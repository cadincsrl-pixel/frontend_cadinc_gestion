-- Se borran los renglones de pedido que no son materiales (OK del user 07/09).
--
-- La revisión del 07/09 clasificó 334 renglones de texto libre y marcó 21 como
-- "no son materiales". El user decidió: borrar las líneas de IVA, los nombres de
-- responsables, los canjes de herramienta y las tareas y notas.
--
-- La verificación previa al borrado cambió dos cosas del plan original:
--
--   1. El renglón 2195 SALE de la lista. Estaba clasificado como nota suelta
--      ("t4 que trajo yona todos"), pero es una pieza de herrería: su pedido
--      (458, CC FARM 25, obra de CLIENTE) tiene tres hermanos de la misma
--      entrega — 2194 "t1 de los herreros", 2196 "chapa ranurada TODAS" y 2197
--      "chapas naranjas con soporte" — que sí se conservan. Los cuatro están
--      'a_cobrar' en $0, o sea pendientes de tasar y facturarle al cliente.
--      Borrar uno de los cuatro sería incoherente y perdería una entrega
--      cobrable. Quedan 14.
--
--   2. El sello "NO ES UN MATERIAL" se limpia de los que NO se borran. Quedó
--      puesto en 20 renglones y solo 14 se van. Los 6 restantes son materiales
--      de verdad (trapos de sábana, alfombras viejas, un gancho que fabricó
--      Bruno, la pieza de herrería, la recarga de matafuego): dejarles el sello
--      hace que la próxima auditoría proponga borrar material bueno.
--
-- LO QUE SE BORRA (guardado acá para poder reconstruirlo desde git):
--
--   id  | obra               | fecha      | pedido  | clase       | cant        | descripción
--    241 | CC NORTE           | 2026-06-10 | sol  93 | material    | cant 1 unid | responsable mario barrionuevo
--    376 | CC-009             | 2026-06-19 | sol 127 | material    | cant 1 unid | responsable miguel aguilar
--    483 | CC CADINC 1        | 2026-06-25 | sol 149 | material    | cant 1 unid | responsable franco diaz
--    852 | CC NORTE           | 2026-07-08 | sol 222 | herramienta | cant 1 unid | Materiales de los herreros para soldar guinche y herramientas
--    897 | CC PRADERAS        | 2026-07-01 | sol 178 | material    | cant 1 unid | rodrigo fernandez
--   1270 | cc 24              | 2026-07-21 | sol 308 | material    | cant 3 unid | Cosas de Molina q mando comprar Nicolás
--   1353 | CC-016             | 2026-07-23 | sol 329 | material    | cant 1 unid | retirar tablon de las heras
--   1354 | CC-014             | 2026-07-22 | sol 321 | material    | cant 1 unid | IVA
--   1516 | CC-014             | 2026-07-27 | sol 353 | material    | cant 1 unid | IVA
--   1517 | CC-017             | 2026-07-27 | sol 349 | material    | cant 1 unid | IVA
--   1640 | CC FARM 25         | 2026-07-29 | sol 370 | material    | cant 1 unid | IVA
--   1700 | CC CLINICA HERAS   | 2026-07-29 | sol 372 | material    | cant 1 unid | iva
--   3133 | CC-005             | 2026-09-01 | sol 625 | herramienta | cant 1 unid | cambio de demoledor.. un mediano x un chicho
--   3183 | CC-025             | 2026-09-02 | sol 642 | herramienta | cant 1 unid | cambio de andamio de 6 roseta x 5 roseta
--
-- Los 14 están en $0 y ninguno está cobrado, así que no se mueve un peso.
--
-- LAS 5 LÍNEAS DE IVA valieron plata hasta el barrido del 04/09, que las puso en
-- $0 con este razonamiento (los eventos que lo dicen se van en CASCADE, así que
-- quedan transcriptos):
--
--   1354 | 04/09 | El IVA ya está dentro del precio final de cada material. Era $203.500,00
--   1516 | 04/09 | El IVA ya está dentro del precio final de cada material. Era $18.742,67
--   1517 | 04/09 | El IVA ya está dentro del precio final de cada material. Era $66.045,00
--   1640 | 04/09 | El IVA ya está dentro del precio final de cada material. Era $58.041,65
--   1700 | 04/09 | El IVA ya está dentro del precio final de cada material. Era $205.700,00
--
-- Los importes NO se pierden con el borrado: siguen en la línea del remito, que
-- guarda su propio precio_unit y su proveedor —
--   1354 RM-0418 VOLTAJE $203.500,00 · 1516 RM-0440 Fontanero $18.742,67
--   1517 RM-0447 Silva $66.045,00   · 1640 RM-0465 Fontanero $58.041,65
--   1700 RM-0482 Silva $205.700,00
-- Dos quedaron con la pregunta abierta y no la cierra este borrado:
--   · 1516 es el ÚNICO renglón de su pedido, o sea que en ese pedido no hay
--     ningún material adentro del cual pueda estar ese IVA. Es un cargo de
--     impuesto cuya compra está cargada en otro lado.
--   · 1517 (CC-017, Silva): si los renglones hermanos estuvieran cargados NETOS,
--     el IVA daría ~$70.129 contra los $66.045 del renglón (6% de error), mucho
--     más cerca que la hipótesis de que ya venían con IVA (12% de error). Puede
--     ser que a CC-017 se le hayan perdonado esos $66.045 el 04/09.
--
-- QUÉ SE LLEVA PUESTO CADA BORRADO, y por qué está bien:
--
--   · materiales_a_cuenta_cliente (CASCADE) — solo 1270 tenía fila todavía, en
--     $0 y sin cobro. Las otras 13 ya habían salido de la cuenta el 04 y 05/09.
--   · solicitud_item_eventos (CASCADE) — se pierde la historia del renglón. Lo
--     que importaba quedó transcripto arriba; audit_log no tiene copia porque
--     aquellos barridos corrieron por migración y no pasaron por el middleware.
--   · remitos_envio_item (SET NULL) — los 14 salieron en un remito emitido. La
--     LÍNEA DEL REMITO NO SE TOCA: guarda su propia descripción, cantidad y
--     precio, así que el papel que se firmó en la obra sigue diciendo lo mismo.
--     Solo pierde el puntero al renglón que le dio origen, y el tipo TS ya lo
--     declara nullable. Efecto secundario asumido: al REIMPRIMIR uno de esos 14
--     remitos, la tabla de abajo "ESTADO DEL PEDIDO ORIGINAL" (que se arma
--     leyendo el pedido, no el remito) ya no va a listar ese renglón. La tabla
--     principal del remito sí lo sigue mostrando.
--   · herr_entregas (SET NULL) — 852, 3133 y 3183 tienen fila en el pañol. Las
--     de 3133 y 3183 son los dos canjes, ya en 'ignorada' y con la nota que
--     explica el canje: sobreviven intactas y son el mejor registro que queda.
--
-- Tres pedidos (353, 625 y 642) quedan sin ningún renglón, porque el que se
-- borra era el único. NO se borran los pedidos: tienen un remito emitido
-- colgando (RM-0440, RM-0805, RM-0830) y el FK lo impide, que es lo correcto.
-- En la pantalla no molestan: `matchCategoria` descarta los pedidos sin
-- renglones (`items.length === 0`), así que no aparecen en ninguna pestaña.

