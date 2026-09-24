-- =====================================================================
-- Contabilidad fase 1: tablas, guardas y partida doble (2026-09-26)
--
-- Por qué: el dueño dejó Finnegans (§5.19) y la contabilidad pasa a vivir en
-- el ERP. Esta migración crea el esqueleto: ejercicios, períodos mensuales,
-- plan de cuentas jerárquico y asientos con sus líneas.
--
-- Reglas que viven EN LA BASE (el backend las repite para dar errores limpios):
--   · el plan de cuentas es un árbol por código (1, 1.1, 1.1.01, …): el padre
--     lo deriva un trigger, hereda rubro, y solo las hojas imputan;
--   · a cont_asientos/cont_asiento_lineas solo se escribe desde las RPC
--     (GUC cadinc.cont_rpc), nunca en un período cerrado, y el número de
--     asiento solo lo pone el cierre del período (GUC cadinc.cont_cierre);
--   · un asiento confirmado cuadra (Σdebe = Σhaber, ≥ 2 líneas, cuentas
--     imputables), chequeado por constraint triggers DIFERIDOS: las RPC
--     borran e insertan líneas en varios pasos y se mira cómo quedó al final.
--
-- Seed: ejercicio 2026/27 (01/07/2026 – 30/06/2027) con sus 12 períodos.
-- `exclude using gist (daterange … with &&)` no necesita btree_gist: el
-- operador de rango tiene opclass gist nativa.
-- =====================================================================

-- ── 1) Helpers de permisos (espejo de _ventas_flag, 20260924b) ─────────

create or replace function public._cont_es_admin(p_user_id uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce((select p.rol = 'admin' and coalesce(p.activo, true) from public.profiles p where p.id = p_user_id), false)
$$;

-- El coalesce de AFUERA no es decorativo (lección de _pagos_flag, 20260921f):
-- sin fila el subselect da NULL y un `if not …` no entraría por ninguna rama.
create or replace function public._cont_flag(p_user_id uuid, p_flag text, p_default boolean default false)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce((
    select case
             when coalesce(p.activo, true) = false then false
             when p.rol = 'admin'                  then true
             when p.permisos -> 'contabilidad' ? p_flag
               then coalesce((p.permisos -> 'contabilidad' ->> p_flag)::boolean, p_default)
             else p_default
           end
      from public.profiles p
     where p.id = p_user_id
  ), false)
$$;

comment on function public._cont_flag(uuid, text, boolean) is
  'Flag de permisos.contabilidad del usuario (admin activo = true, inactivo o inexistente = false). Espejo del backend.';

create or replace function public._cont_naturaleza(p_rubro text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_rubro in ('activo', 'egreso') then 'deudora'
              when p_rubro in ('pasivo', 'pn', 'ingreso') then 'acreedora' end
$$;

-- ── 2) Ejercicios y períodos ───────────────────────────────────────────

create table public.cont_ejercicios (
  id          bigserial primary key,
  nombre      text not null unique,
  desde       date not null,
  hasta       date not null,
  estado      text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_by  uuid references auth.users(id),
  check (hasta > desde),
  constraint cont_ejercicios_sin_solape exclude using gist (daterange(desde, hasta, '[]') with &&)
);

create table public.cont_periodos (
  id                 bigserial primary key,
  ejercicio_id       bigint not null references public.cont_ejercicios(id),
  numero             smallint not null check (numero between 1 and 12),
  desde              date not null,
  hasta              date not null,
  estado             text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  cerrado_por        uuid,
  cerrado_at         timestamptz,
  reabierto_por      uuid,
  reabierto_at       timestamptz,
  motivo_reapertura  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  updated_by         uuid references auth.users(id),
  unique (ejercicio_id, numero),
  check (hasta >= desde),
  check (estado = 'abierto' or cerrado_at is not null),
  constraint cont_periodos_sin_solape exclude using gist (daterange(desde, hasta, '[]') with &&)
);

-- ── 3) Plan de cuentas ─────────────────────────────────────────────────

