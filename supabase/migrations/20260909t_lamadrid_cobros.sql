-- LAMADRID 566 (CC-016): se cargan los cobros reales del cliente
--
-- Hasta hoy la obra tenía CERO cobros en el sistema: todo el facturable
-- figuraba adeudado. El user pasó su registro de caja (captura, 08/09) con
-- los pagos de LAMADRID. El módulo Caja del ERP está vacío (0 movimientos),
-- así que la fuente es ese registro externo + la planilla del cliente, que
-- coincide en los dos primeros (su corte es 27/08, por eso no vio el 3ro).
--
--   06/08  $1.500.000  efectivo       "pago efectivo"
--   06/08  $2.200.000  transferencia  "mono c — 2.0 M + 200.000 Metán"
--   28/08  $5.000.000  (sin detalle → medio 'otro')
--
-- Total cargado: $8.700.000. No se imputan todavía ("Imputar lo pagado"
-- queda para cuando el user cierre las correcciones pendientes del cruce:
-- EMI, arena, zinguería).

insert into cuenta_cliente_cobros (obra_cod, fecha, monto, medio, obs) values
  ('CC-016', '2026-08-06', 1500000, 'efectivo',      'Pago efectivo (registro de caja del user, 08/09).'),
  ('CC-016', '2026-08-06', 2200000, 'transferencia', 'Transferencia mono c — 2.0 M + 200.000 Metán (registro de caja del user, 08/09).'),
  ('CC-016', '2026-08-28', 5000000, 'otro',          'Sin detalle en el registro de caja del user (08/09); medio no registrado.');
