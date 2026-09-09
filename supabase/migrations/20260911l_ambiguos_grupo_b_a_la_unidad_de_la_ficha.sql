-- 20260911l — Grupo B de los ambiguos: renglones que decian "N kg" o "N unid"
-- y son "N de la ficha". Lectura confirmada por el user el 08/09 ("el grupo B
-- esta ok"):
--   cables unipolar 2.5mm2 "100 unid"  -> 100 m (rollo de 100)      x3, CC-019
--   pastina x 5kg "10 kg"              -> 2 unidades                CC PRADERAS
--   yeso x 25kg "N kg"                 -> N bolsas                  cc 08, CADINC 1 x2, CC-019
--
-- Se corrige unidad y cantidad en el renglon del pedido y en la cuenta, y
-- recien ahi se tasa al precio de la ficha. Las tres guardas siguen en el
-- WHERE (precio 0, no cobrado, y ahora tambien no certificado); la lista de
-- ids es ademas explicita para que no entre nada mas.

select set_config('cadinc.mcc_fuente', 'ambiguos_grupo_b', true);

with decidido(mcc_id, unidad, cantidad) as (values
  (1457, 'm', 100), (1458, 'm', 100), (1459, 'm', 100),
  (1733, 'unid', 2),
  (308, 'bolsa', 3), (411, 'bolsa', 2), (2097, 'bolsa', 5), (1896, 'bolsa', 4)
),
objetivo as (
  select c.id as mcc_id, i.id as item_id, d.unidad, d.cantidad, m.precio_ref
    from decidido d
    join public.materiales_a_cuenta_cliente c on c.id = d.mcc_id
    join public.solicitud_compra_item i on i.id = c.item_id
    join public.stock_materiales m on m.id = i.material_id
   where coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
     and m.precio_ref > 0 and public.unidad_compatible(d.unidad, m.unidad)
),
upd_item as (
  update public.solicitud_compra_item i
     set unidad = o.unidad, cantidad = o.cantidad,
         cantidad_enviada  = case when i.cantidad_enviada  is not null then o.cantidad end,
         cantidad_comprada = case when i.cantidad_comprada is not null then o.cantidad end,
         precio_unit = o.precio_ref
    from objetivo o where i.id = o.item_id
  returning i.id
)
update public.materiales_a_cuenta_cliente c
   set unidad = o.unidad, cantidad = o.cantidad,
       precio_unit = o.precio_ref, precio_total = round(o.cantidad * o.precio_ref, 2),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from objetivo o where c.id = o.mcc_id;
