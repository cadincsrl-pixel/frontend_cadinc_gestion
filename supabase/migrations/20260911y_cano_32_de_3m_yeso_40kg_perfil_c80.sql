-- 20260911y — Tres correcciones de ficha pedidas por el user el 08/09 (noche).
--
-- 1) CAÑO PVC 32: Awaduct/Saladillo fabrica el 32 SOLO en 3 m (codigo 1060,
--    "TUBO 32 X 3.00"); la ficha 181 "Caño PVC 32mm x 4m" describia un largo
--    que no existe. Los dos pedidos que la usaron llevaban codos y reducciones
--    PVC de desague al lado, asi que son ese caño. Internet 08/09/2026:
--    Banchero $4.215,67 · Deplano $3.710,31 · ML $3.523 a $4.618 → referencia
--    $4.200. Los dos renglones estaban a $30.000 cada caño, 7 veces el precio
--    del mercado: error de carga.
--      item 1589  28/07  CC-019            2 x $30.000  A COBRAR → se corrige a $4.200 (-$51.600)
--      item 2957  28/08  CC CLINICA SALTA  2 x $30.000  COBRADO (cobro 3) → congelado, solo cambia la descripcion
--    La ficha 181 se desactiva; sus alias pasan a la 2355.
--
-- 2) YESO: la bolsa es de 40 kg, no de 25 (user: "la bolsa trae 40 kg"; Sosa
--    en el recuento: "solo viene en bolsa de 40 kg, 90 kg en total"). Se
--    renombra la ficha 772 y la descripcion de los renglones por bolsa. Los
--    renglones por kilo colgados de esta ficha (390, 415, 546, 1878, 2274,
--    2749) no se tocan: son kilos, no bolsas, y quedaron asi por decision del
--    user en 20260907f.
--
-- 3) PERFIL C80 de Casa Belen (CC-006): es el 80x50 (user). El item 3504
--    "Perfil C80 (fuera del sistema)", 1 x $69.838, esta COBRADO (cobro 5):
--    solo se vincula a la ficha 1233; la plata no se toca.

-- ═══ 1) caño 32 ═══════════════════════════════════════════════════════════
select public.fijar_precio_ref(2355, 4200, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);

update public.stock_materiales
   set alias = array(select distinct x from unnest(alias || array['cano 32 pvc','cano pvc 32mm x 4m','cano de 32 x 4','cano 32 x 4m','cano pvc 32']) x order by x),
       obs   = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: referencia $4.200 de internet (Banchero $4.215,67, Deplano $3.710, ML $3.523-$4.618). Absorbe la ficha 181 "x 4m", que describia un largo que Awaduct no fabrica.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 2355;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
select i.id, i.solicitud_id, 'correccion', i.estado, i.estado,
       'Caño PVC 32mm: Awaduct lo fabrica en 3 m, no en 4. Pasa a la ficha 2355.'
       || case when i.id = 1589 then ' Precio corregido de $30.000 a $4.200 (precio de mercado).' else ' Ya cobrado: la plata no cambia.' end,
       jsonb_build_object('motivo', 'cano 32 es de 3 m 2026-09-08', 'material_anterior', 181, 'material_nuevo', 2355),
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
 where i.id in (1589, 2957) and i.material_id = 181;

update public.solicitud_compra_item
   set material_id = 2355, descripcion = 'Caño PVC 32mm x 3m'
 where id in (1589, 2957) and material_id = 181;

update public.materiales_a_cuenta_cliente
   set descripcion = 'Caño PVC 32mm x 3m', updated_at = now()
 where item_id in (1589, 2957) and descripcion = 'Caño PVC 32mm x 4m';

select set_config('cadinc.mcc_fuente', 'correccion_cano_32_precio_de_mercado', true);

update public.materiales_a_cuenta_cliente c
   set precio_unit  = 4200,
       precio_total = round(c.cantidad * 4200, 2),
       updated_at   = now(),
       updated_by   = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where c.item_id = 1589 and c.precio_unit = 30000
   and c.cobro_id is null and c.certificado_id is null;

update public.solicitud_compra_item
   set precio_unit = 4200
 where id = 1589 and precio_unit = 30000;

update public.stock_materiales
   set activo = false,
       obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: BAJA. Awaduct no fabrica el 32 en 4 m; fusionada en la 2355 (Caño PVC 32mm x 3m). Sus 2 renglones (1589, 2957) pasaron alla.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 181;

-- ═══ 2) yeso 40 kg ════════════════════════════════════════════════════════
update public.stock_materiales
   set nombre = 'Yeso x 40kg',
       alias  = array(select distinct x from unnest(alias || array['yeso x 40kg','yeso 40 kg','bolsa de yeso 40','yeso x 25kg','bolsa de yeso']) x order by x),
       obs    = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: la bolsa es de 40 kg, no de 25 (user; Sosa conto 90 kg en bolsas de 40). Mismo precio $14.400.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 772 and nombre = 'Yeso x 25kg';

update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: la bolsa (ficha 772) es de 40 kg.'),
       updated_at = now()
 where id = 948;

update public.solicitud_compra_item
   set descripcion = 'Yeso x 40kg'
 where material_id = 772 and descripcion = 'Yeso x 25kg' and unidad in ('bolsa', 'unid');

update public.materiales_a_cuenta_cliente c
   set descripcion = 'Yeso x 40kg', updated_at = now()
  from public.solicitud_compra_item i
 where i.id = c.item_id and i.material_id = 772 and c.descripcion = 'Yeso x 25kg'
   and i.unidad in ('bolsa', 'unid') and c.cobro_id is null and c.certificado_id is null;

-- ═══ 3) perfil C80 ════════════════════════════════════════════════════════
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
select i.id, i.solicitud_id, 'correccion', i.estado, i.estado,
       'Perfil C80 = Perfil C 80x50x15 x 6m (user). Vinculado a la ficha 1233; ya cobrado, el importe no cambia.',
       jsonb_build_object('motivo', 'perfil c80 es 80x50 2026-09-08', 'material_anterior', null, 'material_nuevo', 1233),
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
 where i.id = 3504 and i.material_id is null;

update public.solicitud_compra_item
   set material_id = 1233, descripcion = 'Perfil C 80x50x15 x 6m (fuera del sistema)'
 where id = 3504 and material_id is null;
