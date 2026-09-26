-- =====================================================================
-- 20261009b — ARGEC: la FA 0002-00004036 se pagó con el e-cheq 2675
-- (2026-09-26, dueño: «fijate las facturas de argec de su carpeta así
-- cerramos»)
--
-- La conciliación con el resumen de ARGEC al 10/07 ya estaba hecha (diario
-- 26/09): deuda $3.903.675,12. Faltaba la FA 4036 del 27/05 ($19.481.000,
-- instalación tercer eje dominio AHS90EQ, planta Quilmes), que entró con la
-- importación histórica de mayo (#23) como «a reconstruir» y sin imputar.
-- ARGEC la cobró con su recibo 4593 del 28/05; en la carpeta está el
-- comprobante: e-cheq Galicia N° 2675, op. LR5TDRy422, emitido el 28/05,
-- pago 29/05, $19.481.000, «Orden de pago / Pago argec fac 4036».
--
-- 1. Imputar la 4036 como las de junio: Mantenimiento y repuestos (4) → CC-020.
-- 2. Reconstruir el pago: OP e-cheq desde Galicia con el cheque 2675.
-- 3. FA 4112–4114 (10/07, «REPARACIONES» $690.000 + IVA sobre dominios de
--    camiones): concepto «Mantenimiento y repuestos», como el resto de
--    ARGEC. Estaban en «Otros» / «Materiales de obra».
-- La deuda con ARGEC no cambia ($3.903.675,12): la 4036 era «a reconstruir».
-- =====================================================================
do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
begin
  perform public.pagos_imputar_factura(3778, 4,
    jsonb_build_array(jsonb_build_object('obra_cod', 'CC-020', 'monto', 19481000)),
    'Instalación tercer eje dominio AHS90EQ (chasis 8AW658275TC500283), planta Quilmes', v_user);

  perform public.pagos_reconstruir_orden(75,
    jsonb_build_object(
      'fecha', '2026-05-28', 'forma_pago', 'echeq', 'cuenta_origen_id', 1, 'monto_pagado', 19481000,
      'referencia', 'E-cheq Galicia N° 2675 · op. LR5TDRy422 («Orden de pago / Pago argec fac 4036») · recibo ARGEC 4593 del 28/05',
      'obs', 'Pago reconstruido el 26/09 desde el comprobante del e-cheq (carpeta Proveedores/Argec).',
      'cheques', jsonb_build_array(jsonb_build_object(
        'numero', '2675', 'banco', 'Galicia', 'fecha_cobro', '2026-05-29', 'monto', 19481000, 'es_propio', true))),
    jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', 3778, 'monto', 19481000)),
    v_user);

  update public.pagos_facturas
     set concepto_id = 4, updated_by = v_user
   where id in (131, 132, 133) and proveedor_id = 75 and concepto_id is distinct from 4;
end $m$;
