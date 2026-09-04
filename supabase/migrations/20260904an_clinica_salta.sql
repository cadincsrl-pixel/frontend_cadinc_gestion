-- 20260904an — Clínica Salta (CC CLINICA SALTA): herramientas fuera de la cuenta, precios, vínculos y los "$1"
--
-- OK del user 2026-09-04 ("resolve todo"). Materiales a cargo del cliente.
-- 1) Salen de la cuenta las 17 herramientas (14 detectadas + fusionadora,
--    "herramientas de Bruno", "llave para tornillo") y tres filas del catálogo
--    pasan a herramienta: Cuchara de albañil, Llana dentada 12mm, Prolongación 10m.
-- 2) Cuatro renglones toman precio del catálogo / última compra.
-- 3) ~28 vínculos al catálogo. Tres correcciones con plata, todas con prueba:
--    · rollo de corrugado 3/4 (#599): 1 "unid" a $5.592 = 25 m × $223,68 NETO
--      (presupuesto Voltaje 212162 28/08) → 25 m × $270,65 final.
--    · caño rígido 3/4 (#599): 3 tiras cargadas a $312,18 (el precio de la
--      curva); el presupuesto dice $2.467 neto la tira de 3 m → 9 m × $995,02.
--    · telfix taco 8 (#578): $34,39 es el neto de Silva → $41,62.
--    Y "caño de 20", "caño 25 ff", "caño 20 ff": barras/metros → fila por metro.
-- 4) Los renglones cargados a $1 (pedidos #582, #600, #624 y uno de #273): se
--    vinculan y toman el precio del catálogo si lo hay; si no, quedan en $0
--    para que se vean como "sin precio" en vez de sumar un peso.
-- 5) Duratop es PVC de desagüe, no termofusión: la fila 928 "Codo termofusión
--    63mm" (creada desde "codo de 63 duratop") pasa a "Codo PVC 63mm 87°30'"
--    con el precio de la factura de El Fontanero 0008-2265; a la 927 se le saca
--    el alias duratop. Cierra la pregunta 4 de la mañana.
-- Ninguno cobrado.

-- 1) herramientas ────────────────────────────────────────────────────────────
update public.stock_materiales set clase = 'herramienta'
 where id in (773, 775, 281) and clase <> 'herramienta';   -- Cuchara de albañil, Llana dentada 12mm, Prolongación 10m

update public.solicitud_compra_item set clase = 'herramienta'
 where id in (105, 3113, 1292) and material_id is null and clase <> 'herramienta';

create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.obra_cod = 'CC CLINICA SALTA' and c.cobro_id is null
  and (i.herr_origen is not null or i.clase = 'herramienta' or i.material_id in (773, 775, 281));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta del cliente: ' || h.descripcion,
       jsonb_build_object('motivo', 'limpieza cuenta CC CLINICA SALTA 2026-09-04', 'origen_mcc', h.origen, 'precio_total', h.precio_total, 'detectada_por', 'user')
from herr h;

delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

-- 2) precios del catálogo ───────────────────────────────────────────────────
create temp table precios (item_id int, precio numeric, fuente text);
insert into precios values
  (1044, 2135.14,   'precio de referencia del catálogo (Balde de albañil 12lts)'),
  (3258, 19852.07,  'precio de referencia del catálogo (Diluyente x 4lts)'),
  (3256, 1135.00,   'precio de referencia del catálogo (Estopa x bolsa)'),
  (3035, 265220.50, 'última compra del sistema (Chapa galvanizada lisa C25, rollo)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'CC CLINICA SALTA precios 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id where coalesce(i.precio_unit, 0) = 0;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id and coalesce(i.precio_unit, 0) = 0;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table precios;

-- 5) Duratop = PVC desagüe (antes de vincular) ──────────────────────────────
update public.stock_materiales
   set nombre = 'Codo PVC 63mm 87°30'' (desagüe)', precio_ref = 2239.40, rubro_id = 1,
       alias = array(select distinct unnest(alias || array['codo 63 duratop','codo de 63','codo pvc 63'])),
       obs = coalesce(obs || ' · ', '') || 'Era "Codo termofusión 63mm" pero Duratop es PVC de desagüe. Factura El Fontanero 0008-2265 30/07/2026: $1.850,74 neto.'
 where id = 928;
update public.stock_materiales set alias = array_remove(array_remove(alias, 'canos 63 duratop'), 'caños 63 duratop') where id = 927;

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select 'Llave de paso termofusión 20mm', 'unid', 0, 1, array['llave de 20','llave de paso fusion 20','llave de paso 20'], 'material',
       'Alta 2026-09-04 desde Clínica Salta (pedido #582). Sin precio.'
where not exists (select 1 from public.stock_materiales where nombre = 'Llave de paso termofusión 20mm');

