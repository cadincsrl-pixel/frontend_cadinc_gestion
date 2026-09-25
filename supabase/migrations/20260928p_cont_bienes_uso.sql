-- =====================================================================
-- 20260928p — Contabilidad: bienes de uso (inventario, importador y cuadro)
-- (2026-09-24)
--
-- Por qué: la amortización de los bienes de uso es el ajuste mensual (o
-- anual) que falta para que el resultado del ERP sea real, y el inventario
-- de bienes tiene que poder conciliarse contra el mayor de 1.2.2.XX.
--
--   · cont_bienes_uso: un renglón por bien (BU-NNNN, no editable) con sus
--     tres cuentas: origen (1.2.2.XX.01), amortización acumulada
--     (1.2.2.XX.03, regularizadora del activo) y gasto (egreso). Sin vida
--     útil = no se amortiza (terrenos). `amort_acum_inicial` es la
--     acumulada al corte (cont_config.bu_corte_inicial, 30/06/2026); un bien
--     dado de alta después del corte arranca en 0.
--   · cont_amortizacion_corridas + cont_amortizaciones: una corrida vigente
--     por `hasta` (período o ejercicio) con su asiento (tipo 'ajuste',
--     origen cont_amortizacion_corridas/'amortizacion', 20260928q) y el
--     detalle por bien. Anular una corrida deja sus filas asociadas, que ya
--     no cuentan.
--   · Teórico (_cont_bu_teorico): lineal, sin reiniciar la vida útil;
--     proporcional = desde el 1° del mes de alta, completo = desde el 1° del
--     ejercicio de alta; con baja, hasta el mes anterior; tope en
--     valor_origen − valor_residual. La corrida registra «teórico −
--     registrado» (catch-up: un mes cerrado sin corrida o un cambio de vida
--     útil se ajustan en el próximo tramo abierto).
--   · Importador (cont_importar_bienes): todo o nada, con vista previa fila
--     por fila; resuelve la cuenta por código con puntos, código Finnegans
--     de 7 dígitos o nombre del rubro; la .03 hermana y el gasto del mapeo
--     `bienes.gasto` como defaults.
--   · Cuadro (cont_bienes_cuadro) con subtotales por rubro y control
--     inventario vs mayor.
--
-- Flag `contabilidad.bienes_uso` (default false) para escribir. Grants solo
-- service_role.
-- =====================================================================

create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

-- ── 1) Tablas ──────────────────────────────────────────────────────────
create sequence public.cont_bienes_uso_codigo_seq;

create table public.cont_bienes_uso (
  id                 bigserial primary key,
  codigo             text not null unique default 'BU-' || lpad(nextval('public.cont_bienes_uso_codigo_seq')::text, 4, '0'),
  descripcion        text not null check (length(btrim(descripcion)) >= 3),
  identificador      text not null default '',
  cuenta_origen_id   bigint not null references public.cont_cuentas(id),
  cuenta_amort_id    bigint references public.cont_cuentas(id),
  cuenta_gasto_id    bigint references public.cont_cuentas(id),
  fecha_alta         date not null,
  valor_origen       numeric(14,2) not null check (valor_origen > 0),
  vida_util_anios    numeric(5,2) check (vida_util_anios is null or vida_util_anios > 0),
  valor_residual     numeric(14,2) not null default 0 check (valor_residual >= 0),
  amort_acum_inicial numeric(14,2) not null default 0 check (amort_acum_inicial >= 0),
  metodo             text not null default 'lineal' check (metodo = 'lineal'),
  criterio_alta      text check (criterio_alta in ('completo', 'proporcional')),
  obra_cod           text references public.obras(cod),
  pagos_factura_id   bigint references public.pagos_facturas(id),
  fecha_baja         date,
  motivo_baja        text,
  obs                text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,
  constraint bu_residual_chk   check (valor_residual < valor_origen),
  constraint bu_inicial_chk    check (amort_acum_inicial <= valor_origen - valor_residual),
  constraint bu_amortiza_chk   check (vida_util_anios is null or (cuenta_amort_id is not null and cuenta_gasto_id is not null)),
  constraint bu_baja_chk       check ((fecha_baja is null) = (motivo_baja is null)),
  constraint bu_baja_fecha_chk check (fecha_baja is null or fecha_baja >= fecha_alta)
);
alter sequence public.cont_bienes_uso_codigo_seq owned by public.cont_bienes_uso.codigo;
create index cont_bienes_uso_origen_idx on public.cont_bienes_uso (cuenta_origen_id);
create index cont_bienes_uso_obra_idx on public.cont_bienes_uso (obra_cod) where obra_cod is not null;
create index cont_bienes_uso_factura_idx on public.cont_bienes_uso (pagos_factura_id) where pagos_factura_id is not null;

comment on table public.cont_bienes_uso is
  'Inventario de bienes de uso (BU-NNNN) con sus cuentas de origen, amortización acumulada y gasto. Sin vida útil = no se amortiza. amort_acum_inicial = acumulada al corte (cont_config.bu_corte_inicial). 20260928p.';

create table public.cont_amortizacion_corridas (
  id               bigserial primary key,
  desde            date not null,
  hasta            date not null,
  frecuencia       text not null check (frecuencia in ('mensual', 'anual')),
  estado           text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  asiento_id       bigint references public.cont_asientos(id),
  total            numeric(14,2) not null default 0,
  hash             text,
  motivo_anulacion text,
  anulado_por      uuid,
  anulado_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  constraint cont_amort_corrida_rango_chk check (desde <= hasta),
  constraint cont_amort_corrida_anulada_chk check (estado = 'vigente' or (motivo_anulacion is not null and anulado_at is not null))
);
create unique index cont_amortizacion_corridas_vigente_uidx on public.cont_amortizacion_corridas (hasta) where estado = 'vigente';
create index cont_amortizacion_corridas_asiento_idx on public.cont_amortizacion_corridas (asiento_id) where asiento_id is not null;

comment on table public.cont_amortizacion_corridas is
  'Corridas de amortización: una vigente por `hasta` (período o ejercicio), con su asiento (tipo ajuste, origen cont_amortizacion_corridas/amortizacion). 20260928p/q.';

