-- Conciliación con Pizarro Refrigeración (dueño, 25/09: «armalas con lo que tenemos»).
-- Fuente: resúmenes de cuenta de Pizarro del 13/08, 27/08 y 05/09, su recibo 6131, y los
-- listados de Galicia de e-cheqs emitidos y endosados.
--
-- FA 7402 ($196.483,94): Pizarro aplicó $170.058,42 de su recibo 0001-00005960 (saldo a favor
--   de los endosos del 30/06) y quedó un saldo de $26.425,52, que es el e-cheq Galicia 2989
--   (emitido el 31/08, pagado el 01/09). Dos OP reconstruidas.
-- FA 5523 ($95.537,78) y FA 7394 ($241.174,04): no figuran en ningún resumen de Pizarro (13/08
--   en adelante). Se dan por canceladas con el mismo saldo a favor anterior al 01/07 (endosos
--   del 30/06: Macro 67958524 por $5.366.522,05 y Galicia 3583 por $5.663.528,19). DEDUCIDO:
--   no hay recibo de Pizarro de estas dos.
-- Queda abierta solo la FA 7526 ($154.677,16, 07/09), posterior al último resumen.

do $m$
declare u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
begin
  perform public.pagos_reconstruir_orden(116,
    jsonb_build_object('fecha','2026-08-31','forma_pago','echeq','monto_pagado',26425.52,'cuenta_origen_id',1,
      'referencia','E-cheq Galicia N° 2989 (emitido 31/08, pago 01/09): saldo de la FA 7402 según resumen de cuenta de Pizarro al 27/08',
      'obs','Pago reconstruido el 25/09 en la conciliación con Pizarro.',
      'cheques', jsonb_build_array(jsonb_build_object('numero','2989','banco','Galicia','fecha_cobro','2026-09-01','monto',26425.52,'es_propio',true,'librador',''))),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',333,'monto',26425.52)), u);
  perform public.pagos_reconstruir_orden(116,
    jsonb_build_object('fecha','2026-07-30','forma_pago','otro','monto_pagado',170058.42,
      'referencia','Saldo a favor anterior al 01/07 (endosos del 30/06: Macro 67958524 y Galicia 3583), aplicado por Pizarro con su recibo 0001-00005960',
      'obs','Pago reconstruido el 25/09 en la conciliación con Pizarro (resúmenes de cuenta del 13/08 y 27/08).'),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',333,'monto',170058.42)), u);
  perform public.pagos_reconstruir_orden(116,
    jsonb_build_object('fecha','2026-07-28','forma_pago','otro','monto_pagado',336711.82,
      'referencia','Saldo a favor anterior al 01/07 (endosos del 30/06: Macro 67958524 y Galicia 3583). Pizarro ya no muestra estas facturas en su resumen de cuenta del 13/08',
      'obs','Pago reconstruido el 25/09 en la conciliación con Pizarro. Deducido del resumen de cuenta: no hay recibo de Pizarro de estas dos facturas.'),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',263,'monto',95537.78), jsonb_build_object('tipo','factura','factura_id',306,'monto',241174.04)), u);
end
$m$;
