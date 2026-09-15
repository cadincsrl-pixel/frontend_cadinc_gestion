-- "chapon calibre 16" era chapa negra por hoja, no chapón por metro cuadrado
--
-- Quedó abierto el 14/09 al corregir la chapa galvanizada (20260914aj): la ficha
-- 955 "chapon calibre 16" convivía con la 2713 y no se sabía si eran el mismo
-- producto. El user confirmó dos cosas: **la chapa C16 se vende por hoja**, y la
-- que salió en el pedido 669 era **negra**, no galvanizada. Son dos productos.
--
-- Lo que tenía la 955 adentro, y por qué estaba mal:
--
--   * Unidad m², cuando la C16 se vende por hoja.
--   * UN solo movimiento en toda su vida: salida de 1 el 04/09 12:53, pedido 669
--     de Cristian Sosa para MANTENIMIENTO (CC CADINC 1), valuada en $0. Nunca
--     tuvo una entrada, así que su stock quedó en −1.
--   * Tres unidades distintas para la misma cosa: el renglón pide en "m", la
--     ficha está en "m²" y la fila de cuenta corriente dice "m".
--   * Precio de $37.500 el m², tipeado a mano el 09/09 sin factura detrás.
--   * El alias "chapa calibre 16", que le robaba a la ficha por hoja los pedidos
--     que le correspondían. Es el patrón de la arena del §5.15: alias corto
--     sobre fichas hermanas con distinta unidad.
--
-- El contexto del pedido 669 es lo que decidió el producto: la chapa sale junto
-- a un Ángulo 1-1/2" x 1/8" x 6m, en un pedido de equipamiento de mantenimiento.
-- Ángulo más chapa es trabajo de herrería, y para soldar se usa chapa negra.
--
-- Y el nombre era la confusión de origen: "chapón" de verdad es la ficha 869
-- (Chapón de hierro liso 1/8" 1.22x2.44, $254.932 la hoja). 1/8" son 3,2 mm; el
-- calibre 16 es 1,5 mm, diez veces más fino. No es un chapón, es una chapa.
--
-- POR QUÉ FICHA NUEVA Y NO RENAME: §5.15 prohíbe el rename in-place cuando la
-- ficha tiene movimientos, porque stock_movimientos no guarda unidad y cambiarla
-- reinterpreta en silencio las cantidades viejas. La 955 tiene uno. Acá esa
-- reinterpretación es justamente la que queremos —ese "1" siempre fue 1 hoja y
-- no 1 m²— pero se hace a la vista, moviendo el movimiento a una ficha nueva,
-- no pisando la unidad de la vieja.
--
-- EL −1 VIAJA CON EL MOVIMIENTO, A PROPÓSITO. No se inventa una entrada para
-- taparlo: el depósito despachó una hoja que nunca registró recibir, y ese
-- agujero es real. Se cierra con un recuento físico, no por SQL (§5.15: el
-- número contado es la verdad).
--
-- EL ALIAS "chapa calibre 16" NO QUEDA EN NINGUNA DE LAS DOS, por decisión del
-- user: no distingue galvanizada de negra, que es justo lo que hay que elegir.
--
-- LA FICHA NUEVA NACE SIN PRECIO, como la 2712 el mismo día: no hay comprobante
-- de chapa negra C16. El despacho del 04/09 está en $0 y es de una obra interna,
-- así que no hay plata del cliente en juego.

-- 1. La ficha que faltaba. Los 7 sinónimos se verificaron contra las 2.503
--    fichas activas simulando el matcher real: 0 colisiones. Va "chapon calibre
--    16" porque es como lo pidió la obra, y no va "chapon" suelto, que es
--    ambiguo contra la 869 (1/8" a $254.932 la hoja).
insert into stock_materiales
  (rubro_id, nombre, unidad, clase, activo, usa_color, stock_actual, stock_minimo, precio_ref, alias, obs)
values
  (7, 'Chapa negra lisa C16 1 x 2 m (hoja)', 'unid', 'material', true, false, 0, 0, 0,
   array[
     'chapa negra lisa c16',
     'chapa negra c16',
     'chapa negra calibre 16',
     'chapa negra 1x2',
     'chapon calibre 16',
     'chapon de hierro 16',
     'chapon 16'
   ],
   'Alta 14/09/2026 (20260914ak): sale de la ficha 955 "chapon calibre 16", que estaba en m2 y era en realidad chapa negra por hoja. Sin precio hasta tener comprobante.');

-- 2. El renglón del pedido 669. Cambiar material_id dispara
--    trg_item_recalc_a_cargo_de; verificado que calc_a_cargo_de('CC CADINC 1',
--    3329) devuelve 'cadinc', igual a lo que ya tiene la fila: no reclasifica.
update solicitud_compra_item
   set material_id = (select id from stock_materiales where nombre = 'Chapa negra lisa C16 1 x 2 m (hoja)'),
       unidad = 'unid',
       obs = coalesce(obs || ' · ', '') ||
             'Reasignado el 14/09 (20260914ak): estaba colgado de "chapon calibre 16" (ficha 955, medida en m2). El user confirmo que la C16 va por hoja y que esta era negra. La cantidad 1 siempre fue 1 hoja, no 1 m2.'
 where id = 3329
   and material_id = 955;

-- 3. La fila de cuenta corriente. Es de obra interna y está en $0, así que no se
--    toca ni precio ni cantidad: sólo el texto que se imprime y la unidad.
update materiales_a_cuenta_cliente
   set descripcion = 'Chapa negra lisa C16 1 x 2 m (hoja)',
       unidad = 'unid',
       updated_at = now()
 where id = 3121
   and descripcion = 'chapon calibre 16'
   and cobro_id is null and certificado_id is null;

-- 4. El movimiento de stock. Acá es donde el "1" pasa de significar 1 m² a
--    significar 1 hoja, que es lo que realmente salió del depósito.
update stock_movimientos
   set material_id = (select id from stock_materiales where nombre = 'Chapa negra lisa C16 1 x 2 m (hoja)')
 where id = 160
   and material_id = 955;

-- 5. stock_actual es cache sin trigger sobre stock_movimientos (§5.15): se
--    recalcula a mano. entrada suma, salida resta, ajuste es un DELTA.
update stock_materiales m
   set stock_actual = coalesce((
         select sum(case mv.tipo when 'entrada' then mv.cantidad
                                 when 'salida'  then -mv.cantidad
                                 when 'ajuste'  then mv.cantidad end)
           from stock_movimientos mv where mv.material_id = m.id), 0)
 where m.nombre = 'Chapa negra lisa C16 1 x 2 m (hoja)' or m.id = 955;

-- 6. El precio inventado de la 955, a cero por la única puerta, para que quede
--    en el historial que se dio de baja y no que alguien lo borró.
select fijar_precio_ref(955, 0, 'migracion');

-- 7. Baja de la 955. Se le vacían los sinónimos para que "chapa calibre 16" deje
--    de existir como puerta de entrada, incluso si alguna pantalla no filtrara
--    por activo.
update stock_materiales
   set activo = false,
       alias = array[]::text[],
       obs = coalesce(obs || ' · ', '') ||
             'Baja 14/09/2026 (20260914ak): era chapa negra C16 por hoja, no chapon por m2. Su unico movimiento (salida de 1 del 04/09, pedido 669) se migro a la ficha nueva "Chapa negra lisa C16 1 x 2 m (hoja)". El alias "chapa calibre 16" no quedo en ninguna ficha: no distingue galvanizada de negra.'
 where id = 955
   and activo is true;
