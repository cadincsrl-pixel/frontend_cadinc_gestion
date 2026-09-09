-- 20260911k — Los renglones de aguarras y diluyente pedidos POR LITRO pasan a
-- las fichas por litro, y el aguarras se tasa.
--
-- El deposito compra aguarras y thinner por tambor y los despacha por litro
-- (Sosa, recuento del 08/09). Los renglones venian colgados de las fichas de
-- la LATA de 4 lts con unidad 'lt': unidad incompatible, no se podian tasar,
-- y hubieran dado disparates. El user confirmo (08/09): "las fichas van por
-- litro, tenemos dos tipos: aguarras y diluyente, que es el thinner".
--
-- Aguarras x litro (2633) ya tiene precio: $4.500. Thinner (diluyente) x litro
-- (2634) no: falta confirmar si el tambor es de 180 o 200 lts. Esos quedan en
-- $0 pero en la ficha correcta, listos para tasar cuando haya precio.
--
-- No se tocan los stock_movimientos viejos: el recuento del 08/09 ya dejo el
-- stock_actual de las latas y de los litros en lo contado.

select set_config('cadinc.mcc_fuente', 'relink_por_litro', true);

-- 1) el renglon del pedido y la fila de la cuenta apuntan a la ficha por litro
with mapa(vieja, nueva, nombre) as (values
  (357, 2633, 'Aguarrás x litro'),
  (125, 2634, 'Thinner (diluyente) x litro')
),
objetivo as (
  select c.id as mcc_id, i.id as item_id, mp.nueva, mp.nombre
    from public.materiales_a_cuenta_cliente c
    join public.solicitud_compra_item i on i.id = c.item_id
    join mapa mp on mp.vieja = i.material_id
   where c.cobro_id is null and c.certificado_id is null
     and coalesce(c.precio_unit, 0) = 0
     and lower(c.unidad) = 'lt'
),
upd_item as (
  update public.solicitud_compra_item i
     set material_id = o.nueva, descripcion = o.nombre
    from objetivo o where i.id = o.item_id
  returning i.id
)
update public.materiales_a_cuenta_cliente c
   set descripcion = o.nombre, updated_at = now(),
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from objetivo o where c.id = o.mcc_id;

-- 2) el aguarras ya tiene precio por litro: se tasa con las tres guardas
update public.materiales_a_cuenta_cliente c
   set precio_unit  = m.precio_ref,
       precio_total = round(c.cantidad * m.precio_ref, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
  join public.stock_materiales m on m.id = i.material_id
 where i.id = c.item_id and m.id = 2633
   and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
   and m.precio_ref > 0 and public.unidad_compatible(c.unidad, m.unidad);

update public.solicitud_compra_item i
   set precio_unit = c.precio_unit
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and i.material_id = 2633
   and coalesce(i.precio_unit, 0) = 0 and c.precio_unit > 0;
