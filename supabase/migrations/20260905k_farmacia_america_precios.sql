-- 20260905k — Farmacia America (CC-023): precios para los renglones en $0
--
-- Pedido del user 2026-09-05: "con los precios de Silva, completá los precios
-- del pedido de Farmacia America". Del pedido #650: cinta malla (Silva 05/09
-- $5.127,18) y T2 punta mecha c/ alas (Silva 26/08 $42,52); la lana de vidrio
-- no tiene precio en ningún lado y queda en $0. Ya que la obra es del cliente y
-- el user pidió completar, el resto de los renglones en $0 de la obra toma la
-- última compra real del sistema (o la referencia del catálogo si no hay compra).
-- Quedan en $0: lo que no tiene precio en ningún lado (lana de vidrio, curva 50
-- 45°, te 25x20, codo c/ acometida 110x63, puntal 2,5 m) y el caño termofusión
-- 25 cargado como "2 unid" sobre una fila por metro (no se sabe cuántos metros).
-- Los precios "$1" del catálogo (curva 40 45°, codo c/ acometida) se corrigen.

create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (3215, 5127.18,  'Silva 05/09/2026 (Cinta malla Durlock, rollo 48 mm x 90 m)'),
  (3214, 42.52,    'Silva 26/08/2026 (Tornillo T2 punta mecha c/ alas)'),
  (2694, 2135.14,  'última compra 04/09/2026 (Balde de albañil 12lts)'),
  (2790, 771.76,   'última compra 04/09/2026 (Guante de tela)'),
  (2791, 927,      'última compra 15/07/2026 (Protector auditivo copa)'),
  (2792, 4874.06,  'última compra 04/09/2026 (Casco seguridad c/ arnés)'),
  (2896, 32000,    'última compra 02/09/2026 (Caño PVC 110mm x 4m)'),
  (2898, 5587.96,  'última compra 02/09/2026 (Ramal PVC 110mm Y)'),
  (2899, 6240.5,   'última compra 14/07/2026 (Ramal PVC 110 a 63mm Y)'),
  (2901, 2740,     'última compra 11/08/2026 (Curva PVC 110mm 45°)'),
  (2903, 1445.44,  'última compra 20/07/2026 (Codo PVC 40mm)'),
  (2904, 1141.38,  'última compra 14/07/2026 (Curva PVC 40mm 45°)'),
  (2905, 3296,     'última compra 27/08/2026 (Reducción PVC 63 a 50mm)'),
  (2908, 668.51,   'última compra 29/07/2026 (Codo termofusión 25mm)'),
  (2910, 16943.61, 'última compra 29/07/2026 (Llave de paso termofusión 25mm)'),
  (2911, 5093.28,  'catálogo (Rosca macho termofusión 3/4")'),
  (2913, 3850,     'última compra 27/08/2026 (Codo termofusión 20mm c/ rosca hembra 1/2")'),
  (3339, 1500,     'última compra 01/09/2026 (Ripio bruto fino x bolsa)'),
  (3341, 1500,     'última compra 01/09/2026 (Arena x 25kg)'),
  (3345, 5,        'catálogo (Cuña p/ nivelador de porcelanato)'),
  (3348, 3850,     'última compra 03/09/2026 (Disco diamantado continuo 115mm)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'CC-023 Farmacia America precios 2026-09-05', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table precios;

-- catálogo: referencias rotas en $1 y precios reales más nuevos
update public.stock_materiales set precio_ref = 1141.38, obs = coalesce(obs || ' · ', '') || 'Estaba en $1. Última compra 14/07/2026 $1.141,38.' where id = 727 and precio_ref = 1;
update public.stock_materiales set precio_ref = 0, obs = coalesce(obs || ' · ', '') || 'Estaba en $1 (marcador). Sin precio.' where id = 738 and precio_ref = 1;
update public.stock_materiales set precio_ref = 927, obs = coalesce(obs || ' · ', '') || 'Última compra 15/07/2026 $927.' where id = 647 and coalesce(precio_ref, 0) = 0;
update public.stock_materiales set precio_ref = 42.52, obs = coalesce(obs || ' · ', '') || 'Silva 26/08/2026 $42,52.' where id = 940 and precio_ref = 51.46;
