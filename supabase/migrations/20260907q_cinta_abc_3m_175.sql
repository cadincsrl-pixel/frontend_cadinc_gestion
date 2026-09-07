-- 20260907q — La cinta aisladora que compró ABC es 3M 175 negra 20 m (user 2026-09-07)
--
-- El user: "la cinta aisladora fijate la que compré en ABC así le pones la marca".
--
-- LA FACTURA LO DICE TEXTUAL. ABC A 0012-00400157 del 02/09/2026
-- (`datos-entrada/facturas abc.pdf`, hoja 6), línea:
--
--     CINTA AISLADORA 175 NEGRA 20M - 3M
--
-- O sea que es exactamente la ficha 1546 que se creó esta mañana con el
-- catálogo del proveedor (`20260907e`). Esa compra estaba colgada de la fila
-- genérica (61, "Cinta aisladora sin especificar").
--
-- SE MUEVEN DOS RENGLONES Y SUS MOVIMIENTOS DE STOCK:
--
--  · item 2737 — la compra: 30 unidades a $4.996,12 (pedidas 20, compradas 30),
--    factura 41, obra CC DEPOSITO. Con su ENTRADA de stock de 30.
--
--  · item 95 — el despacho del 02/06 a CC PRADERAS, 1 unidad. Con su SALIDA.
--    Va también porque su precio es $5.161,28, idéntico al de la 3M 175 que ABC
--    facturó en mayo (item 52, factura 6): esa unidad salió de esa compra. Es la
--    única salida que tiene la fila genérica.
--
-- Resultado del stock: la 3M 175 queda en 29 (30 − 1), que es lo que hay
-- físicamente en el depósito, y la genérica queda en 0 en vez de 29.
--
-- NO SE TOCA el item 71 (ABC, misma factura de mayo que el 52, 10 unidades a
-- $7.559). Es otro precio, o sea otra cinta, y su factura (0012-00389992) no
-- está en el PDF local: sin el papel no se puede saber el modelo.
--
-- Los importes no cambian: la fila de la cuenta del cliente del item 95
-- ($5.161,28, sin cobrar) solo cambia de descripción.

-- ═══ 1) los renglones ══════════════════════════════════════════════════════
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       case i.id
         when 2737 then 'La factura ABC 0012-00400157 (02/09/2026) dice "CINTA AISLADORA 175 NEGRA 20M - 3M": '
                         'la compra pasa de la fila genérica a la ficha del modelo.'
         else 'Sale de la fila genérica a 3M 175 negra 20 m: su precio ($5.161,28) es el de la 3M 175 que '
              'ABC facturó en mayo, así que esta unidad salió de esa compra.'
       end,
       jsonb_build_object('motivo','cinta ABC es 3M 175 negra 20m 2026-09-07',
                          'material_anterior', 61, 'material_nuevo', 1546,
                          'evidencia','factura ABC A 0012-00400157 del 02/09/2026')
from public.solicitud_compra_item i
where i.id in (2737, 95) and i.material_id = 61;

update public.solicitud_compra_item
   set material_id = 1546, descripcion = 'Cinta aisladora 3M 175 negra 20m'
 where id in (2737, 95) and material_id = 61;

-- Solo la descripción; ningún campo de plata.
update public.materiales_a_cuenta_cliente
   set descripcion = 'Cinta aisladora 3M 175 negra 20m', updated_at = now()
 where item_id = 95;

-- ═══ 2) los movimientos de stock ═══════════════════════════════════════════
update public.stock_movimientos
   set material_id = 1546
 where solicitud_item_id in (2737, 95) and material_id = 61;

-- ═══ 3) los saldos ═════════════════════════════════════════════════════════
-- 1546: entrada 30 − salida 1 = 29, que es lo que hay en el galpón.
update public.stock_materiales
   set stock_actual = 29,
       precio_ref   = 4996.12,
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: recibe la compra de ABC (factura A 0012-00400157 del 02/09/2026, línea "CINTA '
             'AISLADORA 175 NEGRA 20M - 3M"): 30 unidades a $4.996,12, más el despacho de 1 a Praderas. '
             'Las 29 del depósito son estas. El precio de referencia pasa del catálogo del proveedor '
             '($5.091,04) al de esta compra real.',
       updated_at = now()
 where id = 1546;

-- 61: se queda sin stock y sin el precio de una compra que no era suya.
update public.stock_materiales
   set stock_actual = 0,
       precio_ref   = 0,
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: las 29 unidades y la compra de ABC del 02/09 se fueron a "Cinta aisladora 3M 175 '
             'negra 20m" (1546), que es lo que dice esa factura. Queda sin stock y sin precio de '
             'referencia: esta fila es solo para los renglones viejos que no dicen modelo.',
       updated_at = now()
 where id = 61;
