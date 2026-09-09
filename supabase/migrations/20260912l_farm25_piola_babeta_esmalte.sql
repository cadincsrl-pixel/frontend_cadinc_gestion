-- FARMACIA 25 y catálogo: tres de los renglones sin precio, resueltos
--
-- Repasando los 23 sin precio de FARMACIA 25, tres tenían ficha con precio y
-- el user resolvió los tres (09/09):
--
-- 1. "Piola de albañil es herramienta". La ficha 784 pasa a clase herramienta
--    (rubro 26): va y vuelve de la obra, no se le factura a nadie. Sale de la
--    cuenta de las CINCO obras donde estaba, ninguna cobrada:
--      mcc 85   CC-009      $6.000
--      mcc 688  CC-014      $6.000
--      mcc 797  CC NORTE    $6.000
--      mcc 958  CC FARM 25  $0
--      mcc 2545 CC-014      $0
--      mcc 3056 CC-015      $0
--    Efecto: −$18.000 repartidos en tres obras. Mismo patrón que el puntal
--    (20260910p) y la rotuladora (20260905h).
--
-- 2. "Babeta de chapa está ok": toma el precio de su ficha, $4.990.
--    mcc 1009, 3 unidades = $14.970.
--
-- 3. "Los esmaltes sintéticos vienen por latas de 4 litros, eso deben ser 4
--    litros": el renglón decía cantidad 1 unidad "lt", que es media verdad —
--    lo que salió del depósito fue UNA LATA de 4 litros. Queda 1 lata a
--    $160.000 (precio_ref de la ficha 802), con la unidad de la ficha para
--    que no vuelva a leerse como un litro suelto.
--    mcc 2145.

-- ── 1. La piola ──
update public.stock_materiales
   set clase = 'herramienta', rubro_id = 26, precio_ref = 0,
       obs = coalesce(obs || ' · ', '') ||
             'Pasada a herramienta el 09/09/2026 (dicho del user): va y vuelve de la obra, no se factura.'
 where id = 784;

create temp table herr as
select c.id as mcc_id, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where i.material_id = 784 and c.cobro_id is null;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Era una herramienta cargada en la cuenta: ' || h.descripcion,
       jsonb_build_object('motivo', 'piola de albanil pasada a herramienta 2026-09-09', 'origen_mcc', h.origen)
from herr h;

delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

update public.solicitud_compra_item set material_id = material_id where material_id = 784;

-- ── 2. La babeta ──
update public.materiales_a_cuenta_cliente
   set precio_unit = 4990, precio_total = 14970, updated_at = now()
 where id = 1009 and obra_cod = 'CC FARM 25';

-- ── 3. El esmalte: una lata de 4 litros ──
update public.materiales_a_cuenta_cliente
   set cantidad = 1, unidad = 'lata', precio_unit = 160000, precio_total = 160000, updated_at = now()
 where id = 2145 and obra_cod = 'CC FARM 25';

update public.solicitud_compra_item i
   set unidad = 'lata',
       obs = coalesce(i.obs || ' · ', '') ||
             'Es UNA LATA de 4 litros, no un litro suelto (dicho del user 09/09).'
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and c.id = 2145;
