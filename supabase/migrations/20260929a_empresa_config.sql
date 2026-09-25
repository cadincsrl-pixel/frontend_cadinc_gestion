-- =====================================================================
-- 20260929a — Datos de la empresa editables desde Admin (2026-09-25)
--
-- Tanda 6, ítem 1 (spec «configuración del ERP desde la pantalla» §3.1).
--
-- 1) `_perm_flag(user, modulo, flag, default)`: helper genérico, espejo de
--    `_pagos_flag` para cualquier módulo. Lleva el coalesce por AFUERA
--    (sin fila → false, no NULL; ver CLAUDE.md §5.18).
-- 2) `empresa_config`: UNA fila (id = 1) con la identidad de la empresa.
--    Semilla = los valores que hoy imprimen los PDF (src/lib/config/empresa.ts).
--    El CUIT NO se edita: va atado al certificado de ARCA (ARCA_CUIT).
--    `calle_factura` existe para que la factura salga IGUAL que hoy: la de
--    Finnegans imprimía «Maipú 396 3», la OP imprime «Maipú 396, Dpto. 3».
--    Vacía = se usa `domicilio_calle`.
-- 3) `empresa_config_json()` (lectura con derivados) y
--    `empresa_guardar(p_cambios, p_user_id)` (única puerta de escritura,
--    pide admin.configurar).
-- 4) `_ventas_cuit_emisor()` pasa a leer la tabla (STABLE, con fallback).
--    Solo la usa `ventas_guardar_borrador`; ningún índice/CHECK/default.
-- =====================================================================

-- ── 1) Flag genérico ────────────────────────────────────────────────────
create or replace function public._perm_flag(p_user uuid, p_modulo text, p_flag text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((
    select case
             when coalesce(p.activo, true) = false then false
             when p.rol = 'admin'                  then true
             when p.permisos -> p_modulo ? p_flag
               then coalesce((p.permisos -> p_modulo ->> p_flag)::boolean, p_default)
             else p_default
           end
      from public.profiles p
     where p.id = p_user
  ), false)
$$;

-- ── 2) Tabla ────────────────────────────────────────────────────────────
create table public.empresa_config (
  id                 smallint primary key default 1 check (id = 1),
  razon_social       text not null check (length(btrim(razon_social)) >= 3),
  nombre_fantasia    text not null check (length(btrim(nombre_fantasia)) >= 2),
  cuit               text not null check (cuit ~ '^\d{11}$'),
  condicion_iva      text not null default 'Responsable Inscripto',
  iibb               text not null default '',
  inicio_actividades date,
  domicilio_calle    text not null default '',
  calle_factura      text not null default '',
  localidad          text not null default '',
  provincia          text not null default '',
  codigo_postal      text not null default '',
  telefono           text not null default '',
  email              text not null default '',
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

comment on table public.empresa_config is
  'Identidad de la empresa (una sola fila, id=1). Se escribe solo por empresa_guardar(). El CUIT lo define el certificado de ARCA y no se edita.';
comment on column public.empresa_config.calle_factura is
  'Calle tal como se imprime en la factura de venta (renglón 1). Vacía = domicilio_calle.';

insert into public.empresa_config (id, razon_social, nombre_fantasia, cuit, condicion_iva, iibb,
  inicio_actividades, domicilio_calle, calle_factura, localidad, provincia, codigo_postal, telefono, email)
values (1, 'CADINC S.R.L.', 'CADINC SRL', '33717191949', 'Responsable Inscripto', '33-71719194-9',
  date '2021-07-01', 'Maipú 396, Dpto. 3', 'Maipú 396 3', 'San Miguel de Tucumán', 'Tucumán', '4000',
  '3815 02-5772', '');

create or replace function public.fn_empresa_config_sin_borrar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  raise exception 'EMPRESA_NO_SE_BORRA' using errcode = 'P0001';
end $$;

create trigger trg_empresa_config_sin_borrar before delete on public.empresa_config
  for each row execute function public.fn_empresa_config_sin_borrar();
create trigger trg_empresa_config_touch before update on public.empresa_config
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.empresa_config
  for each row execute function public.audit_cambios('admin', 'datos de la empresa', 'id');

alter table public.empresa_config enable row level security;
create policy empresa_config_all on public.empresa_config for all using (true) with check (true);
revoke all on table public.empresa_config from public, anon, authenticated;
grant all on table public.empresa_config to service_role;

-- ── 3) Lectura con derivados ────────────────────────────────────────────
create or replace function public.empresa_config_json()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(e) - 'id'
    || jsonb_build_object(
         'cuit_fmt', substr(e.cuit, 1, 2) || '-' || substr(e.cuit, 3, 8) || '-' || substr(e.cuit, 11, 1),
         -- «Maipú 396, Dpto. 3 — San Miguel de Tucumán, Tucumán» (OP y documentos)
         'domicilio', concat_ws(' — ',
             nullif(e.domicilio_calle, ''),
             nullif(concat_ws(', ', nullif(e.localidad, ''), nullif(e.provincia, '')), '')),
         -- «Maipú 396 3 – San Miguel de Tucumán» (factura, renglón 1)
         'domicilio_factura_1', concat_ws(' – ',
             nullif(coalesce(nullif(e.calle_factura, ''), e.domicilio_calle), ''),
             nullif(e.localidad, '')),
         -- «(4000) Tucumán Argentina» (factura, renglón 2)
         'domicilio_factura_2', concat_ws(' ',
             case when e.codigo_postal <> '' then '(' || e.codigo_postal || ')' end,
             nullif(e.provincia, ''),
             'Argentina'))
    from public.empresa_config e
   where e.id = 1
