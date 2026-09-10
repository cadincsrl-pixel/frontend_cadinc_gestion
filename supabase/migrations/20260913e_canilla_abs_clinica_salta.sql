-- El renglón ilegible del presupuesto de POLLANO era una canilla, no una rejilla
--
-- Al cargar el presupuesto manuscrito (20260912z) quedó un renglón sin ficha:
-- la anteúltima línea de la hoja 2, 2 unidades por $37.900, que se leía como
-- "Rejillita PVC…" y ahí se perdía la letra. Se cargó con la plata correcta y
-- la descripción "Rejilla PVC (falta definir el modelo)".
--
-- El user lo resolvió el 10/09: es una "canilla PVC cromada ABS para mesada".
-- Cierra con el precio: $18.950 cada una es mucho para una rejilla de piso
-- (las del catálogo están entre $7.300 y $7.700) y es lo que vale una canilla
-- de cuerpo plástico cromado, muy por debajo de una monocomando ($99.000).
--
-- No hay ficha parecida en el catálogo: las canillas que hay son de servicio
-- o esféricas, y las griferías son monocomando. Se crea una.

insert into public.stock_materiales (rubro_id, nombre, unidad, alias, precio_ref, obs, created_by)
values (1, 'Canilla ABS cromada p/ mesada', 'unid',
        array['canilla mesada', 'canilla abs', 'canilla pvc cromada', 'canilla cromada mesada'], 18950,
        'Alta desde el presupuesto de POLLANO del 02/09 (CLINICA SALTA): 2 u a $18.950.',
        'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);

update public.solicitud_compra_item
   set material_id = (select id from public.stock_materiales where nombre = 'Canilla ABS cromada p/ mesada'),
       descripcion = 'Canilla ABS cromada p/ mesada',
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 3621;

update public.materiales_a_cuenta_cliente
   set descripcion = 'Canilla ABS cromada p/ mesada', updated_at = now(),
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where item_id = 3621;