create table public.cont_cuentas (
  id           bigserial primary key,
  codigo       text not null unique check (codigo ~ '^[1-9](\.[0-9]{1,3}){0,5}$'),
  codigo_orden int[] generated always as (string_to_array(codigo, '.')::int[]) stored,
  nivel        smallint generated always as (array_length(string_to_array(codigo, '.'), 1)) stored,
  nombre       text not null check (length(btrim(nombre)) >= 2),
  padre_id     bigint references public.cont_cuentas(id),
  rubro        text not null check (rubro in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso')),
  imputable    boolean not null default false,
  auxiliar     text not null default 'none' check (auxiliar in ('none', 'cliente', 'proveedor', 'tesoreria')),
  activo       boolean not null default true,
  baja_motivo  text,
  obs          text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  updated_by   uuid references auth.users(id),
  constraint cont_cuentas_auxiliar_solo_imputable check (auxiliar = 'none' or imputable),
  constraint cont_cuentas_baja_con_motivo check (activo or baja_motivo is not null)
);
create index cont_cuentas_padre_idx  on public.cont_cuentas (padre_id);
create index cont_cuentas_codigo_pat_idx on public.cont_cuentas (codigo text_pattern_ops);
create index cont_cuentas_orden_idx  on public.cont_cuentas (codigo_orden);

comment on table public.cont_cuentas is
  'Plan de cuentas. Árbol por código (padre = código sin su último segmento, lo deriva fn_cont_cuenta_consistente). Solo las imputables reciben líneas.';

-- ── 4) Asientos y líneas ───────────────────────────────────────────────

create table public.cont_asientos (
  id                bigserial primary key,
  ejercicio_id      bigint not null references public.cont_ejercicios(id),
  periodo_id        bigint not null references public.cont_periodos(id),
  numero            int,
  fecha             date not null,
  tipo              text not null check (tipo in ('apertura', 'manual', 'automatico', 'ajuste', 'cierre')),
  estado            text not null default 'borrador' check (estado in ('borrador', 'confirmado', 'anulado')),
  glosa             text not null check (length(btrim(glosa)) >= 3),
  total             numeric(14,2) not null default 0,
  origen_tabla      text,
  origen_id         bigint,
  origen_evento     text,
  origen_hash       text,
  revierte_id       bigint references public.cont_asientos(id),
  revertido_por_id  bigint references public.cont_asientos(id),
  motivo_anulacion  text,
  anulado_por       uuid,
  anulado_at        timestamptz,
  confirmado_por    uuid,
  confirmado_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id),
  check (num_nonnulls(origen_tabla, origen_id, origen_evento) in (0, 3)),
  check (tipo <> 'automatico' or origen_tabla is not null),
  check (numero is null or estado = 'confirmado'),
  check (estado <> 'anulado' or motivo_anulacion is not null),
  unique (ejercicio_id, numero)
);
-- Fase 3 (contabilizador): un evento de origen genera a lo sumo un asiento vivo.
create unique index cont_asientos_origen_uidx on public.cont_asientos (origen_tabla, origen_id, origen_evento)
  where origen_tabla is not null and estado <> 'anulado' and revertido_por_id is null and revierte_id is null;
create unique index cont_asientos_revierte_uidx on public.cont_asientos (revierte_id)
  where revierte_id is not null and estado <> 'anulado';
create unique index cont_asientos_apertura_uidx on public.cont_asientos (ejercicio_id)
  where tipo = 'apertura' and estado <> 'anulado';
create index cont_asientos_fecha_idx   on public.cont_asientos (fecha, id);
create index cont_asientos_periodo_idx on public.cont_asientos (periodo_id, estado);