create table public.cont_amortizaciones (
  id                  bigserial primary key,
  corrida_id          bigint not null references public.cont_amortizacion_corridas(id) on delete cascade,
  bien_id             bigint not null references public.cont_bienes_uso(id),
  hasta               date not null,
  meses               numeric(6,2) not null,
  importe             numeric(14,2) not null check (importe >= 0),
  acumulada_al_cierre numeric(14,2) not null,
  constraint cont_amortizaciones_bien_corrida_key unique (bien_id, corrida_id)
);
create index cont_amortizaciones_corrida_idx on public.cont_amortizaciones (corrida_id);

comment on table public.cont_amortizaciones is
  'Detalle por bien de cada corrida de amortización. Solo cuentan las de corridas vigentes. 20260928p.';

-- ── 2) Piezas de cálculo ───────────────────────────────────────────────
create or replace function public._cont_bu_corte()
returns date language sql stable set search_path = public, pg_temp as $$
  select coalesce((public._cont_cfg('bu_corte_inicial') #>> '{}')::date, date '2026-06-30')
$$;

-- 1° del ejercicio que contiene p_fecha (o, si no hay ejercicio cargado para
-- esa fecha, el mismo mes de inicio que el primer ejercicio: julio).
create or replace function public._cont_bu_inicio_ejercicio(p_fecha date)
returns date language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select e.desde from public.cont_ejercicios e where p_fecha between e.desde and e.hasta),
    (select case when extract(month from p_fecha) >= m.mes
                 then make_date(extract(year from p_fecha)::int, m.mes, 1)
                 else make_date(extract(year from p_fecha)::int - 1, m.mes, 1) end
       from (select coalesce((select extract(month from desde)::int from public.cont_ejercicios order by desde limit 1), 7) as mes) m))
$$;

-- Meses amortizables de un bien hasta p_d2 (inclusive, meses completos).
create or replace function public._cont_bu_meses(p_b public.cont_bienes_uso, p_d2 date)
returns int language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_ini date;
  v_m0  date;
  v_fin date;
  v_n   int;
begin
  if p_b.vida_util_anios is null or p_d2 is null then return 0; end if;
  v_ini := case when coalesce(p_b.criterio_alta, public._cont_cfg('bu_criterio_alta') #>> '{}', 'proporcional') = 'completo'
                then public._cont_bu_inicio_ejercicio(p_b.fecha_alta)
                else date_trunc('month', p_b.fecha_alta::timestamp)::date end;
  v_m0  := date_trunc('month', greatest(v_ini, public._cont_bu_corte() + 1)::timestamp)::date;
  -- Fin exclusivo: el mes siguiente a p_d2, o el mes de la baja (se amortiza
  -- hasta el mes ANTERIOR a la baja, P-B2).
  v_fin := least((date_trunc('month', p_d2::timestamp) + interval '1 month')::date,
                 coalesce(date_trunc('month', p_b.fecha_baja::timestamp)::date, 'infinity'::date));
  v_n := (extract(year from v_fin)::int * 12 + extract(month from v_fin)::int)
       - (extract(year from v_m0)::int * 12 + extract(month from v_m0)::int);
  return greatest(v_n, 0);
end $$;

-- Acumulada teórica al p_d2 (sin reiniciar la vida útil, con tope).
create or replace function public._cont_bu_teorico(p_b public.cont_bienes_uso, p_d2 date)
returns numeric language sql stable set search_path = public, pg_temp as $$
  select case
    when p_b.vida_util_anios is null then p_b.amort_acum_inicial
    else round(least(p_b.valor_origen - p_b.valor_residual,
                     p_b.amort_acum_inicial
                     + (p_b.valor_origen - p_b.valor_residual) / (p_b.vida_util_anios * 12) * public._cont_bu_meses(p_b, p_d2)), 2)
  end
$$;

-- Registrado (inicial + corridas vigentes) de un bien con hasta ≤ p_hasta.
create or replace function public._cont_bu_registrado(p_bien_id bigint, p_hasta date)
returns numeric language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(a.importe), 0)
    from public.cont_amortizaciones a
    join public.cont_amortizacion_corridas k on k.id = a.corrida_id and k.estado = 'vigente'
   where a.bien_id = p_bien_id and (p_hasta is null or k.hasta <= p_hasta)
$$;

-- Defaults de cuentas a partir de la cuenta de origen: la .03 hermana y el
-- mapeo bienes.gasto [título, general].
create or replace function public._cont_bu_defaults(p_cuenta_origen_id bigint)
returns table (cuenta_amort_id bigint, cuenta_gasto_id bigint)
language sql stable set search_path = public, pg_temp as $$
  select (select h.id from public.cont_cuentas h
           where h.codigo = t.codigo || '.03' and h.activo and h.imputable and h.rubro = 'activo'),
         public._cont_cuenta_mapeada('bienes.gasto', array[coalesce(t.codigo, ''), ''])
    from public.cont_cuentas c
    left join public.cont_cuentas t on t.id = c.padre_id
   where c.id = p_cuenta_origen_id
$$;

-- Código Finnegans de dígitos → código con puntos (1220401 → 1.2.2.04.01).
create or replace function public._cont_codigo_finnegans(p_txt text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v text := btrim(coalesce(p_txt, ''));
  r text;
  i int;
begin
  if v !~ '^[0-9]{3,11}$' or (length(v) - 3) % 2 <> 0 then return null; end if;
  r := substr(v, 1, 1) || '.' || substr(v, 2, 1) || '.' || substr(v, 3, 1);
  i := 4;
  while i <= length(v) loop
    r := r || '.' || substr(v, i, 2);
    i := i + 2;
  end loop;
  return r;
end $$;

-- Resuelve una cuenta de texto (código con puntos, Finnegans o nombre).
-- p_modo: 'origen' (un título se lleva a su .01), 'amort' (activo), 'gasto'
-- (egreso). Null si no la encuentra o es ambigua.
create or replace function public._cont_bu_resolver_cuenta(p_txt text, p_modo text)
returns bigint language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_t   text := btrim(coalesce(p_txt, ''));
  v_cod text;
  c     public.cont_cuentas%rowtype;
  v_n   int;
  v_id  bigint;
  v_rub text := case p_modo when 'gasto' then 'egreso' else 'activo' end;
begin
  if v_t = '' then return null; end if;
  v_cod := coalesce(public._cont_codigo_finnegans(v_t), v_t);
  select * into c from public.cont_cuentas where codigo = v_cod and activo;
  if not found then
    select count(*), min(id) into v_n, v_id from public.cont_cuentas
     where activo and rubro = v_rub and public.norm_txt(nombre) = public.norm_txt(v_t)
       and (imputable or (p_modo = 'origen' and codigo like '1.2.2.%'));
    if v_n <> 1 then return null; end if;
    select * into c from public.cont_cuentas where id = v_id;
  end if;
  if c.imputable then
    return case when c.rubro = v_rub then c.id end;
  end if;
  if p_modo = 'origen' then
    return (select h.id from public.cont_cuentas h
             where h.codigo = c.codigo || '.01' and h.activo and h.imputable and h.rubro = 'activo');
  end if;
  return null;
end $$;

create or replace function public._cont_bu_resolver_obra(p_txt text)
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_t  text := btrim(coalesce(p_txt, ''));
  v_n  int;
  v_c  text;
begin
  if v_t = '' then return null; end if;
  select o.cod into v_c from public.obras o where lower(o.cod) = lower(v_t);
  if found then return v_c; end if;
  select count(*), min(o.cod) into v_n, v_c from public.obras o where public.norm_txt(o.nom) = public.norm_txt(v_t);
  return case when v_n = 1 then v_c end;
end $$;

-- ── 3) Consistencia ────────────────────────────────────────────────────
create or replace function public.fn_cont_bien_consistente()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  c        public.cont_cuentas%rowtype;
  v_cambio boolean;
