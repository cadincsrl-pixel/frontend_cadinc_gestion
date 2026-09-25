-- =====================================================================
-- 20260929e — Montos de ARCA con vigencia (2026-09-25)
--
-- Tanda 6, ítem 4 (spec «configuración del ERP desde la pantalla» §3.4).
-- La spec lo reservaba como 20260929b; esa letra la tomaron productos.
--
-- 1) `ventas_parametros`: monto mínimo de la FCE MiPyME y tope de
--    identificación de consumidor final, cada uno con su fecha de vigencia.
--    La tabla NO se edita en el lugar: un valor nuevo es una fila nueva con
--    su `vigente_desde`; el historial es la tabla misma. Solo se puede
--    borrar una vigencia FUTURA, y cada clave conserva al menos una fila.
--    Semilla = los valores que tenían las funciones hasta hoy (5.549.862 y
--    10.000.000), vigentes desde fechas anteriores a toda factura existente
--    (la más vieja es del 23/09/2026): ningún resultado cambia.
-- 2) `_ventas_parametro(clave, fecha)`: el último valor con
--    vigente_desde <= fecha; si la fecha es anterior a todos, el más viejo
--    (nunca null). `_ventas_monto_minimo_fce()` y `_ventas_tope_cf()` pasan
--    de IMMUTABLE con el número escrito a STABLE leyendo la tabla (misma
--    firma y mismo resultado hoy), y se suman las variantes `(date)`.
--    No las usa ningún CHECK ni índice (verificado).
-- 3) Parches por ancla: `ventas_guardar_borrador` usa el mínimo a la fecha
--    del comprobante (3 usos) y `fn_ventas_cf_identificado` el tope a la
--    fecha del comprobante (2 usos).
-- 4) RPCs `ventas_parametros_json`, `ventas_parametros_vigentes`,
--    `ventas_guardar_parametro` y `ventas_borrar_parametro`
--    (flag facturacion.configurar).
-- =====================================================================

create or replace function pg_temp._n(p_txt text, p_ancla text, p_nuevo text, p_veces int) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception 'ANCLA_NO_UNICA (% veces, se esperaban %): %', v_n, p_veces, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

-- ── 1) Tabla ────────────────────────────────────────────────────────────
create table public.ventas_parametros (
  id            bigserial primary key,
  clave         text          not null check (clave in ('monto_minimo_fce', 'tope_cf_identificacion')),
  valor         numeric(14,2) not null check (valor > 0),
  vigente_desde date          not null,
  fuente        text          not null default '' check (length(fuente) <= 120),
  obs           text          not null default '' check (length(obs) <= 500),
  created_at    timestamptz   not null default now(),
  created_by    uuid,
  constraint ventas_parametros_clave_desde_key unique (clave, vigente_desde)
);

comment on table public.ventas_parametros is
  'Montos de ARCA con vigencia (Ventas › Configuración). No se editan: un valor nuevo es una fila nueva. Solo se escriben por ventas_guardar_parametro() / ventas_borrar_parametro(). Los lee _ventas_parametro(clave, fecha).';

insert into public.ventas_parametros (clave, valor, vigente_desde, fuente) values
  ('monto_minimo_fce',       5549862,  '2026-04-14', 'Registro FCE MiPyMEs ARCA'),
  ('tope_cf_identificacion', 10000000, '2025-05-29', 'RG ARCA 5700/2025');

create trigger trg_audit_cambios after update on public.ventas_parametros
  for each row execute function public.audit_cambios('facturacion', 'parámetro ARCA', 'id');
create trigger trg_audit_borrado after delete on public.ventas_parametros
  for each row execute function public.audit_borrado('facturacion', 'parámetro ARCA', 'id');

alter table public.ventas_parametros enable row level security;
create policy ventas_parametros_all on public.ventas_parametros for all using (true) with check (true);
revoke all on table public.ventas_parametros from public, anon, authenticated;
grant all on table public.ventas_parametros to service_role;
revoke all on sequence public.ventas_parametros_id_seq from public, anon, authenticated;
grant all on sequence public.ventas_parametros_id_seq to service_role;

