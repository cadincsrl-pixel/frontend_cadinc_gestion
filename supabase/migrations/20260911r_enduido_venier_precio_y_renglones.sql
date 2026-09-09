-- 20260911r — El enduido de 20 L que compra CADINC es el Venier, y tiene precio.
--
-- Silvafast (la tienda de Silva, el proveedor real) lo vende hoy a $62.254
-- final con IVA (08/09/2026). La compra de Silva del 31/07 a $2.745 el litro
-- = $54.900 el balde cierra con ese producto: es el Venier. Precio por
-- fijar_precio_ref (historial con fuente y usuario).
--
-- Los dos renglones de enduido en $0 ("20 kg" en cc 08 y "8 kg" en CADINC 1)
-- se pasan a la ficha Venier x 20lts: el de 20 es UN balde; el de 8 es lo que
-- el user describe como "medio balde o lo que queda": 8 de 20 = 0,4 balde.
-- Si eran Prinz, se cambian de ficha (mismo precio aproximado).

select public.fijar_precio_ref(2655, 62254, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: $62.254 final, Silvafast (Silva). La compra del 31/07 a $2.745/lt ($54.900 el balde) era este producto.')
 where id = 2655;

select set_config('cadinc.mcc_fuente', 'ambiguos_grupo_c', true);

with decidido(mcc_id, cantidad) as (values (300, 1), (405, 0.4)),
objetivo as (
  select c.id as mcc_id, i.id as item_id, d.cantidad, m.precio_ref
    from decidido d
    join public.materiales_a_cuenta_cliente c on c.id = d.mcc_id
    join public.solicitud_compra_item i on i.id = c.item_id
    cross join (select precio_ref from public.stock_materiales where id = 2655) m
   where coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
     and m.precio_ref > 0
),
upd_item as (
  update public.solicitud_compra_item i
     set material_id = 2655, descripcion = 'Enduido plástico interior Venier x 20lts',
         unidad = 'balde', cantidad = o.cantidad,
         cantidad_enviada  = case when i.cantidad_enviada  is not null then o.cantidad end,
         cantidad_comprada = case when i.cantidad_comprada is not null then o.cantidad end,
         precio_unit = o.precio_ref
    from objetivo o where i.id = o.item_id
  returning i.id
)
update public.materiales_a_cuenta_cliente c
   set descripcion = 'Enduido plástico interior Venier x 20lts',
       unidad = 'balde', cantidad = o.cantidad,
       precio_unit = o.precio_ref, precio_total = round(o.cantidad * o.precio_ref, 2),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from objetivo o where c.id = o.mcc_id;