begin
  if tg_op = 'INSERT' or new.cuenta_origen_id is distinct from old.cuenta_origen_id then
    select * into c from public.cont_cuentas where id = new.cuenta_origen_id;
    if not found or not c.activo or not c.imputable or c.rubro <> 'activo' then
      raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'cuenta_origen_id', 'cuenta_id', new.cuenta_origen_id)::text;
    end if;
  end if;
  if new.cuenta_amort_id is not null and (tg_op = 'INSERT' or new.cuenta_amort_id is distinct from old.cuenta_amort_id) then
    select * into c from public.cont_cuentas where id = new.cuenta_amort_id;
    if not found or not c.activo or not c.imputable or c.rubro <> 'activo' then
      raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'cuenta_amort_id', 'cuenta_id', new.cuenta_amort_id)::text;
    end if;
  end if;
  if new.cuenta_gasto_id is not null and (tg_op = 'INSERT' or new.cuenta_gasto_id is distinct from old.cuenta_gasto_id) then
    select * into c from public.cont_cuentas where id = new.cuenta_gasto_id;
    if not found or not c.activo or not c.imputable or c.rubro <> 'egreso' then
      raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'cuenta_gasto_id', 'cuenta_id', new.cuenta_gasto_id)::text;
    end if;
  end if;
  if new.fecha_alta > public._cont_bu_corte() and new.amort_acum_inicial <> 0 then
    raise exception 'BU_INICIAL_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'amort_acum_inicial', 'motivo', 'alta_posterior_al_corte',
                                 'corte', public._cont_bu_corte())::text;
  end if;
  if tg_op = 'UPDATE' then
    v_cambio := new.cuenta_origen_id is distinct from old.cuenta_origen_id
             or new.cuenta_amort_id is distinct from old.cuenta_amort_id
             or new.cuenta_gasto_id is distinct from old.cuenta_gasto_id
             or new.fecha_alta is distinct from old.fecha_alta;
    if v_cambio and exists (
         select 1 from public.cont_amortizaciones am
           join public.cont_amortizacion_corridas k on k.id = am.corrida_id and k.estado = 'vigente'
           join public.cont_asientos a on a.id = k.asiento_id
           join public.cont_periodos p on p.id = a.periodo_id
          where am.bien_id = new.id and p.estado = 'cerrado') then
      raise exception 'BIEN_CON_AMORTIZACIONES_CERRADAS' using errcode = 'P0001', detail = json_build_object('bien_id', new.id)::text;
    end if;
  end if;
  return new;
end $$;

create trigger trg_cont_bien_consistente before insert or update on public.cont_bienes_uso
  for each row execute function public.fn_cont_bien_consistente();

-- ── 4) Vista ───────────────────────────────────────────────────────────
create or replace view public.v_cont_bienes_uso with (security_invoker = true) as
select b.id, b.codigo, b.descripcion, b.identificador,
       b.cuenta_origen_id, co.codigo as cuenta_origen_codigo, co.nombre as cuenta_origen_nombre,
       coalesce(t.codigo, co.codigo) as rubro_codigo, coalesce(t.nombre, co.nombre) as rubro_nombre,
       b.cuenta_amort_id, ca.codigo as cuenta_amort_codigo, ca.nombre as cuenta_amort_nombre,
       b.cuenta_gasto_id, cg.codigo as cuenta_gasto_codigo, cg.nombre as cuenta_gasto_nombre,
       b.fecha_alta, b.valor_origen, b.vida_util_anios, b.valor_residual, b.amort_acum_inicial,
       b.metodo, b.criterio_alta,
       coalesce(b.criterio_alta, public._cont_cfg('bu_criterio_alta') #>> '{}', 'proporcional') as criterio_efectivo,
       b.obra_cod, o.nom as obra_nom, b.pagos_factura_id,
       b.fecha_baja, b.motivo_baja, b.obs,
       (b.amort_acum_inicial + public._cont_bu_registrado(b.id, null))::numeric(14,2) as amort_acum_hoy,
       (b.valor_origen - b.amort_acum_inicial - public._cont_bu_registrado(b.id, null))::numeric(14,2) as valor_neto_hoy,
       exists (select 1 from public.cont_amortizaciones am
                 join public.cont_amortizacion_corridas k on k.id = am.corrida_id and k.estado = 'vigente'
                 join public.cont_asientos a on a.id = k.asiento_id
                 join public.cont_periodos p on p.id = a.periodo_id
                where am.bien_id = b.id and p.estado = 'cerrado') as tiene_amortizaciones_cerradas,
       b.created_by, pc.nombre as created_by_nombre, b.created_at, b.updated_at
  from public.cont_bienes_uso b
  join public.cont_cuentas co on co.id = b.cuenta_origen_id
  left join public.cont_cuentas t on t.id = co.padre_id
  left join public.cont_cuentas ca on ca.id = b.cuenta_amort_id
  left join public.cont_cuentas cg on cg.id = b.cuenta_gasto_id
  left join public.obras o on o.cod = b.obra_cod
  left join public.profiles pc on pc.id = b.created_by;

comment on view public.v_cont_bienes_uso is
  'Bienes de uso con nombres de cuentas, rubro (título 1.2.2.XX), obra y acumulada registrada a hoy (inicial + corridas vigentes). 20260928p.';

-- ── 5) ABM ─────────────────────────────────────────────────────────────
create or replace function public._cont_bien_json(p_id bigint)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select to_jsonb(v) from public.v_cont_bienes_uso v where v.id = p_id
$$;

