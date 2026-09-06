-- 20260906f — Vista v_material_compras: todas las compras reales de un material (historial de precios del catálogo)
--
-- Mismo predicado que v_material_ultima_compra (20260904z) pero SIN el
-- DISTINCT ON: una fila por compra, con proveedor, obra, pedido, factura,
-- cantidad y precio final. La lee GET /api/stock/catalogo/:id/compras para
-- el "Historial de precios" del catálogo (por compra y por proveedor). Un
-- material tiene decenas de compras, no miles: sin riesgo de techo de 1000.

create or replace view public.v_material_compras with (security_invoker = true) as
select i.material_id,
       i.id            as item_id,
       i.solicitud_id,
       s.obra_cod,
       o.nom           as obra_nom,
       i.descripcion,
       i.color,
       coalesce(i.cantidad_comprada, i.cantidad) as cantidad,
       i.unidad,
       i.precio_unit,
       i.proveedor_id,
       p.nombre        as proveedor_nombre,
       i.fecha_resolucion as fecha,
       i.pagado_por,
       i.factura_id,
       f.numero        as factura_numero,
       i.estado
from public.solicitud_compra_item i
join public.solicitud_compra s on s.id = i.solicitud_id
left join public.obras o on o.cod = s.obra_cod
left join public.proveedores p on p.id = i.proveedor_id
left join public.facturas_compra f on f.id = i.factura_id
where i.material_id is not null
  and i.precio_unit > 0
  and i.estado in ('comprado', 'en_proveedor', 'retirado', 'enviado')
  and (i.proveedor_id is not null
       or exists (select 1 from public.solicitud_item_eventos e where e.item_id = i.id and e.accion in ('comprado', 'en_proveedor'))
       or exists (select 1 from public.materiales_a_cuenta_cliente c where c.item_id = i.id and c.origen = 'proveedor'));

grant select on public.v_material_compras to authenticated, service_role;
