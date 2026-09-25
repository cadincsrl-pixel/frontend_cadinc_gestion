-- =====================================================================
-- 20260928l — Tesorería: movimientos de fondos sin factura (2026-09-24)
--
-- Por qué: la plata que entra o sale de un banco, la caja o una billetera
-- sin una factura ni una OP detrás (comisiones bancarias, impuesto al
-- cheque, VEP, sueldos, retiros y aportes de socios, transferencias entre
-- cuentas propias) no tenía dónde registrarse, y el mayor de los bancos no
-- podía cuadrar con el extracto. Esta migración crea el registro; el asiento
-- lo arma el motor de automáticos (20260928m, circuito «fondos»).
--
--   · tesoreria_conceptos: lista editable (baja con activo=false, sin DELETE)
--     con el sentido que admite cada concepto. Su cuenta contable sale del
--     mapeo `fondos.concepto` (20260928m): nunca se inventa.
--   · tesoreria_movimientos: ingreso / egreso / transferencia, numerado
--     MF-NNNNNN. `importe_ars` lo calcula SIEMPRE el trigger (no se confía en
--     el cliente) y es lo que usa el asiento. Cuentas en USD: cotización
--     obligatoria; transferencia entre monedas distintas: importe_destino
--     obligatorio y la cotización se deriva.
--   · No hay DELETE: se anula con motivo. Anular vale aunque el período esté
--     cerrado (el motor hace el contraasiento en el primer día abierto);
--     editar un mes cerrado no.
--   · `origen='conciliacion'` + `extracto_linea_id` quedan listos para la
--     conciliación bancaria (la FK la agrega esa migración).
--   · Adjuntos en el bucket privado `tesoreria-docs`
--     (movimientos/<id>/<uuid>.<ext>), clon de pagos_facturas_adjuntos.
--
-- Escritura solo por RPC security definer con p_user_id y el flag
-- `contabilidad.movimientos_fondos` (default false). Grants solo service_role.
-- =====================================================================

-- ── 1) Conceptos ───────────────────────────────────────────────────────
create table public.tesoreria_conceptos (
  id          bigserial primary key,
  nombre      text not null check (length(btrim(nombre)) >= 2),
  nombre_norm text not null default '',
  sentido     text not null default 'ambos' check (sentido in ('ingreso', 'egreso', 'ambos')),
  orden       smallint not null default 0,
  activo      boolean not null default true,
  obs         text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  constraint tesoreria_conceptos_nombre_norm_key unique (nombre_norm)
);
comment on table public.tesoreria_conceptos is
  'Conceptos de los movimientos de fondos sin factura (Contabilidad › Tesorería). La cuenta sale del mapeo fondos.concepto. Baja con activo=false. 20260928l.';

create or replace function public.fn_tesoreria_concepto_norm() returns trigger
  language plpgsql set search_path = public, pg_temp as $f$
begin
  new.nombre := btrim(regexp_replace(new.nombre, '\s+', ' ', 'g'));
  new.nombre_norm := public.norm_txt(new.nombre);
  return new;
end $f$;

create trigger trg_tesoreria_concepto_norm before insert or update of nombre on public.tesoreria_conceptos
  for each row execute function public.fn_tesoreria_concepto_norm();

insert into public.tesoreria_conceptos (nombre, sentido, orden, obs) values
  ('Comisiones y gastos bancarios',                    'egreso',   1, ''),
  ('Impuesto a los débitos y créditos (Ley 25413)',    'egreso',   2, ''),
  ('Intereses ganados',                                'ingreso',  3, ''),
  ('Intereses pagados',                                'egreso',   4, ''),
  ('Pago VEP IVA',                                     'egreso',   5, ''),
  ('Pago VEP IIBB',                                    'egreso',   6, ''),
  ('Pago F.931 cargas sociales',                       'egreso',   7, ''),
  ('Pago de sueldos',                                  'egreso',   8, ''),
  ('Retiro de socios',                                 'egreso',   9, ''),
  ('Aporte de socios',                                 'ingreso', 10, ''),
  ('Gasto menor sin comprobante',                      'egreso',  11, ''),
  ('Cobro sin factura',                                'ingreso', 12, ''),
  ('Pago sin factura',                                 'egreso',  13, ''),
  ('Depósito de valores',                              'ingreso', 14,
   'Lo correcto es una TRANSFERENCIA de «Valores a depositar» al banco. Si se usa como ingreso, mapearlo a Valores a depositar (1.1.1.01.06).'),
  ('Otro',                                             'ambos',   99, '');

