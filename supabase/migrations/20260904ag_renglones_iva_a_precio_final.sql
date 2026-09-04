-- 20260904ag — Los renglones "IVA" de julio: el IVA pasa adentro de cada material
--
-- En julio (antes del modal neto/final del 30/07) las compras se cargaban al
-- neto y se agregaba un renglón "IVA" por factura como si fuera un material.
-- Cinco renglones así, $552.028. Como la regla es precio FINAL por renglón
-- (y 20260904s ya pasó a final varios renglones de esos mismos pedidos, con lo
-- que su IVA quedó contado dos veces: $124.582), acá se cierra el tema:
--   · cada renglón que seguía al neto pasa a final (× 1,21)
--   · el renglón "IVA" sale de la cuenta del cliente (evento) y queda en $0
-- OK del user 2026-09-04 ("si repara lo del iva").
--
-- Por pedido (neto de los renglones vs renglón IVA):
--   #321 Casa Operarios  Voltaje    987.035 × 21% = 207.277 vs 203.500  → 12 renglones a final, sale IVA 1354
--   #352/#353 Casa Op.   Fontanero   89.113 × 21% =  18.714 vs  18.743  → 4 renglones (detergente, cinta aisladora,
--                                                                          cinta pasacables, trapo) a final, sale IVA 1516
--   #370 Farm 25         Fontanero  268.097 × 21% =  56.300 vs  58.042  → 4 renglones a final, sale IVA 1640
--   #372 Clínica Heras   Silva      924.180 × 21% = 194.078 vs 205.700  → 11 renglones a final, sale IVA 1700
--   #349 CC-017          Silva      275.638 × 21% =  57.884 vs  66.045  → 8 renglones Silva a final (las placas de
--                                                                          cielorraso de otro proveedor y el tarugo
--                                                                          placeholder no), sale IVA 1517
-- Ninguno cobrado (guard en cada update).

create temp table neto (item_id int, precio_viejo numeric);
insert into neto values
  -- #321
  (1314, 4813.45), (1316, 3546.33), (1317, 362.04), (1320, 482.89), (1321, 34360.43), (1323, 16941.33),
  (1324, 13400), (1325, 14175), (1326, 1720.76), (1327, 11031.06), (1328, 23434.04), (1329, 925),
  -- #352 (factura Fontanero, IVA en #353)
  (1509, 8500), (1512, 5500), (1500, 8006.76), (1705, 2500),
  -- #370
  (1629, 5678.17), (1630, 34181.53), (1631, 30865.84), (1632, 4699.25),
  -- #372
  (1641, 3931.63), (1642, 4420.77), (1643, 14088.45), (1644, 1976.15), (1645, 20.68), (1646, 33.8),
  (1647, 14.52), (1648, 25), (1649, 4209.64), (1650, 41064.08), (1651, 1288.43),
  -- #349 (solo Silva)
  (1474, 3931.63), (1475, 4420.77), (1476, 2888.46), (1477, 14088.45), (1478, 3312.84), (1479, 1976.15),
  (1482, 830.38), (1486, 4209.64);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Precio cargado neto (el IVA iba en un renglón aparte del pedido): ' || n.precio_viejo || ' → final ' || round(n.precio_viejo * 1.21, 2),
       jsonb_build_object('motivo', 'renglones IVA a precio final 2026-09-04', 'precio_anterior', n.precio_viejo, 'precio_nuevo', round(n.precio_viejo * 1.21, 2))
from neto n join public.solicitud_compra_item i on i.id = n.item_id
where i.precio_unit = n.precio_viejo;

update public.solicitud_compra_item i
   set precio_unit = round(n.precio_viejo * 1.21, 2)
  from neto n
 where i.id = n.item_id and i.precio_unit = n.precio_viejo;

update public.materiales_a_cuenta_cliente c
   set precio_unit = round(n.precio_viejo * 1.21, 2),
       precio_total = round(c.cantidad * round(n.precio_viejo * 1.21, 2), 2),
       updated_at = now()
  from neto n
 where c.item_id = n.item_id and c.precio_unit = n.precio_viejo and c.cobro_id is null;

drop table neto;

-- los renglones "IVA" salen de la cuenta y quedan en $0
create temp table iva (item_id int);
insert into iva values (1354), (1516), (1640), (1700), (1517);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'sacado_de_cuenta_cliente', null, i.estado, c.cantidad,
       'Renglón "IVA" de la factura: el IVA ya está dentro del precio final de cada material del pedido. Era $' || c.precio_total,
       jsonb_build_object('motivo', 'renglones IVA a precio final 2026-09-04', 'origen_mcc', c.origen, 'precio_total', c.precio_total, 'detectada_por', 'agente')
from iva v join public.solicitud_compra_item i on i.id = v.item_id
join public.materiales_a_cuenta_cliente c on c.item_id = i.id and c.cobro_id is null;

delete from public.materiales_a_cuenta_cliente c using iva v where c.item_id = v.item_id and c.cobro_id is null;

update public.solicitud_compra_item i set precio_unit = 0 from iva v where i.id = v.item_id;

drop table iva;
