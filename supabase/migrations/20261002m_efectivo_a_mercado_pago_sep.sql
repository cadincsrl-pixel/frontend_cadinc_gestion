-- Extracto de Mercado Pago de septiembre (al 26/09; lo cruzó la sesión de Compras/Ventas): 5 facturas que estaban
-- en efectivo (20261002c) o por Galicia (20261002d) se pagaron por transferencia desde Mercado Pago (tesorería 18).
-- Se anula cada OP y se rehace con el medio real y el N° de operación.
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  r record;
begin
  for r in select * from (values
      (854::bigint, 23::bigint, 756::bigint, '2026-09-03'::date, 6338.85::numeric,   'Mercado Pago · 03/09 Transferencia enviada Corralon Santa Clara · op. 177046554016'),
      (984, 236, 781, '2026-09-04', 100637.90, 'Mercado Pago · 04/09 Transferencia enviada Gonzalez, Carlos Leonel · op. 177283742584'),
      (1025, 278, 884, '2026-09-14', 52069.42, 'Mercado Pago · 14/09 Transferencia enviada Aislantes Tecnopor Srl · op. 177978515515'),
      (1017, 270, 887, '2026-09-15', 48655.18, 'Mercado Pago · 15/09 Transferencia enviada Marola Atilio Srl · op. 178190297721'),
      (1049, 99, 932, '2026-09-18', 79300.01, 'Mercado Pago · 18/09 Transferencia enviada Hdi Lubricentro S A S · op. 179723795162')
    ) as t(op, prov, fac, fecha, monto, ref) loop
    perform public.pagos_anular_orden(r.op, 'Se rehace con el medio real: transferencia desde Mercado Pago (extracto de septiembre)', u);
    perform public.pagos_reconstruir_orden(r.prov,
      jsonb_build_object('fecha', r.fecha, 'forma_pago', 'transferencia', 'monto_pagado', r.monto, 'cuenta_origen_id', 18,
        'referencia', r.ref, 'obs', 'Pago reconstruido el 26/09 con el extracto de Mercado Pago de septiembre'),
      jsonb_build_array(jsonb_build_object('tipo','factura','factura_id', r.fac, 'monto', r.monto)), u);
  end loop;
end $m$;
