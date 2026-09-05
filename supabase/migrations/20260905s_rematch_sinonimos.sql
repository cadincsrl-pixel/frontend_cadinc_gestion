-- 20260905s — Re-match de los renglones sin material con los sinónimos de hoy (20260905n)
--
-- El matcher del pedido corre al crear el renglón (gotcha 2026-09-03): un
-- sinónimo nuevo no alcanza a lo ya cargado. Con los 79 materiales que
-- recibieron sinónimos hoy, 12 renglones en texto libre pasan a tener match
-- EXACTO (norm_material sobre nombre o alias). Se vinculan los 8 con match
-- único y misma unidad; quedan afuera y anotados para el user:
--   · 1430 "espejo" (CC-019): el alias genérico apunta a 60x80 y no se sabe la medida.
--   · 2206 "chapas grises ranuradas" (CC FARM 25): matchea 4 largos de chapa.
--   · 2897 "caño de 63" y 2902 "caño de 40" (CC-023): 2 m contra filas por barra de 4 m.
-- No se toca ningún precio.

create temp table vinc (item_id int, material_id int);
insert into vinc values
  (227, 179), (947, 179),   -- sika 1A plus → Sellador poliuretano x 300ml
  (231, 270),               -- foco 20w → Lámpara LED 20W
  (500, 3),                 -- caño de 63 (1 unid) → Caño PVC 63mm x 4m
  (579, 918),               -- brocha n40 → Brocha N°40
  (1550, 12),               -- cupla 50 → Cupla PVC 50mm
  (2221, 328),              -- acelerante sika 3 → Acelerante fraguado x 5lts
  (2883, 644);              -- gafa trasparente → Lentes seguridad transparentes

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 're-match sinónimos 2026-09-05', 'material_id', v.material_id, 'desc_canonica', m.nombre)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.id = v.material_id
where i.material_id is null;

update public.solicitud_compra_item i set material_id = v.material_id, descripcion = m.nombre
  from vinc v join public.stock_materiales m on m.id = v.material_id where i.id = v.item_id and i.material_id is null;
update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
  from vinc v join public.stock_materiales m on m.id = v.material_id where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;
