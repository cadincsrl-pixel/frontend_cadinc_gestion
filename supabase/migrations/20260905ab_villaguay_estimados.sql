-- 20260905ab — Villaguay (cc 24): precios estimados aceptados por el user ("están bien, después ajustamos") + cocina eléctrica $583.884
--
-- Obra llave en mano (costo interno). 25 renglones con material del catálogo
-- toman el estimado de mercado propuesto el 2026-09-05; el aguarrás cargado
-- "5 lt" sobre una fila por lata de 4 l se prorratea ($35.000 / 4 = $8.750/l);
-- la cocina eléctrica (texto libre) toma $583.884 dicho por el user. El
-- catálogo toma los mismos estimados como referencia, marcados como tales en
-- obs, para que los próximos pedidos no salgan en $0. Quedan en $0: el cable
-- UTP cargado "1 unid" (no se sabe cuántos metros) y 21 renglones en texto
-- libre sin precio conocido (pedido 214, cosas de Molina, audio, mamparas…).

create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (117,  6500,   'estimado de mercado (Balde de albañil 20lts)'),
  (736,  62000,  'estimado de mercado (Chapa galvanizada lisa C25 1,22 x 2,40 m, hoja)'),
  (785,  4500,   'estimado de mercado (Espátula 150mm)'),
  (996,  9000,   'estimado de mercado, por pieza (Piso granítico 40x40 Thin Compact)'),
  (997,  6500,   'estimado de mercado, por placa (Placa cielorraso desmontable 60x60)'),
  (1272, 12000,  'estimado de mercado, por barra (Caño estructural 20x10)'),
  (2001, 70000,  'estimado de mercado (Fijador sellador x 20lts; la referencia $78,65 estaba rota)'),
  (2007, 8750,   'prorrateo: lata de 4 l a $35.000 → $8.750 el litro (Aguarrás, cargado 5 lt)'),
  (2011, 6500,   'estimado de mercado (Rodillo lana pelo corto 23cm)'),
  (2012, 30000,  'estimado de mercado, el rollo (Film polietileno 100 micrones)'),
  (2016, 12000,  'estimado de mercado (Palo extensible p/ rodillo)'),
  (2019, 900,    'estimado de mercado (Lija al agua N°180)'),
  (2061, 15000,  'estimado de mercado (Rueda de repuesto p/ cortadora de cerámica)'),
  (2100, 1700,   'estimado de mercado (Tapa 2 módulos blanca 10x5)'),
  (2101, 2500,   'estimado de mercado (Tecla Cambre negra)'),
  (2104, 2000,   'estimado de mercado (Portabastidor p/ cablecanal)'),
  (2367, 45000,  'estimado de mercado (Placa Superboard 10mm)'),
  (2359, 3500,   'estimado de mercado (Tope de puerta)'),
  (2356, 18000,  'estimado de mercado (Térmica 2x40A)'),
  (2374, 12000,  'estimado de mercado (Fotocélula)'),
  (2372, 150000, 'estimado de mercado (Barral antipánico p/ puerta)'),
  (2655, 3500,   'estimado de mercado (Baldosa de vereda 40x40)'),
  (2658, 8000,   'estimado de mercado (Cartel "Salida de emergencia")'),
  (2865, 4000,   'estimado de mercado (Traba p/ ventana de aluminio)'),
  (2708, 25000,  'estimado de mercado (Nitrógeno, carga p/ prueba de cañería)'),
  (2820, 583884, 'precio dicho por el user 05/09/2026 (cocina eléctrica)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ') — OK del user, a ajustar',
       jsonb_build_object('motivo', 'Villaguay precios estimados 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio, 'estimado', p.fuente like 'estimado%')
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) <= 1;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) <= 1;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit <= 1 and c.cobro_id is null;
drop table precios;

-- catálogo: referencias estimadas (marcadas), solo donde no había precio
update public.stock_materiales m set precio_ref = v.p, precio_actualizado_en = now(),
       obs = coalesce(m.obs || ' · ', '') || 'Referencia ESTIMADA (mercado 05/09/2026, OK del user): $' || v.p || '. Ajustar con la primera compra real.'
from (values
  (779, 6500), (1172, 62000), (804, 4500), (1178, 9000), (764, 6500), (1168, 12000), (126, 6500), (455, 30000), (798, 12000),
  (805, 900), (883, 15000), (1176, 1700), (1165, 2500), (1167, 2000), (286, 45000), (853, 3500), (244, 18000), (1166, 12000),
  (1169, 150000), (1180, 3500), (899, 8000), (879, 4000), (1171, 25000)
) as v(id, p)
where m.id = v.id and coalesce(m.precio_ref, 0) <= 1;

update public.stock_materiales set precio_ref = 70000, precio_actualizado_en = now(),
       obs = coalesce(obs || ' · ', '') || 'Tenía $78,65 (referencia rota). Estimado 05/09/2026: $70.000 la lata de 20 l; ajustar con la primera compra real.'
 where id = 120 and precio_ref = 78.65;
