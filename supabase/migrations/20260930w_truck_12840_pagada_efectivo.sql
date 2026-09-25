-- Truck NOA FA A 0007-00012840 ($81.300): pagada en efectivo (dueño, 25/09). La factura dice
-- «Cond. venta: contado efectivo». OP reconstruida desde Caja, fecha de la factura.

do $m$
begin
  perform public.pagos_reconstruir_orden(183,
    jsonb_build_object('fecha', '2026-09-24', 'forma_pago', 'efectivo', 'monto_pagado', 81300, 'cuenta_origen_id', 3,
      'referencia', 'Pagada en efectivo (dueño, 25/09); la factura dice «Cond. venta: contado efectivo»',
      'obs', 'Pago reconstruido el 25/09.'),
    jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', 967, 'monto', 81300)),
    'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
end
$m$;
