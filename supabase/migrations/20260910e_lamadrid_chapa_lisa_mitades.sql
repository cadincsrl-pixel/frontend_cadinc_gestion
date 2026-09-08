-- LAMADRID 566: de los 3 rollos de chapa lisa C25, 30 m pagó el cliente
--
-- Los 3 rollos de 20 m (03/08, 04/08 y 12/08 hierronort, $265.220,50 c/u)
-- estaban íntegros a cobrar. El user aclaró: "de ahí 30 pagó el cliente y
-- 30 pagó CADINC" — mitad y mitad en metros.
--
-- Representación con la granularidad de renglón:
--   · rollo del 03/08 (mcc 1783 / item 1930) → ENTERO pago directo (20 m).
--   · rollo del 04/08 (mcc 1886 / item 2025) → SE DESDOBLA a la mitad:
--     el renglón original queda 0,5 rollo (10 m) pago directo, y nace un
--     renglón hermano de 0,5 rollo (10 m) a cobrar en el mismo pedido
--     (patrón "desdoblado del renglón #N").
--   · rollo del 12/08 (mcc 2222) → queda entero a cobrar.
--
-- Resultado: cliente 20+10 = 30 m ($397.830,75) · CADINC 10+20 = 30 m
-- ($397.830,75 a cobrar). Efecto sobre la cuenta: −$397.830,75.

-- 1. Rollo del 03/08 entero al cliente
update materiales_a_cuenta_cliente
   set pagado_por = 'cliente', updated_at = now()
 where id = 1783 and obra_cod = 'CC-016';

update solicitud_compra_item
   set pagado_por = 'cliente',
       obs = coalesce(obs || ' · ', '') ||
             'Pagado directo por el cliente (30 de los 60 m de chapa lisa C25; dicho del user 08/09).'
 where id = 1930;

-- 2. Rollo del 04/08: mitad cliente en el renglón original...
update materiales_a_cuenta_cliente
   set cantidad = 0.5, precio_total = 132610.25,
       pagado_por = 'cliente', updated_at = now()
 where id = 1886 and obra_cod = 'CC-016';

update solicitud_compra_item
   set cantidad = 0.5, pagado_por = 'cliente',
       obs = coalesce(obs || ' · ', '') ||
             'Desdoblado el 08/09: medio rollo (10 m) lo pagó el cliente, la otra mitad CADINC (renglón hermano).'
 where id = 2025;

-- ...y mitad CADINC en un renglón hermano del mismo pedido
with item as (
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, material_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  values
    (428, 'Chapa galvanizada lisa C25 (rollo de 20 m, ancho 1,22)', 0.5, 'unid',
     'enviado', 877, 0.5, '2026-08-04', '2026-08-04',
     'Desdoblado del renglón del rollo del 04/08: esta mitad (10 m) la pagó CADINC y se cobra; la otra mitad la pagó el cliente.')
  returning id, solicitud_id
)
insert into materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, fecha_resolucion, pagado_por)
select 'CC-016', i.solicitud_id, i.id,
       'Chapa galvanizada lisa C25 (rollo de 20 m, ancho 1,22)',
       0.5, 'unid', 265220.50, 132610.25, 'deposito', '2026-08-04', 'cadinc'
from item i;
