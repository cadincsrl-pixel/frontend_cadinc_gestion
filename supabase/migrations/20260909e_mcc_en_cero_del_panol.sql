-- Cuatro renglones del pañol que la cuenta contabiliza como $0
--
-- Aparecieron al preparar la pantalla de gasto interno: cuatro filas de
-- materiales_a_cuenta_cliente quedaron con cantidad = 0 aunque su renglón de
-- pedido sí se despachó y sí tiene precio. Resultado: $244.111,52 que en toda
-- pantalla de plata figuran como cero.
--
--   MCC 288 · Sellador PU Sikaflex 1A Plus x 300ml · 12 × $12.000,00 = $144.000,00
--   MCC 476 · Barbijo descartable                  · 60 ×  $1.255,91 =  $75.354,60
--   MCC 124 · Lustramuebles (Blem)                 ·  3 ×  $4.290,04 =  $12.870,12
--   MCC 477 · Lentes seguridad transparentes       · 10 ×  $1.188,68 =  $11.886,80
--
-- Las cuatro son de CC CADINC (el pañol) y las cuatro tienen cobro_id null, así
-- que ningún cliente quedó sub-facturado: es gasto propio mal contado. Se
-- arregla antes de mostrar la pantalla nueva, o el número del pañol nace corto.
--
-- El WHERE es genérico e idempotente a propósito (no lista los cuatro ids):
-- si el mismo desfasaje aparece en otra fila, esta migración la arregla también,
-- y correrla dos veces no hace nada la segunda.

update public.materiales_a_cuenta_cliente c
   set cantidad     = i.cantidad_enviada,
       precio_unit  = i.precio_unit,
       precio_total = round(i.cantidad_enviada * i.precio_unit, 2),
       updated_at   = now()
  from public.solicitud_compra_item i
 where i.id = c.item_id
   and c.cantidad = 0
   and i.cantidad_enviada > 0
   and i.precio_unit > 0
   and c.cobro_id is null;
