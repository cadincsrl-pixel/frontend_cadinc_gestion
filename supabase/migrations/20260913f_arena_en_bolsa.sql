-- ARENA: dos despachos en bolsas estaban colgados de la ficha por TONELADA.
--
-- (Renombrada de 20260913b el 10/09: ese prefijo lo tomó otra sesión en
--  paralelo con 20260913b_nicolas_cargar_precios, aplicada varias horas
--  antes. En la base quedó registrada con el nombre viejo; manda el
--  timestamp de schema_migrations, no la letra del archivo.)
--
-- Juan Pablo pidió 30 bolsas de arena para LAMADRID (pedido 721, 10/09) y el
-- buscador le dio la ficha 90 "Arena fina", que se mide en tn. El despacho
-- descontó 30 de esa ficha y el depósito quedó en -28 TONELADAS. La ficha
-- correcta es la 769 "Arena x 25kg", que es por bolsa.
--
-- No empezó con él: el 03/09 Nicolás ya había despachado 15 "bolsas" contra la
-- misma ficha de toneladas (item 3245, Laprida 196).
--
-- CAUSA RAÍZ: la ficha 90 tiene entre sus alias la palabra "arena" a secas. El
-- matcher del Combobox es substring, así que se lleva puesta cualquier
-- búsqueda que contenga "arena". Y como stock_movimientos NO guarda unidad,
-- 30 bolsas y 30 toneladas se anotan igual: el error es invisible hasta que
-- el stock se va a negativo.
--
-- SE MUEVEN SOLO LOS DOS RENGLONES EN "bolsa". El item 3262 (1 m3, 03/09,
-- pedido 656) NO se toca: un metro cúbico es una medida a granel y su lugar
-- es la ficha de granel, aunque la unidad tampoco coincida exactamente con
-- "tn". Queda anotado como cosa a mirar.
--
-- ── LO DELICADO: LOS RECUENTOS FÍSICOS DEL 07/09 ──
-- Las dos fichas fueron contadas a mano ese día y cada ajuste dice el número
-- contado:
--   ficha  90: "el sistema decía -16 y se contaron 2"    → ajuste +18
--   ficha 769: "el sistema decía -33 y se contaron 200"  → ajuste +233
-- El conteo es la verdad física y NO se toca. Pero al mover el despacho del
-- 03/09 (anterior al recuento) cambia el saldo previo de las dos fichas, así
-- que los ajustes se RECALCULAN para que el resultado siga dando el número
-- contado:
--   ficha  90: saldo previo pasa de -16 a  -1 → ajuste +3   (para llegar a 2)
--   ficha 769: saldo previo pasa de -33 a -48 → ajuste +248 (para llegar a 200)
-- El despacho de 30 del 10/09 es POSTERIOR al recuento y no lo afecta.
--
-- Resultado: ficha 90 queda en 2 (lo contado, ya sin bolsas mezcladas) y
-- ficha 769 en 88 bolsas.
--
-- Ninguno de los tres renglones está cobrado ni certificado.

begin;

-- 1) Los renglones del pedido a la ficha por bolsa.
update solicitud_compra_item
   set material_id = 769, descripcion = 'Arena x 25kg'
 where id in (3245, 3648);

update materiales_a_cuenta_cliente
   set descripcion = 'Arena x 25kg', updated_at = now()
 where item_id in (3245, 3648);

-- 2) Los movimientos de stock que generaron esos despachos.
update stock_movimientos set material_id = 769 where id in (135, 455);

-- 3) Los ajustes del recuento, recalculados para preservar lo contado.
update stock_movimientos
   set cantidad = 3,
       obs = 'Recuento del depósito 2026-09-07: se contaron 2. Ajuste recalculado el 10/09 '
             || '(era +18): el despacho de 15 bolsas del 03/09 se movió a la ficha 769 '
             || '"Arena x 25kg", así que el saldo previo pasó de -16 a -1 y alcanza +3 para llegar a 2.'
 where id = 252;

update stock_movimientos
   set cantidad = 248,
       obs = 'Recuento del depósito 2026-09-07: se contaron 200. Ajuste recalculado el 10/09 '
             || '(era +233): entró el despacho de 15 bolsas del 03/09 que estaba en la ficha 90, '
             || 'así que el saldo previo pasó de -33 a -48 y hacen falta +248 para llegar a 200.'
 where id = 249;

-- 4) Stock recalculado desde los movimientos (no hay trigger que lo mantenga:
--    stock_actual es un cache que escribe el backend).
update stock_materiales m
   set stock_actual = (
     select coalesce(sum(case mv.tipo when 'entrada' then mv.cantidad
                                      when 'ajuste'  then mv.cantidad
                                      else -mv.cantidad end), 0)
       from stock_movimientos mv where mv.material_id = m.id),
       updated_at = now()
 where m.id in (90, 769);

-- 5) La causa raíz: el alias "arena" suelto sale de la ficha de granel, y la
--    de bolsa gana las frases con las que se la pide en obra. Ojo: NO se saca
--    "arena" de ningún lado por las malas — la ficha 769 se llama "Arena x
--    25kg", así que buscar "arena" la sigue encontrando por el nombre.
update stock_materiales
   set alias = array_remove(alias, 'arena'), updated_at = now()
 where id = 90;

update stock_materiales
   set alias = alias || array['arena fina en bolsa', 'bolsa de arena fina',
                              'arena fina x 25kg', 'arena en bolsa'],
       updated_at = now()
 where id = 769;

-- 6) Y el nombre de la ficha de granel dice a granel, que es lo que confundió:
--    en el buscador "Arena fina" al lado de "Arena x 25kg" no avisa que una va
--    por tonelada. La unidad NO cambia (sigue tn), así que no reinterpreta
--    ningún movimiento viejo.
update stock_materiales
   set nombre = 'Arena fina a granel (por tonelada)', updated_at = now()
 where id = 90 and nombre = 'Arena fina';

commit;
