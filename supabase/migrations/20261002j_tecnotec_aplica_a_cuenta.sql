-- Tecnotec: el endoso 3098 de Adrenalina Rent ($4.296.463,06, 06/07) había dejado $1.166.627,14 a cuenta.
-- El dueño (26/09) pide aplicarlo también a la FA 00007-00002326 (14/08, $98.559,11). No hay RPC para aplicar
-- «a cuenta» a una factura: se anula la OP 1087 y se rehace con las dos facturas; el a cuenta baja a $1.068.068,03.
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
begin
  perform public.pagos_anular_orden(1087, 'Se rehace para aplicar parte del a cuenta a la FA 2326 (dueño, 26/09)', u);
  perform public.pagos_reconstruir_orden(67,
    jsonb_build_object('fecha','2026-07-06','forma_pago','echeq','monto_pagado',4296463.06,'cuenta_origen_id',1,
      'referencia','Galicia CC 4736: e-cheq 3098 de ADRENALINA RENT SA endosado a Tecnotec («Varios / op3776»); FA 2275 (Finnegans) y FA 2326 (dueño)',
      'obs','Pago reconstruido el 26/09 con el reporte de pagos de Finnegans; a cuenta aplicado a la FA 2326 por pedido del dueño',
      'cheques', jsonb_build_array(jsonb_build_object('numero','3098','banco','BANCO DE GALICIA Y BUENOS AIRES S.A.U.','fecha_cobro','2026-07-06','monto',4296463.06,'es_propio',false,'librador','ADRENALINA RENT SA · CUIT 30711040176'))),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',116,'monto',3129835.92),
                      jsonb_build_object('tipo','factura','factura_id',521,'monto',98559.11),
                      jsonb_build_object('tipo','a_cuenta','monto',1068068.03)), u);
end $m$;
