-- 20260911p — El "geotextil" es Sika Tex 75, velo de poliester para refuerzo
-- de membranas liquidas: rollo de 1,05 m de ancho x 25 m de largo (26 m2).
-- Dato del user (08/09), con la publicacion de MercadoLibre a la vista
-- ($110.357 el rollo; la compra real de Silva del 12/08 fue $30.981).
--
-- La ficha 686 se llama por lo que es y dice las medidas. El renglon de
-- "50 m" de CC-011 (mcc 342) son 2 rollos: se corrige y se tasa al precio
-- del catalogo ($30.981, la unica compra). El renglon con cantidad 0 (1016)
-- no se toca.

update public.stock_materiales
   set nombre = 'Geotextil Sika Tex 75 p/ refuerzo de membrana x rollo (1,05 × 25 m = 26 m²)',
       alias  = (select array_agg(distinct a) from unnest(coalesce(alias,'{}') || array['sika tex', 'sikatex', 'sika tex 75', 'manta sika tex', 'geotextil sika', 'velo para membrana']) a),
       obs    = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: es Sika Tex 75 (poliester, refuerzo de membranas liquidas), rollo de 1,05 x 25 m = 26 m2. MercadoLibre 08/09: $110.357 el rollo; la ultima compra (Silva 12/08) fue $30.981.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 686;

select set_config('cadinc.mcc_fuente', 'ambiguos_grupo_c', true);

with objetivo as (
  select c.id as mcc_id, i.id as item_id, m.precio_ref
    from public.materiales_a_cuenta_cliente c
    join public.solicitud_compra_item i on i.id = c.item_id
    join public.stock_materiales m on m.id = i.material_id
   where c.id = 342 and m.id = 686
     and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
     and m.precio_ref > 0
),
upd_item as (
  update public.solicitud_compra_item i
     set unidad = 'rollo', cantidad = 2,
         cantidad_enviada  = case when i.cantidad_enviada  is not null then 2 end,
         cantidad_comprada = case when i.cantidad_comprada is not null then 2 end,
         precio_unit = o.precio_ref
    from objetivo o where i.id = o.item_id
  returning i.id
)
update public.materiales_a_cuenta_cliente c
   set unidad = 'rollo', cantidad = 2,
       precio_unit = o.precio_ref, precio_total = round(2 * o.precio_ref, 2),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from objetivo o where c.id = o.mcc_id;