$$;

-- ── 4) Escritura ────────────────────────────────────────────────────────
create or replace function public.empresa_guardar(p_cambios jsonb, p_user_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row  jsonb;
  v_k    text;
  v_v    jsonb;
  v_txt  text;
  v_max  int;
  v_min  int;
  v_fecha date;
  v_topes constant jsonb := jsonb_build_object(
    -- clave: [mínimo, máximo] de largo
    'razon_social',    jsonb_build_array(3, 120),
    'nombre_fantasia', jsonb_build_array(2, 80),
    'condicion_iva',   jsonb_build_array(3, 60),
    'iibb',            jsonb_build_array(0, 30),
    'domicilio_calle', jsonb_build_array(0, 120),
    'calle_factura',   jsonb_build_array(0, 120),
    'localidad',       jsonb_build_array(0, 80),
    'provincia',       jsonb_build_array(0, 60),
    'codigo_postal',   jsonb_build_array(0, 10),
    'telefono',        jsonb_build_array(0, 40),
    'email',           jsonb_build_array(0, 120));
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._perm_flag(p_user_id, 'admin', 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'EMPRESA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', null)::text;
  end if;
  if p_cambios ? 'cuit' then
    raise exception 'CUIT_NO_EDITABLE' using errcode = 'P0001';
  end if;

  select to_jsonb(e) into v_row from public.empresa_config e where e.id = 1 for update;
  if v_row is null then raise exception 'EMPRESA_SIN_FILA' using errcode = 'P0001'; end if;

  for v_k, v_v in select key, value from jsonb_each(p_cambios) loop
    if v_k = 'inicio_actividades' then
      if jsonb_typeof(v_v) = 'null' or v_v #>> '{}' = '' then
        v_row := v_row || jsonb_build_object(v_k, null);
      else
        begin
          v_fecha := (v_v #>> '{}')::date;
        exception when others then
          raise exception 'EMPRESA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
        end;
        if jsonb_typeof(v_v) <> 'string' or v_fecha > public.hoy_ar() or v_fecha < date '1900-01-01' then
          raise exception 'EMPRESA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
        end if;
        v_row := v_row || jsonb_build_object(v_k, v_fecha);
      end if;
    elsif v_topes ? v_k then
      if jsonb_typeof(v_v) <> 'string' then
        raise exception 'EMPRESA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_txt := btrim(regexp_replace(v_v #>> '{}', '\s+', ' ', 'g'));
      v_min := (v_topes -> v_k ->> 0)::int;
      v_max := (v_topes -> v_k ->> 1)::int;
      if length(v_txt) < v_min or length(v_txt) > v_max then
        raise exception 'EMPRESA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      if v_k = 'email' and v_txt <> '' and v_txt !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
        raise exception 'EMPRESA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row := v_row || jsonb_build_object(v_k, v_txt);
    else
      raise exception 'EMPRESA_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;

  update public.empresa_config e
     set razon_social       = r.razon_social,
         nombre_fantasia    = r.nombre_fantasia,
         condicion_iva      = r.condicion_iva,
         iibb               = r.iibb,
         inicio_actividades = r.inicio_actividades,
         domicilio_calle    = r.domicilio_calle,
         calle_factura      = r.calle_factura,
         localidad          = r.localidad,
         provincia          = r.provincia,
         codigo_postal      = r.codigo_postal,
         telefono           = r.telefono,
         email              = r.email,
         updated_by         = p_user_id
    from jsonb_populate_record(null::public.empresa_config, v_row) r
   where e.id = 1;

  return public.empresa_config_json();
end $$;

-- ── 5) CUIT del emisor desde la tabla ───────────────────────────────────
-- Era IMMUTABLE con el literal. Pasa a STABLE: solo la llama
-- ventas_guardar_borrador (verificado: ningún índice, CHECK ni default).
create or replace function public._ventas_cuit_emisor()
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$ select coalesce((select cuit from public.empresa_config where id = 1), '33717191949'::text) $$;

-- ── 6) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_perm_flag(uuid, text, text, boolean)',
    'fn_empresa_config_sin_borrar()',
    'empresa_config_json()',
    'empresa_guardar(jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