-- ── 2) Lectores ─────────────────────────────────────────────────────────
create or replace function public._ventas_parametro(p_clave text, p_fecha date)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select valor from public.ventas_parametros
      where clave = p_clave and vigente_desde <= coalesce(p_fecha, public.hoy_ar())
      order by vigente_desde desc limit 1),
    (select valor from public.ventas_parametros
      where clave = p_clave order by vigente_desde asc limit 1))
$$;

create or replace function public._ventas_monto_minimo_fce()
returns numeric language sql stable set search_path to 'public', 'pg_temp'
as $$ select public._ventas_parametro('monto_minimo_fce', public.hoy_ar()) $$;

create or replace function public._ventas_monto_minimo_fce(p_fecha date)
returns numeric language sql stable set search_path to 'public', 'pg_temp'
as $$ select public._ventas_parametro('monto_minimo_fce', p_fecha) $$;

create or replace function public._ventas_tope_cf()
returns numeric language sql stable set search_path to 'public', 'pg_temp'
as $$ select public._ventas_parametro('tope_cf_identificacion', public.hoy_ar()) $$;

create or replace function public._ventas_tope_cf(p_fecha date)
returns numeric language sql stable set search_path to 'public', 'pg_temp'
as $$ select public._ventas_parametro('tope_cf_identificacion', p_fecha) $$;

-- ── 3) Parches por ancla (sobre la definición viva) ─────────────────────
do $p$
declare
  v_def text := pg_get_functiondef('public.ventas_guardar_borrador(jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v_def := pg_temp._n(v_def, 'public._ventas_monto_minimo_fce()', 'public._ventas_monto_minimo_fce(v_fecha)', 3);
  execute v_def;

  v_def := pg_get_functiondef('public.fn_ventas_cf_identificado()'::regprocedure);
  v_def := pg_temp._n(v_def, 'public._ventas_tope_cf()', 'public._ventas_tope_cf(new.fecha_cbte)', 2);
  execute v_def;
end $p$;

-- ── 4) RPCs ─────────────────────────────────────────────────────────────
-- Estado de cada fila respecto de HOY: la vigente es la última con
-- vigente_desde <= hoy (o la más vieja si todas son futuras).
create or replace function public.ventas_parametros_json(p_clave text default null)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with v as (
    select distinct on (clave) clave, id
      from public.ventas_parametros
     order by clave, (vigente_desde <= public.hoy_ar()) desc,
              case when vigente_desde <= public.hoy_ar() then vigente_desde end desc nulls last,
              vigente_desde asc
  )
  select coalesce(jsonb_agg(
           to_jsonb(p) || jsonb_build_object('estado',
             case when p.id in (select id from v) then 'vigente'
                  when p.vigente_desde > public.hoy_ar() then 'futuro'
                  else 'historico' end)
           order by p.clave, p.vigente_desde desc), '[]'::jsonb)
    from public.ventas_parametros p
   where p_clave is null or p.clave = p_clave
$$;

create or replace function public.ventas_parametros_vigentes(p_fecha date default null)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'fecha', coalesce(p_fecha, public.hoy_ar()),
    'monto_minimo_fce', public._ventas_parametro('monto_minimo_fce', coalesce(p_fecha, public.hoy_ar())),
    'tope_cf_identificacion', public._ventas_parametro('tope_cf_identificacion', coalesce(p_fecha, public.hoy_ar())))
$$;

