-- 20260908c — Poximix en 9 y las dos fichas de bolsa se unifican
-- (user 2026-09-07: "poximix tengo 9 bolsas - y las bolsas escombro y
-- alpillera deberiamos unificar")
--
-- POXIMIX: quedaba afuera de la cuarta tanda porque Sosa habia puesto 0 y
-- pegado la descripcion del "Poximix Exterior" en vez de un numero. El user
-- cuenta 9 bolsas contra 13 del sistema.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
values
  (697, 'ajuste', -4, 'ajuste_inventario', 'faltante_fisico', 'pendiente', '2026-09-07',
   'Recuento del deposito 2026-09-07: el sistema decia 13 y el user conto 9 bolsas. Faltan 4.',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

-- BOLSAS: "bolsa para escombro" (808) y "bolsa de arpillera" (819) son la misma
-- bolsa; una la nombra por el uso y la otra por el material. Sobrevive la 808:
-- tiene 18 renglones contra 6, precio de referencia cargado ($300) y es donde
-- el recuento anoto las 330. La 819 le pasa renglones, movimientos y alias.
update public.stock_movimientos     set material_id = 808 where material_id = 819;
update public.solicitud_compra_item set material_id = 808 where material_id = 819;
update public.herr_entregas         set material_id = 808 where material_id = 819;

-- Las descripciones de los renglones viejos NO se tocan: dicen "Bolsa de
-- arpillera" porque asi se pidieron, y son documentos emitidos.
update public.stock_materiales
set alias = array(select distinct e from unnest(alias || array[
      'bolsa de arpillera','bolsas arpillera','bolsas para alpillera',
      'bolsas vacias alpilleras','bolsas vacias','bolsa de alpillera',
      'bolsas de alpillera','bolsa alpillera']) e),
    obs = 'Absorbio la ficha 819 ("Bolsa de arpillera") el 07/09: es la misma bolsa, una nombrada por el uso y la otra por el material. Lo confirmo el user en el recuento ("es lo mismo que bolsa alpillera").'
where id = 808;

update public.stock_materiales
set activo = false, stock_actual = 0, alias = '{}',
    obs = 'Fusionada en la ficha 808 ("Bolsa para escombro") el 07/09: es la misma bolsa. Sus renglones, movimientos y alias se mudaron.'
where id = 819;