-- ── 2) Movimientos ─────────────────────────────────────────────────────
create sequence public.tesoreria_movimientos_numero_seq;

create table public.tesoreria_movimientos (
  id                   bigserial primary key,
  numero               int not null unique default nextval('public.tesoreria_movimientos_numero_seq'),
  fecha                date not null,
  tipo                 text not null check (tipo in ('ingreso', 'egreso', 'transferencia')),
  tesoreria_id         bigint not null references public.tesoreria_cuentas(id),
  tesoreria_destino_id bigint references public.tesoreria_cuentas(id),
  concepto_id          bigint references public.tesoreria_conceptos(id),
  importe              numeric(14,2) not null check (importe > 0),
  importe_destino      numeric(14,2) check (importe_destino is null or importe_destino > 0),
  cotizacion           numeric(14,6) check (cotizacion is null or cotizacion > 0),
  importe_ars          numeric(14,2) not null check (importe_ars > 0),
  obra_cod             text references public.obras(cod),
  referencia           text not null default '',
  obs                  text not null default '',
  origen               text not null default 'manual' check (origen in ('manual', 'conciliacion')),
  extracto_linea_id    bigint,
  estado               text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  motivo_anulacion     text,
  anulado_por          uuid,
  anulado_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id),
  updated_by           uuid references auth.users(id),
  constraint tes_mov_destino_chk  check ((tipo = 'transferencia') = (tesoreria_destino_id is not null)),
  constraint tes_mov_destino_dist check (tesoreria_destino_id is null or tesoreria_destino_id <> tesoreria_id),
  constraint tes_mov_concepto_chk check ((tipo = 'transferencia') = (concepto_id is null)),
  constraint tes_mov_obra_chk     check (tipo <> 'transferencia' or obra_cod is null),
  constraint tes_mov_anulado_chk  check (estado = 'vigente' or (motivo_anulacion is not null and anulado_at is not null)),
  constraint tes_mov_origen_chk   check (origen = 'manual' or extracto_linea_id is not null)
);
alter sequence public.tesoreria_movimientos_numero_seq owned by public.tesoreria_movimientos.numero;

create index tesoreria_movimientos_fecha_idx    on public.tesoreria_movimientos (fecha, id);
create index tesoreria_movimientos_tes_idx      on public.tesoreria_movimientos (tesoreria_id, fecha);
create index tesoreria_movimientos_destino_idx  on public.tesoreria_movimientos (tesoreria_destino_id) where tesoreria_destino_id is not null;
create index tesoreria_movimientos_concepto_idx on public.tesoreria_movimientos (concepto_id);
create index tesoreria_movimientos_obra_idx     on public.tesoreria_movimientos (obra_cod) where obra_cod is not null;
create unique index tesoreria_movimientos_extracto_uidx on public.tesoreria_movimientos (extracto_linea_id)
  where extracto_linea_id is not null and estado = 'vigente';

comment on table public.tesoreria_movimientos is
  'Movimientos de fondos sin factura ni OP: ingreso, egreso o transferencia entre cuentas de tesorería. Numerados MF-NNNNNN. Asiento automático circuito «fondos» (20260928m). Sin DELETE: se anulan. 20260928l.';
comment on column public.tesoreria_movimientos.importe_ars is
  'Lo calcula fn_tesoreria_mov_consistente (no se confía en el cliente): importe en ARS, o importe × cotización, o el lado en pesos de una transferencia entre monedas. Es lo que usa el asiento.';
comment on column public.tesoreria_movimientos.tesoreria_id is
  'Ingreso: donde entra la plata. Egreso y transferencia: de donde sale.';

-- Consistencia de cuentas, concepto y monedas. La RPC repite las reglas para
-- dar errores limpios; esto es la red. Cuentas/concepto inactivos solo se
-- miran cuando cambian (anular o editar la obs de un movimiento viejo no se
-- traba porque después dieron de baja la cuenta).
create or replace function public.fn_tesoreria_mov_consistente()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  o     public.tesoreria_cuentas%rowtype;
  d     public.tesoreria_cuentas%rowtype;
  c     public.tesoreria_conceptos%rowtype;
  v_chk boolean;
  v_ars numeric;
  v_usd numeric;
