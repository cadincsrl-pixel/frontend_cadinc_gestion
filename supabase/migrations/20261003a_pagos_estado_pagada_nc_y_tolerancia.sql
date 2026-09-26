-- =====================================================================
-- 20261003a — Compras: facturas saldadas que quedaban «pendientes»
-- (2026-09-26, pedido del dueño: «en pendientes de pago veo facturas con
-- nota de crédito ... que les falta para salir»)
--
-- `_pagos_recalcular_estado` solo pasaba a «pagada» una factura aprobada o
-- pagada al cargar, o una histórica (pago_a_reconstruir) cubierta por OP
-- RECONSTRUIDAS (20260929z). Quedaban «pendientes» con saldo 0:
--   · históricas canceladas por NC (no hay OP),
--   · históricas pagadas con «Marcar pagadas» (tarjeta/billetera: la OP no es
--     reconstruida) o con OP normales;
--   · las que quedan con centavos de redondeo (saldo 0,01).
-- Una histórica NO se puede aprobar (FACTURA_A_RECONSTRUIR), así que nunca
-- salían de la bandeja.
--
-- 1) v_recon: histórica sin aprobar cubierta por CUALQUIER aplicación (OP
--    emitida o NC aprobada), no solo por OP reconstruidas. Marca
--    pagada_reconstruida como hasta ahora (el CHECK la acepta).
-- 2) «Cubierta» usa la tolerancia de Compras (`_pagos_tolerancia_saldo()`,
--    20260930e, default $1): aplicado >= total − tolerancia. Las no históricas
--    siguen necesitando aprobación (la doble firma no cambia).
-- 3) Recalcula todas las facturas no anuladas.
-- Parche por ancla sobre la función viva.
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
declare v text := pg_get_functiondef('public._pagos_recalcular_estado(bigint)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_recon    boolean := false;$a$,
$n$  v_recon    boolean := false;
  v_tol      numeric(14,2) := public._pagos_tolerancia_saldo();$n$);
  v := pg_temp._una(v,
$a$    v_recon := not v_puede and exists (
      select 1 from public.pagos_orden_lineas l
        join public.pagos_ordenes o on o.id = l.orden_id
       where l.factura_id = p_factura_id and o.estado = 'emitida' and o.reconstruida);$a$,
$n$    -- 20261003a: una histórica (no se puede aprobar) queda pagada con cualquier
    -- aplicación (OP emitida o NC aprobada), no solo con OP reconstruidas.
    v_recon := not v_puede and (exists (
      select 1 from public.pagos_orden_lineas l
        join public.pagos_ordenes o on o.id = l.orden_id
       where l.factura_id = p_factura_id and o.estado = 'emitida' and o.reconstruida)
      or (v_f.pago_a_reconstruir and v_aplicado > 0));$n$);
  v := pg_temp._una(v,
$a$      when v_puede and v_aplicado >= v_f.total    then 'pagada'
      when v_recon and v_aplicado >= v_f.total    then 'pagada'$a$,
$n$      when v_puede and v_aplicado >= v_f.total - v_tol    then 'pagada'
      when v_recon and v_aplicado >= v_f.total - v_tol    then 'pagada'$n$);
  execute v;
end $m$;

do $b$
declare r record;
begin
  for r in select id from public.pagos_facturas where estado <> 'anulada' and clase = 'factura' loop
    perform public._pagos_recalcular_estado(r.id);
  end loop;
end $b$;
