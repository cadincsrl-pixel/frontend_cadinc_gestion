-- Limpieza del catálogo, tanda 5: las dos masillas de CC-026 tenían la unidad al revés del nombre.
-- Dueño, 25/09: las dos son de Durlock.
--
--   2668 "masilla x 7kg" en kg   → "Masilla Durlock x 7kg" por balde (se despachó 1 balde).
--        Precio: el $11 inventado pasa a $11.086,49, que es lo que se le cargó y cuadra exacto con
--        el balde de 32 kg (50.681,12 / 32 × 7).
--   2777 "masilla x kg" en unid  → "Masilla Durlock x kg (suelta)" por kg (se despacharon 3 kg).
--        Precio sin tocar ($0): la compra fue a $1.058/kg, un precio viejo; queda para tasar.
--
-- Cambiar la unidad acá NO reinterpreta mal los movimientos (§5.15): ya estaban escritos en la
-- unidad correcta (1 balde; 3 kg), lo que estaba mal era la ficha.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
begin
  update public.solicitud_compra_item set descripcion = 'Masilla Durlock x 7kg'
   where material_id = 2668 and descripcion = 'masilla x 7kg';
  update public.solicitud_compra_item set descripcion = 'Masilla Durlock x kg (suelta)'
   where material_id = 2777 and descripcion = 'masilla x kg';

  update public.materiales_a_cuenta_cliente c
     set descripcion = case i.material_id when 2668 then 'Masilla Durlock x 7kg' else 'Masilla Durlock x kg (suelta)' end,
         updated_at = now()
    from public.solicitud_compra_item i
   where c.item_id = i.id and i.material_id in (2668, 2777)
     and c.descripcion in ('masilla x 7kg', 'masilla x kg') and c.cobro_id is null;

  update public.stock_materiales
     set nombre = 'Masilla Durlock x 7kg', unidad = 'balde',
         alias = array['masilla x 7kg', 'masilla x 7 kg', 'masilla durlock 7', 'masilla 7kg', 'balde de masilla 7kg'],
         updated_by = v_user, updated_at = now()
   where id = 2668;

  update public.stock_materiales
     set nombre = 'Masilla Durlock x kg (suelta)', unidad = 'kg',
         alias = array['masilla x kg', 'masilla suelta', 'masilla por kilo', 'masilla durlock suelta', 'masilla durlock x kg'],
         updated_by = v_user, updated_at = now()
   where id = 2777;

  perform public.fijar_precio_ref(2668, 11086.49, 'manual', 3684, v_user);
end
$m$;
