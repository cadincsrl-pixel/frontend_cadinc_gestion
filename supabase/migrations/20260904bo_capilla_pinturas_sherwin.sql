-- 20260904bo — Concepción Capilla: "pintura 7005" y "pintura 7055" son Loxon LD exterior mate x 18 l
--
-- Confirmado por el user (2026-09-04): 7005 → base EW (fila 1159, $152.785,81)
-- y 7055 ×2 → base Deep (fila 1153, $156.956,51). Los tres renglones salieron
-- del depósito en $0 y toman el precio de referencia. Los códigos Sherwin
-- quedan como alias para que la próxima vez el pedido los encuentre.

update public.stock_materiales set alias = array(select distinct unnest(alias || array['7005','pintura 7005','sw7005','sw 7005','loxon 7005']))
 where id = 1159;
update public.stock_materiales set alias = array(select distinct unnest(alias || array['7055','pintura 7055','sw7055','sw 7055','loxon 7055']))
 where id = 1153;

create temp table vinc (item_id int, material_id int, precio numeric, nota text);
insert into vinc values
  (1533, 1159, 152785.81, 'pintura 7005 → Loxon LD exterior mate 18 l base EW (según el user)'),
  (1542, 1153, 156956.51, 'pintura 7055 → Loxon LD exterior mate 18 l base Deep (según el user)'),
  (1825, 1153, 156956.51, 'pintura 7055 → Loxon LD exterior mate 18 l base Deep (según el user)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → ' || m.nombre || ' — ' || v.nota,
       jsonb_build_object('motivo', 'CC-017 Concepción Capilla pinturas 2026-09-04', 'material_id', v.material_id, 'desc_canonica', m.nombre,
                          'precio_anterior', i.precio_unit, 'precio_nuevo', v.precio)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.id = v.material_id
where i.material_id is null;

update public.solicitud_compra_item i set material_id = v.material_id, descripcion = m.nombre, unidad = 'lata', precio_unit = v.precio
  from vinc v join public.stock_materiales m on m.id = v.material_id where i.id = v.item_id and i.material_id is null;
update public.materiales_a_cuenta_cliente c
   set descripcion = m.nombre, unidad = 'lata', precio_unit = v.precio, precio_total = round(c.cantidad * v.precio, 2), updated_at = now()
  from vinc v join public.stock_materiales m on m.id = v.material_id where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;
