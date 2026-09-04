-- 20260904z — Catálogo de precios: estado del precio por material
--
-- Para filtrar "qué tengo que hacer" en la pantalla (pedido del user 2026-09-04):
--   sin_precio     · no tiene precio de referencia ni compra de dónde tomarlo
--   tasar          · no tiene precio, pero sí una última compra para tomar
--   desactualizado · tiene precio, y la última compra difiere más de 0,5 %
--   al_dia         · precio = última compra
--   sin_compra     · tiene precio, nunca se compró por el sistema
-- `dif_pct` es la diferencia última compra vs referencia, en %, para ordenar
-- y mostrar. Se agregan al final de la vista (create or replace lo exige).

create or replace view public.v_catalogo_materiales
with (security_invoker = true) as
select m.id, m.rubro_id, r.nombre as rubro, r.icono as rubro_icono,
       m.nombre, m.unidad, m.precio_ref, m.precio_actualizado_en,
       m.proveedor_id, pp.nombre as proveedor_nombre,
       m.alias, m.clase, m.activo, m.usa_color, m.stock_actual, m.obs, m.updated_at,
       public.norm_txt(m.nombre || ' ' || coalesce(array_to_string(m.alias, ' '), '') || ' ' || r.nombre) as busq,
       u.precio_unit      as uc_precio,
       u.proveedor_nombre as uc_proveedor,
       u.fecha            as uc_fecha,
       u.solicitud_id     as uc_pedido,
       u.obra_cod         as uc_obra,
       case
         when m.precio_ref = 0 and u.precio_unit is null then 'sin_precio'
         when m.precio_ref = 0                            then 'tasar'
         when u.precio_unit is null                       then 'sin_compra'
         when abs(u.precio_unit - m.precio_ref) / m.precio_ref > 0.005 then 'desactualizado'
         else 'al_dia'
       end as estado_precio,
       case when m.precio_ref > 0 and u.precio_unit is not null
            then round((u.precio_unit - m.precio_ref) / m.precio_ref * 100)
       end as dif_pct
from public.stock_materiales m
join public.stock_rubros r on r.id = m.rubro_id
left join public.proveedores pp on pp.id = m.proveedor_id
left join public.v_material_ultima_compra u on u.material_id = m.id;