create table public.cont_asiento_lineas (
  id                bigserial primary key,
  asiento_id        bigint not null references public.cont_asientos(id) on delete cascade,
  orden             smallint not null,
  cuenta_id         bigint not null references public.cont_cuentas(id),
  debe              numeric(14,2) not null default 0 check (debe >= 0),
  haber             numeric(14,2) not null default 0 check (haber >= 0),
  aux_cliente_id    bigint references public.ventas_clientes(id),
  aux_proveedor_id  bigint references public.pagos_proveedores(id),
  aux_tesoreria_id  bigint,  -- la FK a tesoreria_cuentas la agrega 20260926b
  obra_cod          text references public.obras(cod),
  glosa             text not null default '',
  created_at        timestamptz not null default now(),
  check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0)),
  check (num_nonnulls(aux_cliente_id, aux_proveedor_id, aux_tesoreria_id) <= 1)
);
create index cont_asiento_lineas_asiento_idx on public.cont_asiento_lineas (asiento_id);
create index cont_asiento_lineas_cuenta_idx  on public.cont_asiento_lineas (cuenta_id);
create index cont_asiento_lineas_obra_idx    on public.cont_asiento_lineas (obra_cod) where obra_cod is not null;

-- ── 5) Consistencia del plan de cuentas ────────────────────────────────

create or replace function public.fn_cont_cuenta_consistente()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_padre_cod text;
  v_p         public.cont_cuentas%rowtype;
  v_campo     text;
begin
  -- El CHECK también lo frena, pero antes el generated column tiraría un
  -- "invalid input syntax for type integer" sin código.
  if new.codigo is null or new.codigo !~ '^[1-9](\.[0-9]{1,3}){0,5}$' then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', detail = json_build_object('codigo', new.codigo)::text;
  end if;
  if new.auxiliar <> 'none' and not new.imputable then
    raise exception 'AUXILIAR_SOLO_IMPUTABLE' using errcode = 'P0001',
      detail = json_build_object('codigo', new.codigo, 'auxiliar', new.auxiliar)::text;
  end if;

  if position('.' in new.codigo) = 0 then
    new.padre_id := null;
  else
    v_padre_cod := regexp_replace(new.codigo, '\.[0-9]+$', '');
    select * into v_p from public.cont_cuentas where codigo = v_padre_cod;
    if not found then
      raise exception 'PADRE_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('codigo', new.codigo, 'padre_codigo', v_padre_cod)::text;
    end if;
    if v_p.imputable then
      raise exception 'PADRE_IMPUTABLE' using errcode = 'P0001',
        detail = json_build_object('codigo', new.codigo, 'padre_codigo', v_padre_cod)::text;
    end if;
    if new.rubro is distinct from v_p.rubro then
      raise exception 'RUBRO_DISTINTO_AL_PADRE' using errcode = 'P0001',
        detail = json_build_object('codigo', new.codigo, 'rubro', new.rubro, 'padre_codigo', v_padre_cod, 'rubro_padre', v_p.rubro)::text;
    end if;
    new.padre_id := v_p.id;
  end if;

  if tg_op = 'UPDATE' then
    if exists (select 1 from public.cont_asiento_lineas l where l.cuenta_id = old.id) then
      v_campo := case when new.codigo    is distinct from old.codigo    then 'codigo'
                      when new.rubro     is distinct from old.rubro     then 'rubro'
                      when new.imputable is distinct from old.imputable then 'imputable'
                      when new.auxiliar  is distinct from old.auxiliar  then 'auxiliar' end;
      if v_campo is not null then
        raise exception 'CUENTA_CON_MOVIMIENTOS' using errcode = 'P0001',
          detail = json_build_object('cuenta_id', old.id, 'campo', v_campo)::text;
      end if;
    end if;
    if new.codigo <> old.codigo and exists (select 1 from public.cont_cuentas h where h.padre_id = old.id) then
      raise exception 'CODIGO_CON_HIJAS' using errcode = 'P0001', detail = json_build_object('cuenta_id', old.id)::text;
    end if;
    -- Cambiar el rubro de un título dejaría a sus hijas con otro rubro.
    if new.rubro <> old.rubro and exists (select 1 from public.cont_cuentas h where h.padre_id = old.id) then
      raise exception 'CUENTA_CON_HIJAS' using errcode = 'P0001',
        detail = json_build_object('cuenta_id', old.id, 'campo', 'rubro')::text;
    end if;
  end if;

  if new.imputable and tg_op = 'UPDATE'
     and exists (select 1 from public.cont_cuentas h where h.padre_id = new.id) then
    raise exception 'IMPUTABLE_CON_HIJAS' using errcode = 'P0001', detail = json_build_object('cuenta_id', new.id)::text;
  end if;

  if not new.activo and (tg_op = 'INSERT' or old.activo)
     and exists (select 1 from public.cont_cuentas h where h.padre_id = new.id and h.activo) then
    raise exception 'CUENTA_CON_HIJAS_ACTIVAS' using errcode = 'P0001', detail = json_build_object('cuenta_id', new.id)::text;
  end if;
  if new.activo and (tg_op = 'INSERT' or not old.activo) and v_p.id is not null and not v_p.activo then
    raise exception 'PADRE_INACTIVO' using errcode = 'P0001',
      detail = json_build_object('cuenta_id', new.id, 'padre_codigo', v_p.codigo)::text;
  end if;
  return new;
