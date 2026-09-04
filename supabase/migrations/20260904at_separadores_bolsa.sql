-- 20260904at — La bolsa de separadores ya tenía precio y proveedor
--
-- User (2026-09-04): "la bolsa de separadores ya te pasé el precio y el
-- proveedor". Es la fila 318 "Separador plástico 2cm", que hoy mismo quedó
-- vinculada en Lamadrid (#651) a la compra a Zeramiko de $6.996,20 la bolsa,
-- pero el catálogo seguía en $0. Se carga el precio, se le suman los
-- sinónimos, el renglón de Clínica Salta pasa a esa fila (conserva su
-- precio de $7.400) y se borra la fila genérica que di de alta en 20260904as.

update public.stock_materiales
   set precio_ref = 6996.20,
       alias = array(select distinct unnest(alias || array['bolsa de separadores', 'separadores bolsa', 'bolsas de separadores', 'crucetas bolsa', 'bolsa de crucetas', 'separadores 2mm', 'separadores porcelanato'])),
       obs = coalesce(obs || ' · ', '') || 'Se vende por bolsa. Zeramiko, compra Lamadrid #651 (2026-09): $6.996,20 la bolsa, precio final.'
 where id = 318;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado,
       'Bolsa de separadores: es el Separador plástico 2cm (Zeramiko), no la fila genérica',
       jsonb_build_object('motivo', 'catalogo CC CLINICA SALTA 2026-09-04 (2)', 'material_id', 318, 'material_anterior', i.material_id, 'desc_canonica', 'Separador plástico 2cm')
from public.solicitud_compra_item i where i.id = 3054;

update public.solicitud_compra_item set material_id = 318, descripcion = 'Separador plástico 2cm' where id = 3054;
update public.materiales_a_cuenta_cliente set descripcion = 'Separador plástico 2cm', updated_at = now() where item_id = 3054 and cobro_id is null;

delete from public.stock_materiales
 where nombre = 'Separadores p/ cerámico x bolsa'
   and not exists (select 1 from public.solicitud_compra_item i where i.material_id = stock_materiales.id);
