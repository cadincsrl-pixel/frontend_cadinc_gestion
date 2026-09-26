-- =====================================================================
-- 20261011b — Logística Don Salvador: la FA A 0007-00007677 se pagó con 4
-- e-cheqs de Nuevo Acompañar endosados (2026-09-26)
--
-- Comprobante Galicia «Cheques de la operación LR6VEmf921» (30/06/2026) y el
-- listado de endosados del Galicia: e-cheqs 568, 569, 570 y 571 de NUEVO
-- ACOMPANAR S.R.L. (CUIT 30714790176, Banco Galicia), emitidos el 30/06 y
-- endosados ese día a Don Salvador, $2.356.364,21 cada uno (15/07, 14/08,
-- 13/09 y 13/10). Suman $9.425.456,84: 3 centavos menos que la factura
-- ($9.425.456,87), que quedan como resto (igual que los centavos de las
-- otras dos cuotas de Don Salvador).
-- Dueño: «a don salvador solo se le pagó 3 facturas»: 7291, 7344 y 7677
-- (la 7675 la anuló la NC 532, 20261011a).
-- =====================================================================
select public.pagos_reconstruir_orden(817,
  jsonb_build_object(
    'fecha', '2026-06-30', 'forma_pago', 'echeq', 'monto_pagado', 9425456.84,
    'referencia', 'Endoso de 4 e-cheqs de Nuevo Acompañar (568–571) · op. Galicia LR6VEmf921 del 30/06 · FA 7677',
    'obs', 'Pago reconstruido el 26/09 desde el comprobante de la operación y el listado de endosados del Galicia.',
    'cheques', jsonb_build_array(
      jsonb_build_object('numero', '00000568', 'banco', 'Galicia', 'fecha_cobro', '2026-07-15', 'monto', 2356364.21, 'es_propio', false, 'librador', 'NUEVO ACOMPANAR S.R.L. · CUIT 30714790176'),
      jsonb_build_object('numero', '00000569', 'banco', 'Galicia', 'fecha_cobro', '2026-08-14', 'monto', 2356364.21, 'es_propio', false, 'librador', 'NUEVO ACOMPANAR S.R.L. · CUIT 30714790176'),
      jsonb_build_object('numero', '00000570', 'banco', 'Galicia', 'fecha_cobro', '2026-09-13', 'monto', 2356364.21, 'es_propio', false, 'librador', 'NUEVO ACOMPANAR S.R.L. · CUIT 30714790176'),
      jsonb_build_object('numero', '00000571', 'banco', 'Galicia', 'fecha_cobro', '2026-10-13', 'monto', 2356364.21, 'es_propio', false, 'librador', 'NUEVO ACOMPANAR S.R.L. · CUIT 30714790176'))),
  jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', 3990, 'monto', 9425456.84)),
  'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
