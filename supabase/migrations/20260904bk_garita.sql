-- 20260904bk — Garita (CC-025, llave en mano): la chapa a $2,65 M, 19 vínculos, 3 altas, precios y 3 herramientas fuera
--
-- Pedido del user 2026-09-04 ("arreglemos la obra garita"). 72 renglones, 10
-- pedidos, $6.198.961, 23 sin precio, 20 en texto libre, todo gasto CADINC.
--
-- 1) LA CHAPA (#3355): 10 **m** de "Chapa galvanizada lisa C25" despachados al
--    precio del ROLLO ($265.220,50) → $2.652.205, el 43 % de la obra. El rollo
--    es de 20 m (alias "rollo chapa calibre 25 x 20 mts") → $13.261,03/m →
--    $132.610,30. Se corrige el renglón y se anota en la fila 877.
-- 2) Herramientas fuera de la cuenta: "reglas de 3ml" (#3063 y #3087 → Regla
--    de aluminio 3m, herramienta del catálogo; el ledger del pañol las toma
--    solo) y "cambio de andamio de 6 roseta x 5 roseta" (#3183: es un canje de
--    piezas de andamio, pasa a clase herramienta y su fila del pañol queda
--    ignorada). Las tres estaban en $0.
-- 3) Altas: tablero embutir 16 bocas, panel LED 60x60 40 W y el aplique
--    bidireccional triangular (Mónaco), precios finales de Voltaje. La pintura
--    asfáltica x 4 l ya existía (el LIKE sin tilde no la encontró): el alta de
--    abajo no hace nada y el vínculo usa la fila existente.
-- 4) 19 vínculos conservando el precio, salvo: tablas 1x6 "60 ml" → 20 tablas
--    de 3,05 m a $4.356; alfajías 1x2 "50 ml" → 15 de 3,35 m ($0); pintura
--    asfáltica 4 l → 1 lata de 4 l; "t1" ×150 toma $25 del catálogo. Tres
--    renglones pendientes del pedido #676 (t1, t2, tacos del 6) también se
--    vinculan para que entren a la cuenta ya con catálogo.
-- 5) Nueve renglones en $0 toman el precio de referencia (cascos, chalecos,
--    cinta de peligro, balde, fichas, sellador).
-- 6) El catálogo toma precios de esta obra donde estaba en $0 (disco diamantado
--    180, alambre 18, arena y piedra x 25 kg, clavos 2", puerta placa 80,
--    ficha macho) y se arregla "Bolsa para escombro" ($100.000 → $300).
-- Quedan para el user: "accesorios plafon 60x60", tablero de obra estanco,
-- manguera de agua "1 unid", niveladores (precio por caja), "tornillo del 8".
-- Ninguno cobrado.

-- 1) la chapa ───────────────────────────────────────────────────────────────
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, i.cantidad,
       'Despachada al precio del rollo ($265.220,50) siendo 10 m: el rollo es de 20 m → $13.261,03/m',
       jsonb_build_object('motivo', 'CC-025 Garita 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', 13261.03)
from public.solicitud_compra_item i where i.id = 3355 and i.precio_unit = 265220.5;

update public.solicitud_compra_item set precio_unit = 13261.03 where id = 3355 and precio_unit = 265220.5;
update public.materiales_a_cuenta_cliente
   set precio_unit = 13261.03, precio_total = round(cantidad * 13261.03, 2), updated_at = now()
 where item_id = 3355 and precio_unit = 265220.5 and cobro_id is null;

update public.stock_materiales
   set obs = coalesce(obs || ' · ', '') || 'ROLLO DE 20 M. Si se despacha por metro: $13.261,03/m (2026-09-04).'
 where id = 877 and coalesce(obs, '') not like '%ROLLO DE 20 M%';

