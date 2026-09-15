-- Las cajas estancas por medida, y el pegamento eléctrico que faltaba
--
-- Sale del barrido de texto libre del 15/09: de 36 renglones del día, 34 tenían
-- ficha y 2 no. Los dos eran del mismo pedido (#796, Farmacia América, cargado
-- por Juan Pablo) y los dos tenían la ficha mal en el catálogo, no mal escrita.
--
-- ── 1. EL PEGAMENTO SON DOS PRODUCTOS ────────────────────────────────────────
--
-- El user: "tenemos dos tipos, de pvc para caños sanitarios y de pvc para caños
-- electricos". Verificado contra los fabricantes, y es más fuerte que "dos
-- marcas": el de electricidad es un adhesivo SELLADOR. La ficha técnica de la
-- línea Kaloductos de Kalop dice que la unión pasa de IP55 a IP65 al usarlo, o
-- sea que es lo que hace que un caño a la intemperie sea estanco. El sanitario
-- no hace eso.
--
-- El distinguidor duro es la presentación, igual que el código de lista:
--     250 cc -> sanitario      100 ml -> eléctrico
--
-- La ficha 34 que ya existía ("Adhesivo PVC x 250cc", $12.300) es la SANITARIA
-- y se queda como está. La eléctrica es nueva: Kalop KL05599, 100 ml, $6.389 de
-- referencia de lista (elecas.ar, 15/09/2026).
--
-- SEÑAL DE QUE ESTABAN MEZCLADOS: los 6 renglones que usaron la ficha 34 se
-- pagaron entre $4.190 y $20.630. Cinco veces de diferencia no se explica con un
-- solo producto; con dos productos y dos presentaciones metidos en una ficha, sí.
-- No se retasa nada acá — queda anotado para mirar con los comprobantes.
--
-- ── 2. LAS CAJAS ESTANCAS VAN POR MEDIDA ─────────────────────────────────────
--
-- El user: "para mi la caja es una caja estanca plastica viene en muchas
-- medidas", y pidió cargar 110x110, 200x200, 250x250 y 300x300.
--
-- Había UNA sola ficha, la 760 "Caja estanca PVC 110x110", que además se quedaba
-- con los alias genéricos "caja estanca", "caja estanca pvc" y "caja de paso
-- estanca". O sea que quien pedía "caja estanca" a secas caía siempre en la más
-- chica del catálogo. Es el patrón de la arena del §5.15.
--
-- Esos tres alias genéricos SE SACAN y no se le ponen a ninguna: las cuatro
-- fichas llevan "Caja estanca PVC" en el nombre, así que buscar "caja estanca"
-- ahora devuelve las cuatro y quien pide elige la medida. Mismo criterio que
-- "chapa calibre 16" el 14/09.
--
-- LAS CUATRO NACEN SIN PRECIO, A PROPÓSITO. En el mercado la profundidad cambia
-- el precio al doble para la misma cara: la 210x210x110 está entre $11.359 y
-- $12.400, y la 210x210x165 a $21.834,25 (Genrod, distribuidoresdelsud, 15/09).
-- La de 310x310x165 aparece entre $27.430 y $47.571,55 según el vendedor. Poner
-- un número sin saber la profundidad sería inventarlo; el precio real entra con
-- el comprobante de la primera compra.
--
-- La ficha 58 "Caja de paso" queda como está: es un cascarón sin medida, sin
-- precio, sin sinónimos y sin un solo renglón ni movimiento en su vida. No la doy
-- de baja porque no me lo pidieron, pero es candidata.

