-- =====================================================================
-- Contabilidad: la CVLP sin líquido cargado se contabiliza por su total
-- (2026-09-28)
--
-- Por qué: el comprobante externo 060/061 (CVLP de Casilda) que viene de
-- ARCA YA trae como total el neto de la comisión de Casilda. Hasta hoy
-- `_cont_prop_venta_externo` dejaba la CVLP pendiente con CVLP_SIN_LIQUIDO si
-- `ventas_comprobantes_externos.liquido` era null, y había que cargar a mano
-- un líquido igual al total (las 26 CVLP que había al aplicar esto lo tienen
-- igual al total).
--
-- Qué cambia: el importe es `coalesce(liquido, total)`. El líquido queda como
-- corrección opcional (si Casilda liquidó distinto del papel). Se conserva
-- CVLP_LIQUIDO_INVALIDO (importe − IVA ≤ 0).
--
-- Los asientos existentes no cambian de hash: con liquido = total la
-- propuesta es idéntica (verificado con rollback: 26/26 iguales).
--
-- Parche por anclas sobre la definición viva (20260927e / 20260928c).
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
  v text;
begin
  v := pg_get_functiondef('public._cont_prop_venta_externo(bigint)'::regprocedure);

  v := pg_temp._una(v,
$a$  v_por_cli boolean;
begin$a$,
$a$  v_por_cli boolean;
  v_liq     numeric;
begin$a$);

  v := pg_temp._una(v,
$a$    if x.liquido is null then
      p := public._cont_prop_motivo(p, 'CVLP_SIN_LIQUIDO', jsonb_build_object('externo_id', p_id));
    elsif x.liquido - x.iva <= 0 then
      p := public._cont_prop_motivo(p, 'CVLP_LIQUIDO_INVALIDO', jsonb_build_object('externo_id', p_id, 'liquido', x.liquido, 'iva', x.iva));
    else
      p := public._cont_prop_linea(p, 'ventas.deudores', array[''], true, x.liquido * tc, 'cliente', x.cliente_id, null, g);$a$,
$a$    -- El total de la CVLP de ARCA ya es el neto de la comisión: el líquido
    -- es solo una corrección opcional (20260928f).
    v_liq := coalesce(x.liquido, x.total);
    if v_liq - x.iva <= 0 then
      p := public._cont_prop_motivo(p, 'CVLP_LIQUIDO_INVALIDO', jsonb_build_object('externo_id', p_id, 'liquido', v_liq, 'iva', x.iva));
    else
      p := public._cont_prop_linea(p, 'ventas.deudores', array[''], true, v_liq * tc, 'cliente', x.cliente_id, null, g);$a$);

  v := pg_temp._una(v,
$a$                                   false, (x.liquido - x.iva) * tc, null, null, null, g);$a$,
$a$                                   false, (v_liq - x.iva) * tc, null, null, null, g);$a$);

  execute v;
end $m$;
