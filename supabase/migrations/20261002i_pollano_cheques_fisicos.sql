-- Pollano Sanitarios FA 00003-00007772 (10/09, $627.829,99) pagada con 4 cheques físicos propios emitidos el 10/09,
-- pago diferido al 30/09 (planilla del dueño): N° 31268362 $52.730, 31268363 $101.739,99, 31268364 $342.850,
-- 31268365 $130.510. Se asume chequera del Galicia (tesorería 1); si es de otro banco, cambiar la cuenta de la OP.
do $m$
begin
  perform public.pagos_reconstruir_orden(12,
    jsonb_build_object('fecha','2026-09-10','forma_pago','cheque','monto_pagado',627829.99,'cuenta_origen_id',1,
      'referencia','Cheques físicos propios N° 31268362 a 31268365 (emitidos 10/09, pago 30/09) a Pollano Fabián Rodrigo',
      'obs','Pago reconstruido el 26/09 con la planilla de cheques del dueño',
      'cheques', jsonb_build_array(
        jsonb_build_object('numero','31268362','banco','Galicia','fecha_cobro','2026-09-30','monto',52730.00,'es_propio',true,'librador',''),
        jsonb_build_object('numero','31268363','banco','Galicia','fecha_cobro','2026-09-30','monto',101739.99,'es_propio',true,'librador',''),
        jsonb_build_object('numero','31268364','banco','Galicia','fecha_cobro','2026-09-30','monto',342850.00,'es_propio',true,'librador',''),
        jsonb_build_object('numero','31268365','banco','Galicia','fecha_cobro','2026-09-30','monto',130510.00,'es_propio',true,'librador',''))),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',851,'monto',627829.99)),
    'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
end $m$;
