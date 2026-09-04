-- Dos precisiones de nombre y la vinculacion de la "mecha copa".
--
-- 1) LA BOQUILLA. El user: "Boquilla Hexagonal para techar 3/8, es la que aprieta
--    los autoperforantes de los techos". Ya existia como fila 843 con un nombre
--    menos preciso. Renombrar es seguro: remitos_envio_item y
--    materiales_a_cuenta_cliente guardan snapshots del texto, no leen el catalogo.
--
--    ⚠ "mecha copa" NO VA COMO ALIAS, y esto es lo importante de esta migracion.
--    En los pedidos historicos ese texto designa DOS cosas distintas: esta
--    boquilla y una corona de verdad ("mecha copa para amoladora 40", item 1918,
--    despachado con remito RM-0533). La regla del proyecto es que un texto que
--    significa cosas distintas segun el contexto NO lleva alias: se elige a mano.
--    El precedente es "cortadora ceramica", que devolvia la RUEDA DE REPUESTO.
--
--    Y tampoco va NINGUN alias que contenga el token "mecha". El Combobox no
--    matchea alias exacto: concatena nombre + rubro + todos los alias en un solo
--    blob y filtra por substring (text.ts: tokens.every(t => target.includes(t))).
--    Meter "mecha" en el blob de la boquilla la hace competir con las coronas en
--    cualquier busqueda que empiece con esa palabra.
--
-- 2) EL LIMPIAVIDRIOS. Se creo hoy sin el tamano en el nombre, contra la
--    convencion del catalogo ("Diluyente x 4lts", "Cemento Portland x 25kg").
--    Viene en bidones de 1 y 5 litros; la compra fueron 2 de 5 litros.

begin;

update public.stock_materiales
   set nombre = 'Boquilla hexagonal 3/8 p/ techar',
       alias  = array[
         'boquilla para autoperforantes',
         'boquillas',
         'boquilla hexagonal',
         'boquilla hexagonal para techar',
         'boquilla de techar',
         'boquilla para techar',
         'boquilla 3 8'
       ],
       obs = 'Aprieta los autoperforantes de chapa. NO lleva alias con la palabra "mecha": en los pedidos "mecha copa" designa tambien la corona bimetalica, y el buscador filtra por substring sobre todos los alias juntos.'
 where id = 843;

update public.solicitud_compra_item
   set material_id = 843,
       descripcion = 'Boquilla hexagonal 3/8 p/ techar'
 where id = 2126
   and estado = 'comprado'
   and material_id is null;

update public.stock_materiales
   set nombre = 'Limpiavidrios x 5lts',
       obs    = 'Viene en bidones de 1 y de 5 litros. Si aparece la compra del de 1 litro, va como fila aparte ("Limpiavidrios x 1lt"), no como la misma.'
 where id = 949;

update public.solicitud_compra_item
   set descripcion = 'Limpiavidrios x 5lts'
 where id = 2884 and material_id = 949;

commit;
