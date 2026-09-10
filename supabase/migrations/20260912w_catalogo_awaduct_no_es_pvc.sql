-- CATÁLOGO: Awaduct es polipropileno, no PVC.
--
-- El user lo marcó y se verificó en la web. Awaduct es una línea de desagüe de
-- POLIPROPILENO sanitario de Industrias Saladillo: se une con junta deslizante
-- y O'Ring de doble labio, NO se pega ni se suelda. El PVC de desagüe va con
-- adhesivo. Son productos distintos, con precios distintos, y en obra no se
-- reemplazan uno por el otro.
--
-- Prueba dura, contra proveedores que publican el código junto al nombre:
--   1024 = "TUBO CAÑO 63 X 2.00 DESAGUE AWADUCT"   (sanitariosglobal.com.ar)
--   1060 = "AWADUCT CAÑO 32 X 3MT |1060|"          (elaguilasanitarios.com.ar)
-- Esos son exactamente los códigos que llevan nuestras fichas "Caño PVC 63mm
-- x 2m" y "Caño PVC 32mm x 3m".
--
-- Alcance: 258 fichas activas se llaman "PVC" y llevan un código de lista de 4
-- dígitos en el primer alias. 255 de ellas entraron el 08/09 en UNA sola
-- importación (una única lista de precios) y las otras 3 son viejas que esa
-- importación completó. No hay códigos repetidos ni nombres repetidos, y
-- ningún nombre trae "PVC" dos veces, así que el reemplazo es 1 a 1 y no
-- colisiona con nada.
--
-- Que las series 1xxx a 8xxx son de Awaduct se ve además en el vocabulario:
-- piletas de patio con sifón desmontable, bocas de acceso, desengrasadoras,
-- sombreretes de ventilación, transiciones gollete, corta-refila, grapas de
-- fijación, O'ring de tapa de inspección, multitapa, cupla cordón antiplagas.
-- Es el índice del catálogo Awaduct.
--
-- NO se tocan las fichas "PVC pluvial" (674, 675, 677, 683) ni ninguna otra
-- sin código: esas sí son PVC.

begin;

-- ── 1) El renombre ──────────────────────────────────────────────────────
-- Antes de pisar el nombre, se guarda el viejo como alias en las 162 fichas
-- que hoy no tienen ningún alias con "pvc". Si no, quien busca "caño pvc 63"
-- —que es como se lo pide en obra— dejaría de encontrarlas. Frase completa,
-- no la palabra suelta: el matcher del Combobox es substring.
update stock_materiales
   set alias = alias || array[ translate(lower(nombre), 'áéíóúüñ°"''', 'aeiouun') ]
 where activo and nombre ilike '%PVC%'
   and array_length(alias,1) > 0 and alias[1] ~ '^[0-9]{4}$'
   and alias::text not ilike '%pvc%';

update stock_materiales
   set nombre = replace(nombre, 'PVC', 'Awaduct'),
       updated_at = now()
 where activo and nombre ilike '%PVC%'
   and array_length(alias,1) > 0 and alias[1] ~ '^[0-9]{4}$';

-- ── 2) Propagación a lo que todavía no se le cobró al cliente ───────────
-- El renglón guarda una copia del nombre, así que renombrar la ficha no lo
-- cambia solo. Se propaga ÚNICAMENTE a los renglones sin cobro y sin
-- certificado: si el cliente ya vio ese texto en un certificado, no se le
-- cambia por atrás.
update solicitud_compra_item i
   set descripcion = m.nombre
  from stock_materiales m
 where i.material_id = m.id
   and m.nombre like '%Awaduct%'
   and i.descripcion like '%PVC%'
   and i.descripcion = replace(m.nombre, 'Awaduct', 'PVC')
   and not exists (
     select 1 from materiales_a_cuenta_cliente c
      where c.item_id = i.id and (c.cobro_id is not null or c.certificado_id is not null)
   );

update materiales_a_cuenta_cliente c
   set descripcion = m.nombre, updated_at = now()
  from solicitud_compra_item i join stock_materiales m on m.id = i.material_id
 where c.item_id = i.id
   and c.cobro_id is null and c.certificado_id is null
   and m.nombre like '%Awaduct%'
   and c.descripcion = replace(m.nombre, 'Awaduct', 'PVC');

-- ── 3) Deshacer un error mío de hoy ─────────────────────────────────────
-- En 20260912t le agregué alias "awaduct" a la ficha 928 y mandé ahí el codo
-- de 63 del pedido 709. Estaba mal: la 928 NO tiene código de lista y sus
-- alias propios dicen "duratop", que es otra marca (Grupo Dema). La elegí por
-- el historial de precios, no por el código.
update stock_materiales
   set alias = array_remove(array_remove(alias, 'codo de 63 awaduct'), 'codo 63 awaduct')
 where id = 928;

-- El codo va a la ficha Awaduct que corresponde: cód. 2047, HH — en el papel
-- decía H/H igual que el manguito de la misma boleta, y en la línea Awaduct
-- el codo "de 90°" es de 87°30'.
update solicitud_compra_item i
   set material_id = 2327, descripcion = (select nombre from stock_materiales where id = 2327)
 where i.id = 3557;

update materiales_a_cuenta_cliente
   set descripcion = (select nombre from stock_materiales where id = 2327), updated_at = now()
 where item_id = 3557;

-- La ficha nunca tuvo precio; los $2.410 de POLLANO le dan el primero.
update stock_materiales
   set precio_ref = 2410, precio_actualizado_en = '2026-08-25'
 where id = 2327 and precio_ref = 0;

commit;
