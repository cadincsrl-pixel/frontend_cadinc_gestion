-- La membrana de Farmacia América se cargó con el TOTAL de la factura
--
-- Factura A 0008-00011787 de AISLANTES TECNOPOR S.R.L., 14/09/2026:
--
--   1 u  Membrana Wichi Tecno x 30m2 1,4x22m
--        Neto gravado            $ 42.592,57
--        IVA 21%                 $  8.944,44
--        IB - CM  1,25%          $    532,41   <- percepción
--        TOTAL                   $ 52.069,42
--
-- La ficha 2720 y el renglón 3843 quedaron en $52.069,42, o sea el total de la
-- factura con la percepción de IIBB adentro. La convención del sistema
-- (CLAUDE.md §5.14) es precio FINAL CON IVA, y nada más:
--
--        42.592,57 x 1,21 = 51.537,01
--
-- La percepción de IIBB es un pago a cuenta que CADINC recupera contra su
-- propio impuesto, no un costo del producto. La prueba de que ésta es la
-- excepción y no el criterio: ESE MISMO DÍA, en la misma tanda de carga, la
-- planchuela de hierronort (renglón 3826) se cargó a $30.254,84 = neto x 1,21,
-- dejando afuera sus percepciones de IIBB y TEM. Dos manos, dos criterios.
--
-- Son $532,41 de más que se le está cobrando a Farmacia América (CC-023).
-- El renglón no está cobrado ni certificado (cobro_id y certificado_id en
-- null), así que no hay que descongelar nada: alcanza con valuar.
--
-- De paso, la ficha nació como alta rápida de texto libre: nombre en minúscula
-- "membrana hidrofuga", unidad "unid" y sin un solo sinónimo. Se le puede
-- cambiar nombre y unidad sin reinterpretar historia porque NO TIENE NINGÚN
-- movimiento de stock (§5.15 prohíbe el rename in-place sólo cuando los hay:
-- stock_movimientos no guarda unidad).
--
-- Los sinónimos van todos de dos palabras para arriba salvo "wichi", que es
-- marca y no colisiona. Deliberadamente NO se agrega "hidrofuga" suelto: las
-- fichas 111, 326 y 1013 son el Hidrófugo aditivo (Ceresita, Sika 1) y ya
-- llevan "hidrofugo" de alias. Son productos que no tienen nada que ver y el
-- buscador del pedido es substring.

-- 1. La ficha PRIMERO, y recién después el precio. El orden importa:
--    fn_stock_materiales_precio_historial es un trigger AFTER UPDATE OF precio_ref
--    que copia stock_materiales.unidad a la fila del historial. Si el precio se
--    fija antes del cambio de unidad, queda escrito para siempre que $51.537,01
--    es el precio de UNA UNIDAD, cuando es el de un rollo de 30,8 m². Al revés
--    no hay riesgo: el update de nombre/unidad/alias no dispara ningún trigger
--    de precio, porque los dos son UPDATE OF precio_ref.
update stock_materiales
   set nombre  = 'Membrana hidrófuga Wichi Tecno x rollo (1,4 × 22 m = 30,8 m²)',
       unidad  = 'rollo',
       alias   = array[
                   'membrana hidrofuga',
                   'membrana hidrófuga',
                   'membrana hidrofuga wichi',
                   'membrana wichi',
                   'wichi tecno',
                   'wichi',
                   'membrana hidrofuga 30m2',
                   'membrana 30m2',
                   'membrana 1.4x22'
                 ],
       updated_at = now()
 where id = 2720
   and nombre = 'membrana hidrofuga'
   and not exists (select 1 from stock_movimientos where material_id = 2720);

-- 2. El precio, por la única puerta al catálogo. Con p_item_id, para que el
--    historial diga qué compra lo justifica (§5.14: la traza es lo que se cuida).
select fijar_precio_ref(2720, 51537.01, 'migracion', 3843);

-- 3. La cuenta del cliente. El trigger deja el evento precio_cambiado.
update materiales_a_cuenta_cliente
   set precio_unit  = 51537.01,
       precio_total = round(cantidad * 51537.01, 2),
       unidad       = 'rollo',
       descripcion  = 'Membrana hidrófuga Wichi Tecno x rollo (1,4 × 22 m = 30,8 m²)',
       updated_at   = now()
 where id = 3562
   and precio_unit = 52069.42
   and cobro_id is null and certificado_id is null;

-- 4. El renglón del pedido, para quien lo mire desde la solicitud.
update solicitud_compra_item
   set precio_unit = 51537.01,
       obs = coalesce(obs || ' · ', '') ||
             'Precio corregido el 14/09 (20260914ag): estaba cargado el total de la factura Tecnopor 0008-00011787 ($52.069,42), que incluye $532,41 de percepción de IIBB. El precio con IVA es $51.537,01.'
 where id = 3843
   and precio_unit = 52069.42;