-- ── El pegamento eléctrico ───────────────────────────────────────────────────
insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
values
  (2, 'Adhesivo sellador p/ caño eléctrico PVC x 100ml (Kalop)',
   'unid', 'material', true, false, 0, 0, 0,
   array[
     'pegamento para cano electrico',
     'pegamento cano electrico',
     'pegamento para caneria electrica',
     'adhesivo cano electrico',
     'pegamento pvc electrico',
     'adhesivo pvc electrico',
     'pegamento electrico',
     'adhesivo kalop',
     'kaloducto'
   ],
   'Alta 15/09/2026 (20260915h). Kalop KL05599, 100 ml, linea Kaloductos. Es SELLADOR: la union pasa de IP55 a IP65 al usarlo. NO es el mismo que el sanitario (ficha 34, 250cc). Precio de lista de referencia $6.389 (elecas.ar, 15/09/2026), no de compra.');

select fijar_precio_ref(
  (select id from stock_materiales where nombre = 'Adhesivo sellador p/ caño eléctrico PVC x 100ml (Kalop)'),
  6389.00, 'migracion');

-- ── Las cajas estancas que faltaban ──────────────────────────────────────────
insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
values
  (2, 'Caja estanca PVC 200x200', 'unid', 'material', true, false, 0, 0, 0,
   array['caja estanca 200x200','caja estanca 20x20','caja de paso 200x200','caja estanca 200'],
   'Alta 15/09/2026 (20260915h). Sin precio: en el mercado la profundidad lo cambia al doble (210x210x110 entre $11.359 y $12.400; 210x210x165 $21.834,25). El precio entra con el comprobante.'),
  (2, 'Caja estanca PVC 250x250', 'unid', 'material', true, false, 0, 0, 0,
   array['caja estanca 250x250','caja estanca 25x25','caja de paso 250x250','caja estanca 250'],
   'Alta 15/09/2026 (20260915h). Sin precio hasta tener comprobante.'),
  (2, 'Caja estanca PVC 300x300', 'unid', 'material', true, false, 0, 0, 0,
   array['caja estanca 300x300','caja estanca 30x30','caja de paso 300x300','caja 30x30 electricidad','caja estanca 300'],
   'Alta 15/09/2026 (20260915h). Sin precio: la 310x310x165 aparece entre $27.430 y $47.571,55 segun el vendedor. El precio entra con el comprobante.');

-- ── Sacarle los alias genéricos a la 110x110 ─────────────────────────────────
-- Se le dejan los que nombran SU medida y se le quitan los que se llevaban los
-- pedidos de todas las demás.
update stock_materiales
   set alias = array['caja estanca 110x110','caja estanca 11x11','caja de paso 110x110','caja estanca 110','caja estanca 10x10'],
       obs = coalesce(obs || ' · ', '') ||
             'Alias genericos ("caja estanca", "caja estanca pvc", "caja de paso estanca") retirados el 15/09 (20260915h): se llevaban a la mas chica los pedidos de todas las medidas. Las cuatro fichas llevan "Caja estanca PVC" en el nombre, asi que buscar "caja estanca" devuelve las cuatro.',
       updated_at = now()
 where id = 760
   and nombre = 'Caja estanca PVC 110x110';

-- ── Los dos renglones de Juan Pablo, a su ficha ──────────────────────────────
-- Cambiar material_id dispara trg_item_recalc_a_cargo_de; CC-023 es obra de
-- cliente sin por_administracion, asi que calc_a_cargo_de devuelve 'cliente',
-- que es lo que ya tienen. No reclasifica.
update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Caja estanca PVC 300x300'),
       obs = coalesce(obs || ' · ', '') ||
             'Vinculado el 15/09 (20260915h): "Caja 30x30 (electicidad)" es la caja estanca de 300x300, que hasta hoy no existia en el catalogo.'
 where id = 3897 and material_id is null;

update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Adhesivo sellador p/ caño eléctrico PVC x 100ml (Kalop)'),
       obs = coalesce(obs || ' · ', '') ||
             'Vinculado el 15/09 (20260915h): es el adhesivo ELECTRICO (Kalop 100ml), no el sanitario de 250cc de la ficha 34.'
 where id = 3900 and material_id is null;
