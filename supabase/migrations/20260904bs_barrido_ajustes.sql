-- 20260904bs — Barrido: dos cosas que quedaron colgadas
--
-- 1) La ruleta de 5 m (813) pasó a herramienta en 20260904bq, pero sus 7
--    renglones ya vinculados seguían en las cuentas (uno en Praderas a $42.000,
--    3 ruletas). Salen y entran al pañol (se toca material_id para el trigger).
-- 2) El velo de fibra (906) no pudo pasar a "rollo" en 20260904br por el guard:
--    el renglón #3243 (Laprida, CC-015) tenía 25 "m" a $30.981 = $774.525, que
--    es el precio de un rollo aplicado por metro. 25 m = medio rollo de 50 m →
--    0,5 rollo a $30.981 = $15.490,50 (−$759.034 en Laprida). Con eso la fila
--    pasa a rollo, referencia $33.520.

-- 1) ruletas ─────────────────────────────────────────────────────────────────
create temp table fuera as
select c.id as mcc_id, c.obra_cod, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total
from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id
where c.cobro_id is null and i.material_id = 813;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select f.item_id, f.solicitud_id, 'sacado_de_cuenta_cliente', null, f.estado, f.cantidad,
       'Era una herramienta cargada en la cuenta de ' || f.obra_cod || ': ' || f.descripcion,
       jsonb_build_object('motivo', 'barrido herramientas 2026-09-04', 'tipo', 'herramienta', 'origen_mcc', f.origen, 'precio_total', f.precio_total, 'obra_cod', f.obra_cod)
from fuera f;
delete from public.materiales_a_cuenta_cliente c using fuera f where c.id = f.mcc_id;
drop table fuera;

update public.solicitud_compra_item set material_id = material_id
 where material_id = 813 and herr_origen is distinct from 'catalogo';

-- 2) velo de fibra ───────────────────────────────────────────────────────────
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 0.5,
       '25 "m" a $30.981 era el precio del rollo aplicado por metro: 25 m = medio rollo de 50 m → 0,5 rollo a $30.981 — antes 25 m × $30.981 = $774.525',
       jsonb_build_object('motivo', 'barrido catalogo 2026-09-04', 'cantidad_anterior', i.cantidad, 'precio_anterior', i.precio_unit, 'cantidad_nueva', 0.5, 'precio_nuevo', 30981)
from public.solicitud_compra_item i where i.id = 3243 and i.unidad = 'm' and i.cantidad = 25;

update public.solicitud_compra_item
   set cantidad = 0.5, unidad = 'rollo',
       cantidad_comprada = case when cantidad_comprada is null then null else 0.5 end,
       cantidad_enviada  = case when cantidad_enviada  is null then null else 0.5 end
 where id = 3243 and unidad = 'm' and cantidad = 25;
update public.materiales_a_cuenta_cliente
   set cantidad = 0.5, unidad = 'rollo', precio_total = round(0.5 * precio_unit, 2), updated_at = now()
 where item_id = 3243 and unidad = 'm' and cobro_id is null;

update public.stock_materiales
   set unidad = 'rollo', precio_ref = 33520,
       alias = array(select distinct unnest(alias || array['velo de fibra','rollo de velo','velo 50x1','velo de 1x50','rollos de velo'])),
       obs = coalesce(obs || ' · ', '') || 'ROLLO de 50 m x 1 m. Decía "m" a $30.981, que era el precio del rollo. $33.520 (CC-015, 2026).'
 where id = 906 and unidad = 'm';
