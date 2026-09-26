-- HDI Lubricentro (4 facturas, 01–07/09) y Truck NOA (4 facturas, 04–14/09) pagadas en efectivo desde la Caja,
-- con la fecha de cada factura (el dueño, 26/09: «HDI con caja y esas facturas de Truck NOA también»).
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  r record;
begin
  for r in select v.id, v.proveedor_id, v.fecha, v.saldo from public.v_pagos_facturas v
            where v.id = any(array[735,753,771,805,774,834,870,872]::bigint[]) and v.pago_a_reconstruir and v.saldo > 0 loop
    perform public.pagos_reconstruir_orden(r.proveedor_id,
      jsonb_build_object('fecha', r.fecha, 'forma_pago', 'efectivo', 'monto_pagado', r.saldo, 'cuenta_origen_id', 3,
        'referencia', 'Efectivo (Caja), indicado por el dueño', 'obs', 'Pago reconstruido el 26/09 en efectivo (dueño: HDI y Truck NOA con caja)'),
      jsonb_build_array(jsonb_build_object('tipo','factura','factura_id', r.id, 'monto', r.saldo)), u);
  end loop;
end $m$;