begin
  select * into o from public.tesoreria_cuentas where id = new.tesoreria_id;
  if not found then
    raise exception 'TESORERIA_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'tesoreria_id', 'tesoreria_id', new.tesoreria_id)::text;
  end if;
  if new.tesoreria_destino_id is not null then
    select * into d from public.tesoreria_cuentas where id = new.tesoreria_destino_id;
    if not found then
      raise exception 'TESORERIA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'tesoreria_destino_id', 'tesoreria_id', new.tesoreria_destino_id)::text;
    end if;
  end if;

  v_chk := new.estado = 'vigente' and (tg_op = 'INSERT'
             or new.tipo is distinct from old.tipo
             or new.tesoreria_id is distinct from old.tesoreria_id
             or new.tesoreria_destino_id is distinct from old.tesoreria_destino_id
             or new.concepto_id is distinct from old.concepto_id);
  if v_chk then
    if not o.activo then
      raise exception 'TESORERIA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'tesoreria_id', 'tesoreria_id', o.id, 'motivo', 'inactiva')::text;
    end if;
    if new.tesoreria_destino_id is not null and not d.activo then
      raise exception 'TESORERIA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'tesoreria_destino_id', 'tesoreria_id', d.id, 'motivo', 'inactiva')::text;
    end if;
    if new.concepto_id is not null then
      select * into c from public.tesoreria_conceptos where id = new.concepto_id;
      if not found or not c.activo then
        raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001',
          detail = json_build_object('campo', 'concepto_id', 'concepto_id', new.concepto_id)::text;
      end if;
      if c.sentido not in (new.tipo, 'ambos') then
        raise exception 'CONCEPTO_SENTIDO_INVALIDO' using errcode = 'P0001',
          detail = json_build_object('campo', 'concepto_id', 'concepto_id', c.id, 'sentido', c.sentido, 'tipo', new.tipo)::text;
      end if;
    end if;
  end if;

  if new.tipo <> 'transferencia' or d.moneda = o.moneda then
    new.importe_destino := null;
    if o.moneda = 'ARS' then
      new.cotizacion  := null;
      new.importe_ars := new.importe;
    else
      if new.cotizacion is null then
        raise exception 'COTIZACION_REQUERIDA' using errcode = 'P0001',
          detail = json_build_object('campo', 'cotizacion', 'moneda', o.moneda)::text;
      end if;
      new.importe_ars := round(new.importe * new.cotizacion, 2);
    end if;
  else
    if new.importe_destino is null then
      raise exception 'IMPORTE_DESTINO_REQUERIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'importe_destino', 'moneda_origen', o.moneda, 'moneda_destino', d.moneda)::text;
    end if;
    if o.moneda = 'ARS' then v_ars := new.importe; v_usd := new.importe_destino;
    else v_ars := new.importe_destino; v_usd := new.importe; end if;
    new.importe_ars := v_ars;
    new.cotizacion  := round(v_ars / v_usd, 6);
  end if;
  if new.importe_ars <= 0 then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'importe')::text;
  end if;
  return new;
end $$;

create trigger trg_tesoreria_mov_consistente before insert or update on public.tesoreria_movimientos
  for each row execute function public.fn_tesoreria_mov_consistente();

-- ── 3) Adjuntos + bucket ───────────────────────────────────────────────
create table public.tesoreria_movimientos_adjuntos (
  id             bigserial primary key,
  movimiento_id  bigint not null references public.tesoreria_movimientos(id) on delete cascade,
  tipo           text not null check (tipo in ('comprobante', 'vep', 'extracto', 'otro')),
  storage_path   text not null,            -- 'movimientos/<id>/<uuid>.<ext>' en el bucket tesoreria-docs
  nombre_archivo text not null,
  hash_sha256    text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  obs            text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id),
  deleted_at     timestamptz
);
create index tesoreria_mov_adjuntos_mov_idx on public.tesoreria_movimientos_adjuntos (movimiento_id) where deleted_at is null;
-- Dedup por movimiento, no global: un extracto respalda legítimamente varios movimientos.
create unique index tesoreria_mov_adjuntos_mov_hash_uidx on public.tesoreria_movimientos_adjuntos (movimiento_id, hash_sha256)
  where deleted_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tesoreria-docs', 'tesoreria-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 4) Vista ───────────────────────────────────────────────────────────
