-- Constructora Jericó FA 00002-00000695 (01/09, $430.647,29): planilla de caja del 28/08, $431.000
-- «Jerico Laboratorio Suelos · Estudio de Suelos» (Concepción PL). Efectivo desde la Caja; la caja redondea.
do $m$
begin
  perform public.pagos_reconstruir_orden(189,
    jsonb_build_object('fecha','2026-08-28','forma_pago','efectivo','monto_pagado',430647.29,'cuenta_origen_id',3,
      'referencia','Caja CADINC 28/08: $431.000 «Jericó Laboratorio Suelos · Estudio de Suelos» (Concepción PL)',
      'obs','Pago reconstruido el 26/09 con la planilla de caja'),
    jsonb_build_array(jsonb_build_object('tipo','factura','factura_id',736,'monto',430647.29)),
    'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
end $m$;