-- 3) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, 'material', v.obs
from (values
  ('Pintura asfáltica x 4lts', 'unid', 0, 8,
   array['pintura asfaltica','pintura asfaltica 4 litros','asfaltica','pintura asfáltica'],
   'Alta 2026-09-04 desde Garita (pedido #612). SIN PRECIO: la compra a El Sol quedó a $358,16/l, sospechoso.'),
  ('Tablero embutir 16 bocas', 'unid', 14790.52, 2,
   array['tablero pvc embutir 16 polos','tablero 16 bocas','tablero 16 modulos','tablero embutir 16','tablero de 16'],
   'Alta 2026-09-04 desde Garita: Voltaje 03/09/2026 $14.790,52 final.'),
  ('Panel LED 60x60 40W (embutir)', 'unid', 29643.56, 2,
   array['plafon led 40w 59.5x59.5','plafon led 60x60','panel led 60x60','panel 60x60 40w','plafon 60x60','panel led 40w','plafon 40w'],
   'Alta 2026-09-04 desde Garita: Voltaje 03/09/2026 $29.643,56 final.'),
  ('Aplique bidireccional triangular exterior (Mónaco)', 'unid', 13590.56, 2,
   array['difusor monaco bidireccional triangular','difusor bidireccional','aplique bidireccional','bidireccional triangular','monaco bidireccional','difusor monaco'],
   'Alta 2026-09-04 desde Garita: Voltaje 03/09/2026 $13.590,56 final.')
) as v(nombre, unidad, precio_ref, rubro_id, alias, obs)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 4) vínculos ────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, material_id int, cant numeric, unidad text, precio numeric, nota text);
insert into vinc values
  (3007, 647,  null, null, null,    'protector auditivo → copa (1 unidad para una persona)'),
  (3012, 440,  null, null, null,    'disco d corte n7 → Disco corte 180mm'),
  (3014, 809,  null, null, null,    'clavos 2.1/2 → Clavos 2.5" (kg)'),
  (3018, 903,  null, null, null,    'tachos de 20l → Tacho plástico vacío 20lts'),
  (3029, 933,  20, 'unid', 4356,    '60ml de tablas de 1x6: 60 m ÷ 3,05 m = 20 tablas a $4.356 (referencia del catálogo)'),
  (3030, 556,  15, 'unid', 0,       '50ml de alfajias 1x2: 50 m ÷ 3,35 m = 15 alfajías, sin precio de referencia'),
  (3050, (select id from public.stock_materiales where lower(nombre) = lower('Pintura asfáltica x 4lts')), 1, 'unid', 1432.64,
                                    'pintura asfaltica: 4 l a $358,16 → 1 lata de 4 l a $1.432,64 (mismo total; precio sospechoso)'),
  (3063, 337,  null, null, null,    'reglas de 3ml → Regla de aluminio 3m (herramienta)'),
  (3087, 337,  null, null, null,    'reglas de 3ml → Regla de aluminio 3m (herramienta)'),
  (3064, 107,  null, null, null,    'clavo de 2" → Clavos 2" (kg)'),
  (3191, 910,  null, null, null,    'Porcelanato 58x58 (zeramiko) → fila 910'),
  (3197, 504,  null, null, null,    'puerta placa oblak 0.80x2.05 → Puerta placa interior 80cm'),
  (3271, (select id from public.stock_materiales where lower(nombre) = lower('Tablero embutir 16 bocas')), null, null, null, 'alta'),
  (3272, (select id from public.stock_materiales where lower(nombre) = lower('Panel LED 60x60 40W (embutir)')), null, null, null, 'alta'),
  (3279, 962,  null, null, null,    'bastidor 3 modulos → Bastidor 3 módulos'),
  (3280, 1001, null, null, null,    'tapa 3 modulos → Tapa 3 módulos blanca'),
  (3286, (select id from public.stock_materiales where lower(nombre) = lower('Aplique bidireccional triangular exterior (Mónaco)')), null, null, null, 'alta'),
  (3356, 76,   null, null, 25,      't1 ×150 → Tornillo T1 punta aguja a $25 (catálogo)'),
  -- pendientes del pedido #676 (todavía no están en la cuenta)
  (3364, 76,   null, null, null,    't1 (pendiente)'),
  (3365, 77,   null, null, null,    't2 (pendiente)'),
  (3366, 382,  null, null, null,    'tacos del 6 (pendiente) → Tarugo fisher 6mm c/tornillo');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, coalesce(v.cant, i.cantidad),
       i.descripcion || ' → ' || m.nombre || case when v.nota is not null then ' — ' || v.nota else '' end,
       jsonb_build_object('motivo', 'CC-025 Garita 2026-09-04', 'material_id', v.material_id, 'desc_canonica', m.nombre,
                          'cantidad_anterior', i.cantidad, 'cantidad_nueva', coalesce(v.cant, i.cantidad),
                          'precio_anterior', i.precio_unit, 'precio_nuevo', coalesce(v.precio, i.precio_unit))
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.id = v.material_id
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = v.material_id, descripcion = m.nombre,
       cantidad          = coalesce(v.cant, i.cantidad),
       cantidad_comprada = case when i.cantidad_comprada is null then null else coalesce(v.cant, i.cantidad_comprada) end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else coalesce(v.cant, i.cantidad_enviada)  end,
       unidad            = coalesce(v.unidad, i.unidad),
       precio_unit       = coalesce(v.precio, i.precio_unit)
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where i.id = v.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = m.nombre,
       cantidad    = coalesce(v.cant, c.cantidad),
       unidad      = coalesce(v.unidad, c.unidad),
       precio_unit = coalesce(v.precio, c.precio_unit),
       precio_total = round(coalesce(v.cant, c.cantidad) * coalesce(v.precio, c.precio_unit), 2),
       updated_at  = now()
  from vinc v join public.stock_materiales m on m.id = v.material_id
 where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;