create or replace view public.v_tesoreria_movimientos with (security_invoker = true) as
select m.id, m.numero, 'MF-' || lpad(m.numero::text, 6, '0') as numero_txt,
       m.fecha, m.tipo,
       m.tesoreria_id, o.nombre as tesoreria_nombre, o.tipo as tesoreria_tipo, o.moneda as tesoreria_moneda,
       m.tesoreria_destino_id, d.nombre as destino_nombre, d.moneda as destino_moneda,
       m.concepto_id, c.nombre as concepto_nombre,
       m.importe, m.importe_destino, m.cotizacion, m.importe_ars,
       m.obra_cod, ob.nom as obra_nom,
       m.referencia, m.obs, m.origen, m.extracto_linea_id,
       m.estado, m.motivo_anulacion, m.anulado_por, pa.nombre as anulado_por_nombre, m.anulado_at,
       (select count(*) from public.tesoreria_movimientos_adjuntos j
         where j.movimiento_id = m.id and j.deleted_at is null)::int as cant_adjuntos,
       a.id as asiento_id, a.numero as asiento_numero,
       m.created_by, pc.nombre as created_by_nombre, m.created_at, m.updated_at
  from public.tesoreria_movimientos m
  join public.tesoreria_cuentas o on o.id = m.tesoreria_id
  left join public.tesoreria_cuentas d on d.id = m.tesoreria_destino_id
  left join public.tesoreria_conceptos c on c.id = m.concepto_id
  left join public.obras ob on ob.cod = m.obra_cod
  left join public.profiles pa on pa.id = m.anulado_por
  left join public.profiles pc on pc.id = m.created_by
  left join lateral (select x.id, x.numero from public._cont_asiento_activo('tesoreria_movimientos', m.id) x) a on true;

comment on view public.v_tesoreria_movimientos is
  'Movimientos de fondos con nombres de cuentas, concepto, obra, usuarios, adjuntos y su asiento automático activo. 20260928l.';

-- ── 5) RPC ─────────────────────────────────────────────────────────────
create or replace function public._tesoreria_mov_json(p_id bigint)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select to_jsonb(v) from public.v_tesoreria_movimientos v where v.id = p_id
$$;

create or replace function public._tesoreria_concepto_json(p_id bigint)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
           'id', c.id, 'nombre', c.nombre, 'sentido', c.sentido, 'orden', c.orden, 'activo', c.activo, 'obs', c.obs,
           'en_uso', (select count(*) from public.tesoreria_movimientos m where m.concepto_id = c.id and m.estado = 'vigente'),
           'cuenta_id', cc.id, 'cuenta_codigo', cc.codigo, 'cuenta_nombre', cc.nombre)
    from public.tesoreria_conceptos c
    left join public.cont_mapeos mp on mp.clave = 'fondos.concepto' and mp.subclave = c.id::text
    left join public.cont_cuentas cc on cc.id = mp.cuenta_id
   where c.id = p_id
$$;

