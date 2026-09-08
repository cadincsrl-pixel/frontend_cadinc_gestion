-- 20260911d — El catalogo deja de invitar a copiar el precio de un litro a la
-- ficha de la lata.
--
-- v_material_ultima_compra no exponia la UNIDAD de esa compra, y
-- v_catalogo_materiales comparaba precio contra precio y marcaba
-- "desactualizado" aunque las unidades fueran distintas: 27 fichas activas hoy,
-- 6 de ellas con el cartel que invita a apretar "usar". Ejemplos: Loxon x 20 lts
-- (ficha 'lata' $247.132) contra una compra en 'lt' a $14.463; Enduido x 25kg
-- (balde $62.695) contra 'kg' a $6.910.
--
-- Ahora: uc_unidad sale en la vista, uc_unidad_ok = unidad_compatible(), el
-- estado 'unidad_distinta' se decide ANTES que 'desactualizado', y dif_pct solo
-- se calcula cuando las unidades son compatibles. Las 27 salen del filtro
-- "Desactualizados". El backend rechaza "usar" con 409 UNIDAD_DISTINTA (fase 1).

create or replace view public.v_material_ultima_compra as
 select distinct on (i.material_id) i.material_id,
    i.id as item_id,
    i.solicitud_id,
    s.obra_cod,
    i.precio_unit,
    i.proveedor_id,
    p.nombre as proveedor_nombre,
    i.fecha_resolucion as fecha,
    i.pagado_por,
    i.unidad
   from solicitud_compra_item i
     join solicitud_compra s on s.id = i.solicitud_id
     left join proveedores p on p.id = i.proveedor_id
  where i.material_id is not null and i.precio_unit > 0::numeric
    and (i.estado = any (array['comprado'::text, 'en_proveedor'::text, 'retirado'::text, 'enviado'::text]))
    and (i.proveedor_id is not null
         or (exists (select 1 from solicitud_item_eventos e
                      where e.item_id = i.id and (e.accion = any (array['comprado'::text, 'en_proveedor'::text]))))
         or (exists (select 1 from materiales_a_cuenta_cliente c
                      where c.item_id = i.id and c.origen = 'proveedor'::text)))
  order by i.material_id, i.fecha_resolucion desc nulls last, i.id desc;

create or replace view public.v_catalogo_materiales as
 select m.id,
    m.rubro_id,
    r.nombre as rubro,
    r.icono as rubro_icono,
    m.nombre,
    m.unidad,
    m.precio_ref,
    m.precio_actualizado_en,
    m.proveedor_id,
    pp.nombre as proveedor_nombre,
    m.alias,
    m.clase,
    m.activo,
    m.usa_color,
    m.stock_actual,
    m.obs,
    m.updated_at,
    norm_txt((((m.nombre || ' '::text) || coalesce(array_to_string(m.alias, ' '::text), ''::text)) || ' '::text) || r.nombre) as busq,
    u.precio_unit as uc_precio,
    u.proveedor_nombre as uc_proveedor,
    u.fecha as uc_fecha,
    u.solicitud_id as uc_pedido,
    u.obra_cod as uc_obra,
        case
            when m.precio_ref = 0::numeric and u.precio_unit is null then 'sin_precio'::text
            when m.precio_ref = 0::numeric then 'tasar'::text
            when u.precio_unit is null then 'sin_compra'::text
            when not public.unidad_compatible(u.unidad, m.unidad) then 'unidad_distinta'::text
            when (abs(u.precio_unit - m.precio_ref) / m.precio_ref) > 0.005 then 'desactualizado'::text
            else 'al_dia'::text
        end as estado_precio,
        case
            when m.precio_ref > 0::numeric and u.precio_unit is not null
                 and public.unidad_compatible(u.unidad, m.unidad)
              then round((u.precio_unit - m.precio_ref) / m.precio_ref * 100::numeric)
            else null::numeric
        end as dif_pct,
    u.unidad as uc_unidad,
    (u.precio_unit is not null and public.unidad_compatible(u.unidad, m.unidad)) as uc_unidad_ok
   from stock_materiales m
     join stock_rubros r on r.id = m.rubro_id
     left join proveedores pp on pp.id = m.proveedor_id
     left join v_material_ultima_compra u on u.material_id = m.id;

-- Las dos vistas ya estaban con security_invoker (§5.8); se reafirma para que el
-- CREATE OR REPLACE no las deje corriendo con los permisos del dueño.
alter view public.v_material_ultima_compra set (security_invoker = on);
alter view public.v_catalogo_materiales    set (security_invoker = on);
