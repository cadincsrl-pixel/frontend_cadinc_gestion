-- 20260904af — Casa Operarios (CC-014), texto libre, tanda 1: los vínculos seguros
--
-- El user pidió resolver primero el texto libre de CC-014 (145 renglones
-- enviados sin fila del catálogo, sin contar herramientas). Esta tanda son los
-- que no necesitan decisión: sinónimo exacto del catálogo, precio idéntico al
-- de la factura ya vinculada en otra obra, o nombre inequívoco. No cambia
-- ningún total de la cuenta; seis renglones cambian de unidad conservando el
-- total (una barra = 4 m, una tira = 3 m, litros = latas). Evento por renglón
-- con la descripción original. Ninguno cobrado.

create temp table vinc (item_id int, material_id int, unidad_nueva text);
insert into vinc values
  -- sinónimo exacto
  (751, 647, null),  (772, 903, null),  (817, 818, null),  (839, 919, null),
  (910, 201, null),  (941, 201, null),  (1318, 915, null), (1504, 53, null),  (2793, 53, null),
  (1511, 812, null), (2133, 55, null),  (1314, 55, null),  (2136, 443, null), (2137, 444, null),
  (2399, 120, 'lata'), (2553, 109, 'bolsa'), (2581, 259, null), (2585, 383, null), (2636, 491, null),
  (2659, 32, null),  (1812, 32, null),  (2660, 384, null), (2676, 720, null), (2719, 167, null),
  (3146, 149, null), (2148, 925, null),
  -- nombre inequívoco o precio idéntico a la factura ya identificada
  (749, 692, null),   -- pares de guantes de tela
  (755, 653, null),   -- barbijo
  (771, 440, null),   -- discos de corte de 7" = 180 mm
  (813, 179, null),   -- selladores sika 1a plus (alias de la fila 179)
  (915, 203, null),  (938, 203, null),   -- cuplas fusión de 25
  (918, 996, null),   -- tornillos de bronce p/ inodoro: $1.210,39 = la fila creada hoy
  (923, 5, null),    (1187, 5, null),   (1188, 5, null),   -- codos 40 Duratop (HH / MH)
  (926, 191, null),   -- piletas de patio
  (928, 1, null),     -- caños de 40: $10.940,24 = tubo 40 x 4 m
  (929, 3, null),     -- caños de 63 x 4 m
  (930, 190, null),   -- ramal Y 110 con acometida de 63
  (934, 11, null),    -- cuplas de 40
  (935, 970, null),   -- "deslizantes": $5.227,33 = lubricante siliconado p/ caños
  (942, 726, null),   -- llaves de paso fusión 25
  (1164, 1014, null), -- curva 90° 110 HH Duratop
  (1176, 450, 'lata'),-- antióxido para perfil, 2 lt = 2 latas de 1 lt
  (1310, 56, null),   -- caja pvc rectangular
  (1316, 252, null),  -- llave 1 toma tv
  (1319, 37, null),   -- cable 1x2.5 (tres colores)
  (1326, 65, null),   -- tubo led 18w
  (1327, 274, null),  -- plafón led 18w
  (1431, 205, null),  -- tubos macho de 20 x 1/2 fusión
  (1432, 917, null),  -- codo de 20 con rosca 1/2 fusión
  (1437, 725, null),  -- rejilla 12x12 con tapa ciega
  (1499, 56, null),   -- "tapas pvc rectangulares": mismo precio que la caja rectangular
  (1663, 213, null),  -- grifería cocina monocomando FV
  (1779, 1007, 'unid'), -- pastina blenda, 3 kg = 3 x 1 kg
  (1811, 224, null),  -- rejilla ducha 10x10
  (1814, 109, 'bolsa'), -- pegamento weber
  (1866, 358, null),  -- rodillo antigoteo n22
  (1873, 975, null),  -- rodillos epoxi n8
  (2135, 255, null),  -- tapa ciega
  (2631, 935, null),  -- precinto "25mm" = 25 cm
  (2632, 277, null);  -- precinto "15mm" = 15 cm

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'catalogo CC-014 2026-09-04', 'material_id', v.material_id,
                          'desc_canonica', m.nombre, 'unidad_anterior', i.unidad, 'unidad_nueva', coalesce(v.unidad_nueva, i.unidad))
from vinc v
join public.solicitud_compra_item i on i.id = v.item_id
join public.stock_materiales m on m.id = v.material_id
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = v.material_id, descripcion = m.nombre, unidad = coalesce(v.unidad_nueva, i.unidad)
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = m.nombre, unidad = coalesce(v.unidad_nueva, c.unidad), updated_at = now()
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where c.item_id = v.item_id and c.cobro_id is null;

drop table vinc;

-- Conversiones de unidad (el total no cambia) ─────────────────────────────────
create temp table conv (item_id int, material_id int, cant numeric, unidad text, precio numeric, total numeric, nota text);
insert into conv values
  (832,  153, 2, 'unid', 34050.00,  68100.00, 'perfil C de 80: 12 m = 2 tiras de 6 m'),
  (1160, 15,  4, 'm',     1892.88,   7571.51, 'caño fusión de 20: 1 barra = 4 m'),
  (2582, 257, 3, 'm',     1010.13,   3030.40, 'caño rígido 1": 1 tira = 3 m'),
  (1884, 115, 1, 'lata', 139640.00, 139640.00, 'látex exterior: 20 lt = 1 lata de 20 lt'),
  (1881, 112, 2, 'lata',  98388.40, 196776.80, 'látex interior: 40 lt = 2 latas de 20 lt'),
  (1886, 700, 3, 'lata',  40356.00, 121068.00, 'sintético blanco 3 en 1: 12 lt = 3 latas de 4 lt');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, c.cant,
       c.nota || ' — antes ' || coalesce(i.cantidad_comprada, i.cantidad) || ' ' || i.unidad || ' × $' || i.precio_unit || '; ahora ' || c.cant || ' ' || c.unidad || ' × $' || c.precio || ' (mismo total $' || c.total || '). Era: ' || i.descripcion,
       jsonb_build_object('motivo', 'catalogo CC-014 2026-09-04', 'material_id', c.material_id,
                          'cantidad_anterior', coalesce(i.cantidad_comprada, i.cantidad), 'precio_anterior', i.precio_unit,
                          'cantidad_nueva', c.cant, 'precio_nuevo', c.precio)
from conv c join public.solicitud_compra_item i on i.id = c.item_id
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = c.material_id, descripcion = m.nombre,
       cantidad = c.cant, cantidad_comprada = case when i.cantidad_comprada is null then null else c.cant end,
       cantidad_enviada = case when i.cantidad_enviada is null then null else c.cant end,
       unidad = c.unidad, precio_unit = c.precio
  from conv c join public.stock_materiales m on m.id = c.material_id
 where i.id = c.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente mc
   set descripcion = m.nombre, cantidad = c.cant, unidad = c.unidad, precio_unit = c.precio, precio_total = c.total, updated_at = now()
  from conv c join public.stock_materiales m on m.id = c.material_id
 where mc.item_id = c.item_id and mc.cobro_id is null;

drop table conv;