end $$;

create trigger trg_cont_cuenta_consistente before insert or update on public.cont_cuentas
  for each row execute function public.fn_cont_cuenta_consistente();

-- ── 6) Guardas de asientos y líneas ────────────────────────────────────
-- Patrón de GUC como cadinc.pagos_recalc: la escritura solo entra si la RPC
-- prendió cadinc.cont_rpc (o el escape cadinc.descongelar, con motivo escrito).

create or replace function public.fn_cont_asiento_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_cierre   boolean := coalesce(current_setting('cadinc.cont_cierre', true), '') = 'on';
  v_per_id   bigint;
  v_eje_id   bigint;
  v_eje_est  text;
  v_cerrado  boolean := false;
  v_ignorar  text[] := array['revertido_por_id', 'updated_at', 'updated_by'];
begin
  if coalesce(current_setting('cadinc.cont_rpc', true), '') <> 'on'
     and coalesce(current_setting('cadinc.descongelar', true), '') <> 'on' then
    raise exception 'ASIENTO_SOLO_RPC' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.fecha is distinct from old.fecha) then
    select p.id, p.ejercicio_id, e.estado into v_per_id, v_eje_id, v_eje_est
      from public.cont_periodos p join public.cont_ejercicios e on e.id = p.ejercicio_id
     where new.fecha between p.desde and p.hasta;
    if v_per_id is null then
      raise exception 'FECHA_SIN_PERIODO' using errcode = 'P0001', detail = json_build_object('fecha', new.fecha)::text;
    end if;
    if v_eje_est = 'cerrado' then
      raise exception 'EJERCICIO_CERRADO' using errcode = 'P0001',
        detail = json_build_object('ejercicio_id', v_eje_id, 'fecha', new.fecha)::text;
    end if;
    new.periodo_id := v_per_id;
    new.ejercicio_id := v_eje_id;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_cerrado := v_cerrado or exists (select 1 from public.cont_periodos where id = old.periodo_id and estado = 'cerrado');
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_cerrado := v_cerrado or exists (select 1 from public.cont_periodos where id = new.periodo_id and estado = 'cerrado');
  end if;
  if v_cerrado and not v_cierre then
    -- Excepción: marcar/desmarcar al original como revertido (el contraasiento
    -- vive en un período abierto; el original puede estar en uno cerrado).
    if not (tg_op = 'UPDATE' and (to_jsonb(new) - v_ignorar) = (to_jsonb(old) - v_ignorar)) then
      raise exception 'PERIODO_CERRADO' using errcode = 'P0001',
        detail = json_build_object('periodo_id', case when tg_op = 'DELETE' then old.periodo_id else new.periodo_id end,
                                   'fecha', case when tg_op = 'DELETE' then old.fecha else new.fecha end)::text;
    end if;
  end if;

  if not v_cierre and (
       (tg_op = 'UPDATE' and new.numero is distinct from old.numero)
    or (tg_op = 'INSERT' and new.numero is not null)) then
    raise exception 'NUMERO_SOLO_AL_CERRAR' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger trg_cont_asientos_guard before insert or update or delete on public.cont_asientos
  for each row execute function public.fn_cont_asiento_guard();