create or replace function public.ventas_guardar_parametro(p jsonb, p_user_id uuid, p_forzar boolean default false)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_clave  text;
  v_valor  numeric;
  v_desde  date;
  v_fuente text;
  v_obs    text;
  v_n      int;
  v_id     bigint;
  v_k      text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', null)::text;
  end if;
  for v_k in select jsonb_object_keys(p) loop
    if v_k not in ('clave', 'valor', 'vigente_desde', 'fuente', 'obs') then
      raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;

  v_clave := p ->> 'clave';
  if v_clave is null or v_clave not in ('monto_minimo_fce', 'tope_cf_identificacion') then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'clave')::text;
  end if;
  if jsonb_typeof(p -> 'valor') <> 'number' or (p ->> 'valor')::numeric <= 0
     or (p ->> 'valor')::numeric >= 1e12 or round((p ->> 'valor')::numeric, 2) <> (p ->> 'valor')::numeric then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'valor')::text;
  end if;
  v_valor := (p ->> 'valor')::numeric;
  if coalesce(p ->> 'vigente_desde', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'vigente_desde')::text;
  end if;
  begin
    v_desde := (p ->> 'vigente_desde')::date;
  exception when others then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'vigente_desde')::text;
  end;
  if v_desde < date '2020-01-01' or v_desde > public.hoy_ar() + 3650 then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'vigente_desde')::text;
  end if;
  v_fuente := btrim(regexp_replace(coalesce(p ->> 'fuente', ''), '\s+', ' ', 'g'));
  v_obs    := btrim(coalesce(p ->> 'obs', ''));
  if length(v_fuente) > 120 then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'fuente')::text;
  end if;
  if length(v_obs) > 500 then
    raise exception 'PARAMETRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'obs')::text;
  end if;

  -- Serializa las altas de la misma clave.
  perform 1 from public.ventas_parametros where clave = v_clave for update;

  if exists (select 1 from public.ventas_parametros where clave = v_clave and vigente_desde = v_desde) then
    raise exception 'PARAMETRO_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('campo', 'vigente_desde', 'clave', v_clave, 'vigente_desde', v_desde)::text;
  end if;

  -- Retroactivo: hay comprobantes autorizados en producción desde esa fecha.
  if v_desde < public.hoy_ar() then
    select count(*) into v_n from public.ventas_facturas
     where ambiente = 'prod' and estado = 'autorizada' and fecha_cbte >= v_desde;
    if v_n > 0 and not coalesce(p_forzar, false) then
      raise exception 'PARAMETRO_RETROACTIVO' using errcode = 'P0001',
        detail = json_build_object('campo', 'vigente_desde', 'vigente_desde', v_desde, 'facturas', v_n)::text;
    end if;
  end if;

  insert into public.ventas_parametros (clave, valor, vigente_desde, fuente, obs, created_by)
  values (v_clave, v_valor, v_desde, v_fuente, v_obs, p_user_id)
  returning id into v_id;

  return (select e from jsonb_array_elements(public.ventas_parametros_json(v_clave)) e where (e ->> 'id')::bigint = v_id);
end $$;

create or replace function public.ventas_borrar_parametro(p_id bigint, p_user_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.ventas_parametros%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  select * into v_row from public.ventas_parametros where id = p_id;
  if not found then
    raise exception 'PARAMETRO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  perform 1 from public.ventas_parametros where clave = v_row.clave for update;
  if v_row.vigente_desde <= public.hoy_ar() then
    raise exception 'PARAMETRO_YA_VIGENTE' using errcode = 'P0001',
      detail = json_build_object('id', p_id, 'vigente_desde', v_row.vigente_desde)::text;
  end if;
  if (select count(*) from public.ventas_parametros where clave = v_row.clave) <= 1 then
    raise exception 'PARAMETRO_ULTIMO' using errcode = 'P0001',
      detail = json_build_object('id', p_id, 'clave', v_row.clave)::text;
  end if;
  delete from public.ventas_parametros where id = p_id;
  return to_jsonb(v_row);
end $$;

-- ── 5) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_ventas_parametro(text, date)',
    '_ventas_monto_minimo_fce()',
    '_ventas_monto_minimo_fce(date)',
    '_ventas_tope_cf()',
    '_ventas_tope_cf(date)',
    'ventas_parametros_json(text)',
    'ventas_parametros_vigentes(date)',
    'ventas_guardar_parametro(jsonb, uuid, boolean)',
    'ventas_borrar_parametro(bigint, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
