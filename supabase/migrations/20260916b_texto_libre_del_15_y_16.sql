-- El texto libre del 15 y 16 de septiembre: 4 de 5 cerrados
--
-- Barrido de los renglones sin ficha de los dos días: 5 en total, de tres tipos
-- distintos. Uno queda abierto y se explica al final.
--
-- ── 1. LA CUPLA YA EXISTÍA, Y EL CÓDIGO LO PRUEBA ───────────────────────────
--
-- Renglón 3944, "Cupla awaduct 110" (CC-018, 5 unidades, ya enviado). El user:
-- "la cupla es lo mismo que manguito". Y la foto que mandó trae el código de
-- lista 2016, que es el PRIMER ALIAS de la ficha 2191 "Manguito de reparación
-- Awaduct 110mm HH". No hay nada que crear: falta el sinónimo.
--
-- OJO CON QUÉ SINÓNIMO. "cupla awaduct 110" pega en 8 fichas y "cupla 110" en
-- 12 — cuplas de bombeo cloacal, de cordón, antiplagas, reducciones. Son alias
-- ambiguos y no se usan. El que identifica de verdad es "cupla hh 110": HH
-- (hembra-hembra) es lo que distingue a la cupla recta del resto. 0 colisiones.
--
-- Y hay un efecto secundario BUENO: al sumarle "cupla" al blob, la 2191 pasa a
-- aparecer entre los candidatos de "cupla awaduct 110". Eso es correcto — esa
-- frase es genuinamente ambigua y quien pide tiene que elegir entre las 9.
--
-- ── 2. DOS VARIANTES GALVANIZADAS DE ALGO QUE YA TENÍAMOS ───────────────────
--
-- Mismo patrón que la planchuela galvanizada del 14/09: existe la común, falta
-- la galvanizada, y el buscador no devuelve nada.
--
--   3944 → ficha 2191 (ya existía)
--   4044  "Angulo galvanizado 1 1/2x 1/8"  ← existe la común (157, $32.157)
--   4048  "Chapa galvanizada 12 4x8"       ← existen C16, C18 y C25, no C12
--
-- 4x8 pies es 1,22 x 2,44 m, la misma medida que la C18. Las dos nacen SIN
-- precio: son compras ya hechas y el precio real entra con el comprobante.
--
-- ── 3. LA TAPA ES ALTA NUEVA ────────────────────────────────────────────────
--
-- Renglón 4072, "Tapa de inspeccion de aluminio" (CC-023). Se revisaron las ~50
-- fichas con "tapa" y ninguna sirve: son portarrejillas, tapas de sifón y tapas
-- Awaduct que van DENTRO del caño. Esta es una puerta de acceso de pared o piso.
--
-- El user corrigió dos cosas sobre el renglón: es de ACERO INOXIDABLE, no de
-- aluminio, y la que se pidió es de 30x30, no la de 40x40 de la foto.
--
-- SIN PRECIO, a propósito: la publicación que mandó es de la de 40x40
-- ($47.392,96 con IVA — se verifica, 39.168 x 1,21 = 47.393,28, 32 centavos de
-- redondeo). Ese precio NO sirve para la de 30x30. Y no se pre-generan las otras
-- medidas: es la lección de las cajas estancas y de las pinturas por color.
--
-- ── LO QUE QUEDA ABIERTO ────────────────────────────────────────────────────
--
-- Renglón 3980, "Pileta de patio salida 100" (CC-028, ya enviado). NO se toca
-- porque hay 23 candidatas y ninguna cierra sola: está la genérica "Pileta de
-- patio 15x15" ($10.484) y 22 variantes Awaduct, TODAS con salida 110, no 100.
-- Falta que el user diga si "salida 100" es la de 110 dicha corto o es otra.
--
-- ── NOTA AL MARGEN ──────────────────────────────────────────────────────────
--
-- La ficha 2713 (Chapa galvanizada lisa C16), creada ayer, quedó en el rubro
-- Herrería mientras sus tres hermanas (C18, C25 hoja y C25 por metro) están en
-- Techado y cubiertas. La C12 de esta migración va con las hermanas. La 2713 no
-- se mueve acá para no mezclar cosas; queda anotado.

-- 1. La cupla: sólo el sinónimo.
update stock_materiales
   set alias = alias || array['cupla hh 110', 'cupla de reparacion 110', 'cupla awaduct hh 110'],
       updated_at = now()
 where id = 2191
   and not ('cupla hh 110' = any(alias));

update solicitud_compra_item
   set material_id = 2191,
       obs = coalesce(obs || ' · ', '') ||
             'Vinculado el 16/09 (20260916b): cupla y manguito son lo mismo, y el codigo de lista 2016 de la foto es el de esta ficha.'
 where id = 3944 and material_id is null;

-- 2. Las dos galvanizadas.
insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
values
  (7, 'Ángulo galvanizado 1-1/2" x 1/8" x 6m', 'unid', 'material', true, false, 0, 0, 0,
   array['angulo galvanizado 1 1/2 x 1/8','angulo galvanizado 1 1/2','angulo galvanizado'],
   'Alta 16/09/2026 (20260916b). Variante galvanizada de la ficha 157 (angulo comun, $32.157). Sin precio: la compra del 16/09 en CC-018 le pone el real.'),
  (9, 'Chapa galvanizada lisa C12 1,22 x 2,44 m (hoja)', 'unid', 'material', true, false, 0, 0, 0,
   array['chapa galvanizada c12','chapa galvanizada calibre 12','chapa c12','chapa 4x8','chapa galvanizada 12'],
   'Alta 16/09/2026 (20260916b). 4x8 pies = 1,22 x 2,44 m, la misma medida que la C18. Sin precio: la compra del 16/09 en CC-018 le pone el real.');

update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Ángulo galvanizado 1-1/2" x 1/8" x 6m'),
       obs = coalesce(obs || ' · ', '') ||
             'Vinculado el 16/09 (20260916b): es la variante GALVANIZADA; la ficha 157 es la comun.'
 where id = 4044 and material_id is null;

update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Chapa galvanizada lisa C12 1,22 x 2,44 m (hoja)'),
       obs = coalesce(obs || ' · ', '') ||
             'Vinculado el 16/09 (20260916b): calibre 12 en 4x8 pies (1,22 x 2,44 m). No existia; estaban C16, C18 y C25.'
 where id = 4048 and material_id is null;

-- 3. La tapa de inspección.
insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
values
  (1, 'Tapa puerta de inspección p/ llave de paso 30x30 acero inoxidable', 'unid', 'material', true, false, 0, 0, 0,
   array['tapa de inspeccion de aluminio','tapa puerta de inspeccion','puerta de inspeccion inox',
         'tapa inspeccion llave de paso','tapa inox 30x30','puerta de inspeccion 30x30'],
   'Alta 16/09/2026 (20260916b). Es de ACERO INOXIDABLE, no de aluminio (lo corrigio el user). Viene en muchas medidas; esta es la 30x30, que es la que se pidio. Sin precio: la publicacion que mando es de la de 40x40 ($47.392,96 c/IVA) y no sirve para esta medida. El alias "tapa de inspeccion de aluminio" queda a proposito, que es como se pidio.');

update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Tapa puerta de inspección p/ llave de paso 30x30 acero inoxidable'),
       obs = coalesce(obs || ' · ', '') ||
             'Vinculado el 16/09 (20260916b): es de acero inoxidable, no de aluminio, y la medida pedida es 30x30.'
 where id = 4072 and material_id is null;
