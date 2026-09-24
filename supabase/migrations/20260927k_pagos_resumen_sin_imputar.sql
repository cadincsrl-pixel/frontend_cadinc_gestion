-- =====================================================================
-- Compras: los chips de estado respetan «sin imputar» y el concepto
-- (2026-09-27)
--
-- Por qué (revisión de código de la fase 3): pagos_resumen alimenta los chips
-- de estado de la bandeja y no filtraba sin_imputar. Con ~1000 facturas
-- importadas de ARCA (20260927c), filtrando «imputadas» el chip decía
-- «Pendiente (1020)» y la lista mostraba 20. Tampoco filtraba concepto
-- (el backend lo sacaba del schema del resumen para no mentir).
--
-- Suma dos parámetros opcionales AL FINAL, con default null, que filtran
-- igual que el listado (aplicarFiltrosFacturas del backend: .eq sobre
-- v_pagos_facturas):
--   p_sin_imputar boolean default null   → v.sin_imputar = p_sin_imputar
--   p_concepto_id bigint  default null   → v.concepto_id = p_concepto_id
--
-- DROP + CREATE (no sobrecarga): una sola función, así PostgREST no tiene
-- dos candidatas. El backend viejo de producción llama con los 14 parámetros
-- nombrados de siempre; los dos nuevos tienen default, así que PostgREST
-- resuelve a esta misma función y el resultado es idéntico al de antes.
-- Parche por anclas sobre la definición viva (20260925l/20260923i).
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

do $m$
declare
  v text := pg_get_functiondef('public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$p_clase text DEFAULT NULL::text)$a$,
$a$p_clase text DEFAULT NULL::text, p_sin_imputar boolean DEFAULT NULL::boolean, p_concepto_id bigint DEFAULT NULL::bigint)$a$);
  v := pg_temp._una(v,
$a$       and (p_clase is null or v.clase = p_clase)
$a$,
$a$       and (p_clase is null or v.clase = p_clase)
       and (p_sin_imputar is null or v.sin_imputar = p_sin_imputar)
       and (p_concepto_id is null or v.concepto_id = p_concepto_id)
$a$);
  drop function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);

comment on function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint) is
  'Agregados de la bandeja de Compras por grupo. p_sin_imputar y p_concepto_id (20260927k) filtran igual que el listado.';

revoke all on function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint)
  from public, anon, authenticated;
grant execute on function public.pagos_resumen(text,bigint,text,text,text[],text,text,text,date,date,text[],boolean,boolean,text,boolean,bigint)
  to service_role;

notify pgrst, 'reload schema';
