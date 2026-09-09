-- 20260911n — Grupo C de los ambiguos, con la lectura del user (08/09):
--   404  latex satinado 30 lt        -> 1,5 latas de 20      (CC CADINC 1)
--   290  latex satinado 20 lt        -> 1 lata               (CC LOGISTICA)
--   299  latex cielorraso 20 lt      -> 1 lata               (cc 08)
--   1014 membrana liquida 10 lt      -> medio balde de 20 kg (CC CADINC 1)
--   341  membrana liquida 2 lt       -> 2 kg sueltos = 0,1 balde (CC-011)
--   293  poximix 1 kg                -> 0,2 bolsa de 5 kg    (CC LOGISTICA)
--   552, 482, 608, 1321 alambre "1 unid" -> 1 kg
--   10   geotextil "1 unid"          -> 1 rollo              (CC PRADERAS)
--
-- El geotextil (686) tenia unidad m2 y precio $30.981, pero su unica compra
-- fue 1 "unid" a $30.981 (Silva, 12/08): el precio es POR ROLLO. Se corrige
-- la unidad de la ficha a 'rollo' (excepcion a la regla de no renombrar
-- unidades in-place: sus movimientos siempre fueron rollos, la etiqueta era
-- lo que estaba mal; queda anotado en la ficha). El renglon de 50 m (342)
-- espera el largo del rollo; el de 0 unid (1016) no se toca.
--
-- En el galpon a la lata de 20 lts le dicen "balde": se suman alias.

select set_config('cadinc.mcc_fuente', 'ambiguos_grupo_c', true);

update public.stock_materiales
   set unidad = 'rollo',
       nombre = 'Geotextil no tejido 200g/m² x rollo (1 m de ancho)',
       alias  = (select array_agg(distinct a) from unnest(coalesce(alias,'{}') || array['geotextil', 'geotextil rollo', 'rollo de geotextil']) a),
       obs    = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: la unidad decia m2 pero el precio ($30.981) es de la unica compra, 1 rollo (Silva 12/08). Pasa a rollo de 1 m de ancho; largo del rollo por confirmar.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 686;

update public.stock_materiales
   set alias = (select array_agg(distinct a) from unnest(coalesce(alias,'{}') || array['balde de 20', 'balde 20 lts', 'balde de 20 litros']) a)
 where id in (799, 797);

with decidido(mcc_id, unidad, cantidad) as (values
  (404, 'lata', 1.5), (290, 'lata', 1), (299, 'lata', 1),
  (1014, 'balde', 0.5), (341, 'balde', 0.1),
  (293, 'bolsa', 0.2),
  (552, 'kg', 1), (482, 'kg', 1), (608, 'kg', 1), (1321, 'kg', 1),
  (10, 'rollo', 1)
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