create or replace function public.cont_guardar_bien(p_bien jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old   public.cont_bienes_uso%rowtype;
  v_id    bigint;
  v_desc  text;
  v_iden  text;
  v_co    bigint;
  v_ca    bigint;
  v_cg    bigint;
  v_fa    date;
  v_vo    numeric;
  v_vu    numeric;
  v_vr    numeric;
  v_ai    numeric;
  v_cri   text;
  v_obra  text;
  v_fac   bigint;
  v_obs   text;
  v_def   record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'bienes_uso') then
    raise exception 'SIN_PERMISO_BIENES' using errcode = 'P0001';
  end if;
  if p_bien is null or jsonb_typeof(p_bien) <> 'object' then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'descripcion')::text;
  end if;

  if nullif(p_bien ->> 'id', '') is not null then
    begin
      v_id := (p_bien ->> 'id')::bigint;
    exception when others then v_id := -1;
    end;
    select * into v_old from public.cont_bienes_uso where id = v_id for update;
    if not found then
      raise exception 'BIEN_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_bien -> 'id')::text;
    end if;
    if v_old.fecha_baja is not null then
      raise exception 'BIEN_DADO_DE_BAJA' using errcode = 'P0001', detail = json_build_object('id', v_id, 'fecha_baja', v_old.fecha_baja)::text;
    end if;
  end if;

  v_desc := btrim(regexp_replace(coalesce(p_bien ->> 'descripcion', ''), '\s+', ' ', 'g'));
  if length(v_desc) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'descripcion')::text;
  end if;
  v_iden := left(btrim(coalesce(p_bien ->> 'identificador', '')), 120);
  v_obs  := left(btrim(coalesce(p_bien ->> 'obs', '')), 1000);

  begin
    v_fa := nullif(btrim(coalesce(p_bien ->> 'fecha_alta', '')), '')::date;
  exception when others then v_fa := null;
  end;
  if v_fa is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'fecha_alta')::text;
  end if;

  begin
    v_vo := round(nullif(p_bien ->> 'valor_origen', '')::numeric, 2);
  exception when others then v_vo := null;
  end;
  if v_vo is null or v_vo <= 0 or v_vo >= 1e12 then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'valor_origen')::text;
  end if;
  begin
    v_vr := round(coalesce(nullif(p_bien ->> 'valor_residual', '')::numeric, 0), 2);
    v_ai := round(coalesce(nullif(p_bien ->> 'amort_acum_inicial', '')::numeric, 0), 2);
  exception when others then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'valor_residual')::text;
  end;
  if v_vr < 0 or v_vr >= v_vo then
    raise exception 'BU_RESIDUAL_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'valor_residual')::text;
  end if;
  if v_ai < 0 or v_ai > v_vo - v_vr then
    raise exception 'BU_INICIAL_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'amort_acum_inicial')::text;
  end if;
  if v_fa > public._cont_bu_corte() and v_ai <> 0 then
    raise exception 'BU_INICIAL_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'amort_acum_inicial', 'motivo', 'alta_posterior_al_corte', 'corte', public._cont_bu_corte())::text;
  end if;

  begin
    v_vu := nullif(p_bien ->> 'vida_util_anios', '')::numeric;
  exception when others then
    raise exception 'VIDA_UTIL_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'vida_util_anios')::text;
  end;
  if v_vu is not null and (v_vu <= 0 or v_vu > 100) then
    raise exception 'VIDA_UTIL_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'vida_util_anios')::text;
  end if;

  v_cri := nullif(btrim(coalesce(p_bien ->> 'criterio_alta', '')), '');
  if v_cri is not null and v_cri not in ('completo', 'proporcional') then
    raise exception 'VIDA_UTIL_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'criterio_alta')::text;
  end if;

  begin
    v_co := nullif(p_bien ->> 'cuenta_origen_id', '')::bigint;
    v_ca := nullif(p_bien ->> 'cuenta_amort_id', '')::bigint;
    v_cg := nullif(p_bien ->> 'cuenta_gasto_id', '')::bigint;
  exception when others then
    raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_origen_id')::text;
  end;
  if v_co is null or not exists (select 1 from public.cont_cuentas c
                                  where c.id = v_co and c.imputable and c.rubro = 'activo'
                                    and (c.activo or v_co = v_old.cuenta_origen_id)) then
    raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_origen_id', 'cuenta_id', v_co)::text;
  end if;
  if v_vu is not null then
    select * into v_def from public._cont_bu_defaults(v_co);
    v_ca := coalesce(v_ca, v_def.cuenta_amort_id);
    v_cg := coalesce(v_cg, v_def.cuenta_gasto_id);
    if v_ca is null then
      raise exception 'BU_SIN_CUENTA_AMORT' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_amort_id')::text;
    end if;
    if v_cg is null then
      raise exception 'BU_SIN_CUENTA_GASTO' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_gasto_id')::text;
    end if;
  end if;
  if v_ca is not null and not exists (select 1 from public.cont_cuentas c
                                       where c.id = v_ca and c.imputable and c.rubro = 'activo'
                                         and (c.activo or v_ca = v_old.cuenta_amort_id)) then
    raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_amort_id', 'cuenta_id', v_ca)::text;
  end if;
  if v_cg is not null and not exists (select 1 from public.cont_cuentas c
                                       where c.id = v_cg and c.imputable and c.rubro = 'egreso'
                                         and (c.activo or v_cg = v_old.cuenta_gasto_id)) then
    raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_gasto_id', 'cuenta_id', v_cg)::text;
  end if;

  v_obra := nullif(btrim(coalesce(p_bien ->> 'obra_cod', '')), '');
  if v_obra is not null and not exists (select 1 from public.obras where cod = v_obra) then
    raise exception 'OBRA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('campo', 'obra_cod', 'obra_cod', v_obra)::text;
  end if;
  begin
    v_fac := nullif(p_bien ->> 'pagos_factura_id', '')::bigint;
  exception when others then v_fac := -1;
  end;
  if v_fac is not null and not exists (select 1 from public.pagos_facturas where id = v_fac) then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('campo', 'pagos_factura_id')::text;
  end if;

  if v_old.id is null then
    insert into public.cont_bienes_uso (descripcion, identificador, cuenta_origen_id, cuenta_amort_id, cuenta_gasto_id,
                                        fecha_alta, valor_origen, vida_util_anios, valor_residual, amort_acum_inicial,
                                        criterio_alta, obra_cod, pagos_factura_id, obs, created_by, updated_by)
    values (v_desc, v_iden, v_co, v_ca, v_cg, v_fa, v_vo, v_vu, v_vr, v_ai, v_cri, v_obra, v_fac, v_obs, p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.cont_bienes_uso
       set descripcion = v_desc, identificador = v_iden, cuenta_origen_id = v_co, cuenta_amort_id = v_ca,
           cuenta_gasto_id = v_cg, fecha_alta = v_fa, valor_origen = v_vo, vida_util_anios = v_vu,
           valor_residual = v_vr, amort_acum_inicial = v_ai, criterio_alta = v_cri, obra_cod = v_obra,
           pagos_factura_id = v_fac, obs = v_obs, updated_by = p_user_id
     where id = v_id;
  end if;
  return public._cont_bien_json(v_id);
end $$;

comment on function public.cont_guardar_bien(jsonb, uuid) is
  'Alta (sin id) o edición de un bien de uso. Con vida útil, la cuenta de amortización y la de gasto salen de la .03 hermana y del mapeo bienes.gasto si no vienen. Flag contabilidad.bienes_uso. 20260928p.';

create or replace function public.cont_baja_bien(p_id bigint, p_fecha date, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b public.cont_bienes_uso%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'bienes_uso') then
    raise exception 'SIN_PERMISO_BIENES' using errcode = 'P0001';
  end if;
  select * into b from public.cont_bienes_uso where id = p_id for update;
  if not found then
    raise exception 'BIEN_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if b.fecha_baja is not null then
    raise exception 'BIEN_DADO_DE_BAJA' using errcode = 'P0001', detail = json_build_object('id', p_id, 'fecha_baja', b.fecha_baja)::text;
  end if;
  if p_fecha is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'fecha')::text;
  end if;
  if p_fecha < b.fecha_alta then
    raise exception 'FECHA_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'fecha', 'fecha_alta', b.fecha_alta)::text;
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  -- Ya amortizado (en un mes cerrado) en o después del mes de la baja.
  if exists (select 1 from public.cont_amortizaciones am
               join public.cont_amortizacion_corridas k on k.id = am.corrida_id and k.estado = 'vigente'
               join public.cont_asientos a on a.id = k.asiento_id
               join public.cont_periodos p on p.id = a.periodo_id
              where am.bien_id = p_id and p.estado = 'cerrado' and am.importe > 0
                and k.hasta >= date_trunc('month', p_fecha::timestamp)::date) then
    raise exception 'BAJA_ANTERIOR_A_AMORTIZADO' using errcode = 'P0001', detail = json_build_object('id', p_id, 'fecha', p_fecha)::text;
  end if;
  update public.cont_bienes_uso
     set fecha_baja = p_fecha, motivo_baja = left(btrim(p_motivo), 500), updated_by = p_user_id
   where id = p_id;
  return public._cont_bien_json(p_id);
