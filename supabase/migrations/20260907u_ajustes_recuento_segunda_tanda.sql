-- 20260907u — Ajustes del recuento del depósito, segunda tanda (user 2026-09-07)
--
-- Sosa siguió cargando la planilla (colección `conteo` del artifact
-- https://claude.ai/code/artifact/f95bdd41-9351-4207-b2ea-2f8c1ab7a43e).
-- De los 9 ítems nuevos, 6 coinciden con el sistema y no generan nada:
-- alambrón, balde de albañil 20 lts, cuña de madera, film 100 micrones,
-- hierro Ø 6mm y pastina x 5kg, todos en 0 contra 0.
--
-- Los 3 que sí difieren van acá. Nacen `pendiente`: no tocan el stock hasta
-- que alguien los aprueba. `cantidad` es el DELTA firmado.
--
-- Los dos positivos son otra vez fichas en NEGATIVO: material que salió sin
-- haber entrado nunca al sistema, así que va como `error_carga`.
-- La piedra partida es el caso grande: 115 bolsas.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
select v.material_id, 'ajuste', v.delta, 'ajuste_inventario', v.sub_motivo, 'pendiente',
       '2026-09-07', v.obs, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from (values
  (770, 115, 'error_carga',      'Recuento del depósito 2026-09-07: el sistema decía -15 y se contaron 100. La ficha estaba en negativo: entraron bolsas que nunca se cargaron.'),
  (1007, 11, 'error_carga',      'Recuento del depósito 2026-09-07: el sistema decía -1 y se contaron 10. La ficha estaba en negativo: entraron unidades que nunca se cargaron.'),
  (328,  -1, 'faltante_fisico',  'Recuento del depósito 2026-09-07: el sistema decía 1 y no se encontró ninguno. Falta.')
) as v(material_id, delta, sub_motivo, obs);
