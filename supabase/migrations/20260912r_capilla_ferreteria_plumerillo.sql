-- CONCEPCION CAPILLA (CC-017): la factura de Ferretería Plumerillo del 08/09
--
-- El user la pasó y preguntó si estaba: no estaba, ni en esa obra ni en
-- ninguna otra (se buscó por descripción, por obra y por fecha).
--
-- Factura A 0007-00004098 de FERRETERIA PLUMERILLO (Sergio R. Muro,
-- Concepción), 08/09/2026, contado. Los importes de esa factura son NETOS
-- (GRAVADO $96.446,31 + IVA 21% $20.253,73 = $116.700,04), así que cada
-- renglón entra multiplicado por 1,21 — el sistema guarda el precio FINAL:
--
--   Codo FRM 25x3/4 IPS fusión   1 u  ×  $7.442,89 →  $9.005,90
--   Tubo IPS fusión multicapa 25mm 4mts  2 u × $15.777,80 → 8 m a $4.772,79
--   Sellaroscas Hidro3 x 25cc    1 u  ×  $2.872,50 →  $3.475,73
--   Codo IPS 90 fusión 25mm      4 u  ×  $1.131,18 →  $1.368,73 c/u
--   Cable tipo taller 5x1.5     10 u  ×  $5.005,06 →  $6.056,12 c/u
--   Total cargado $116.700,07 (3 centavos sobre la factura, por el redondeo
--   de cada renglón a dos decimales).
--
-- Dos lecturas del texto de la factura, para que quede el rastro:
--  · El cable dice "LUCES CAMIONES", pero el user confirmó que es un detalle
--    interno del proveedor: es cable tipo taller 5x1,5 común y va a la obra.
--  · "FRM" se leyó como Fusión Rosca Macho (ficha 2306). Si resultara rosca
--    hembra, el renglón va a la ficha 1072 y el precio no cambia.
--  · "Multicapa" es la línea de IPS con alma de aluminio: ficha 2420, y los
--    2 tubos de 4 m entran como 8 metros, que es la unidad de la ficha.
--
-- La obra es llave en mano: entra como gasto de CADINC.

-- La familia del sellador de roscas tenía 50cc y 125cc, faltaba el de 25.
insert into public.stock_materiales
  (rubro_id, nombre, unidad, clase, stock_actual, stock_minimo, precio_ref,
   precio_actualizado_en, alias, activo, obs)
select 1, 'Sellador de roscas x 25cc', 'unid', 'material', 0, 0, 3475.73,
       '2026-09-08',
       array['sellador hidro 3 x 25 cc', 'hidro 3 25cc', 'sella roscas 25', 'sellaroscas hidro3 25'],
       true,
       'Alta 09/09/2026 desde la factura Ferretería Plumerillo A 0007-00004098. Completa la familia (ya estaban 50cc y 125cc).'
where not exists (select 1 from public.stock_materiales where nombre = 'Sellador de roscas x 25cc');

with prov as (
  insert into public.proveedores (nombre)
  select 'Ferretería Plumerillo'
  where not exists (select 1 from public.proveedores where norm_txt(nombre) like '%plumerillo%')
  returning id
),
prov_id as (
  select coalesce((select id from prov),
                  (select id from public.proveedores where norm_txt(nombre) like '%plumerillo%' limit 1)) as id
),
pedido as (
  insert into public.solicitud_compra (obra_cod, fecha, estado, prioridad, obs)
  values ('CC-017', '2026-09-08', 'aprobada', 'normal',
          '[migración] Compra en Ferretería Plumerillo registrada desde la factura el 09/09; el material ya está en obra.')
  returning id
),
items as (
  insert into public.solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit, proveedor_id, material_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  select p.id, x.descripcion, x.cantidad, x.unidad, 'enviado', x.precio, (select id from prov_id), x.material_id,
         x.cantidad, '2026-09-08', '2026-09-08', x.obs
  from pedido p,
       (values
         ('Codo termofusión 25mm c/ rosca macho 3/4"', 1::numeric, 'unid', 9005.90::numeric, 2306,
          'Factura Plumerillo A 0007-00004098: "CODO FRM 25X3/4 IPS FUSION". FRM leído como Fusión Rosca Macho.'),
         ('Caño termofusión 25mm PN25 con alma de aluminio', 8::numeric, 'm', 4772.79::numeric, 2420,
          'Factura Plumerillo A 0007-00004098: 2 tubos "IPS FUSION MULTICAPA 25MM 4MTS" = 8 m.'),
         ('Sellador de roscas x 25cc', 1::numeric, 'unid', 3475.73::numeric,
          (select id from public.stock_materiales where nombre = 'Sellador de roscas x 25cc'),
          'Factura Plumerillo A 0007-00004098: "SELLAROSCAS HIDRO3 X 25 CC".'),
         ('Codo termofusión 25mm', 4::numeric, 'unid', 1368.73::numeric, 18,
          'Factura Plumerillo A 0007-00004098: "CODO IPS 90 FUSION 25 MM".'),
         ('Cable tipo taller 5x1.5mm²', 10::numeric, 'm', 6056.12::numeric, 1024,
          'Factura Plumerillo A 0007-00004098: "CABLE TIPO TALLER 5X1.5 LUCES CAMIONES" — el detalle de las luces es del proveedor; es cable común y va a la obra (dicho del user 09/09).')
       ) as x(descripcion, cantidad, unidad, precio, material_id, obs)
  returning id, solicitud_id, descripcion, cantidad, unidad, precio_unit, proveedor_id
)
insert into public.materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, a_cargo_de)
select 'CC-017', i.solicitud_id, i.id, i.descripcion, i.cantidad, i.unidad,
       i.precio_unit, round(i.cantidad * i.precio_unit, 2), 'proveedor',
       i.proveedor_id, '2026-09-08', 'cadinc'
from items i;
