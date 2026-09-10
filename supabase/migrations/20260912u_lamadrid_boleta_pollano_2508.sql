-- LAMADRID (CC-016) — boleta POLLANO SANITARIOS del 25/08/26, $101.740.
--
-- La boleta SÍ estaba cargada: es el pedido 694, que subió Nicolás Valdez el
-- 08/09. El problema es cómo quedó cargada:
--
--   a) Los precios NO son los de la boleta: son los precios de referencia del
--      catálogo, que la pantalla auto-completa al resolver. Se ve porque cada
--      precio_unit coincide al centavo con el precio_ref de su ficha
--      (2740,60 / 668,51 / 3603,19 / 5093,28 / 3562,72 / 1813,19 / 935,83 /
--      3750 / 1179,97). Nadie tipeó lo que cobró POLLANO.
--   b) Cuatro renglones quedaron en $1 y los valué YO por Mercado Libre en
--      la migración 20260912k, porque entonces no había factura. Ahora la
--      boleta da los precios reales y uno de mis números estaba 3,7x arriba:
--        Ramal Y 32      estimado $3.500  → real $945
--        Caño 32 x 3m    estimado $4.200  → real $6.350
--        Curva 32 x 45°  estimado $1.000  → real $940   (buena)
--        Manguito 32     estimado $1.200  → real $1.340 (buena)
--   c) Faltan tres renglones de la boleta que nunca se cargaron.
--
-- Total POLLANO en el sistema: $52.155,57. En la boleta: $101.740.
-- Ninguno de los renglones está cobrado ni certificado (todos "a cobrar"),
-- así que se corrigen sin tocar el candado fn_mcc_congelada.
--
-- La fecha de resolución también se corrige: la compra fue el 25/08, no el
-- 08/09 que es cuando Nicolás la cargó. Importa porque la imputación de
-- cobros va de lo más viejo a lo más nuevo.
--
-- QUEDA AFUERA, a confirmar con el user:
--   · El renglón 2 de la boleta ($3.260, "...tekpper 3/4") no se entiende y
--     no se carga. Es lo único que separa este pedido de los $101.740.
--   · "Tuerca M 25 x 3/4": en la boleta la cantidad parece 2 (= $1.845 c/u) y
--     en el sistema es 1. Se deja en 1 con el importe de la boleta ($3.690),
--     que da el mismo total para el cliente; si eran 2, se parte en dos.
--     Ojo también con el mapeo: "tuerca" puede ser unión doble con tuerca y
--     no la rosca macho/hembra que se eligió.

begin;

-- ── 1) Precios reales de la boleta (importe de la línea / cantidad) ──────
update solicitud_compra_item set precio_unit = 2275,  fecha_resolucion = '2026-08-25' where id = 3489; -- caño termof. 25, 4 m, $9.100
update solicitud_compra_item set precio_unit =  630,  fecha_resolucion = '2026-08-25' where id = 3490; -- codos 25 x10, $6.300
update solicitud_compra_item set precio_unit = 3790,  fecha_resolucion = '2026-08-25' where id = 3491; -- codos 25x1/2 x4, $15.160
update solicitud_compra_item set precio_unit = 3690,  fecha_resolucion = '2026-08-25' where id = 3492; -- tuerca M 25x3/4, $3.690
update solicitud_compra_item set precio_unit = 4170,  fecha_resolucion = '2026-08-25' where id = 3493; -- tuerca H 25x3/4, $4.170
update solicitud_compra_item set precio_unit = 3750,  fecha_resolucion = '2026-08-25' where id = 3494; -- curva sobrepaso 25, $3.750
update solicitud_compra_item set precio_unit = 6350,  fecha_resolucion = '2026-08-25' where id = 3495; -- caños 32x3m x3, $19.050
update solicitud_compra_item set precio_unit =  940,  fecha_resolucion = '2026-08-25' where id = 3496; -- curvas 32x45 x10, $9.400
update solicitud_compra_item set precio_unit =  840,  fecha_resolucion = '2026-08-25' where id = 3497; -- codos 32x90 x5, $4.200
update solicitud_compra_item set precio_unit = 1200,  fecha_resolucion = '2026-08-25' where id = 3498; -- buje 50x40, $1.200
update solicitud_compra_item set precio_unit = 1190,  fecha_resolucion = '2026-08-25' where id = 3499; -- buje 40x32, $1.190
update solicitud_compra_item set precio_unit = 1340,  fecha_resolucion = '2026-08-25' where id = 3500; -- manguitos 32 x2, $2.680
update solicitud_compra_item set precio_unit =  945,  fecha_resolucion = '2026-08-25' where id = 3501; -- ramal Y 32 x2, $1.890

update materiales_a_cuenta_cliente m
   set precio_unit = i.precio_unit,
       precio_total = i.cantidad * i.precio_unit,
       fecha_resolucion = i.fecha_resolucion,
       updated_at = now()
  from solicitud_compra_item i
 where m.item_id = i.id and i.id between 3489 and 3501;

-- ── 2) Los dos renglones legibles que faltaban ──────────────────────────
-- Flotante de bronce común p/ tanque, rosca 1/2 → ficha 23; teflón 3/4 x 10 m
-- → ficha 33 (ya trae el alias "teflon alta densidad 3/4").
with nuevos as (
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, proveedor_id, precio_unit,
     fecha_resolucion, fecha_envio, material_id, pagado_por, cantidad_comprada, cantidad_enviada, obs)
  values
    (694, 'Flotante p/ tanque', 1, 'unid', 'enviado', 1, 16200,
     '2026-08-25', '2026-08-25', 23, 'cadinc', 1, 1,
     'Boleta POLLANO 25/08: "flotante bce común p/tanque 1/2"'),
    (694, 'Cinta teflón', 1, 'unid', 'enviado', 1, 500,
     '2026-08-25', '2026-08-25', 33, 'cadinc', 1, 1,
     'Boleta POLLANO 25/08: "teflón 3/4 x 10 mt"')
  returning id, descripcion, cantidad, unidad, precio_unit, fecha_resolucion, proveedor_id
)
insert into materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad, precio_unit, precio_total,
   origen, proveedor_id, fecha_resolucion, pagado_por, a_cargo_de, created_by)
select 'CC-016', 694, n.id, n.descripcion, n.cantidad, n.unidad, n.precio_unit,
       n.cantidad * n.precio_unit, 'proveedor', n.proveedor_id, n.fecha_resolucion,
       'cadinc', 'cliente', '2e45e785-fa26-4e1a-8602-22fa093c39d8'
  from nuevos n;

-- ── 3) Fichas del catálogo ──────────────────────────────────────────────
-- El flotante no tenía precio; ahora hay uno real.
update stock_materiales
   set precio_ref = 16200, precio_actualizado_en = '2026-08-25'
 where id = 23 and precio_ref = 0;

-- Estas tres las había fijado yo con estimaciones de Mercado Libre en
-- 20260912k. La boleta manda sobre la estimación.
update stock_materiales set precio_ref =  940, precio_actualizado_en = '2026-08-25' where id = 2276 and precio_ref = 1000;
update stock_materiales set precio_ref = 1340, precio_actualizado_en = '2026-08-25' where id = 2187 and precio_ref = 1200;
update stock_materiales set precio_ref =  945, precio_actualizado_en = '2026-08-25' where id = 1931 and precio_ref = 3500;

-- El caño PVC 32 x 3m (ficha 2355) NO se toca: sus $4.200 los puso el user a
-- mano el 08/09 y su decisión es más nueva que esta boleta. Queda anotado que
-- POLLANO lo cobró $6.350 el 25/08, por si quiere alinearlo.

commit;
