-- El puntal metálico regulable es HERRAMIENTA (dicho del user, 08/09)
--
-- La ficha 891 "Puntal metálico regulable 2.5m" estaba como material en
-- Hormigón y estructura, y el despacho a FARMACIA AMERICA (item 2944 /
-- mcc 2778, x3) acababa de tasarse con Mercado Libre a $46.572/u. Pero el
-- puntal va y vuelve de la obra: no se cobra, cuenta en el pañol.
--
-- Patrón de conversión (§5.12, mismo camino que la rotuladora 20260905h):
-- clase herramienta + rubro 26, evento sacado_de_cuenta_cliente, fila MCC
-- borrada (no estaba cobrada), y touch de material_id para que el pañol
-- tome los renglones. Efecto en la cuenta de CC-023: −$139.716.

update public.stock_materiales
   set clase = 'herramienta', rubro_id = 26, precio_ref = 0,
       obs = coalesce(obs || ' · ', '') ||
             'Pasada a herramienta el 08/09/2026: va y vuelve de la obra, no se factura.'
 where id = 891;

create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where i.material_id = 891 and c.cobro_id is null;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta: ' || h.descripcion,
       jsonb_build_object('motivo', 'puntal regulable pasado a herramienta 2026-09-08', 'origen_mcc', h.origen)
from herr h;

delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

-- touch: el pañol toma los renglones del tipo nuevo
update public.solicitud_compra_item set material_id = material_id where material_id = 891;
