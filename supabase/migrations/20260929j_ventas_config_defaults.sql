-- =====================================================================
-- 20260929j — Ventas › Configuración: valores por defecto de la factura
--             (2026-09-25)
--
-- Tanda 6, ítem 9, parte A (spec «configuración del ERP desde la pantalla»
-- §3.9). La spec lo reservaba como 20260929b; esa letra la tomaron los
-- productos de venta. `ventas_config` ya existe (20260929g) con una sola
-- clave; acá se suman:
--
--   condicion_pago_default  'Cc Clientes'  texto 1–100
--   provincia_default       'Tucuman'      una de las 24 de `PROVINCIAS`
--                                          (cadincsrl lib/arca/padron-datos.ts
--                                          y facturacion.utils.ts del front,
--                                          sin tildes, CABA = «Capital Federal»)
--   unidad_default          'Unidades'     texto 1–50
--   leyenda_fce             null           null = la de ARCA (la constante
--                                          LEYENDA_FCE del PDF); si no, texto
--                                          de 50 a 1000 caracteres
--
-- Se siembran con el valor de hoy (el que estaba escrito en el frontend): así
-- cada cambio desde la pantalla es un UPDATE y lo toma el trigger de
-- auditoría que ya tiene la tabla. No cambia nada de lo que se imprime.
--
-- `ventas_config_json()` y `ventas_guardar_config()` se reemplazan enteras:
-- nacieron en 20260929g y nadie las tocó desde entonces (verificado contra
-- `pg_get_functiondef` el 25/09). Pasan a SECURITY DEFINER, como
-- `pagos_*_config` en 20260929i (solo service_role las ejecuta).
--
-- La leyenda por defecto de ARCA NO vive en la base: la agrega el backend a
-- la respuesta del GET (`leyenda_fce_default`) desde su constante.
--
-- Errores: CONFIG_INVALIDA { clave, motivo } con motivo ∈ tipo_invalido,
-- texto_vacio, texto_largo, texto_corto, provincia_invalida,
-- tipo_inexistente_o_inactivo, clave_desconocida.
-- =====================================================================

-- ── 1) Claves ───────────────────────────────────────────────────────────
alter table public.ventas_config drop constraint if exists ventas_config_clave_check;
alter table public.ventas_config add constraint ventas_config_clave_check check (clave in (
  'retencion_tipo_default',
  'condicion_pago_default',
  'provincia_default',
  'unidad_default',
  'leyenda_fce'
));

insert into public.ventas_config (clave, valor) values
  ('condicion_pago_default', '"Cc Clientes"'::jsonb),
  ('provincia_default',      '"Tucuman"'::jsonb),
  ('unidad_default',         '"Unidades"'::jsonb),
  ('leyenda_fce',            'null'::jsonb)
on conflict (clave) do nothing;

-- ── 2) Provincias (espejo de PROVINCIAS de ARCA) ────────────────────────
create or replace function public._ventas_provincias()
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select array[
    'Buenos Aires', 'Capital Federal', 'Catamarca', 'Chaco', 'Chubut', 'Cordoba', 'Corrientes', 'Entre Rios',
    'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquen', 'Rio Negro', 'Salta',
    'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucuman'
  ]::text[]
$$;

comment on function public._ventas_provincias() is
  'Las 24 provincias como las lista el selector de la factura (sin tildes, CABA = Capital Federal). Espejo de PROVINCIAS en cadincsrl/src/lib/arca/padron-datos.ts y en facturacion.utils.ts. 20260929j.';

-- ── 3) Lectura ──────────────────────────────────────────────────────────
create or replace function public.ventas_config_json()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with c as (select clave, valor from public.ventas_config)
  select jsonb_build_object(
    'retencion_tipo_default',
      coalesce((select valor #>> '{}' from c where clave = 'retencion_tipo_default' and jsonb_typeof(valor) = 'string'), 'iibb'),
    'condicion_pago_default',
      coalesce((select valor #>> '{}' from c where clave = 'condicion_pago_default' and jsonb_typeof(valor) = 'string'), 'Cc Clientes'),
    'provincia_default',
      coalesce((select valor #>> '{}' from c where clave = 'provincia_default' and jsonb_typeof(valor) = 'string'), 'Tucuman'),
    'unidad_default',
      coalesce((select valor #>> '{}' from c where clave = 'unidad_default' and jsonb_typeof(valor) = 'string'), 'Unidades'),
    'leyenda_fce',
      (select valor #>> '{}' from c where clave = 'leyenda_fce' and jsonb_typeof(valor) = 'string'))
$$;

-- ── 4) Escritura ────────────────────────────────────────────────────────
create or replace function public.ventas_guardar_config(p_cambios jsonb, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_k   text;
  v_v   jsonb;
  v_txt text;
  v_max int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', null)::text;
  end if;

  for v_k, v_v in select key, value from jsonb_each(p_cambios) loop
    case v_k
      when 'retencion_tipo_default' then
        if jsonb_typeof(v_v) <> 'string'
           or not exists (select 1 from public.ventas_retencion_tipos x where x.clave = v_v #>> '{}' and x.activo) then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'tipo_inexistente_o_inactivo')::text;
        end if;

      when 'condicion_pago_default', 'unidad_default' then
        if jsonb_typeof(v_v) <> 'string' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'tipo_invalido')::text;
        end if;
        v_txt := btrim(regexp_replace(v_v #>> '{}', '\s+', ' ', 'g'));
        v_max := case when v_k = 'unidad_default' then 50 else 100 end;
        if v_txt = '' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'texto_vacio')::text;
        end if;
        if length(v_txt) > v_max then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'texto_largo', 'max', v_max)::text;
        end if;
        v_v := to_jsonb(v_txt);

      when 'provincia_default' then
        if jsonb_typeof(v_v) <> 'string' or not ((v_v #>> '{}') = any (public._ventas_provincias())) then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'provincia_invalida')::text;
        end if;

      when 'leyenda_fce' then
        if jsonb_typeof(v_v) not in ('null', 'string') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'tipo_invalido')::text;
        end if;
        -- Vacía = volver a la de ARCA. Se imprime en una línea: sin saltos.
        v_txt := nullif(btrim(regexp_replace(coalesce(v_v #>> '{}', ''), '\s+', ' ', 'g')), '');
        if v_txt is not null and length(v_txt) < 50 then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'texto_corto', 'min', 50)::text;
        end if;
        if v_txt is not null and length(v_txt) > 1000 then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'texto_largo', 'max', 1000)::text;
        end if;
        v_v := coalesce(to_jsonb(v_txt), 'null'::jsonb);

      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'motivo', 'clave_desconocida')::text;
    end case;

    insert into public.ventas_config (clave, valor, updated_by) values (v_k, v_v, p_user_id)
    on conflict (clave) do update set valor = excluded.valor, updated_by = excluded.updated_by;
  end loop;
  return public.ventas_config_json();
end $$;

-- ── 5) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_ventas_provincias()',
    'ventas_config_json()',
    'ventas_guardar_config(jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