end $$;

create or replace function public.cont_revertir_baja_bien(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b public.cont_bienes_uso%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'bienes_uso') then
    raise exception 'SIN_PERMISO_BIENES' using errcode = 'P0001';
  end if;
  select * into b from public.cont_bienes_uso where id = p_id for update;
  if not found then
    raise exception 'BIEN_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if b.fecha_baja is null then
    raise exception 'BIEN_SIN_BAJA' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  update public.cont_bienes_uso set fecha_baja = null, motivo_baja = null, updated_by = p_user_id where id = p_id;
  return public._cont_bien_json(p_id);
end $$;

-- ── 6) Importador ──────────────────────────────────────────────────────
-- p_filas: [{indice?, descripcion, cuenta, fecha_alta, valor_origen,
-- vida_util_anios, valor_residual, amort_acum_inicial, cuenta_amort,
-- cuenta_gasto, identificador, obra, obs}]. cuenta / cuenta_amort /
-- cuenta_gasto / obra vienen como texto (código o nombre) y se resuelven acá.
-- Todo o nada; con p_confirmar y errores → IMPORTACION_CON_ERRORES.
create or replace function public._cont_bu_num(p_v jsonb)
returns numeric language plpgsql immutable set search_path = public, pg_temp as $$
declare v text;
begin
  if p_v is null or jsonb_typeof(p_v) = 'null' then return null; end if;
  if jsonb_typeof(p_v) = 'number' then return (p_v #>> '{}')::numeric; end if;
  v := btrim(replace(replace(p_v #>> '{}', '$', ''), ' ', ''));
  if v = '' then return null; end if;
  begin
    return v::numeric;
  exception when others then
    return replace(replace(v, '.', ''), ',', '.')::numeric;   -- «1.234.567,89»
  end;
end $$;

create or replace function public._cont_bu_fecha(p_v jsonb)
returns date language plpgsql stable set search_path = public, pg_temp as $$
declare v text;
begin
  if p_v is null or jsonb_typeof(p_v) = 'null' then return null; end if;
  v := btrim(p_v #>> '{}');
  if v = '' then return null; end if;
  if v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then return left(v, 10)::date; end if;
  if v ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then return to_date(v, 'DD/MM/YYYY'); end if;
  if v ~ '^[0-9]{1,2}/[0-9]{4}$' then return to_date('01/' || v, 'DD/MM/YYYY'); end if;
  return v::date;
end $$;

create or replace function public.cont_importar_bienes(p_filas jsonb, p_user_id uuid, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e        jsonb;
  n        int;
  v_idx    int;
  v_err    jsonb;
  v_av     jsonb;
  v_desc   text;
  v_iden   text;
  v_co     bigint;
  v_ca     bigint;
  v_cg     bigint;
  v_fa     date;
  v_vo     numeric;
  v_vu     numeric;
  v_vr     numeric;
  v_ai     numeric;
  v_obra   text;
  v_def    record;
  v_corte  date := public._cont_bu_corte();
  v_filas  jsonb := '[]'::jsonb;
  v_res    jsonb;
  v_ok     int := 0;
  v_ce     int := 0;
  v_ca_n   int := 0;
  v_svo    numeric := 0;
  v_sai    numeric := 0;
  v_crea   int := 0;
  f        jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'bienes_uso') then
    raise exception 'SIN_PERMISO_BIENES' using errcode = 'P0001';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'SIN_FILAS' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 2000)::text;
  end if;

  for e, n in select x, t.n::int from jsonb_array_elements(p_filas) with ordinality as t(x, n) loop
    v_err := '[]'::jsonb; v_av := '[]'::jsonb;
    v_co := null; v_ca := null; v_cg := null; v_fa := null; v_vo := null; v_vu := null; v_vr := 0; v_ai := 0; v_obra := null;
    v_idx := coalesce(nullif(e ->> 'indice', '')::int, n);

    v_desc := btrim(regexp_replace(coalesce(e ->> 'descripcion', ''), '\s+', ' ', 'g'));
    if length(v_desc) < 3 then
      v_err := v_err || jsonb_build_object('codigo', 'DESCRIPCION_REQUERIDA', 'campo', 'descripcion');
    end if;
    v_iden := left(btrim(coalesce(e ->> 'identificador', '')), 120);

    begin
      v_fa := public._cont_bu_fecha(e -> 'fecha_alta');
    exception when others then v_fa := null;
    end;
    if v_fa is null then
      v_err := v_err || jsonb_build_object('codigo', 'FECHA_REQUERIDA', 'campo', 'fecha_alta');
    end if;

    begin
      v_vo := round(public._cont_bu_num(e -> 'valor_origen'), 2);
    exception when others then v_vo := null;
    end;
    if v_vo is null or v_vo <= 0 or v_vo >= 1e12 then
      v_err := v_err || jsonb_build_object('codigo', 'IMPORTE_INVALIDO', 'campo', 'valor_origen');
    end if;
    begin
      v_vr := round(coalesce(public._cont_bu_num(e -> 'valor_residual'), 0), 2);
    exception when others then
      v_err := v_err || jsonb_build_object('codigo', 'IMPORTE_INVALIDO', 'campo', 'valor_residual'); v_vr := 0;
    end;
    begin
      v_ai := round(coalesce(public._cont_bu_num(e -> 'amort_acum_inicial'), 0), 2);
    exception when others then
      v_err := v_err || jsonb_build_object('codigo', 'IMPORTE_INVALIDO', 'campo', 'amort_acum_inicial'); v_ai := 0;
    end;
    begin
      v_vu := public._cont_bu_num(e -> 'vida_util_anios');
    exception when others then
      v_err := v_err || jsonb_build_object('codigo', 'VIDA_UTIL_INVALIDA', 'campo', 'vida_util_anios'); v_vu := null;
    end;
    if v_vu is not null and (v_vu <= 0 or v_vu > 100) then
      v_err := v_err || jsonb_build_object('codigo', 'VIDA_UTIL_INVALIDA', 'campo', 'vida_util_anios');
    end if;
    if v_vo is not null and v_vo > 0 then
      if v_vr < 0 or v_vr >= v_vo then
        v_err := v_err || jsonb_build_object('codigo', 'BU_RESIDUAL_INVALIDO', 'campo', 'valor_residual');
      elsif v_ai < 0 or v_ai > v_vo - v_vr then
        v_err := v_err || jsonb_build_object('codigo', 'BU_INICIAL_INVALIDA', 'campo', 'amort_acum_inicial');
      end if;
    end if;
    if v_fa is not null and v_fa > v_corte and v_ai <> 0 then
      v_err := v_err || jsonb_build_object('codigo', 'BU_INICIAL_INVALIDA', 'campo', 'amort_acum_inicial');
    end if;

    v_co := public._cont_bu_resolver_cuenta(e ->> 'cuenta', 'origen');
    if v_co is null then
      v_err := v_err || jsonb_build_object('codigo', 'BU_CUENTA_INVALIDA', 'campo', 'cuenta');
    else
      select * into v_def from public._cont_bu_defaults(v_co);
      if nullif(btrim(coalesce(e ->> 'cuenta_amort', '')), '') is not null then
        v_ca := public._cont_bu_resolver_cuenta(e ->> 'cuenta_amort', 'amort');
        if v_ca is null then v_err := v_err || jsonb_build_object('codigo', 'BU_CUENTA_INVALIDA', 'campo', 'cuenta_amort'); end if;
      else
        v_ca := v_def.cuenta_amort_id;
      end if;
      if nullif(btrim(coalesce(e ->> 'cuenta_gasto', '')), '') is not null then
        v_cg := public._cont_bu_resolver_cuenta(e ->> 'cuenta_gasto', 'gasto');
        if v_cg is null then v_err := v_err || jsonb_build_object('codigo', 'BU_CUENTA_INVALIDA', 'campo', 'cuenta_gasto'); end if;
      else
        v_cg := v_def.cuenta_gasto_id;
      end if;
      if v_vu is not null and v_ca is null and nullif(btrim(coalesce(e ->> 'cuenta_amort', '')), '') is null then
        v_err := v_err || jsonb_build_object('codigo', 'BU_SIN_CUENTA_AMORT', 'campo', 'cuenta_amort');
      end if;
      if v_vu is not null and v_cg is null and nullif(btrim(coalesce(e ->> 'cuenta_gasto', '')), '') is null then
        v_err := v_err || jsonb_build_object('codigo', 'BU_SIN_CUENTA_GASTO', 'campo', 'cuenta_gasto');
      end if;
    end if;

    if nullif(btrim(coalesce(e ->> 'obra', '')), '') is not null then
      v_obra := public._cont_bu_resolver_obra(e ->> 'obra');
      if v_obra is null then v_err := v_err || jsonb_build_object('codigo', 'OBRA_NO_EXISTE', 'campo', 'obra'); end if;
    end if;

    -- Avisos.
    if v_vu is null then
      v_av := v_av || jsonb_build_object('codigo', 'NO_SE_AMORTIZA');
    end if;
    if (v_iden <> '' and (exists (select 1 from public.cont_bienes_uso b where public.norm_txt(b.identificador) = public.norm_txt(v_iden))
                          or exists (select 1 from jsonb_array_elements(v_filas) g
                                      where public.norm_txt(g -> 'resuelto' ->> 'identificador') = public.norm_txt(v_iden))))
       or (v_fa is not null and v_vo is not null
           and (exists (select 1 from public.cont_bienes_uso b
                         where public.norm_txt(b.descripcion) = public.norm_txt(v_desc) and b.fecha_alta = v_fa and b.valor_origen = v_vo)
                or exists (select 1 from jsonb_array_elements(v_filas) g
                            where public.norm_txt(g -> 'resuelto' ->> 'descripcion') = public.norm_txt(v_desc)
                              and g -> 'resuelto' ->> 'fecha_alta' = v_fa::text
                              and (g -> 'resuelto' ->> 'valor_origen')::numeric = v_vo))) then
      v_av := v_av || jsonb_build_object('codigo', 'BIEN_DUPLICADO');
    end if;

    v_res := jsonb_build_object(
      'descripcion', v_desc, 'identificador', v_iden,
      'cuenta_origen_id', v_co, 'cuenta_origen_codigo', (select codigo from public.cont_cuentas where id = v_co),
      'cuenta_amort_id', v_ca, 'cuenta_amort_codigo', (select codigo from public.cont_cuentas where id = v_ca),
      'cuenta_gasto_id', v_cg, 'cuenta_gasto_codigo', (select codigo from public.cont_cuentas where id = v_cg),
      'fecha_alta', v_fa, 'valor_origen', v_vo, 'vida_util_anios', v_vu, 'valor_residual', v_vr,
      'amort_acum_inicial', v_ai, 'obra_cod', v_obra, 'obs', left(btrim(coalesce(e ->> 'obs', '')), 1000));

    v_filas := v_filas || jsonb_build_object(
      'indice', v_idx,
      'estado', case when jsonb_array_length(v_err) > 0 then 'error' when jsonb_array_length(v_av) > 0 then 'aviso' else 'ok' end,
      'errores', v_err, 'avisos', v_av, 'resuelto', v_res);

    if jsonb_array_length(v_err) > 0 then
      v_ce := v_ce + 1;
    else
      if jsonb_array_length(v_av) > 0 then v_ca_n := v_ca_n + 1; else v_ok := v_ok + 1; end if;
      v_svo := v_svo + v_vo;
      v_sai := v_sai + v_ai;
    end if;
  end loop;

  if coalesce(p_confirmar, false) then
    if v_ce > 0 then
      raise exception 'IMPORTACION_CON_ERRORES' using errcode = 'P0001',
        detail = jsonb_build_object('filas', (select jsonb_agg(g) from jsonb_array_elements(v_filas) g where g ->> 'estado' = 'error'),
                                    'resumen', jsonb_build_object('total', jsonb_array_length(v_filas), 'ok', v_ok,
                                                                  'con_error', v_ce, 'con_aviso', v_ca_n,
                                                                  'valor_origen', v_svo, 'amort_acum_inicial', v_sai))::text;
    end if;
    for f in select g -> 'resuelto' from jsonb_array_elements(v_filas) g loop
      insert into public.cont_bienes_uso (descripcion, identificador, cuenta_origen_id, cuenta_amort_id, cuenta_gasto_id,
                                          fecha_alta, valor_origen, vida_util_anios, valor_residual, amort_acum_inicial,
                                          obra_cod, obs, created_by, updated_by)
      values (f ->> 'descripcion', f ->> 'identificador', (f ->> 'cuenta_origen_id')::bigint,
              (f ->> 'cuenta_amort_id')::bigint, (f ->> 'cuenta_gasto_id')::bigint,
              (f ->> 'fecha_alta')::date, (f ->> 'valor_origen')::numeric, (f ->> 'vida_util_anios')::numeric,
              (f ->> 'valor_residual')::numeric, (f ->> 'amort_acum_inicial')::numeric,
              f ->> 'obra_cod', f ->> 'obs', p_user_id, p_user_id);
      v_crea := v_crea + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'confirmado', coalesce(p_confirmar, false),
    'creados', v_crea,
    'resumen', jsonb_build_object('total', jsonb_array_length(v_filas), 'ok', v_ok, 'con_error', v_ce, 'con_aviso', v_ca_n,
                                  'valor_origen', v_svo, 'amort_acum_inicial', v_sai),
    'filas', v_filas);
end $$;

-- ── 7) Cuadro de amortizaciones ────────────────────────────────────────
create or replace function public.cont_bienes_cuadro(p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  eje    public.cont_ejercicios%rowtype;
  v_out  jsonb;
begin
  if p_hasta is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'hasta')::text;
  end if;
  select * into eje from public.cont_ejercicios where p_hasta between desde and hasta;
  if not found then
    raise exception 'FECHA_SIN_PERIODO' using errcode = 'P0001', detail = json_build_object('campo', 'hasta', 'fecha', p_hasta)::text;
  end if;

  with bienes as (
    select b.*, co.codigo as origen_codigo, coalesce(t.codigo, co.codigo) as rubro_codigo,
           coalesce(t.nombre, co.nombre) as rubro_nombre, coalesce(t.codigo_orden, co.codigo_orden) as rubro_orden,
           b.amort_acum_inicial + coalesce((select sum(a.importe) from public.cont_amortizaciones a
                                              join public.cont_amortizacion_corridas k on k.id = a.corrida_id and k.estado = 'vigente'
                                             where a.bien_id = b.id and k.hasta < eje.desde), 0) as acum_inicio,
           coalesce((select sum(a.importe) from public.cont_amortizaciones a
                       join public.cont_amortizacion_corridas k on k.id = a.corrida_id and k.estado = 'vigente'
                      where a.bien_id = b.id and k.hasta between eje.desde and p_hasta), 0) as amort_ej,
           public._cont_bu_teorico(b, p_hasta) as teorico
      from public.cont_bienes_uso b
      join public.cont_cuentas co on co.id = b.cuenta_origen_id
      left join public.cont_cuentas t on t.id = co.padre_id
     where b.fecha_alta <= p_hasta and (b.fecha_baja is null or b.fecha_baja >= eje.desde)
  ),
  filas as (
    select jsonb_build_object(
             'bien_id', id, 'codigo', codigo, 'descripcion', descripcion, 'identificador', identificador,
             'rubro_codigo', rubro_codigo, 'rubro_nombre', rubro_nombre, 'fecha_alta', fecha_alta, 'fecha_baja', fecha_baja,
             'valor_origen', valor_origen, 'valor_residual', valor_residual, 'vida_util_anios', vida_util_anios,
             'amort_acum_inicio', acum_inicio, 'amort_ejercicio', amort_ej, 'amort_acum_cierre', acum_inicio + amort_ej,
             'valor_neto', valor_origen - acum_inicio - amort_ej,
             'falta_amortizar_teorico', teorico - acum_inicio - amort_ej,
             'obra_cod', obra_cod) as j, rubro_orden, codigo
      from bienes
  ),
  rubros as (
    select jsonb_build_object(
             'rubro_codigo', rubro_codigo, 'rubro_nombre', rubro_nombre, 'cantidad', count(*),
             'valor_origen', sum(valor_origen), 'valor_residual', sum(valor_residual),
             'amort_acum_inicio', sum(acum_inicio), 'amort_ejercicio', sum(amort_ej),
             'amort_acum_cierre', sum(acum_inicio + amort_ej), 'valor_neto', sum(valor_origen - acum_inicio - amort_ej),
             'falta_amortizar_teorico', sum(teorico - acum_inicio - amort_ej)) as j, min(rubro_orden) as ord
      from bienes group by rubro_codigo, rubro_nombre
  ),
  vigentes as (select * from bienes where fecha_baja is null or fecha_baja > p_hasta),
  inv as (
    select cuenta_origen_id as cuenta_id, 'origen'::text as tipo, sum(valor_origen) as inventario from vigentes group by 1
    union all
    select cuenta_amort_id, 'amortizacion', sum(acum_inicio + amort_ej) from vigentes where cuenta_amort_id is not null group by 1
  ),
  ctrl as (
    select jsonb_build_object(
             'cuenta_id', c.id, 'codigo', c.codigo, 'nombre', c.nombre, 'tipo', i.tipo,
             'inventario', i.inventario, 'mayor', m.saldo, 'diferencia', m.saldo - i.inventario) as j, c.codigo_orden
      from (select cuenta_id, tipo, sum(inventario) as inventario from inv group by 1, 2) i
      join public.cont_cuentas c on c.id = i.cuenta_id
      cross join lateral (
        select coalesce(sum(case when i.tipo = 'origen' then l.debe - l.haber else l.haber - l.debe end), 0)::numeric(14,2) as saldo
          from public.cont_asiento_lineas l
          join public.cont_asientos a on a.id = l.asiento_id
         where l.cuenta_id = c.id and a.estado = 'confirmado' and a.fecha <= p_hasta) m
  )
  select jsonb_build_object(
    'ejercicio', jsonb_build_object('id', eje.id, 'nombre', eje.nombre, 'desde', eje.desde, 'hasta', eje.hasta, 'estado', eje.estado),
    'hasta', p_hasta,
    'filas', coalesce((select jsonb_agg(j order by rubro_orden, codigo) from filas), '[]'::jsonb),
    'rubros', coalesce((select jsonb_agg(j order by ord) from rubros), '[]'::jsonb),
    'control_mayor', coalesce((select jsonb_agg(j order by codigo_orden) from ctrl), '[]'::jsonb))
    into v_out;
  return v_out;
end $$;

comment on function public.cont_bienes_cuadro(date) is
  'Cuadro de amortizaciones del ejercicio que contiene p_hasta: por bien, subtotales por rubro y control inventario vs mayor (origen: debe−haber; amortización: haber−debe). 20260928p.';

-- ── 8) «En uso» del mapeo bienes.gasto ─────────────────────────────────
do $m$
declare v text;
begin
  v := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'fondos.concepto' then$a$,
$a$    when 'bienes.gasto' then
      select count(*) into v_n from public.cont_bienes_uso b
        join public.cont_cuentas c on c.id = b.cuenta_origen_id
        left join public.cont_cuentas t on t.id = c.padre_id
       where b.fecha_baja is null and b.vida_util_anios is not null and (p_sub = '' or t.codigo = p_sub);
    when 'fondos.concepto' then$a$);
  execute v;
