-- =====================================================================
-- 20260930z — Sancor y La Segunda: todo pagado por débito automático
-- (2026-09-25, dueño: «no me pongas ni sancor ni la segunda para pagar
-- ponelas pagadas como debito automatico y listo»)
--
-- Las facturas con saldo (8 de Sancor, 2 de La Segunda) se cancelan con una
-- OP por proveedor, fecha 25/09, débito automático desde Galicia. No hay
-- un débito del extracto detrás de cada una: la flota de Sancor se debita en
-- cuotas que todavía no llegaron. Queda dicho en la referencia.
-- Ya estaban pasadas a deuda (no «a reconstruir»): se aprueban y se emite
-- la OP por la puerta normal.
-- Se emite con `cadinc.pagos_reconstruir` prendido (como pagos_reconstruir_orden)
-- porque ninguno de los dos tiene CBU cargado.
-- Además, la forma habitual de los dos pasa a débito automático.
-- =====================================================================
do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_prov bigint;
  v_lineas jsonb;
  v_total numeric;
begin
  -- Mismo permiso que un pago reconstruido: el débito automático no necesita
  -- CBU del proveedor (PROVEEDOR_SIN_DATOS_PAGO).
  perform set_config('cadinc.pagos_reconstruir', 'on', true);
  foreach v_prov in array array[56, 49]::bigint[] loop
    select jsonb_agg(jsonb_build_object('tipo', 'factura', 'factura_id', id, 'monto', saldo) order by fecha, id), sum(saldo)
      into v_lineas, v_total
      from public.v_pagos_facturas
     where proveedor_id = v_prov and estado <> 'anulada' and clase = 'factura' and saldo > 0.005;
    continue when v_lineas is null;
    perform public.pagos_aprobar_facturas(
      (select array_agg(id) from public.v_pagos_facturas
        where proveedor_id = v_prov and estado = 'pendiente' and clase = 'factura' and saldo > 0.005), v_user);
    perform public._pagos_emitir_orden(v_prov,
      jsonb_build_object('fecha', '2026-09-25', 'forma_pago', 'debito_automatico', 'cuenta_origen_id', 1,
        'monto_pagado', v_total,
        'referencia', 'Débito automático Galicia — marcadas pagadas a pedido del dueño (25/09); las cuotas se debitan mes a mes',
        'obs', 'Seguros por débito automático: no se pagan a mano. 20260930z.'),
      v_lineas, '[]'::jsonb, v_user, false);
    update public.pagos_proveedores set forma_pago_habitual = 'debito_automatico' where id = v_prov;
  end loop;
end $m$;

-- La Segunda FA 27-42153 (#336): saldo 0 por las NC 97 y 636, pero seguía
-- «pendiente» y salía para aprobar. (Aplicado como 20260930z_…_b.)
select public.pagos_aprobar_factura(336, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
