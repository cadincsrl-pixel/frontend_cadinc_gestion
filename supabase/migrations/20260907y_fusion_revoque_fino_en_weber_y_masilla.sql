-- 20260907y — Fusión de las dos fichas de revoque fino en la Weber, y la masilla
-- (user 2026-09-07: "fusionalo, las masillas tengo 2 de estas")
--
-- El recuento probó que 723 (fino exterior), 785 (fino interior) y 1567 (Weber
-- extra blanco) son el mismo material: 723 tenía 25 en stock y se contaron 0,
-- 785 dio 0, y la Weber dio 37.
--
-- NO se hace con los dos ajustes pendientes (-25 y +37) que dejó la migración
-- 20260907x. Esos se borran y se reemplazan por la fusión de verdad, que es más
-- honesta: las 25 bolsas SÍ entraron al depósito el 19/08 con su compra a El
-- sol, sólo que contra la ficha equivocada. Mover el movimiento en vez de
-- anularlo y volver a crearlo le deja a la 1567 su historia real de entrada.
delete from public.stock_movimientos where id in (274, 275);

-- 1) La historia de stock y los renglones pasan a la 1567.
update public.stock_movimientos    set material_id = 1567 where material_id in (723, 785);
update public.solicitud_compra_item set material_id = 1567 where material_id in (723, 785);
update public.herr_entregas         set material_id = 1567 where material_id in (723, 785);

-- Las descripciones de los 8 renglones NO se tocan: están todos en `enviado` y
-- son documentos ya emitidos. Dicen "fino exterior"/"fino interior" porque eso
-- fue lo que se pidió en su momento.

-- 2) Los alias viejos se mudan, así quien escribe "fino exterior" en el pedido
--    sigue encontrando el material (ahora el correcto).
update public.stock_materiales
set alias = array(select distinct unnest(alias || array[
      'bolsas de fino exterior','fino exterior','fino interior',
      'bolsa de fino','bolsa de fino interior','bolsas de fino interior'])),
    stock_actual = 25,                    -- las que entraron el 19/08, ahora bien fichadas
    precio_ref   = 9330.49,               -- de esa misma compra a El sol
    precio_actualizado_en = '2026-09-04',
    obs = 'Weber Saint-Gobain. Revoque fino a la cal, hidrorrepelente, extra blanco, interior y exterior, aplicacion a la llana, solo agregar agua. Bolsa de 25 kg. Absorbio las fichas 723 (fino exterior) y 785 (fino interior) el 07/09: el recuento probo que eran el mismo material. Las viejas decian 30 kg, que era el dato equivocado.'
where id = 1567;

-- 3) Las dos viejas quedan vacías y fuera del buscador del pedido.
update public.stock_materiales
set activo = false, stock_actual = 0, alias = '{}',
    obs = 'Fusionada en la ficha 1567 (Revoque fino Weber extra blanco interior/exterior x 25kg) el 07/09. El recuento del deposito encontro 0 de esta y 37 de la Weber: era el mismo material mal fichado. Sus renglones, movimientos y alias se mudaron.'
where id in (723, 785);

-- 4) Lo que el recuento encontró de más: 37 contadas contra 25 que entraron.
--    Doce bolsas que nunca se registraron. Pendiente, como todos los ajustes.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
values
  (1567, 'ajuste', 12, 'ajuste_inventario', 'error_carga', 'pendiente', '2026-09-07',
   'Recuento del deposito 2026-09-07: se contaron 37 bolsas y solo 25 tienen entrada registrada (la compra del 19/08 a El sol, que estaba en la ficha 723 y se mudo acá). Estas 12 llegaron al galpon sin cargarse.',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'),
  -- Masilla Durlock x 32kg: el user conto 2 y la ficha estaba en 0 sin un solo
  -- movimiento de deposito, aunque hay 4 compras registradas desde julio.
  (80, 'ajuste', 2, 'ajuste_inventario', 'error_carga', 'pendiente', '2026-09-07',
   'Recuento del deposito 2026-09-07: el sistema decia 0 y se contaron 2 baldes. La ficha no tiene ningun movimiento de stock pese a tener 4 compras desde julio: entraron sin registrarse.',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