create or replace function public.fn_cont_linea_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_cierre boolean := coalesce(current_setting('cadinc.cont_cierre', true), '') = 'on';
  v_aid    bigint;
  v_est    text;
  v_pest   text;
  v_fecha  date;
  v_pid    bigint;
begin
  if coalesce(current_setting('cadinc.cont_rpc', true), '') <> 'on'
     and coalesce(current_setting('cadinc.descongelar', true), '') <> 'on' then
    raise exception 'ASIENTO_SOLO_RPC' using errcode = 'P0001';
  end if;
  foreach v_aid in array array[case when tg_op <> 'INSERT' then old.asiento_id end,
                               case when tg_op <> 'DELETE' then new.asiento_id end] loop
    continue when v_aid is null;
    select a.estado, p.estado, a.fecha, p.id into v_est, v_pest, v_fecha, v_pid
      from public.cont_asientos a join public.cont_periodos p on p.id = a.periodo_id
     where a.id = v_aid;
    continue when not found;  -- borrado en cascada: el asiento ya no está
    if v_pest = 'cerrado' and not v_cierre then
      raise exception 'PERIODO_CERRADO' using errcode = 'P0001',
        detail = json_build_object('periodo_id', v_pid, 'fecha', v_fecha)::text;
    end if;
    if v_est = 'anulado' then
      raise exception 'ASIENTO_ANULADO_INMUTABLE' using errcode = 'P0001', detail = json_build_object('asiento_id', v_aid)::text;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger trg_cont_lineas_guard before insert or update or delete on public.cont_asiento_lineas
  for each row execute function public.fn_cont_linea_guard();

-- ── 7) Partida doble diferida (molde de _pagos_chequear_desglose) ──────

create or replace function public._cont_chequear_asiento(p_asiento_id bigint)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  a        public.cont_asientos%rowtype;
  v_debe   numeric(14,2);
  v_haber  numeric(14,2);
  v_n      int;
  v_noimp  bigint;
begin
  select * into a from public.cont_asientos where id = p_asiento_id;
  if not found then return; end if;
  select coalesce(sum(debe), 0), coalesce(sum(haber), 0), count(*) into v_debe, v_haber, v_n
    from public.cont_asiento_lineas where asiento_id = p_asiento_id;
  if a.total <> v_debe then
    raise exception 'ASIENTO_TOTAL_INCONSISTENTE' using errcode = 'P0001',
      detail = json_build_object('asiento_id', p_asiento_id, 'total', a.total, 'debe', v_debe)::text;
  end if;
  if a.estado = 'confirmado' then
    if v_n < 2 then
      raise exception 'MENOS_DE_DOS_LINEAS' using errcode = 'P0001',
        detail = json_build_object('asiento_id', p_asiento_id, 'lineas', v_n)::text;
    end if;
    if v_debe <> v_haber then
      raise exception 'ASIENTO_DESBALANCEADO' using errcode = 'P0001',
        detail = json_build_object('asiento_id', p_asiento_id, 'debe', v_debe, 'haber', v_haber, 'diferencia', v_debe - v_haber)::text;
    end if;
    if v_debe = 0 then
      raise exception 'ASIENTO_TOTAL_CERO' using errcode = 'P0001', detail = json_build_object('asiento_id', p_asiento_id)::text;
    end if;
    select l.cuenta_id into v_noimp
      from public.cont_asiento_lineas l join public.cont_cuentas c on c.id = l.cuenta_id
     where l.asiento_id = p_asiento_id and not c.imputable limit 1;
    if v_noimp is not null then
      raise exception 'CUENTA_NO_IMPUTABLE' using errcode = 'P0001',
        detail = json_build_object('asiento_id', p_asiento_id, 'cuenta_id', v_noimp)::text;
    end if;
  end if;
