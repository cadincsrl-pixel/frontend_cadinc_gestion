-- CONCEPCION PL (CC-018): el plástico negro de EMI que faltaba registrar
--
-- El user pasó la factura y preguntó si estaba cargada: no lo estaba, ni en
-- esa obra ni en ninguna otra (se buscó por descripción, por obra y por
-- monto).
--
-- Factura A 0123-00010648 de EMPRESA MAYORISTA INDUSTRIAL (EMI), 20/08/2026,
-- contado, con "PEDIDO NICOLAS" al pie:
--   FILM POLIE.NEG. 4 MTS ANCHO - 200 MICRONES · 150 u × $1.484,80
--   neto $184.067,11 + IVA $38.654,09 + perc. IIBB $2.300,84 = $225.022,05
--
-- Las "150 unidades" de la factura son 150 METROS del rollo de 4 m: coincide
-- con la ficha 950 "Film polietileno 200 micrones (rollo 4m)", que se vende
-- por metro y ya tiene el sinónimo "plastico negro" (así lo llama el user).
-- Precio final por metro: 225.022,05 / 150 = $1.500,147.
--
-- La obra es llave en mano, así que entra como gasto de CADINC.
-- La ficha tiene precio_ref $2.000/m; NO se toca acá: esta compra es de hace
-- tres semanas y bajarla sin mirar el resto sería tasar para atrás.

with pedido as (
  insert into public.solicitud_compra (obra_cod, fecha, estado, prioridad, obs)
  values ('CC-018', '2026-08-20', 'aprobada', 'normal',
          '[migración] Compra a EMI registrada desde la factura el 09/09; el material ya está en obra.')
  returning id
),
item as (
  insert into public.solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit, proveedor_id, material_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  select p.id, 'Film polietileno 200 micrones (rollo 4m)', 150, 'm', 'enviado', 1500.15, 16, 950,
         150, '2026-08-20', '2026-08-20',
         'Factura EMI A 0123-00010648 (20/08): 150 m del rollo de 4 m, $184.067,11 + IVA + percepciones = $225.022,05. "PEDIDO NICOLAS". Pendiente de pago al emitirse.'
  from pedido p
  returning id, solicitud_id
)
insert into public.materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, a_cargo_de)
select 'CC-018', i.solicitud_id, i.id, 'Film polietileno 200 micrones (rollo 4m)',
       150, 'm', 1500.15, 225022.05, 'proveedor', 16, '2026-08-20', 'cadinc'
from item i;