-- 2) herramientas fuera de la cuenta ────────────────────────────────────────
update public.solicitud_compra_item set clase = 'herramienta' where id = 3183 and clase <> 'herramienta';

create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.obra_cod = 'CC-025' and c.cobro_id is null and i.id in (3063, 3087, 3183);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta: ' || h.descripcion,
       jsonb_build_object('motivo', 'CC-025 Garita 2026-09-04', 'origen_mcc', h.origen, 'precio_total', h.precio_total)
from herr h;
delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

-- el canje de andamio no es una salida nueva del pañol
update public.herr_entregas
   set estado = 'ignorada', nota = coalesce(nota || ' | ', '') || 'canje de piezas de andamio (6 rosetas por 5), no es una salida nueva'
 where item_id = 3183 and estado not in ('anulada', 'ignorada');

-- 5) renglones en $0 que toman el precio de referencia ──────────────────────
create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (3004, 2752,    'catálogo (Cinta peligro amarilla/negra 200m)'),
  (3005, 4874.06, 'catálogo (Casco seguridad c/ arnés)'),
  (3318, 4874.06, 'catálogo (Casco seguridad c/ arnés)'),
  (3006, 1985,    'catálogo (Chaleco reflectivo)'),
  (3316, 1985,    'catálogo (Chaleco reflectivo)'),
  (3017, 2135.14, 'catálogo (Balde de albañil 12lts)'),
  (3320, 1386.58, 'catálogo (Ficha hembra 10A)'),
  (3319, 350,     'última compra del sistema 10/07/2026 (Ficha macho 10A)'),
  (3357, 4503.3,  'catálogo (Sellador poliuretano x 300ml)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'CC-025 Garita 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table precios;

-- 6) catálogo: precios desde las compras reales de esta obra ────────────────
update public.stock_materiales set precio_ref = v.p, obs = coalesce(obs || ' · ', '') || v.n
from (values
  (861, 9418,      'Precio de Garita 29/08/2026 (depósito): $9.418.'),
  (317, 4500,      'Precio de Garita 29/08/2026 (depósito): $4.500/kg.'),
  (769, 1500,      'Precio de Garita 01/09/2026 (depósito): $1.500 la bolsa.'),
  (770, 3000,      'Precio de Garita 01/09/2026 (depósito): $3.000 la bolsa.'),
  (107, 6350,      'Precio de Garita 31/08/2026 (depósito): $6.350/kg.'),
  (504, 189819.90, 'Corralón Salta 03/09/2026 (Garita): puerta placa Oblak 0.80x2.05 $189.819,90.'),
  (278, 350,       'Última compra 10/07/2026: $350.')
) as v(id, p, n)
where stock_materiales.id = v.id and coalesce(stock_materiales.precio_ref, 0) = 0;

update public.stock_materiales set precio_ref = 300,
       obs = coalesce(obs || ' · ', '') || 'Estaba en $100.000 (evidentemente el fardo). Garita 31/08/2026: $300 la bolsa.'
 where id = 808 and precio_ref = 100000;

update public.stock_materiales set alias = array(select distinct unnest(alias || array['puerta placa oblak 0.80x2.05','puerta placa 80','puerta placa 0.80','puerta placa oblak 80']))
 where id = 504;

update public.stock_materiales
   set obs = coalesce(obs || ' · ', '') || 'OJO: el precio de referencia $8.465 es POR CAJA ("Niveladores atrim x caja", 16/06/2026). Falta el precio por unidad.'
 where id = 555 and coalesce(obs, '') not like '%POR CAJA%';

-- la fila 355 (Pintura asfáltica x 4lts) ya existía sin alias: se le cargan los del alta
update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['pintura asfaltica','pintura asfaltica 4 litros','asfaltica','pintura asfaltica x 4'])),
       obs = coalesce(obs || ' · ', '') || 'Garita 31/08/2026 (El Sol): quedó a $358,16/l, precio sospechoso; sin precio de referencia.'
 where id = 355;