-- 1. El pañol de CC NORTE deja de contar una unidad fantasma.
--    La entrega 533 se confirmó en bloque el 05/09 sin mirarla de cerca. No es
--    una herramienta: es un renglón bulto sin material_id que hoy suma 1 a
--    "en obra" de CC NORTE sin que se pueda rastrear a qué. Al borrar el
--    renglón padre quedaría contando igual, porque el filtro de
--    v_herr_entregas_obras no mira item_id. Pasa a 'ignorada', el mismo estado
--    que ya tienen los dos canjes.
update herr_entregas
   set estado = 'ignorada',
       nota = 'No era una herramienta: renglón bulto sin material, borrado del '
           || 'pedido el 07/09 por no ser un material. Se ignora para que no '
           || 'siga contando en el pañol de CC NORTE.'
 where id = 533;

-- 2. Se limpia el sello equivocado de los que NO se borran, así la próxima
--    auditoría no los propone. Cada uno queda con lo que sí es.
update solicitud_compra_item set obs = 'Trapo de obra: sábana vieja cortada. Material real, sin valor (descarte reutilizado).' where id in (1989, 2386);
update solicitud_compra_item set obs = 'Alfombra vieja reutilizada para proteger pisos. Material real, sin valor (descarte).' where id = 2334;
update solicitud_compra_item set obs = 'Pieza autofabricada en el taller (la hizo Bruno). Material real, sin valor de compra.' where id = 894;
update solicitud_compra_item set obs = 'Pieza de herrería de la entrega del pedido 458, hermana de "t1 de los herreros". Pendiente de tasar y cobrarle a CC FARM 25.' where id = 2195;

-- 3. El borrado.
delete from solicitud_compra_item
 where id in (241, 376, 483, 852, 897, 1270, 1353, 1354,
              1516, 1517, 1640, 1700, 3133, 3183);
