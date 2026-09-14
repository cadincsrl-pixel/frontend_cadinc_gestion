-- La planchuela galvanizada no tenía ficha, y la de 1/2" estaba al precio crudo
--
-- Dos cosas que salieron de revisar el texto libre del 14/09.
--
-- 1) ALTA. El renglón 3826 (CC-027, comprado a hierronort, 2 u a $30.254,84)
--    dice "Planchuela galvanizada 2x 3/16" y entró sin ficha. La ficha #427
--    "Planchuela 2\" x 3/16\" x 6m" existe pero es la NEGRA: galvanizado es otro
--    producto y otro precio, y el catálogo ya lo distingue en el nombre en caño
--    de acero, chapa, cadena, alambre y tejido. Va ficha aparte.
--
--    Nace SIN PRECIO a propósito. Los $30.254,84 de la compra no se pueden dar
--    por buenos: no hay factura adjunta, hierronort no está en la planilla con
--    este ítem, y la cuenta por kilo contra las planchuelas de SUPERMAT da
--    ~$34.600 c/IVA para la NEGRA de esta medida, o sea que el número de la
--    compra queda por debajo del negro y muy por debajo de un galvanizado.
--    O es neto, o es otra medida/largo. Lo resuelve el comprobante, no una
--    inferencia: inventar el precio acá es exactamente lo que llenó el catálogo
--    de "$11" que nadie volvió a mirar (CLAUDE.md §5.15). El renglón ya está en
--    la cuenta de CC-027 por $60.509,68 con ese precio y no se toca.
--
--    Sin alias genérico "planchuela galvanizada": el nombre de la ficha ya lo
--    contiene y el buscador mira el nombre, así que el alias corto sólo serviría
--    para robarle el match a una futura galvanizada de otra medida.
--
-- 2) PRECIO. La ficha #432 "Hierro plano 1/2\" x 6m" tiene $5.436,89, que es el
--    precio de LISTA CRUDO del comprobante de SUPERMAT (PLANCHUELA 1/2 X 1/8,
--    1,92 kg): sin el 2% de bonificación y sin IVA. Con las dos cosas son
--    $6.447,06 (5436,89 × 0,98 × 1,21). Su hermana #433 (3/4") ya está bien.
--    Es el mismo error que Nicolás levantó en la tornillería esta mañana.
--
--    NO se toca #1093 "Planchuela 1-1/4\"": tiene $7.227,12, que es el lista de
--    la de 3/4 y no el suyo, pero sin la factura no hay con qué reemplazarlo.
--    Queda anotado para cuando alguien la mire.

do $m$
declare
  v_id    int;
  v_items int;
begin
  insert into stock_materiales (nombre, alias, clase, rubro_id, unidad, precio_ref, obs)
  values (
    'Planchuela galvanizada 2" x 3/16" x 6m',
    array[
      'planchuela galvanizada 2x3/16', 'planchuela galvanizada 2 x 3/16',
      'planchuela galvanizada 2x 3/16', 'planchuela 2x3/16 galvanizada',
      'planchuela 2 x 3/16 galvanizada', 'planchuela galvanizada 2',
      'planchuela galvanizada 2 pulgadas'
    ],
    'material', 7, 'unid', 0,
    'Sin tasar: la compra del 14/09 a hierronort ($30.254,84) no se pudo confirmar como precio final con IVA. Pedir el comprobante. La ficha #427 es esta misma medida pero en hierro negro.'
  )
  returning id into v_id;

  update solicitud_compra_item
     set material_id = v_id
   where id = 3826 and material_id is null;
  get diagnostics v_items = row_count;

  raise notice 'ficha % · renglon %', v_id, v_items;
end $m$;

-- Hierro plano 1/2": el lista crudo pasa a precio final con IVA.
select fijar_precio_ref(432, 6447.06, 'migracion');
