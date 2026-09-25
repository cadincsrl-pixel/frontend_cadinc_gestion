-- =====================================================================
-- 20260930y — Petronorte FA 5-11573 (#476, la «11572» del papel) pasa a
-- deuda (2026-09-25). El dueño confirmó: «no esta pagada». Hasta acá era
-- «pago a reconstruir» (importación histórica 13).
-- =====================================================================
select public.pagos_pasar_a_deuda(476, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