end $$;

create or replace function public.fn_cont_partida_doble()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'cont_asientos' then
    perform public._cont_chequear_asiento(new.id);
  else
    if tg_op <> 'INSERT' then perform public._cont_chequear_asiento(old.asiento_id); end if;
    if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.asiento_id is distinct from old.asiento_id) then
      perform public._cont_chequear_asiento(new.asiento_id);
    end if;
  end if;
  return null;
end $$;

create constraint trigger trg_cont_partida_doble_asiento
  after insert or update of estado, total on public.cont_asientos
  deferrable initially deferred for each row execute function public.fn_cont_partida_doble();
create constraint trigger trg_cont_partida_doble_lineas
  after insert or update or delete on public.cont_asiento_lineas
  deferrable initially deferred for each row execute function public.fn_cont_partida_doble();

-- ── 8) updated_at y auditoría (las líneas no: sería ruido) ─────────────

create trigger trg_cont_ejercicios_touch before update on public.cont_ejercicios
  for each row execute function public.set_updated_at();
create trigger trg_cont_periodos_touch before update on public.cont_periodos
  for each row execute function public.set_updated_at();
create trigger trg_cont_cuentas_touch before update on public.cont_cuentas
  for each row execute function public.set_updated_at();
create trigger trg_cont_asientos_touch before update on public.cont_asientos
  for each row execute function public.set_updated_at();

create trigger trg_audit_cambios after update on public.cont_cuentas
  for each row execute function public.audit_cambios('contabilidad', 'cuenta contable', 'id');
create trigger trg_audit_borrado after delete on public.cont_cuentas
  for each row execute function public.audit_borrado('contabilidad', 'cuenta contable', 'id');
create trigger trg_audit_cambios after update on public.cont_asientos
  for each row execute function public.audit_cambios('contabilidad', 'asiento contable', 'id');
create trigger trg_audit_borrado after delete on public.cont_asientos
  for each row execute function public.audit_borrado('contabilidad', 'asiento contable', 'id');
create trigger trg_audit_cambios after update on public.cont_periodos
  for each row execute function public.audit_cambios('contabilidad', 'período contable', 'id');
create trigger trg_audit_borrado after delete on public.cont_periodos
  for each row execute function public.audit_borrado('contabilidad', 'período contable', 'id');

-- ── 9) RLS + grants (backend-as-gateway: solo service_role) ────────────

do $$
declare
  t text;
begin
  foreach t in array array['cont_ejercicios','cont_periodos','cont_cuentas','cont_asientos','cont_asiento_lineas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t || '_id_seq');
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_es_admin(uuid)',
    '_cont_flag(uuid, text, boolean)',
    '_cont_naturaleza(text)',
    '_cont_chequear_asiento(bigint)',
    'fn_cont_cuenta_consistente()',
    'fn_cont_asiento_guard()',
    'fn_cont_linea_guard()',
    'fn_cont_partida_doble()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ── 10) Seed: ejercicio 2026/27 y sus 12 períodos ──────────────────────

insert into public.cont_ejercicios (nombre, desde, hasta) values ('2026/27', '2026-07-01', '2027-06-30');

insert into public.cont_periodos (ejercicio_id, numero, desde, hasta)
select e.id, row_number() over (order by m)::smallint, m::date, (m + interval '1 month' - interval '1 day')::date
  from public.cont_ejercicios e,
       generate_series('2026-07-01'::date, '2027-06-01'::date, interval '1 month') m
 where e.nombre = '2026/27';
