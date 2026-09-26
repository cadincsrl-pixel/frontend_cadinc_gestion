-- =====================================================================
-- 20261011a — Logística Don Salvador: la NC A 0007-00000532 anula la
-- FA A 0007-00007675 (2026-09-26)
--
-- Las dos del 24/06/2026 por $11.654.992,12 (importación ARCA de junio,
-- #24, «a reconstruir»). Don Salvador emitió la 7675, la anuló con la NC 532
-- (código ARCA 3) y la reemplazó por la FA 7677 ($9.425.456,87, CAE
-- correlativo al de la NC). Dueño: «a don salvador solo se le pagó 3
-- facturas» (7291, 7344 y 7677). La NC se aplica completa a la 7675 y las
-- dos quedan en cero. La 7677 queda como estaba hasta saber cómo se pagó.
-- =====================================================================
select public.pagos_reconstruir_nc(3995,
  jsonb_build_array(jsonb_build_object('factura_id', 3989, 'monto', 11654992.12)),
  'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
