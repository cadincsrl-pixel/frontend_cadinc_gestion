-- Rolcar FA 44-38508 y 44-38509 (31/07) pagadas con dos cheques físicos del Banco Nación de Transporte Global SAS,
-- a la orden de CADINC y endosados a Rolcar (foto: ~/Desktop/CADINC-documentos/Proveedores/Rolcar/).
-- N° 00009675 $652.626,00 y N° 00009676 $1.063.315,11, ambos emitidos el 13/07 y con fecha de pago 18/08.
-- Suman $1.715.941,11: sobran $1.781,33 que quedan a cuenta de Rolcar. Cuenta de origen: Valores a depositar (19).
do $m$
begin
  perform public.pagos_reconstruir_orden(141,
    jsonb_build_object('fecha','2026-07-31','forma_pago','cheque','monto_pagado',1715941.11,'cuenta_origen_id',19,
      'referencia','Cheques físicos Banco Nación N° 00009675 y 00009676 de Transporte Global SAS endosados a Rolcar',
      'obs','Pago reconstruido el 26/09 con la foto de los cheques (el dueño: «con esos cheques pagué Rolcar»). Sobran $1.781,33 a cuenta.',
      'cheques', jsonb_build_array(
        jsonb_build_object('numero','00009675','banco','Banco de la Nación Argentina','fecha_cobro','2026-08-18','monto',652626.00,'es_propio',false,'librador','TRANSPORTE GLOBAL SAS · CUIT 30716052121'),
        jsonb_build_object('numero','00009676','banco','Banco de la Nación Argentina','fecha_cobro','2026-08-18','monto',1063315.11,'es_propio',false,'librador','TRANSPORTE GLOBAL SAS · CUIT 30716052121'))),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',361,'monto',1700979.61),
                      jsonb_build_object('tipo','factura','factura_id',362,'monto',13180.17),
                      jsonb_build_object('tipo','a_cuenta','monto',1781.33)),
    'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
end $m$;