create or replace function public.tesoreria_guardar_movimiento(p_mov jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id     bigint;
  v_old    public.tesoreria_movimientos%rowtype;
  v_fecha  date;
  v_tipo   text;
  v_tes    bigint;
  v_des    bigint;
  v_con    bigint;
  v_imp    numeric;
  v_impd   numeric;
  v_cot    numeric;
  v_obra   text;
  v_ref    text;
  v_obs    text;
  o        public.tesoreria_cuentas%rowtype;
  d        public.tesoreria_cuentas%rowtype;
  c        public.tesoreria_conceptos%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'movimientos_fondos') then
    raise exception 'SIN_PERMISO_FONDOS' using errcode = 'P0001';
  end if;
  if p_mov is null or jsonb_typeof(p_mov) <> 'object' then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'fecha')::text;
  end if;

  -- Edición: el movimiento existe, está vigente y su mes está abierto.
  if nullif(p_mov ->> 'id', '') is not null then
    begin
      v_id := (p_mov ->> 'id')::bigint;
    exception when others then v_id := -1;
    end;
    select * into v_old from public.tesoreria_movimientos where id = v_id for update;
    if not found then
      raise exception 'MOVIMIENTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_mov -> 'id')::text;
    end if;
    if v_old.estado = 'anulado' then
      raise exception 'MOVIMIENTO_ANULADO' using errcode = 'P0001', detail = json_build_object('id', v_id)::text;
    end if;
    if not public._cont_periodo_abierto(v_old.fecha) then
      raise exception 'PERIODO_CERRADO' using errcode = 'P0001',
        detail = json_build_object('campo', 'fecha', 'fecha', v_old.fecha)::text;
    end if;
  end if;

  -- Fecha.
  begin
    v_fecha := nullif(btrim(coalesce(p_mov ->> 'fecha', '')), '')::date;
  exception when others then v_fecha := null;
  end;
  if v_fecha is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'fecha')::text;
  end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001',
      detail = json_build_object('campo', 'fecha', 'fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  if not exists (select 1 from public.cont_periodos p where v_fecha between p.desde and p.hasta) then
    raise exception 'FECHA_SIN_PERIODO' using errcode = 'P0001', detail = json_build_object('campo', 'fecha', 'fecha', v_fecha)::text;
  end if;
  if not public._cont_periodo_abierto(v_fecha) then
    raise exception 'PERIODO_CERRADO' using errcode = 'P0001', detail = json_build_object('campo', 'fecha', 'fecha', v_fecha)::text;
  end if;

  -- Tipo.
  v_tipo := btrim(coalesce(p_mov ->> 'tipo', ''));
  if v_tipo not in ('ingreso', 'egreso', 'transferencia') then
    raise exception 'TIPO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'tipo', 'tipo', p_mov -> 'tipo')::text;
  end if;

  -- Importes.
  begin
    v_imp  := round(nullif(p_mov ->> 'importe', '')::numeric, 2);
  exception when others then v_imp := null;
  end;
  if v_imp is null or v_imp <= 0 or v_imp >= 1e12 then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'importe')::text;
  end if;
  begin
    v_impd := round(nullif(p_mov ->> 'importe_destino', '')::numeric, 2);
  exception when others then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'importe_destino')::text;
  end;
  if v_impd is not null and (v_impd <= 0 or v_impd >= 1e12) then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'importe_destino')::text;
  end if;
  begin
    v_cot := round(nullif(p_mov ->> 'cotizacion', '')::numeric, 6);
  exception when others then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'cotizacion')::text;
  end;
  if v_cot is not null and (v_cot <= 0 or v_cot >= 1e8) then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'cotizacion')::text;
  end if;

  -- Cuentas.
  begin
    v_tes := nullif(p_mov ->> 'tesoreria_id', '')::bigint;
    v_des := nullif(p_mov ->> 'tesoreria_destino_id', '')::bigint;
  exception when others then
    raise exception 'TESORERIA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'tesoreria_id')::text;
  end;
  select * into o from public.tesoreria_cuentas where id = v_tes;
  if not found or (not o.activo and (v_old.id is null or v_old.tesoreria_id is distinct from v_tes)) then
    raise exception 'TESORERIA_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'tesoreria_id', 'tesoreria_id', v_tes)::text;
  end if;
  if v_tipo = 'transferencia' then
    if v_des is null then
      raise exception 'TESORERIA_DESTINO_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'tesoreria_destino_id')::text;
    end if;
    select * into d from public.tesoreria_cuentas where id = v_des;
    if not found or (not d.activo and (v_old.id is null or v_old.tesoreria_destino_id is distinct from v_des)) then
      raise exception 'TESORERIA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'tesoreria_destino_id', 'tesoreria_id', v_des)::text;
    end if;
    if v_des = v_tes then
      raise exception 'TESORERIA_IGUALES' using errcode = 'P0001', detail = json_build_object('campo', 'tesoreria_destino_id')::text;
    end if;
  else
    v_des := null;   -- ingreso/egreso no llevan destino
  end if;

  -- Concepto.
  begin
    v_con := nullif(p_mov ->> 'concepto_id', '')::bigint;
  exception when others then
    raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'concepto_id')::text;
  end;
  if v_tipo = 'transferencia' then
    if v_con is not null then
      raise exception 'CONCEPTO_NO_CORRESPONDE' using errcode = 'P0001', detail = json_build_object('campo', 'concepto_id')::text;
    end if;
  else
    if v_con is null then
      raise exception 'CONCEPTO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'concepto_id')::text;
    end if;
    select * into c from public.tesoreria_conceptos where id = v_con;
    if not found or (not c.activo and (v_old.id is null or v_old.concepto_id is distinct from v_con)) then
      raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'concepto_id', 'concepto_id', v_con)::text;
    end if;
    if c.sentido not in (v_tipo, 'ambos') then
      raise exception 'CONCEPTO_SENTIDO_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'concepto_id', 'concepto_id', v_con, 'sentido', c.sentido, 'tipo', v_tipo)::text;
    end if;
  end if;

  -- Monedas (el trigger calcula importe_ars; acá solo el error limpio).
  if v_tipo <> 'transferencia' or d.moneda = o.moneda then
    if o.moneda <> 'ARS' and v_cot is null then
      raise exception 'COTIZACION_REQUERIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'cotizacion', 'moneda', o.moneda)::text;
    end if;
  elsif v_impd is null then
    raise exception 'IMPORTE_DESTINO_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'importe_destino', 'moneda_origen', o.moneda, 'moneda_destino', d.moneda)::text;
  end if;

  -- Obra (centro de costo): solo ingreso/egreso.
  v_obra := nullif(btrim(coalesce(p_mov ->> 'obra_cod', '')), '');
  if v_tipo = 'transferencia' then
    v_obra := null;
  elsif v_obra is not null and not exists (select 1 from public.obras where cod = v_obra) then
    raise exception 'OBRA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('campo', 'obra_cod', 'obra_cod', v_obra)::text;
  end if;

  v_ref := left(btrim(coalesce(p_mov ->> 'referencia', '')), 120);
  v_obs := left(btrim(coalesce(p_mov ->> 'obs', '')), 1000);

  if v_old.id is null then
    insert into public.tesoreria_movimientos (fecha, tipo, tesoreria_id, tesoreria_destino_id, concepto_id,
                                              importe, importe_destino, cotizacion, importe_ars, obra_cod,
                                              referencia, obs, created_by, updated_by)
    values (v_fecha, v_tipo, v_tes, v_des, v_con, v_imp, v_impd, v_cot, v_imp, v_obra, v_ref, v_obs, p_user_id, p_user_id)
    returning id into v_id;
  else
    if v_old.origen = 'conciliacion' and (
         v_fecha is distinct from v_old.fecha or v_tipo is distinct from v_old.tipo
      or v_tes is distinct from v_old.tesoreria_id or v_des is distinct from v_old.tesoreria_destino_id
      or v_imp is distinct from v_old.importe
      or (v_impd is not null and v_impd is distinct from v_old.importe_destino)
      or (v_cot is not null and v_cot is distinct from v_old.cotizacion)) then
      raise exception 'MOVIMIENTO_DE_CONCILIACION' using errcode = 'P0001', detail = json_build_object('id', v_id)::text;
    end if;
    update public.tesoreria_movimientos
       set fecha = v_fecha, tipo = v_tipo, tesoreria_id = v_tes, tesoreria_destino_id = v_des, concepto_id = v_con,
           importe = v_imp, importe_destino = v_impd, cotizacion = v_cot, obra_cod = v_obra,
           referencia = v_ref, obs = v_obs, updated_by = p_user_id
     where id = v_id;
  end if;

  return public._tesoreria_mov_json(v_id);
