-- Conectores plug de CCTV: el kit viene apareado, el catálogo va por pieza
--
-- Compra del 14/09 para el depósito: 5 kits "Conector Ficha Plug Macho Hembra
-- A Presión CCTV" de Artec, $13.200 cada kit. Cada kit trae 10 machos y 10
-- hembras (confirmado por el user contra la mercadería recibida), o sea
-- 50 pares en total.
--
-- Van DOS fichas, macho y hembra, porque se usan por separado: el macho va en
-- la cámara y la hembra en la fuente, y casi nunca se consumen de a pares.
-- Una sola ficha "kit" haría que despachar 3 machos descuente 3 pares.
--
-- PRECIO. $13.200 es el precio FINAL con IVA de Mercado Libre (la publicación
-- lo confirma: "Precio sin impuestos nacionales: $10.909" = 13.200/1,21). El
-- kit trae 20 piezas, así que la pieza sale $660, no los $1.320 que muestra la
-- publicación como "precio por unidad" — ese número sale de dividir por 10
-- conectores, que es lo que dice la ficha del producto y NO lo que vino en la
-- caja. Es justo el error de hoy: el número que se lee del comprobante no es
-- el que va a la ficha.
--
-- ALIAS. Ninguno lleva "ficha macho", "ficha hembra" ni "conector macho" a
-- secas: esos ya son de las fichas 278/279 (Ficha macho/hembra 10A, el enchufe
-- de 220), y el buscador del pedido matchea por substring (CLAUDE.md §5.15).
-- Todos los sinónimos de acá llevan cctv, cámara o plug pegados.

insert into stock_materiales (nombre, alias, clase, rubro_id, unidad, precio_ref, obs)
values
  ('Conector plug macho p/ CCTV a presión',
   array[
     'conector plug macho cctv', 'plug macho cctv', 'ficha plug macho cctv',
     'conector macho camara', 'conector de camara macho', 'plug macho camara',
     'ficha macho camara', 'conector alimentacion camara macho',
     'plug 12v macho', 'conector 12v macho camara', 'plug macho a presion'
   ],
   'material', 2, 'unid', 660,
   'Artec. Viene en kit de 10 machos + 10 hembras a $13.200 (con IVA) = $660 la pieza. Borne a presión, sin soldar. Compra del 14/09: 5 kits al depósito.'),

  ('Conector plug hembra p/ CCTV a presión',
   array[
     'conector plug hembra cctv', 'plug hembra cctv', 'ficha plug hembra cctv',
     'conector hembra camara', 'conector de camara hembra', 'plug hembra camara',
     'ficha hembra camara', 'conector alimentacion camara hembra',
     'plug 12v hembra', 'conector 12v hembra camara', 'plug hembra a presion'
   ],
   'material', 2, 'unid', 660,
   'Artec. Viene en kit de 10 machos + 10 hembras a $13.200 (con IVA) = $660 la pieza. Borne a presión, sin soldar. Compra del 14/09: 5 kits al depósito.');
