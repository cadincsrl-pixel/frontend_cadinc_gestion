-- LAMADRID 566: el complemento de Durlock de SILVA (03/09) no estaba cargado
--
-- Factura A 0025-00026008 de SILVA SRL (03/09/2026, cuenta corriente):
--   cantonera Barbieri 0,38 x 2,6     x3  $6.110,37 neto
--   montante Barbieri 34mm x 2,60     x2  $6.826,46
--   solera Barbieri 35mm x 2,60       x6  $17.853,60
--   placa Durlock STD 12,5 1,20x2,40  x1  $16.526,44
--   Neto $47.316,87 + IVA $9.936,55 + percepciones $1.182,92 = $58.436,34.
--
-- Es un COMPLEMENTO de la tanda grande de Durlock del 31/08 que el sistema
-- sí tiene (33 montantes / 13 soleras / 14 placas): estas cantidades chicas
-- no aparecen en ningún renglón de la obra. Entra al pedido de migración
-- como un renglón (criterio Fontanero/VOLTAJE). La factura decía "mercadería
-- pendiente de entrega" al 03/09 — queda como enviado igual que el resto;
-- si siguiera en el galpón de SILVA, avisar y se pasa al flujo de stock en
-- proveedor.

with pedido as (
  select id from solicitud_compra
   where obra_cod = 'CC-016' and obs like '[migración]%'
   order by id desc limit 1
),
item as (
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit, proveedor_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  select p.id,
         'Compra SILVA: complemento Durlock (3 cantoneras, 2 montantes 34, 6 soleras 35, 1 placa 12,5)',
         1, 'unid', 'enviado', 58436.34, 4,
         1, '2026-09-03', '2026-09-03',
         'Factura A 0025-00026008 (03/09), $47.316,87 + IVA + percepciones = $58.436,34. Complemento de la tanda Durlock del 31/08. La factura decia "mercaderia pendiente de entrega" al emitirse.'
  from pedido p
  returning id, solicitud_id
)
insert into materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, pagado_por)
select 'CC-016', i.solicitud_id, i.id,
       'Compra SILVA: complemento Durlock (3 cantoneras, 2 montantes 34, 6 soleras 35, 1 placa 12,5)',
       1, 'unid', 58436.34, 58436.34, 'proveedor', 4, '2026-09-03', 'cadinc'
from item i;
