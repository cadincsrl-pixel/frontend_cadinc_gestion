-- 20260911u — El barril de thinner tiene ~180 litros (user, 08/09, dato de
-- Sosa). La ficha por litro (2634) estaba en -2: el tambor nunca se cargo como
-- compra ni como entrada, y el despacho del pedido 699 (2 lt) descontó de
-- cero. Se registra un ajuste de inventario (ingreso sin compra) que deja el
-- stock en 180, con el mismo mecanismo del recuento. La ficha del tambor
-- (1145) sigue en 0: lo fisico se lleva por litro.
insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, created_by, obs)
select 2634, 'ajuste', 180 - m.stock_actual, 'ajuste_inventario', 'ingreso_sin_compra', 'aprobado', date '2026-09-08',
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
       'Barril de thinner: quedan ~180 lt (Sosa, 08/09). El tambor nunca se habia cargado como entrada; el sistema decia '||m.stock_actual||' y se dejan 180.'
  from public.stock_materiales m where m.id = 2634 and m.stock_actual <> 180;

update public.stock_materiales
   set stock_actual = 180, updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
       obs = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: quedan ~180 lt en el barril (Sosa); cargado como ajuste de inventario.')
 where id = 2634;
