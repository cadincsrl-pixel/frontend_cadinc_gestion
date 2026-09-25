-- =====================================================================
-- 20260930x — Petronorte: desglose ICL/IDC e imputación de 3 facturas
-- (2026-09-25, pedido del dueño: «11194 y 11716 es gerencial la 11572 es
-- aridos y no se si esta pagada»)
--
-- 1. Los «otros tributos» que trajo ARCA sin clasificar se abren en ICL e
--    IDC según el papel, como la FA 12319 (#44): tipo 'otro' con la leyenda
--    del papel. Los tipos icl/idc (20261001a) quedan para cuando se decida
--    Petronorte; esta migración no los usa.
-- 2. Imputación, concepto Combustible (1):
--      FA 5-11194 (#247) y FA 5-11716 (#558) → CC GERENCIA
--      FA 5-11573 (#476) → CC-020 ARIDOS
-- La #476 es la «11572» del PDF (mismo día, 130 L DIESEL X10, $315.770):
-- el QR dice 11572 y el archivo de ARCA 11573. Se deja el número de ARCA.
-- Sigue `pago_a_reconstruir`: el dueño no sabe si está paga y no aparece en
-- los extractos de Galicia ni en los listados de e-cheq.
-- La #247 queda con saldo $3,63: ARCA la tiene por $65.380.003,63 y el papel
-- (y el QR) por $65.380.000. Se respetan las cifras de ARCA.
-- =====================================================================
do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  r record;
begin
  for r in select * from (values
      (247::bigint, 7371736.40::numeric, 840196.00::numeric, 'CC GERENCIA'),
      (558, 7618072.00, 868271.60, 'CC GERENCIA'),
      (476, 35178.43, 4009.47, 'CC-020')) x(id, icl, idc, obra) loop
    if (select otros from public.pagos_facturas where id = r.id and proveedor_id = 31) <> r.icl + r.idc then
      raise exception 'OTROS_NO_CUADRA factura %', r.id;
    end if;
    perform public.pagos_completar_desglose(r.id, jsonb_build_object(
      'iva_detalle', (select jsonb_agg(jsonb_build_object('alicuota_id', i.alicuota_id, 'base_imp', i.base_imp, 'importe', i.importe))
                        from public.pagos_factura_iva i where i.factura_id = r.id),
      'tributos', jsonb_build_array(
         jsonb_build_object('tipo', 'otro', 'importe', r.icl, 'descripcion', 'ICL (Impuesto sobre los Combustibles Líquidos)'),
         jsonb_build_object('tipo', 'otro', 'importe', r.idc, 'descripcion', 'IDC (Impuesto al Dióxido de Carbono)')),
      'no_gravado', 0, 'exento', 0), v_user, false);
    perform public.pagos_imputar_factura(r.id, 1,
      jsonb_build_array(jsonb_build_object('obra_cod', r.obra, 'monto', (select imputable from public.v_pagos_facturas where id = r.id))),
      null, v_user);
  end loop;
end $m$;
