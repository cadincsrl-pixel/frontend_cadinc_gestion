-- Pizarro Refrigeración FA A 00012-00007486 ($6.197.904): pagada en EFECTIVO (dueño, 25/09).
-- La propia factura dice «Recibí(mos) … forma de pago efectivo» (28/08). Se reconstruye la OP
-- con pagos_reconstruir_orden desde la Caja (tesoreria_cuentas 3), fecha de la factura.

do $m$
begin
  perform public.pagos_reconstruir_orden(116,
    jsonb_build_object('fecha', '2026-08-28', 'forma_pago', 'efectivo', 'monto_pagado', 6197904, 'cuenta_origen_id', 3,
      'referencia', 'Pagada en efectivo (dueño, 25/09); la factura dice «Recibí(mos) … forma de pago efectivo»',
      'obs', 'Pago reconstruido el 25/09 en la conciliación con Pizarro.'),
    jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', 678, 'monto', 6197904)),
    'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
end
$m$;
