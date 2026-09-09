-- 20260911t — El pedido 699 (Lamadrid, dictado por Nicolas al asistente a las
-- 16:19 del 08/09) entro con los CINCO renglones sin ficha: es el mismo bug
-- que el 697, y este pedido es de ANTES del arreglo (commit 0a0e06f, 17:13).
--
-- Consecuencias, verificadas: Sosa despacho cuatro renglones a las 17:05 y,
-- sin ficha, (a) el modal no tenia precio de catalogo para precargar -> $0 en
-- la cuenta del cliente, y (b) NO se descontó stock: sin material_id no hay
-- stock_movimientos. Y la compra de pintura asfaltica ($72.538,75) no toco
-- el catalogo (ficha en $52.115).
--
-- Se vinculan los cinco a su ficha (nombres exactos), se registran las cuatro
-- salidas de deposito que faltaban (con fecha y usuario de Sosa) descontando
-- stock, y se tasan esos cuatro renglones al precio del catalogo, que es lo
-- que el despacho habria precargado. La compra queda con su precio real.
-- OJO: el thinner por litro queda en -2: el tambor nunca se cargo en litros.

select set_config('cadinc.mcc_fuente', 'pedido_699_sin_fichas', true);

-- 1) ficha
with mapa(item_id, mat, nombre) as (values
  (3515, 808,  'Bolsa para escombro'),
  (3516, 87,   'Cemento Portland x 25kg'),
  (3517, 769,  'Arena x 25kg'),
  (3518, 354,  'Pintura asfáltica x 18lts'),
  (3519, 2634, 'Thinner (diluyente) x litro')
)
update public.solicitud_compra_item i
   set material_id = mp.mat, descripcion = mp.nombre
  from mapa mp where i.id = mp.item_id and i.material_id is null;

update public.materiales_a_cuenta_cliente c
   set descripcion = i.descripcion, updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i
 where i.id = c.item_id and i.id in (3515, 3516, 3517, 3518, 3519);

-- 2) las salidas de deposito que faltaban
insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, obra_cod, solicitud_item_id, obs, fecha, created_by, estado)
select i.material_id, 'salida', i.cantidad, 'despacho_obra', 'CC-016', i.id,
       'Despacho del 08/09 17:05 (pedido 699, Sosa). El renglon no tenia ficha y no descontó stock; registrado por 20260911t.',
       date '2026-09-08', '2c2895fc-479b-46eb-be89-956f8dccc42d'::uuid, 'aprobado'
  from public.solicitud_compra_item i
 where i.id in (3515, 3516, 3517, 3519) and i.estado = 'de_deposito'
   and not exists (select 1 from public.stock_movimientos mv where mv.solicitud_item_id = i.id);

update public.stock_materiales m
   set stock_actual = m.stock_actual - x.cant, updated_at = now(), updated_by = '2c2895fc-479b-46eb-be89-956f8dccc42d'::uuid
  from (select material_id, sum(cantidad) as cant from public.solicitud_compra_item where id in (3515, 3516, 3517, 3519) group by material_id) x
 where m.id = x.material_id;

-- 3) precio del catalogo en los cuatro despachos (el que el modal habria precargado)
update public.materiales_a_cuenta_cliente c
   set precio_unit = m.precio_ref, precio_total = round(c.cantidad * m.precio_ref, 2),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
  from public.solicitud_compra_item i join public.stock_materiales m on m.id = i.material_id
 where i.id = c.item_id and i.id in (3515, 3516, 3517, 3519)
   and coalesce(c.precio_unit, 0) = 0 and c.cobro_id is null and c.certificado_id is null
   and m.precio_ref > 0 and public.unidad_compatible(c.unidad, m.unidad);

update public.solicitud_compra_item i
   set precio_unit = c.precio_unit
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and i.id in (3515, 3516, 3517, 3519) and coalesce(i.precio_unit, 0) = 0 and c.precio_unit > 0;
