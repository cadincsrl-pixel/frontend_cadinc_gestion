-- 20260905g — Villaguay (cc 24, llave en mano): renglones en $0 que ya tienen referencia
--
-- Antes de la ronda de preguntas con el user: lo que el catálogo ya sabe.
--   #292 Solera 70 ×3 (la unidad decía "gl": son unidades) → $4.902,47
--   #293 Montante 70 ×2 → $5.436,58 · #294 Solera 35 ×2 → $3.600,48
--   #295 Tornillo T1 ×1 → $25 · #2204 Travesaño cielorraso 0,60 ×60 → $1.004,76
-- Obra llave en mano (gasto CADINC), ninguno cobrado.

create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (292,  4902.47, 'catálogo (Solera 70mm x 2.60m)'),
  (293,  5436.58, 'catálogo (Montante 70mm x 2.60m)'),
  (294,  3600.48, 'catálogo (Solera 35mm x 2.60m)'),
  (295,  25,      'catálogo (Tornillo T1 punta aguja)'),
  (2204, 1004.76, 'Silva 27/07/2026 (Travesaño p/ cielorraso desmontable 0,60m)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'cc 24 Villaguay referencias 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item i set precio_unit = p.precio, unidad = case when i.unidad = 'gl' then 'unid' else i.unidad end
  from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), unidad = case when c.unidad = 'gl' then 'unid' else c.unidad end, updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table precios;
