-- 20260905r — Obras de clientes: los renglones en $0/$1 toman la última compra real (o el catálogo), solo si sube
--
-- OK del user 2026-09-05: "los precios aplicalos siempre y cuando sean más
-- altos que lo que están cargados". Misma regla que Farmacia America
-- (20260905k), ahora para todas las obras con materiales a cargo del cliente
-- (no llave en mano, no depósito), sobre lo NO cobrado que está en $0 o en el
-- marcador $1 y tiene material del catálogo (no herramientas).
--
-- Fuente del precio, en orden: última compra real del mismo material en la
-- misma unidad (MCC origen 'proveedor', precio > $1, la más nueva por
-- fecha_resolucion); si el renglón dice "unid" y el material se vende por
-- bolsa/rollo/lata/balde, vale la compra o la referencia por envase; si no,
-- precio_ref del catálogo. Se exige la misma unidad (o esa equivalencia) para
-- no cobrar un balde al precio del litro ni una bolsa al del kilo: quedan
-- afuera ~40 renglones "kg vs bolsa", "lt vs lata", "unid vs m" que hay que
-- mirar a mano. Nunca baja un precio (nuevo > actual). Evento 'correccion' por
-- renglón con la fuente.

create temp table compras as
select i.material_id, i.unidad, c.precio_unit, c.fecha_resolucion,
       row_number() over (partition by i.material_id, i.unidad order by c.fecha_resolucion desc nulls last, c.id desc) rn
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.origen = 'proveedor' and c.precio_unit > 1 and i.material_id is not null;

create temp table cand as
select c.id as mcc_id, c.item_id, i.solicitud_id, i.estado, c.obra_cod, c.cantidad, c.unidad, c.precio_unit as actual, m.id as material_id, m.nombre,
       coalesce(k1.precio_unit, k2.precio_unit, case when m.precio_ref > 1 then m.precio_ref end) as nuevo,
       case when k1.precio_unit is not null then 'última compra ' || to_char(k1.fecha_resolucion, 'DD/MM/YYYY') || ' (' || m.nombre || ')'
            when k2.precio_unit is not null then 'última compra ' || to_char(k2.fecha_resolucion, 'DD/MM/YYYY') || ' (' || m.nombre || ', por ' || m.unidad || ')'
            else 'catálogo (' || m.nombre || ')' end as fuente
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
join public.stock_materiales m on m.id = i.material_id
join public.obras o on o.cod = c.obra_cod
left join compras k1 on k1.material_id = m.id and k1.unidad = c.unidad and k1.rn = 1
left join compras k2 on k2.material_id = m.id and k2.unidad = m.unidad and k2.rn = 1 and c.unidad <> m.unidad
where c.cobro_id is null and c.precio_unit <= 1
  and o.materiales_a_cargo_de <> 'cadinc' and coalesce(o.es_deposito, false) = false
  and m.clase <> 'herramienta'
  and (c.unidad = m.unidad or (c.unidad = 'unid' and m.unidad in ('bolsa', 'rollo', 'lata', 'balde')));

delete from cand where nuevo is null or nuevo <= actual;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select item_id, solicitud_id, 'correccion', null, estado,
       'Precio cargado: $' || nuevo || ' (' || fuente || ')',
       jsonb_build_object('motivo', 'regla última compra, obras de cliente 2026-09-05', 'precio_anterior', actual, 'precio_nuevo', nuevo, 'material_id', material_id)
from cand;

update public.solicitud_compra_item i set precio_unit = x.nuevo from cand x where i.id = x.item_id and coalesce(i.precio_unit, 0) <= 1;
update public.materiales_a_cuenta_cliente c set precio_unit = x.nuevo, precio_total = round(c.cantidad * x.nuevo, 2), updated_at = now()
  from cand x where c.id = x.mcc_id and c.cobro_id is null;

drop table cand;
drop table compras;