-- 3) vínculos ────────────────────────────────────────────────────────────────
create temp table vinc (item_id int, material_id int);
insert into vinc values
  (2844, 940), (2874, 195), (2877, 17), (2881, 917), (2880, 207), (2879, 205), (2955, 196), (2957, 181),
  (2958, 184), (2950, 54), (2953, 37), (2979, 258), (2984, 85), (2992, 920), (3125, 673), (3127, 1014),
  (3151, 924), (3152, 932), (3155, 860), (103, 33), (104, 179), (1344, 384), (2871, 3), (2872, 928),
  (2980, (select id from public.stock_materiales where nombre = 'Cupla p/ caño rígido 3/4"')),
  (2878, (select id from public.stock_materiales where nombre = 'Llave de paso termofusión 20mm')),
  -- con conversión de unidad (abajo)
  (2952, 59), (2978, 256), (2848, 75), (2876, 15), (101, 16), (102, 15);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'catalogo CC CLINICA SALTA 2026-09-04', 'material_id', v.material_id, 'desc_canonica', m.nombre)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.id = v.material_id
where i.material_id is null;

update public.solicitud_compra_item i set material_id = v.material_id, descripcion = m.nombre
  from vinc v join public.stock_materiales m on m.id = v.material_id where i.id = v.item_id and i.material_id is null;
update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
  from vinc v join public.stock_materiales m on m.id = v.material_id where c.item_id = v.item_id and c.cobro_id is null;
drop table vinc;

-- conversiones y correcciones con plata
create temp table conv (item_id int, cant numeric, unidad text, precio numeric, nota text);
insert into conv values
  (2952, 25, 'm', 270.65, 'rollo de corrugado 3/4: 1 rollo = 25 m; $223,68/m era NETO (presupuesto Voltaje 212162) → $270,65 final'),
  (2978,  9, 'm', 995.02, 'caño rígido 3/4: 3 tiras de 3 m; estaban a $312,18 (precio de la curva) y el presupuesto dice $2.467 neto la tira → $995,02/m final'),
  (2848, 100, 'unid', 41.62, 'telfix taco 8: $34,39 era NETO (Silva) → $41,62 final'),
  (2876,  4, 'm', 0,      'caño de 20: 1 barra = 4 m; precio $1 → sin precio'),
  (101,   1, 'm', 3000,   '1 metro de caño de 25 fusión: 1 unid = 1 m'),
  (102,   2, 'm', 2100,   '2 m de caño 20 fusión: 1 unid = 2 m a $2.100/m (total $4.200 sin cambio)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, c.cant,
       c.nota || ' — antes ' || coalesce(i.cantidad_comprada, i.cantidad) || ' ' || i.unidad || ' × $' || i.precio_unit,
       jsonb_build_object('motivo', 'catalogo CC CLINICA SALTA 2026-09-04', 'cantidad_anterior', coalesce(i.cantidad_comprada, i.cantidad), 'precio_anterior', i.precio_unit, 'cantidad_nueva', c.cant, 'precio_nuevo', c.precio)
from conv c join public.solicitud_compra_item i on i.id = c.item_id;

update public.solicitud_compra_item i
   set cantidad = c.cant, cantidad_comprada = case when i.cantidad_comprada is null then null else c.cant end,
       cantidad_enviada = case when i.cantidad_enviada is null then null else c.cant end,
       unidad = c.unidad, precio_unit = c.precio
  from conv c where i.id = c.item_id;
update public.materiales_a_cuenta_cliente mc
   set cantidad = c.cant, unidad = c.unidad, precio_unit = c.precio, precio_total = round(c.cant * c.precio, 2), updated_at = now()
  from conv c where mc.item_id = c.item_id and mc.cobro_id is null;
drop table conv;

-- 4) los "$1": precio del catálogo si lo hay, si no $0 (visible como sin precio)
create temp table uno as
select i.id as item_id, i.solicitud_id, i.estado, i.descripcion, coalesce(nullif(m.precio_ref, 0), 0) as precio
from public.solicitud_compra_item i
join public.solicitud_compra s on s.id = i.solicitud_id
left join public.stock_materiales m on m.id = i.material_id
where s.obra_cod = 'CC CLINICA SALTA' and i.precio_unit = 1;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select u.item_id, u.solicitud_id, 'correccion', null, u.estado,
       case when u.precio > 0 then 'Estaba cargado a $1 (marcador): toma el precio de referencia $' || u.precio
            else 'Estaba cargado a $1 (marcador): queda en $0 hasta que se tase' end,
       jsonb_build_object('motivo', 'CC CLINICA SALTA precios 2026-09-04', 'precio_anterior', 1, 'precio_nuevo', u.precio)
from uno u;
update public.solicitud_compra_item i set precio_unit = u.precio from uno u where i.id = u.item_id;
update public.materiales_a_cuenta_cliente c set precio_unit = u.precio, precio_total = round(c.cantidad * u.precio, 2), updated_at = now()
  from uno u where c.item_id = u.item_id and c.cobro_id is null;
drop table uno;

-- de paso: el caño rígido por metro queda con precio de referencia (presupuesto Voltaje 212162: $2.467 neto la tira de 3 m)
update public.stock_materiales set precio_ref = 995.02, obs = coalesce(obs || ' · ', '') || 'POR METRO. Voltaje vende la tira de 3 m ($2.467 neto, 28/08/2026).' where id = 256 and precio_ref = 0;