end $m$;

-- ── 9) Auditoría, RLS y grants ─────────────────────────────────────────
create trigger trg_cont_bienes_uso_touch before update on public.cont_bienes_uso
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.cont_bienes_uso
  for each row execute function public.audit_cambios('contabilidad', 'bien de uso', 'id');
create trigger trg_audit_borrado after delete on public.cont_bienes_uso
  for each row execute function public.audit_borrado('contabilidad', 'bien de uso', 'id');

create trigger trg_cont_amort_corridas_touch before update on public.cont_amortizacion_corridas
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.cont_amortizacion_corridas
  for each row execute function public.audit_cambios('contabilidad', 'corrida de amortización', 'id');
create trigger trg_audit_borrado after delete on public.cont_amortizacion_corridas
  for each row execute function public.audit_borrado('contabilidad', 'corrida de amortización', 'id');

do $$
declare t text;
begin
  foreach t in array array['cont_bienes_uso', 'cont_amortizacion_corridas', 'cont_amortizaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t || '_id_seq');
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $$;
revoke all on sequence public.cont_bienes_uso_codigo_seq from public, anon, authenticated;
grant usage, select on sequence public.cont_bienes_uso_codigo_seq to service_role;

revoke all on table public.v_cont_bienes_uso from public, anon, authenticated;
grant select on table public.v_cont_bienes_uso to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_bu_corte()',
    '_cont_bu_inicio_ejercicio(date)',
    '_cont_bu_meses(cont_bienes_uso, date)',
    '_cont_bu_teorico(cont_bienes_uso, date)',
    '_cont_bu_registrado(bigint, date)',
    '_cont_bu_defaults(bigint)',
    '_cont_codigo_finnegans(text)',
    '_cont_bu_resolver_cuenta(text, text)',
    '_cont_bu_resolver_obra(text)',
    '_cont_bu_num(jsonb)',
    '_cont_bu_fecha(jsonb)',
    'fn_cont_bien_consistente()',
    '_cont_bien_json(bigint)',
    'cont_guardar_bien(jsonb, uuid)',
    'cont_baja_bien(bigint, date, text, uuid)',
    'cont_revertir_baja_bien(bigint, uuid)',
    'cont_importar_bienes(jsonb, uuid, boolean)',
    'cont_bienes_cuadro(date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
