-- =====================================================================
-- 20260928h — Contabilidad: cont_pendientes filtra por varias fuentes (2026-09-24)
--
-- Tildes de circuito en Automáticos (Ventas, Cobros, Compras, Pagos).
-- `p_fuentes text[]` (al FINAL) filtra DENTRO de `base`, antes de
-- `_cont_estado_origen` (lo caro), así que el resumen (por_estado,
-- por_fuente, por_motivo) se calcula sobre la selección. `p_fuente` sigue
-- igual (filtra solo `filt`); si vienen los dos, AND.
-- DROP + CREATE en la misma migración: sin sobrecarga ambigua en PostgREST.
-- El backend desplegado llama con 7 parámetros nombrados y sigue andando.
-- =====================================================================

drop function if exists public.cont_pendientes(date, date, text, text, text, integer, integer);

create function public.cont_pendientes(
  p_desde date default null, p_hasta date default null, p_fuente text default null,
  p_estado text default null, p_motivo text default null,
  p_limit integer default 50, p_offset integer default 0,
  p_fuentes text[] default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare
  v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_out jsonb;
begin
  if p_fuentes is not null and (cardinality(p_fuentes) = 0 or exists (
       select 1 from unnest(p_fuentes) f
        where f not in ('ventas_facturas', 'ventas_comprobantes_externos', 'ventas_cobros', 'pagos_facturas', 'pagos_ordenes'))) then
    raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'fuentes', 'fuentes', p_fuentes)::text;
  end if;

  with base as materialized (
    select c.origen_tabla, c.origen_id, c.fecha as fecha_cand,
           public._cont_estado_origen(c.origen_tabla, c.origen_id, c.fecha) as e
      from public._cont_candidatos(coalesce(p_desde, public._cont_cfg_desde()), coalesce(p_hasta, public.hoy_ar())) c
     where p_fuentes is null or c.origen_tabla = any (p_fuentes)
  ),
  pend as (
    select b.origen_tabla, b.origen_id, coalesce((b.e ->> 'fecha')::date, b.fecha_cand) as fecha,
           b.e ->> 'fuente' as fuente, b.e ->> 'descripcion' as descripcion, (b.e ->> 'importe')::numeric(14,2) as importe,
           b.e ->> 'estado' as estado, b.e -> 'motivos' as motivos, (b.e ->> 'asiento_id')::bigint as asiento_id,
           b.e ->> 'asiento_periodo_estado' as asiento_periodo_estado
      from base b
     where b.e ->> 'estado' <> 'al_dia'
  ),
  filt as (
    select * from pend
     where (p_fuente is null or origen_tabla = p_fuente)
       and (p_estado is null or estado = p_estado)
       and (p_motivo is null or exists (select 1 from jsonb_array_elements(motivos) m where m ->> 'codigo' = p_motivo))
  )
  select jsonb_build_object(
    'total', (select count(*) from filt),
    'resumen', jsonb_build_object(
      'por_estado', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*) as n from pend group by 1) x), '{}'::jsonb),
      'por_fuente', coalesce((select jsonb_object_agg(origen_tabla, n) from (select origen_tabla, count(*) as n from pend group by 1) x), '{}'::jsonb),
      'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'clave', clave, 'subclave', subclave, 'cantidad', n)
                                               order by n desc, codigo, clave, subclave)
                                from (select m ->> 'codigo' as codigo, m -> 'detalle' ->> 'clave' as clave,
                                             m -> 'detalle' ->> 'subclave' as subclave, count(*) as n
                                        from pend, jsonb_array_elements(pend.motivos) m group by 1, 2, 3) y), '[]'::jsonb)),
    'items', coalesce((select jsonb_agg(to_jsonb(z) order by z.fecha, z.origen_tabla, z.origen_id)
                         from (select * from filt order by fecha, origen_tabla, origen_id limit v_lim offset v_off) z), '[]'::jsonb))
    into v_out;
  return v_out;
end $function$;

comment on function public.cont_pendientes(date, date, text, text, text, integer, integer, text[]) is
  'Orígenes contables no al día (sin contabilizar, pendientes, desactualizados, a revertir) con resumen. p_fuentes (20260928h) filtra por tablas de origen antes de calcular el estado; p_fuente solo filtra la lista.';

revoke all on function public.cont_pendientes(date, date, text, text, text, integer, integer, text[]) from public, anon, authenticated;
grant execute on function public.cont_pendientes(date, date, text, text, text, integer, integer, text[]) to service_role;

notify pgrst, 'reload schema';
