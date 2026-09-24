-- =====================================================================
-- Compras: el concepto pasa a ser OBLIGATORIO en el alta (2026-09-25)
--
-- ⚠ APLICAR SOLO DESPUÉS DEL DEPLOY DEL BACKEND que manda `concepto_id`
-- en `p_factura` (CreateFacturaSchema con concepto_id obligatorio). Con el
-- backend viejo en producción, esta migración corta TODAS las altas de
-- facturas y NC con CONCEPTO_REQUERIDO.
--
-- Por qué: decisión del dueño, «concepto obligatorio al cargar». En
-- 20260925k la RPC ya valida el concepto si viene; acá deja de aceptar que
-- no venga. Vale para factura y NC. Las 17 viejas ya tienen (20260925m).
-- La edición no cambia: ya rechaza vaciar un concepto (20260925k).
--
-- Técnica: igual que 20260925k, reemplazo contado sobre la definición viva.
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
  v text := pg_get_functiondef('public.pagos_crear_factura(jsonb,jsonb,uuid,jsonb)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_concepto_txt := nullif(btrim(coalesce(p_factura ->> 'concepto_id', '')), '');
  if v_concepto_txt is not null then
$a$,
$a$  v_concepto_txt := nullif(btrim(coalesce(p_factura ->> 'concepto_id', '')), '');
  -- Obligatorio desde 20260925n.
  if v_concepto_txt is null then
    raise exception 'CONCEPTO_REQUERIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'concepto_id')::text;
  end if;
  if v_concepto_txt is not null then
$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
