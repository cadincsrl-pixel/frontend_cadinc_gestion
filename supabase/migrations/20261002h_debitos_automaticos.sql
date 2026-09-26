-- Débitos automáticos (el dueño, 26/09: «se debitan solos»), con la fecha de cada factura:
--   · Peajes (Corredores Viales, Autopistas del Sol, AUBASA, Autopistas Urbanas, AP01) → tarjeta Visa (telepeaje), tesorería 20.
--   · Banco Galicia (gastos), Telecom, Zurich, Aseguradores de Cauciones → débito en Galicia CC, tesorería 1.
--   · Banco Nación (gastos) → débito en Nación c/560, tesorería 13 (si era otra cuenta del Nación, cambiarla en la OP).
--   · Mercado Libre (suscripción Meli+) → débito en Mercado Pago, tesorería 18.
do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  r record;
  v_forma text; v_cta bigint; v_ref text;
begin
  for r in select v.id, v.proveedor_id, v.proveedor_nom, v.fecha, v.saldo from public.v_pagos_facturas v
            where v.id = any(array[88,637,972,184,96,189,200,325,368,715,459,702,342,695,694,869,875,693,951,950,866,937]::bigint[])
              and v.pago_a_reconstruir and v.saldo > 0 loop
    if r.proveedor_nom ~* 'AUTOPISTA|CORREDORES' then
      v_forma := 'tarjeta'; v_cta := 20; v_ref := 'Telepeaje debitado en la tarjeta Visa Business Galicia';
    elsif r.proveedor_nom ~* 'NACION' then
      v_forma := 'debito_automatico'; v_cta := 13; v_ref := 'Débito automático en Banco Nación';
    elsif r.proveedor_nom ~* 'MERCADOLIBRE' then
      v_forma := 'debito_automatico'; v_cta := 18; v_ref := 'Débito en Mercado Pago (suscripción Meli+)';
    else
      v_forma := 'debito_automatico'; v_cta := 1; v_ref := 'Débito automático en Galicia CC 4736';
    end if;
    perform public.pagos_reconstruir_orden(r.proveedor_id,
      jsonb_build_object('fecha', r.fecha, 'forma_pago', v_forma, 'monto_pagado', r.saldo, 'cuenta_origen_id', v_cta,
        'referencia', v_ref, 'obs', 'Pago reconstruido el 26/09: débito automático (confirmado por el dueño)'),
      jsonb_build_array(jsonb_build_object('tipo','factura','factura_id', r.id, 'monto', r.saldo)), u);
  end loop;
end $m$;