end $$;

comment on function public.tesoreria_guardar_movimiento(jsonb, uuid) is
  'Alta (sin id) o edición (con id) de un movimiento de fondos. Flag contabilidad.movimientos_fondos. Devuelve la fila de v_tesoreria_movimientos. 20260928l.';

create or replace function public.tesoreria_anular_movimiento(p_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m public.tesoreria_movimientos%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'movimientos_fondos') then
    raise exception 'SIN_PERMISO_FONDOS' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into v_m from public.tesoreria_movimientos where id = p_id for update;
  if not found then
    raise exception 'MOVIMIENTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if v_m.estado = 'anulado' then
    raise exception 'MOVIMIENTO_YA_ANULADO' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  -- Vale aunque el período esté cerrado: el motor genera el contraasiento en
  -- el primer día abierto ≥ la fecha de anulación.
  update public.tesoreria_movimientos
     set estado = 'anulado', motivo_anulacion = left(btrim(p_motivo), 500), anulado_por = p_user_id, anulado_at = now(),
         updated_by = p_user_id
   where id = p_id;
  return public._tesoreria_mov_json(p_id);
end $$;

create or replace function public.tesoreria_guardar_concepto(p_concepto jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id     bigint;
  v_old    public.tesoreria_conceptos%rowtype;
  v_nom    text;
  v_sen    text;
  v_ord    smallint;
  v_act    boolean;
  v_obs    text;
  v_n      int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'movimientos_fondos') then
    raise exception 'SIN_PERMISO_FONDOS' using errcode = 'P0001';
  end if;
  if p_concepto is null or jsonb_typeof(p_concepto) <> 'object' then
    raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre')::text;
  end if;

  if nullif(p_concepto ->> 'id', '') is not null then
    begin
      v_id := (p_concepto ->> 'id')::bigint;
    exception when others then v_id := -1;
    end;
    select * into v_old from public.tesoreria_conceptos where id = v_id for update;
    if not found then
      raise exception 'CONCEPTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_concepto -> 'id')::text;
    end if;
  end if;

  v_nom := btrim(regexp_replace(coalesce(p_concepto ->> 'nombre', v_old.nombre, ''), '\s+', ' ', 'g'));
  if length(v_nom) < 2 or length(v_nom) > 120 then
    raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre')::text;
  end if;
  v_sen := coalesce(nullif(btrim(p_concepto ->> 'sentido'), ''), v_old.sentido, 'ambos');
  if v_sen not in ('ingreso', 'egreso', 'ambos') then
    raise exception 'CONCEPTO_SENTIDO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'sentido', 'sentido', v_sen)::text;
  end if;
  begin
    v_ord := coalesce(nullif(p_concepto ->> 'orden', '')::smallint, v_old.orden, 0);
    v_act := coalesce(nullif(p_concepto ->> 'activo', '')::boolean, v_old.activo, true);
  exception when others then
    raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'orden')::text;
  end;
  v_obs := left(btrim(coalesce(p_concepto ->> 'obs', v_old.obs, '')), 1000);

  if exists (select 1 from public.tesoreria_conceptos x
              where x.nombre_norm = public.norm_txt(v_nom) and x.id is distinct from v_old.id) then
    raise exception 'CONCEPTO_DUPLICADO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre', 'nombre', v_nom)::text;
  end if;

  if v_old.id is not null and v_sen <> 'ambos' and v_sen is distinct from v_old.sentido then
    select count(*) into v_n from public.tesoreria_movimientos m
     where m.concepto_id = v_old.id and m.estado = 'vigente' and m.tipo <> v_sen;
    if v_n > 0 then
      raise exception 'CONCEPTO_SENTIDO_EN_USO' using errcode = 'P0001',
        detail = json_build_object('campo', 'sentido', 'cantidad', v_n)::text;
    end if;
  end if;

  begin
    if v_old.id is null then
      insert into public.tesoreria_conceptos (nombre, sentido, orden, activo, obs, created_by, updated_by)
      values (v_nom, v_sen, v_ord, v_act, v_obs, p_user_id, p_user_id)
      returning id into v_id;
    else
      update public.tesoreria_conceptos
         set nombre = v_nom, sentido = v_sen, orden = v_ord, activo = v_act, obs = v_obs, updated_by = p_user_id
       where id = v_id;
    end if;
  exception when unique_violation then
    raise exception 'CONCEPTO_DUPLICADO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre', 'nombre', v_nom)::text;
  end;
  return public._tesoreria_concepto_json(v_id);
