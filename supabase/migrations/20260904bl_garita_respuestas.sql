-- 20260904bl — Garita: respuestas del user (2026-09-04)
--
-- 1) "accesorios plafon 60x60" ×8 = marco de aplicar → alta "Marco de aplicar
--    p/ panel LED 60x60" ($13.634,86 final, Voltaje 03/09) y vínculo del #3273.
-- 2) Son HERRAMIENTAS (equipo reutilizable, no consumo de la obra): el tablero
--    de obra estanco c/ disyuntor (743), la manguera de agua 1/2" (782), el
--    tacho plástico de 200 l (841) y el tacho plástico vacío de 20 l (903;
--    "no sé cómo tomarlos": son latas de pintura recicladas, sin costo, y
--    van y vuelven como un balde → herramienta). Pasan a clase herramienta y
--    rubro "Herramientas y máquinas"; salen de la cuenta de TODAS las obras
--    (21 renglones en 13 obras, $27.500 en total, todo manguera; ninguno
--    cobrado) y sus salidas entran al ledger del pañol como "sin revisar"
--    (se toca material_id para que disparen los triggers).
-- 3) Niveladores: la caja trae 250 → $8.465 / 250 = $33,86 la unidad. La fila
--    555 pasa a $33,86; el #3195 (150 u.) toma el precio; los dos renglones
--    "1 unid" a $8.465 (#167 Praderas, #1222 CC-005) pasan a 250 u. × $33,86
--    (mismo total). Los "1 unid"/"3 unid" en $0 (#871, #1597, #1955) quedan
--    para mirar: seguro son cajas.
-- 4) "tornillo del 8" = tornillos sueltos → Tornillo madera 4x40mm (N°8 = 4 mm)
--    con alias; el #3367 del pedido #676 (pendiente) se vincula.
-- 5) La pintura asfáltica a $358,16/l queda como está: el user coincide en que
--    es muy barata pero no hay precio real a mano.

-- 1) marco de aplicar ────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select 'Marco de aplicar p/ panel LED 60x60', 'unid', 13634.86, 2,
       array['accesorios plafon 60x60','marco de aplicar 60x60','marco aplicar panel 60x60','marco de superficie 60x60','kit de aplicar plafon 60x60','marco para plafon 60x60','marco exterior panel 60x60'],
       'material', 'Alta 2026-09-04 desde Garita (Voltaje 03/09/2026, "accesorios plafon 60x60"): $13.634,86 final. Según el user es el marco de aplicar.'
where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Marco de aplicar p/ panel LED 60x60'));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → ' || m.nombre,
       jsonb_build_object('motivo', 'CC-025 Garita respuestas 2026-09-04', 'material_id', m.id, 'desc_canonica', m.nombre)
from public.solicitud_compra_item i, public.stock_materiales m
where i.id = 3273 and i.material_id is null and lower(m.nombre) = lower('Marco de aplicar p/ panel LED 60x60');

update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre
  from public.stock_materiales m where i.id = 3273 and i.material_id is null and lower(m.nombre) = lower('Marco de aplicar p/ panel LED 60x60');
update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
  from public.solicitud_compra_item i join public.stock_materiales m on m.id = i.material_id
 where c.item_id = i.id and i.id = 3273 and c.cobro_id is null;

-- 2) herramientas ────────────────────────────────────────────────────────────
update public.stock_materiales
   set clase = 'herramienta',
       rubro_id = (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'),
       obs = coalesce(obs || ' · ', '') || 'Herramienta (equipo reutilizable) según el user, 2026-09-04.'
 where id in (743, 782, 841, 903) and clase <> 'herramienta';

create temp table herr as
select c.id as mcc_id, c.obra_cod, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where i.material_id in (743, 782, 841, 903) and c.cobro_id is null;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta de ' || h.obra_cod || ': ' || h.descripcion,
       jsonb_build_object('motivo', 'herramientas segun el user (Garita) 2026-09-04', 'origen_mcc', h.origen, 'precio_total', h.precio_total, 'obra_cod', h.obra_cod)
from herr h;
delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

-- tocar material_id dispara el cache de herr_origen (BEFORE) y el ledger del pañol (AFTER)
update public.solicitud_compra_item set material_id = material_id
 where material_id in (743, 782, 841, 903) and herr_origen is distinct from 'catalogo';

-- 3) niveladores ─────────────────────────────────────────────────────────────
update public.stock_materiales
   set precio_ref = 33.86,
       alias = array(select distinct unnest(alias || array['niveladores atrim','niveladores x caja','niveladores para porcelanato','niveladores de piso','niveladores'])),
       obs = coalesce(obs || ' · ', '') || 'La caja trae 250 (user, 2026-09-04): $8.465 / 250 = $33,86 la unidad.'
 where id = 555 and precio_ref = 8465;

create temp table niv (item_id int, cant numeric, precio numeric, nota text);
insert into niv values
  (3195, 150, 33.86, '150 niveladores a $33,86 (caja de 250 a $8.465)'),
  (167,  250, 33.86, '"Niveladores atrim x caja" 1 unid a $8.465 = 250 niveladores a $33,86 (mismo total)'),
  (1222, 250, 33.86, '1 caja a $8.465 = 250 niveladores a $33,86 (mismo total)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, n.cant,
       n.nota || ' — antes ' || i.cantidad || ' ' || i.unidad || ' × $' || coalesce(i.precio_unit, 0),
       jsonb_build_object('motivo', 'niveladores por caja 2026-09-04', 'cantidad_anterior', i.cantidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', n.cant, 'precio_nuevo', n.precio)
from niv n join public.solicitud_compra_item i on i.id = n.item_id;

update public.solicitud_compra_item i
   set cantidad = n.cant, precio_unit = n.precio, descripcion = 'Niveladores piso (cuña + base)',
       cantidad_comprada = case when i.cantidad_comprada is null then null else n.cant end,
       cantidad_enviada  = case when i.cantidad_enviada  is null then null else n.cant end
  from niv n where i.id = n.item_id;
update public.materiales_a_cuenta_cliente c
   set cantidad = n.cant, precio_unit = n.precio, precio_total = round(n.cant * n.precio, 2), descripcion = 'Niveladores piso (cuña + base)', updated_at = now()
  from niv n where c.item_id = n.item_id and c.cobro_id is null;
drop table niv;

-- 4) tornillo del 8 ──────────────────────────────────────────────────────────
update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['tornillo del 8','tornillos del 8','tornillo n8','tornillo n 8','tornillo 8','tornillos n8','tornillo para taco del 6'])),
       obs = coalesce(obs || ' · ', '') || 'N°8 = 4 mm de diámetro (va con el tarugo de 6); el largo más común es 1 1/2" ≈ 40 mm.'
 where id = 133;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad, i.descripcion || ' → Tornillo madera 4x40mm (tornillos sueltos, según el user)',
       jsonb_build_object('motivo', 'CC-025 Garita respuestas 2026-09-04', 'material_id', 133, 'desc_canonica', 'Tornillo madera 4x40mm')
from public.solicitud_compra_item i where i.id = 3367 and i.material_id is null;
update public.solicitud_compra_item set material_id = 133, descripcion = 'Tornillo madera 4x40mm' where id = 3367 and material_id is null;
