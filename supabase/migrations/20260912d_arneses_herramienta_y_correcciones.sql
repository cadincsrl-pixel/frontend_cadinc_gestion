-- 20260912d — Tres correcciones del user (09/09/2026) y un ajuste de stock que se deshace.
--
-- 1) ARNESES SON HERRAMIENTAS. La ficha 656 "Arnés seguridad 3 puntos" estaba como EPP y anoche
--    (20260912a) se tasó a $92.000: 13 renglones, 30 unidades, $2,76M en la cuenta de ocho obras.
--    El user: "los arneses son herramientas" → van y vuelven de la obra y no se cobran (§5.12).
--    Se borran sus 13 filas de MCC (ninguna cobrada ni certificada) con evento
--    'sacado_de_cuenta_cliente', la ficha pasa a clase 'herramienta', los renglones vuelven a $0
--    y se tocan (material_id = material_id) para que el pañol los tome (trg_herr_entregas_sync).
--    El precio $92.000 queda como referencia de compra: 10 de las 123 herramientas tienen precio.
-- 2) CLÍNICA SALTA: 2 caños PVC 32 a $30.000 (7 veces el mercado; 20260911y ya corrigió el de
--    CC-019) estaban COBRADOS en el cobro 3. El user: "arreglá". Se corrige a $4.200 con
--    cadinc.descongelar y se baja monto_cobrado a $8.400: quedan $51.600 del cobro 3 sin imputar.
-- 3) CC-005: 2 kg de yeso cobrados al precio de la bolsa ($14.400). Pasa a "Yeso x kg (suelto)"
--    (ficha 948) a $1.668 el kilo.
-- 4) PORCELANATO 58x58: las 10 cajas del recuento eran de Lamadrid, pagadas por el cliente, y se
--    las llevaron todas (user: "desestimá los porcelanatos"). Se deshace el ajuste de 20260911z.
-- Probado con rollback antes de aplicar.

-- ═══ 1) arneses ═══
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
select i.id, i.solicitud_id, 'sacado_de_cuenta_cliente', i.estado, i.estado,
       'Los arneses son herramientas: van y vuelven de la obra, no se cobran (user 09/09). Sale de la cuenta del cliente y entra al pañol.',
       jsonb_build_object('motivo', 'arneses son herramientas 2026-09-09', 'mcc_id', c.id, 'precio_unit', c.precio_unit, 'precio_total', c.precio_total),
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.materiales_a_cuenta_cliente c join public.solicitud_compra_item i on i.id = c.item_id
 where i.material_id = 656 and c.cobro_id is null and c.certificado_id is null;

delete from public.materiales_a_cuenta_cliente c
 using public.solicitud_compra_item i
 where i.id = c.item_id and i.material_id = 656 and c.cobro_id is null and c.certificado_id is null;

update public.stock_materiales
   set clase = 'herramienta', updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
       obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: es HERRAMIENTA (user): va y vuelve de la obra y no se cobra al cliente. Sus 13 renglones salieron de la cuenta y entraron al pañol. El precio $92.000 queda como referencia de compra.')
 where id = 656 and clase = 'epp';

update public.solicitud_compra_item set precio_unit = 0 where material_id = 656 and precio_unit = 92000;
update public.solicitud_compra_item set material_id = material_id where material_id = 656;

-- ═══ 2) Clínica Salta: caños PVC 32 cobrados a $30.000 ═══
select set_config('cadinc.descongelar', 'on', true);
select set_config('cadinc.mcc_fuente', 'correccion_cano_32_cobrado', true);
update public.materiales_a_cuenta_cliente
   set precio_unit = 4200, precio_total = 8400, monto_cobrado = 8400, updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 2784 and precio_unit = 30000 and cobro_id = 3;
select set_config('cadinc.descongelar', 'off', true);
update public.solicitud_compra_item set precio_unit = 4200 where id = 2957 and precio_unit = 30000;
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
select i.id, i.solicitud_id, 'correccion', i.estado, i.estado,
       'Caño PVC 32 a $30.000 (7 veces el mercado) corregido a $4.200 aunque ya estaba cobrado en el cobro 3: quedan $51.600 de ese cobro sin imputar (user 09/09).',
       jsonb_build_object('motivo', 'cano 32 cobrado de mas 2026-09-09', 'mcc_id', 2784, 'cobro_id', 3, 'precio_anterior', 30000, 'precio_nuevo', 4200),
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i where i.id = 2957;

-- ═══ 3) CC-005: 2 kg de yeso al precio de la bolsa ═══
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
select i.id, i.solicitud_id, 'correccion', i.estado, i.estado,
       'Eran 2 kg de yeso, no 2 bolsas: pasa a "Yeso x kg (suelto)" a $1.668 el kilo (user 09/09).',
       jsonb_build_object('motivo', 'yeso por kilo 2026-09-09', 'material_anterior', 772, 'material_nuevo', 948, 'precio_anterior', 14400, 'precio_nuevo', 1668),
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i where i.id = 2749 and i.material_id = 772;
update public.solicitud_compra_item set material_id = 948, descripcion = 'Yeso x kg (suelto)', precio_unit = 1668
 where id = 2749 and material_id = 772 and precio_unit = 14400;
select set_config('cadinc.mcc_fuente', 'correccion_yeso_kilo', true);
update public.materiales_a_cuenta_cliente
   set descripcion = 'Yeso x kg (suelto)', precio_unit = 1668, precio_total = round(cantidad * 1668, 2), updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 2580 and precio_unit = 14400 and cobro_id is null and certificado_id is null;

-- ═══ 4) porcelanato: no era stock de CADINC ═══
insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, created_by, obs)
select 910, 'ajuste', -m.stock_actual, 'ajuste_inventario', 'otro', 'aprobado', date '2026-09-09', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
       'Las 10 cajas del recuento eran de Lamadrid (pagadas por el cliente) y se las llevaron todas (user 09/09). Se deshace el ajuste del 08/09: no era stock de CADINC.'
  from public.stock_materiales m where m.id = 910 and m.stock_actual = 13.5;
update public.stock_materiales
   set stock_actual = 0, updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
       obs = trim(both ' ' from coalesce(obs, '') || ' · 09/09/2026: las 10 cajas eran de Lamadrid, pagadas por el cliente, y se las llevaron todas (user). Vuelve a 0.')
 where id = 910 and stock_actual = 13.5;