end $$;

create or replace function public.tesoreria_conceptos_listar(p_incluir_inactivos boolean default false)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public._tesoreria_concepto_json(c.id) order by c.orden, c.nombre), '[]'::jsonb)
    from public.tesoreria_conceptos c
   where c.activo or coalesce(p_incluir_inactivos, false)
$$;

create or replace function public.tesoreria_movimientos_listar(
  p_desde date default null, p_hasta date default null, p_tipo text default null, p_tesoreria_id bigint default null,
  p_concepto_id bigint default null, p_obra_cod text default null, p_estado text default null, p_origen text default null,
  p_q text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_q   text := nullif(public.norm_txt(coalesce(p_q, '')), '');
  v_num int;
  v_out jsonb;
begin
  if v_q is not null and v_q ~ '^(mf)?[ -]?0*[0-9]{1,9}$' then
    v_num := nullif(regexp_replace(v_q, '[^0-9]', '', 'g'), '')::int;
  end if;
  with f as materialized (
    select v.*
      from public.v_tesoreria_movimientos v
     where (p_desde is null or v.fecha >= p_desde)
       and (p_hasta is null or v.fecha <= p_hasta)
       and (p_tipo is null or v.tipo = p_tipo)
       and (p_tesoreria_id is null or v.tesoreria_id = p_tesoreria_id or v.tesoreria_destino_id = p_tesoreria_id)
       and (p_concepto_id is null or v.concepto_id = p_concepto_id)
       and (p_obra_cod is null or v.obra_cod = p_obra_cod)
       and (p_estado is null or p_estado = 'todos' or v.estado = p_estado)
       and (p_origen is null or v.origen = p_origen)
       and (v_q is null or v.numero = v_num
            or public.norm_txt(concat_ws(' ', v.numero_txt, v.referencia, v.obs, v.concepto_nombre, v.tesoreria_nombre,
                                          v.destino_nombre, v.obra_cod, v.obra_nom)) like '%' || v_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'totales', jsonb_build_object(
      'ingresos',       coalesce((select sum(importe_ars) from f where estado = 'vigente' and tipo = 'ingreso'), 0),
      'egresos',        coalesce((select sum(importe_ars) from f where estado = 'vigente' and tipo = 'egreso'), 0),
      'transferencias', coalesce((select sum(importe_ars) from f where estado = 'vigente' and tipo = 'transferencia'), 0)),
    'items', coalesce((select jsonb_agg(to_jsonb(z) order by z.fecha desc, z.id desc)
                         from (select * from f order by fecha desc, id desc limit v_lim offset v_off) z), '[]'::jsonb))
    into v_out;
  return v_out;
end $$;

comment on function public.tesoreria_movimientos_listar(date, date, text, bigint, bigint, text, text, text, text, int, int) is
  'Listado paginado (máx. 200) de movimientos de fondos con totales en ARS de los vigentes. p_tesoreria_id busca como origen o destino; p_estado null/todos = todos. 20260928l.';

-- ── 6) Auditoría, RLS y grants ─────────────────────────────────────────
create trigger trg_tesoreria_conceptos_touch before update on public.tesoreria_conceptos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.tesoreria_conceptos
  for each row execute function public.audit_cambios('contabilidad', 'concepto de fondos', 'id');
create trigger trg_audit_borrado after delete on public.tesoreria_conceptos
  for each row execute function public.audit_borrado('contabilidad', 'concepto de fondos', 'id');

create trigger trg_tesoreria_movimientos_touch before update on public.tesoreria_movimientos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.tesoreria_movimientos
  for each row execute function public.audit_cambios('contabilidad', 'movimiento de fondos', 'id');
create trigger trg_audit_borrado after delete on public.tesoreria_movimientos
  for each row execute function public.audit_borrado('contabilidad', 'movimiento de fondos', 'id');

create trigger trg_tesoreria_mov_adjuntos_touch before update on public.tesoreria_movimientos_adjuntos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.tesoreria_movimientos_adjuntos
  for each row execute function public.audit_cambios('contabilidad', 'adjunto de movimiento de fondos', 'id');
create trigger trg_audit_borrado after delete on public.tesoreria_movimientos_adjuntos
  for each row execute function public.audit_borrado('contabilidad', 'adjunto de movimiento de fondos', 'id');

do $$
declare t text;
begin
  foreach t in array array['tesoreria_conceptos', 'tesoreria_movimientos', 'tesoreria_movimientos_adjuntos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t || '_id_seq');
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $$;
revoke all on sequence public.tesoreria_movimientos_numero_seq from public, anon, authenticated;
grant usage, select on sequence public.tesoreria_movimientos_numero_seq to service_role;

revoke all on table public.v_tesoreria_movimientos from public, anon, authenticated;
grant select on table public.v_tesoreria_movimientos to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'fn_tesoreria_concepto_norm()',
    'fn_tesoreria_mov_consistente()',
    '_tesoreria_mov_json(bigint)',
    '_tesoreria_concepto_json(bigint)',
    'tesoreria_guardar_movimiento(jsonb, uuid)',
    'tesoreria_anular_movimiento(bigint, text, uuid)',
    'tesoreria_guardar_concepto(jsonb, uuid)',
    'tesoreria_conceptos_listar(boolean)',
    'tesoreria_movimientos_listar(date, date, text, bigint, bigint, text, text, text, text, integer, integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
