-- LAMADRID 566 (CC-016): cierre de las decisiones del cruce con la planilla
--
-- El user resolvió lo que quedaba (08/09):
--   · "EMI pagó CADINC"           → la compra del techo se le cobra al cliente
--   · "la bolsa de arena a $2.500" → precio por obra para la arena
--   · "la zinguería pagó CADINC"   → mcc 1749/1750/1751 quedan como están (ya
--                                    se cobran) — sin cambios acá
--   · "tornillos t1 pagó CADINC"   → compra del 14/08 que faltaba cargar
--   · "contenedores: agregar los ítems, son alquiler de contenedores"
--
-- ── 1. La compra EMI del techo: $3.888.948,99 ──
--
-- Chapas, tornillos, planchuelas, perfiles, discos, malla y electrodos,
-- comprados a EMI el 01/07 y pagados por CADINC en 3 cheques (1/8, 1/9, 1/10
-- — fila 8 de la planilla; cada cheque $1.296.316,33). El sistema no tenía
-- esta compra: el material del techo entró por despachos que quedaron como
-- "pagó el cliente" (la planilla los marcaba en amarillo por error).
--
-- Se cobra como UN renglón por el total de la factura, igual que la lleva el
-- user, en un pedido de migración. Los renglones de detalle del techo que
-- estaban VALUADOS como pago-directo se ponen en $0 para que no dupliquen ni
-- confundan (su plata está adentro del renglón EMI); se quedan en
-- pagado_por='cliente' a propósito: así no suman deuda, no entran en la
-- alerta de sin-precio (que excluye pagado_por='cliente') y conservan el
-- detalle de qué material era. NO volver a valuarlos: sería cobrar dos veces.
--
-- Los 7 que estaban valuados (total $1.313.678,45):
--   1745 punta philips $3.270,33 · 1746 mecha remache $1.778,70
--   1747 remaches $2.000 · 1757 chapa C18 $41.375 · 1766 chapa C25 28m
--   $368.452 · 1770 hierro plano 3/4 $8.569,92 · 1773 chapa C25 67,5m
--   $888.232,50
--
-- ── 2. Arena a $2.500 la bolsa ──
--
-- Los despachos estaban a $4.400 (el precio de la bolsa de PIEDRA), uno a
-- $1.500 y el de hoy a $5.000. El user fijó $2.500 para esta obra: se
-- ajustan los 11 renglones (165 bolsas, $694.500 → $412.500, −$282.000).
--
-- ── 3. y 4. Compras que faltaban (planilla filas 95 y 138) ──
--
--   Tornillos T1, 200 u, $64.856 total (14/08). OJO: da $324,28/u contra los
--   ~$32 que vale el T1 en el resto de la cuenta — puede ser un error ×10
--   del capataz; se carga como dice la planilla porque el user lo confirmó,
--   pero queda anotado en el obs del renglón.
--   Alquiler de contenedores (volquetes), 2 × $70.000 = $140.000 (27/08).
--
-- Efecto neto sobre el facturable: +3.888.948,99 − 1.313.678,45 − 282.000
-- + 64.856 + 140.000 = +$2.498.126,54.

-- 1a. Renglones de detalle del techo a $0 (cubiertos por el renglón EMI)
update public.materiales_a_cuenta_cliente
   set precio_unit = 0, precio_total = 0, updated_at = now()
 where id in (1745, 1746, 1747, 1757, 1766, 1770, 1773)
   and obra_cod = 'CC-016' and pagado_por = 'cliente';

update public.solicitud_compra_item
   set obs = coalesce(obs || ' · ', '') ||
             'Material del techo cubierto por la compra EMI del 01/07 (se cobra completa en su propio renglón). No valuar de nuevo: sería doble cobro.'
 where id in (1898, 1899, 1900, 1915, 1909, 1923, 1926);

-- 1b + 3 + 4. Pedido de migración con los tres renglones que faltaban
with pedido as (
  insert into public.solicitud_compra (obra_cod, fecha, estado, prioridad, obs)
  values ('CC-016', '2026-09-08', 'aprobada', 'normal',
          '[migración] Compras de LAMADRID hechas fuera del sistema, tomadas de la planilla del cliente en el cruce del 08/09.')
  returning id
),
items as (
  insert into public.solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit, proveedor_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  select p.id, x.descripcion, x.cantidad, 'unid', 'enviado', x.precio_unit, x.proveedor_id,
         x.cantidad, x.fecha, x.fecha, x.obs
  from pedido p,
       (values
         ('Compra EMI del techo: chapas, tornillos, planchuelas, perfiles, discos, malla, electrodos',
          1::numeric, 3888948.99::numeric, 16, '2026-07-01'::date,
          'Pagada por CADINC en 3 cheques de $1.296.316,33 (1/8, 1/9, 1/10). El detalle del material está en los renglones del techo del 31/07-03/08, dejados en $0 para no duplicar.'),
         ('Tornillos T1 (compra del 14/08 fuera del sistema)',
          200::numeric, 324.28::numeric, null::int, '2026-08-14'::date,
          'De la planilla del cliente ($64.856 total). Da $324,28/u contra ~$32/u del T1 del resto de la cuenta: posible error ×10 del capataz, cargado igual por confirmación del user.'),
         ('Alquiler de contenedores (volquetes)',
          2::numeric, 70000::numeric, null::int, '2026-08-27'::date,
          'De la planilla del cliente. Es un servicio (alquiler), no material de stock.')
       ) as x(descripcion, cantidad, precio_unit, proveedor_id, fecha, obs)
  returning id, solicitud_id, descripcion, cantidad, unidad, precio_unit, proveedor_id, fecha_resolucion
)
insert into public.materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, pagado_por)
select 'CC-016', i.solicitud_id, i.id, i.descripcion, i.cantidad, i.unidad,
       i.precio_unit, round(i.cantidad * i.precio_unit, 2), 'proveedor',
       i.proveedor_id, i.fecha_resolucion, 'cadinc'
from items i;

-- 2. Arena a $2.500 la bolsa (los 11 despachos de la obra)
update public.materiales_a_cuenta_cliente
   set precio_unit = 2500, precio_total = round(cantidad * 2500, 2), updated_at = now()
 where id in (1120, 1196, 1312, 1600, 2147, 2316, 2442, 2601, 2660, 2758, 3280)
   and obra_cod = 'CC-016';
