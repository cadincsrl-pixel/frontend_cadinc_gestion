-- =============================================================================
-- 20260902e_stock_materiales_altas.sql
-- Alta masiva de 177 materiales en public.stock_materiales  (v2, post-auditoria)
-- =============================================================================
--
-- APLICAR DE FORMA ATOMICA. El archivo NO trae BEGIN/COMMIT explicito porque
-- apply_migration (y `psql -1`) ya envuelven todo en una transaccion. NO pegarlo
-- por partes en el SQL Editor: un fallo a la mitad dejaria medio catalogo
-- cargado y el BLOQUE 2 sin correr. Los INSERT no son re-ejecutables a proposito
-- (el indice unico parcial stock_materiales_nombre_norm_uidx tiene que gritar
-- 23505 si algo colisiona, en vez de saltearse filas en silencio).
--
-- DE DONDE SALE LA LISTA
-- ----------------------
-- Fase 1 (ya en prod) limpio 13 filas duplicadas/defectuosas, creo
-- public.norm_material(text), agrego stock_materiales.alias text[] y monto un
-- INDICE UNICO PARCIAL sobre norm_material(nombre) WHERE activo. Quedaron 718
-- filas activas y 556 alias sembrados sobre 99 materiales.
--
-- Esta migracion es la Fase 2: cierra los huecos del catalogo detectados al
-- analizar los pedidos de compra que las obras venian cargando como TEXTO LIBRE.
-- Cada fila esta respaldada por pedidos reales (entre 1 y 47 items historicos)
-- y arrastra como `alias` las variantes de texto libre con las que la obra la
-- escribio -- normalizadas a minusculas sin tildes, que es la forma que devuelve
-- norm_material(). Esos alias son lo que hace que el material se encuentre.
--
-- QUE CAMBIO RESPECTO DE LA v1 (la que dos auditores rechazaron)
-- --------------------------------------------------------------
-- El detalle completo esta al pie del archivo, en "CAMBIOS v1 -> v2". En
-- titulares: se sacaron 8 altas (4 duplicados semanticos, 4 que van al modulo
-- Herramientas por decision del dueño), se resolvio la familia de tornillos
-- T1/T2/T3, se completo el BLOQUE 2 para que ningun par singular/plural quede
-- apuntando a dos filas distintas, se borraron los alias que describen otra
-- medida y los genericos que roban pedidos ajenos, y se alinearon los nombres
-- que rompian la familia donde ya viven sus hermanos.
--
-- stock_actual, stock_minimo y precio_ref van en 0 a proposito: el conteo
-- fisico y la carga de precios son procesos aparte. activo = true.
--
-- Al final hay un BLOQUE 2 que renombra 2 filas y reparte alias que la Fase 1
-- sembro sobre la fila equivocada.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Rubro 1 - Sanitaria  (18 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 9 pedidos historicos
  (1, 'Codo termofusión 25mm c/ rosca hembra 1/2"', 'unid', 0, 0, 0, true,
     array['codo con rosca hembra fusion de 25', 'codo de 25 con rosca de 1/2 fusion', 'codo de 25 x 1/2 hembra', 'codo fucion con rosca de 1/2 hembra de 25', 'codos con rosca 25 fusion', 'codos con rosca hembra fusion de 25']::text[]),
  -- 8 pedidos historicos
  (1, 'Rejilla de piso 12x12', 'unid', 0, 0, 0, true,
     array['rejilla 12x12', 'rejilla comun de 12x12']::text[]),
  -- 7 pedidos historicos
  (1, 'Llave de paso termofusión 25mm', 'unid', 0, 0, 0, true,
     array['llave de 25 ff', 'llave de paso 25 fusion', 'llave de paso c campana de 25', 'llave de paso de 25', 'llave de paso fucion de 25', 'llave de paso fusion de 25']::text[]),
  -- 5 pedidos historicos
  (1, 'Curva PVC 40mm 45°', 'unid', 0, 0, 0, true,
     array['curvas de 40', 'curvas de 40 a 45ª mh', 'curvas de 40 a 45ºhh']::text[]),
  -- 4 pedidos historicos -- alias 'desplazador 3 cm' BORRADO: describe otra medida
  (1, 'Desplazador p/ inodoro 5cm', 'unid', 0, 0, 0, true,
     array['desplazador para inodoro de 5cm']::text[]),
  -- 4 pedidos historicos
  (1, 'Flexible mallado 1/2" x 35cm', 'unid', 0, 0, 0, true,
     array['flexible mallado 35 cm de 1/2', 'flexibles 35 cm mallado', 'flexibles 35 cm mallados']::text[]),
  -- 4 pedidos historicos
  (1, 'Tapón roscado 1/2"', 'unid', 0, 0, 0, true,
     array['tapones agua 1/2', 'tapones de 1/2']::text[]),
  -- 3 pedidos historicos
  (1, 'Caño de chapa galvanizada 100mm (ventilación)', 'unid', 0, 0, 0, true,
     array['canos de 100 de chapa', 'canos de chapa de 100', 'canos de 100 para el sombrerete']::text[]),
  -- 3 pedidos historicos
  (1, 'Sopapa 50mm p/ pileta de cocina', 'unid', 0, 0, 0, true,
     array['sopapa de 50', 'sopapa de 50 para pileta de cocina']::text[]),
  -- 3 pedidos historicos
  (1, 'Te termofusión 25mm c/ rosca hembra 1/2"', 'unid', 0, 0, 0, true,
     array['t con rosca hembra fusion de 25']::text[]),
  -- 2 pedidos historicos -- renombrada: 'Flexible cromado 40cm' chocaba con el
  -- alias 'flexible cromado' del id 32 'Flexible 1/2" x 40cm' (otro producto)
  (1, 'Desagüe flexible cromado 40cm p/ pileta', 'unid', 0, 0, 0, true,
     array['flexible cromado 040 para desague de pileta']::text[]),
  -- 2 pedidos historicos
  (1, 'Grifería monocomando bidet', 'unid', 0, 0, 0, true,
     array['griferia bidet']::text[]),
  -- 2 pedidos historicos
  (1, 'Sifón PVC 50mm', 'unid', 0, 0, 0, true,
     array['sifon de 0.5']::text[]),
  -- 2 pedidos historicos
  (1, 'Unión doble termofusión 25mm', 'unid', 0, 0, 0, true,
     array['union doble de 25 fusion']::text[]),
  -- 1 pedidos historicos
  (1, 'Codo PVC c/ acometida 110x63mm', 'unid', 0, 0, 0, true,
     array['codos con acometida de 110x63']::text[]),
  -- 1 pedidos historicos
  (1, 'Columna (pie) p/ lavatorio', 'unid', 0, 0, 0, true,
     array['columna de lavamanos']::text[]),
  -- 1 pedidos historicos
  (1, 'Cupla PVC 63mm', 'unid', 0, 0, 0, true,
     array['cuplas de 63']::text[]),
  -- 1 pedidos historicos
  (1, 'Reducción PVC 40 a 32mm', 'unid', 0, 0, 0, true,
     array['reduccion de 40 a 32 awaduct']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 2 - Electricidad  (21 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 15 pedidos historicos
  (2, 'Prolongación 15m', 'unid', 0, 0, 0, true,
     array['alargue 15ml', 'alargue 15mt', 'alargue de 15 ml', 'alargue de 15m', 'alargue de 15ml', 'alargues 15 m']::text[]),
  -- 5 pedidos historicos -- alias 'alargue o tablero' y 'alargue + tablero'
  -- BORRADOS: son pedidos combinados, no identifican una fila
  (2, 'Tablero de obra estanco c/ disyuntor', 'unid', 0, 0, 0, true,
     array['tablero de obra', 'tablero de obra 20mt']::text[]),
  -- 4 pedidos historicos
  (2, 'Artefacto estanco p/ tubo LED 2x18W', 'unid', 0, 0, 0, true,
     array['estanco cableado para tubo led', 'artefactos led 36w']::text[]),
  -- 4 pedidos historicos
  (2, 'Cable canal 100x50mm x 2m', 'unid', 0, 0, 0, true,
     array['cable canal 100x50', 'cable canal 100x50mm']::text[]),
  -- 4 pedidos historicos -- alias 'cable tipo taller' pelado BORRADO: no permite
  -- elegir entre 2x1.5 y 3x2.5
  (2, 'Cable tipo taller 2x1.5mm²', 'm', 0, 0, 0, true,
     array['cable tipo taller 2x1,5', 'cable tipo taller 2x1.5', 'cable 1.5 tpo taller 15m']::text[]),
  -- 4 pedidos historicos -- alias 'grampas' pelado BORRADO: compite con el id 276
  -- 'Grampa p/ cable 8mm' y con 'grampas para techo' del Gancho J
  (2, 'Grampa p/ caño rígido 3/4"', 'unid', 0, 0, 0, true,
     array['grampas 3/4', 'grampa para tuvo rigido 25 mm']::text[]),
  -- 4 pedidos historicos
  (2, 'Tomacorriente 20A', 'unid', 0, 0, 0, true,
     array['toma 20 a', 'toma 20a', 'tomas 20a embutir', 'llave toma 20a']::text[]),
  -- 3 pedidos historicos
  (2, 'Cable tipo taller 3x2.5mm²', 'm', 0, 0, 0, true,
     array['cable tipo taller 3x2,5', 'cable tipo taller 3x2.5', 'cable tipo taller de 3x2.5']::text[]),
  -- 3 pedidos historicos
  (2, 'Plafón LED 24W', 'unid', 0, 0, 0, true,
     array['plafon ed cuadrado 24w luz fria', 'plafon led circular 24w luz neutra']::text[]),
  -- 3 pedidos historicos -- SIN amperaje ni curva: el unico pedido que la
  -- respalda dice 'llave termica tripolar general'. Inventar 3x32A curva C era
  -- plata y un tablero rehecho si el electricista pedia otro calibre.
  (2, 'Térmica tripolar', 'unid', 0, 0, 0, true,
     array['llave termica tripolar general']::text[]),
  -- 2 pedidos historicos
  (2, 'Buscapolo (destornillador probador)', 'unid', 0, 0, 0, true,
     array['busca polo', 'buscapolo']::text[]),
  -- 2 pedidos historicos
  (2, 'Cable canal 30x12mm x 2m', 'unid', 0, 0, 0, true,
     array['cable canal 30x12', 'cable canal 32x12']::text[]),
  -- 2 pedidos historicos
  (2, 'Caño rígido 7/8"', 'm', 0, 0, 0, true,
     array['cano rigido 7/8']::text[]),
  -- 2 pedidos historicos
  (2, 'Extractor de aire p/ baño', 'unid', 0, 0, 0, true,
     array['extractor para bano', 'extratror']::text[]),
  -- 2 pedidos historicos
  (2, 'Prensacable PG', 'unid', 0, 0, 0, true,
     array['prensacables', 'grampa prensacable']::text[]),
  -- 2 pedidos historicos
  (2, 'Proyector LED 200W', 'unid', 0, 0, 0, true,
     array['reflector led philips 200 w', 'reflector philips 200 w']::text[]),
  -- 2 pedidos historicos
  (2, 'Spot dicroica LED de embutir GU10', 'unid', 0, 0, 0, true,
     array['dicroica con aplique de embutir', 'dicroica luz fria']::text[]),
  -- 2 pedidos historicos
  (2, 'Tablero embutir 8 bocas', 'unid', 0, 0, 0, true,
     array['cajas tablero para termica para 8 modulo']::text[]),
  -- 1 pedidos historicos
  (2, 'Caja estanca PVC 110x110', 'unid', 0, 0, 0, true,
     '{}'::text[]),
  -- 1 pedidos historicos
  (2, 'Estaño p/ soldar', 'unid', 0, 0, 0, true,
     array['estano']::text[]),
  -- 1 pedidos historicos
  (2, 'Luz de emergencia LED', 'unid', 0, 0, 0, true,
     array['luces de emergencia']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 3 - Construcción en seco  (6 materiales)
-- -----------------------------------------------------------------------------
-- FAMILIA DE TORNILLOS T1/T2/T3 (decision del dueño, 2026-09-02):
-- T1 y T2 se compran en las DOS puntas (aguja para perfil-a-perfil y placa,
-- mecha para chapa). La familia queda en 5 filas:
--     id 76  -> 'Tornillo T1 punta aguja'   (renombrado en el BLOQUE 2)
--     id 77  -> 'Tornillo T2 punta aguja'   (renombrado en el BLOQUE 2)
--     nuevo  -> 'Tornillo T1 punta mecha'
--     nuevo  -> 'Tornillo T2 punta mecha'
--     nuevo  -> 'Tornillo T3 punta aguja'
-- Reparto de alias: los que dicen 'aguja' quedan en el 76/77; los que dicen
-- 'mecha' se mudan a las nuevas; los genericos 't1'/'t2' a secas quedan en la
-- fila de aguja por ser la mas pedida. El alias 'punta aguja' pelado se BORRA
-- de las dos filas viejas: no permite elegir entre T1, T2 y T3.
-- (La palabra "autoperforante" salio de los nombres porque las cinco lo son;
--  lo que las distingue es la punta. 'autoperforante' pelado sigue colgando de
--  los ids 380/381, que son los autoperforantes de chapa de rubro 6.)
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 5 pedidos historicos
  (3, 'Tornillo T1 punta mecha', 'unid', 0, 0, 0, true,
     array['t1 mecha', 'tornillo t1 mecha', 'tornillos t1 punta mecha']::text[]),
  -- 3 pedidos historicos -- alias 'placas cielorraso 1.2x0.6' BORRADO: 1.2x0.6
  -- es la placa de 60x120, otro producto y otro precio
  (3, 'Placa cielorraso desmontable 60x60', 'unid', 0, 0, 0, true,
     array['placa 60x60', 'placas 60x60 durlock usada']::text[]),
  -- 3 pedidos historicos
  (3, 'Tarugo mariposa p/ placa de yeso', 'unid', 0, 0, 0, true,
     array['tacos par durlok', 'tacos para durlock', 'tacos para durlok con tornillos']::text[]),
  -- 3 pedidos historicos
  (3, 'Tornillo T2 punta mecha', 'unid', 0, 0, 0, true,
     array['t2 mecha', 'tornillos t2 mecha']::text[]),
  -- 2 pedidos historicos
  (3, 'Perfil perimetral L p/ cielorraso desmontable x 3m', 'unid', 0, 0, 0, true,
     array['perimetral l cielorraso desmontable por 3 m', 'perimetrales l']::text[]),
  -- 2 pedidos historicos -- nombre alineado con la familia (era 'T3
  -- autoperforante', que se contradecia con su propio alias 'tornillo t3 aguja')
  (3, 'Tornillo T3 punta aguja', 'unid', 0, 0, 0, true,
     array['t3', 'tornillo t3 aguja']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 4 - Albañilería  (24 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 47 pedidos historicos -- ver nota "KILAJE A CONFIRMAR" al pie
  (4, 'Arena x 25kg', 'bolsa', 0, 0, 0, true,
     array['bolsas de arena', 'bolsa de arena', 'bolsa arena', 'arena bolsas', 'bolsas de aren']::text[]),
  -- 18 pedidos historicos -- se lleva TODOS los alias con 'bolsa' que estaban
  -- colgados del id 91 'Piedra partida' (que es a granel, unidad tn)
  (4, 'Piedra partida 1-3 x 25kg', 'bolsa', 0, 0, 0, true,
     array['bolsa de piedra 1 al 3', 'bolsa de ripio', 'bolsa piedra 1 al 3', 'bolsa piedra lavada 1 al 3', 'bolsa ripio 1 al 3', 'bolsa ripo 1 al 3', 'bolsas 1 al 3', 'bolsas de piedra 1 al 3', 'bolsas de ripio', 'bolsas de ripio 1 al 3', 'bolsas piedra 1 al 3']::text[]),
  -- 17 pedidos historicos
  (4, 'Pala ancha', 'unid', 0, 0, 0, true,
     array['palas anchas', 'pala amcha', 'pala ancha para el camionero']::text[]),
  -- 16 pedidos historicos
  (4, 'Yeso x 25kg', 'bolsa', 0, 0, 0, true,
     array['yeso', 'bolsas de yeso']::text[]),
  -- 11 pedidos historicos
  (4, 'Cuchara de albañil', 'unid', 0, 0, 0, true,
     array['cuchara']::text[]),
  -- 10 pedidos historicos -- se queda con el alias 'tanza' pelado (10 pedidos
  -- contra los 2 de la desmalezadora)
  (4, 'Tanza de replanteo', 'rollo', 0, 0, 0, true,
     array['rollo de tanza', 'rollo de tanza naranja', 'rollo de tanza nueva', 'tanza']::text[]),
  -- 9 pedidos historicos
  (4, 'Llana dentada 12mm', 'unid', 0, 0, 0, true,
     array['llana dentada', 'llana dentada del 12', 'llana dentada n12', 'llana de 12', 'llana n12', 'llanas del 12']::text[]),
  -- 9 pedidos historicos
  (4, 'Pala de punta', 'unid', 0, 0, 0, true,
     array['palas de punta', 'pala punta']::text[]),
  -- 8 pedidos historicos
  (4, 'Revoque premezclado 3 en 1 x 30kg', 'bolsa', 0, 0, 0, true,
     array['bolsas 3 en 1 weber', 'bolsas de 3 en 1 ( revoque)', 'bolsas de revoque 3 en 1', 'bolsas weber 3 en 1', 'bosa de 3 en 1']::text[]),
  -- 8 pedidos historicos -- contenido en el nombre, envase en `unidad`
  -- (mismo criterio que id 326 'Hidrófugo x 5lts', unidad 'unid')
  (4, 'Ácido muriático x 1lt', 'unid', 0, 0, 0, true,
     array['acido', 'acido muriatico']::text[]),
  -- 7 pedidos historicos
  (4, 'Balde de albañil 20lts', 'unid', 0, 0, 0, true,
     array['baldes de 20l', 'bades de 20l', 'baldes de 20 con manija de alambre hechos']::text[]),
  -- 7 pedidos historicos
  (4, 'Manguera de nivel', 'm', 0, 0, 0, true,
     array['manguera de nivel 15ml', 'manguera de nivel de 15ml', 'manguera nivel', 'manguera de nicel 10m']::text[]),
  -- 6 pedidos historicos
  (4, 'Alambrón', 'kg', 0, 0, 0, true,
     array['alambrones']::text[]),
  -- 6 pedidos historicos
  (4, 'Manguera de agua 1/2"', 'm', 0, 0, 0, true,
     array['manguera', 'magueras', 'maguera de agua', 'maguera 50ml', 'manguera de 1/2”', 'manguera de riego']::text[]),
  -- 5 pedidos historicos
  (4, 'Pico', 'unid', 0, 0, 0, true,
     array['picos']::text[]),
  -- 5 pedidos historicos
  (4, 'Piola de albañil x 50m', 'rollo', 0, 0, 0, true,
     array['piola', 'piola de 40ml', 'piola grues', 'piola gruesa 40ml', 'piola larga']::text[]),
  -- 5 pedidos historicos
  (4, 'Revoque fino interior x 30kg', 'bolsa', 0, 0, 0, true,
     array['bolsa de fino', 'bolsa de fino interior', 'bolsas de fino interior']::text[]),
  -- 4 pedidos historicos
  (4, 'Malla plástica p/ revoque', 'm2', 0, 0, 0, true,
     array['malla plastica', 'malla plastica para revoque']::text[]),
  -- 4 pedidos historicos
  (4, 'Nivel de burbuja 1m', 'unid', 0, 0, 0, true,
     array['nivel burbuja', 'nivel de mano', 'nivel de mano de 1mts']::text[]),
  -- 4 pedidos historicos
  (4, 'Puente de adherencia (Sika Látex) x 4lts', 'lata', 0, 0, 0, true,
     array['sika latex']::text[]),
  -- 3 pedidos historicos
  (4, 'Ferrite negro', 'kg', 0, 0, 0, true,
     array['ferrite']::text[]),
  -- 2 pedidos historicos
  (4, 'Pegamento impermeable x 30kg', 'bolsa', 0, 0, 0, true,
     array['bolsas de pegamento impermeable', 'pegamento impermeable']::text[]),
  -- 1 pedidos historicos
  (4, 'Cemento blanco x 25kg', 'bolsa', 0, 0, 0, true,
     array['cemento blanco']::text[]),
  -- 1 pedidos historicos
  (4, 'Estaca de madera p/ replanteo', 'unid', 0, 0, 0, true,
     array['estacas']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 5 - Pintura  (14 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 18 pedidos historicos
  (5, 'Rodillo epoxi N°10', 'unid', 0, 0, 0, true,
     array['rodillo epoxi 10', 'rodillo epoxi n10', 'rodillos epoxi n10', 'rodillos expoxi n10']::text[]),
  -- 16 pedidos historicos
  (5, 'Brocha N°15', 'unid', 0, 0, 0, true,
     array['brocha', 'brochas', 'brochas 15']::text[]),
  -- 15 pedidos historicos -- nombre alineado con la familia 'Pincel 1"' (361),
  -- 'Pincel 2"' (128), 'Pincel 3"' (129), 'Pincel 4"' (362). El N° vive en los
  -- alias, igual que en las hermanas.
  (5, 'Pincel 2-1/2"', 'unid', 0, 0, 0, true,
     array['pincel de 25', 'pincel n2,5', 'pincel n25', 'pincel n25 traso fina', 'pinceles de 25', 'pinceles n25']::text[]),
  -- 8 pedidos historicos -- cierra el hueco del 120 en la familia 'Lija al agua'
  -- (60/80/100/150/220/320/400). Los 4 alias del 120 ('lija 120', 'lija n120',
  -- 'lijas 120', 'lijas n120') SE QUEDAN ENTEROS en el id 374 'Lija p/ madera
  -- N°120': el texto libre no dice si es al agua o para madera, y partirlos por
  -- la 's' del plural era el bug. Esta fila se elige a mano hasta que aparezca
  -- un pedido que diga 'al agua'.
  (5, 'Lija al agua N°120', 'unid', 0, 0, 0, true,
     '{}'::text[]),
  -- 7 pedidos historicos
  (5, 'Latex p/ cielorraso x 20lts', 'lata', 0, 0, 0, true,
     array['pintura cielo raso', 'pintura cielo raso z10', 'pintura para cielorraso', 'lata cielorraso 20 lts', 'latex cielorraso', 'latex cielorraso exterior']::text[]),
  -- 7 pedidos historicos -- alias 'palo extensible o palo de escoba largo'
  -- BORRADO: pedido combinado/alternativo
  (5, 'Palo extensible p/ rodillo', 'unid', 0, 0, 0, true,
     array['palo extensible', 'palo extensible verde', 'mangos extensibles para rodillo']::text[]),
  -- 6 pedidos historicos
  (5, 'Latex satinado interior x 20lts', 'lata', 0, 0, 0, true,
     array['pintura satina', 'pintura satinada 6105', 'pintura satinada c6105', 'latex satinado interior', 'loxon larga duracion antimanchas satinado sw6105']::text[]),
  -- 5 pedidos historicos -- ver nota de familia en 'Pincel 2-1/2"'
  (5, 'Pincel 1-1/2"', 'unid', 0, 0, 0, true,
     array['pincel 15', 'pincel de 15', 'pincel n15']::text[]),
  -- 5 pedidos historicos -- se lleva 'rodillo peludo' Y 'rodillos peludos' del
  -- id 126 (pelo corto). En obra "peludo" = pelo largo.
  (5, 'Rodillo lana pelo largo 23cm', 'unid', 0, 0, 0, true,
     array['rodillo n22 pelo largo', 'rodillo peludo', 'rodillos n22 pelo largo', 'rodillos pelo largo n22', 'rodillos peludos']::text[]),
  -- 3 pedidos historicos
  (5, 'Esmalte sintético naranja x 4lts', 'lata', 0, 0, 0, true,
     array['pintura naranja']::text[]),
  -- 3 pedidos historicos
  (5, 'Pintura demarcación vial amarilla x 4lts', 'lata', 0, 0, 0, true,
     array['pintura amarilla vial', 'pintura amarillo vial', 'pintura epoxi amarillo vial']::text[]),
  -- 2 pedidos historicos
  (5, 'Espátula 150mm', 'unid', 0, 0, 0, true,
     array['espatula 15 cm']::text[]),
  -- 2 pedidos historicos
  (5, 'Lija al agua N°180', 'unid', 0, 0, 0, true,
     array['lija 180', 'lijas 180']::text[]),
  -- 1 pedidos historicos
  (5, 'Removedor de pintura en gel x 1lt', 'lata', 0, 0, 0, true,
     array['removedor en gel']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 6 - Ferretería general  (52 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 25 pedidos historicos -- alias 'escoba + cepillo de acero' y
  -- 'escoba (fina, que barra!!!)' BORRADOS (pedido combinado / ruido)
  (6, 'Escoba', 'unid', 0, 0, 0, true,
     array['escobas']::text[]),
  -- 19 pedidos historicos
  (6, 'Bolsa para escombro', 'unid', 0, 0, 0, true,
     array['bolsas para escombro', 'bolsas de escombro', 'bolsas de escobros', 'bosas de escombro', 'bolsa de residuo']::text[]),
  -- 13 pedidos historicos -- decimal, como toda la familia: id 386 'Clavos 1"',
  -- 387 'Clavos 1.5"', 107 'Clavos 2"', 108 'Clavos 3"', 388 'Clavos 4"'
  (6, 'Clavos 2.5"', 'kg', 0, 0, 0, true,
     array['clavo 2.5"', 'clavo de 2 1/2"', 'clavos 2 1/2', 'clavos 2,5', 'clavos 2,5"']::text[]),
  -- 13 pedidos historicos
  (6, 'Trapo de piso', 'unid', 0, 0, 0, true,
     array['trapos de piso']::text[]),
  -- 11 pedidos historicos
  (6, 'Aragán (secador de piso) 45cm', 'unid', 0, 0, 0, true,
     array['aragan', 'araganes grandes con cabo', 'secador de piso']::text[]),
  -- 11 pedidos historicos
  (6, 'Pistola p/ cartucho de silicona', 'unid', 0, 0, 0, true,
     array['pistola de silicona', 'pistola para cartuchos', 'pistola de cartucho grande', 'pistola para silicona', 'pistola grande de silicona', 'pistola parta cartucho grande']::text[]),
  -- 11 pedidos historicos
  (6, 'Ruleta (cinta métrica) 5m', 'unid', 0, 0, 0, true,
     array['ruleta', 'ruleta x 5mts', 'cinta metrica', 'cinta metrica 5 mts']::text[]),
  -- 9 pedidos historicos
  (6, 'Tenaza', 'unid', 0, 0, 0, true,
     array['tenasa', 'tenaza bahco nueva']::text[]),
  -- 8 pedidos historicos
  (6, 'Lápiz de carpintero', 'unid', 0, 0, 0, true,
     array['lapi', 'lapiz', 'lapices', 'lapis']::text[]),
  -- 8 pedidos historicos -- alias 'masa' BORRADO: compite con 'masa de goma'
  -- (Maza de goma) y por trigrama con 'masilla' (id 80)
  (6, 'Maza de acero 3kg', 'unid', 0, 0, 0, true,
     array['maza', 'masa chica']::text[]),
  -- 7 pedidos historicos
  (6, 'Ménsula metálica', 'unid', 0, 0, 0, true,
     array['mensula', 'mensulas', 'mensula n62', 'mensulas para la mesada', 'mensulas dispenser', 'mensulas ajuste mampara']::text[]),
  -- 7 pedidos historicos
  (6, 'Virulana de acero', 'unid', 0, 0, 0, true,
     array['paquete de virulana', 'paquete de virulana acero', 'paquetes de viruta', 'paquetes de viruta mediana', 'viruta mediana', 'virutas finas']::text[]),
  -- 6 pedidos historicos
  (6, 'Bolsa de arpillera', 'unid', 0, 0, 0, true,
     array['bolsas vacias', 'bolsas de vacias', 'bolsas vacias alpilleras', 'bolsas para alpillera', 'bolsas arpillera']::text[]),
  -- 6 pedidos historicos -- alias 'punta' pelado BORRADO: competia con
  -- 'punta filip'/'puntas philips' y con 'punta aguja' de los tornillos T1/T2
  (6, 'Punta (cincel) p/ martillo demoledor', 'unid', 0, 0, 0, true,
     array['punta demoledores', 'punta de demoledores grandes', 'punta corta con encastre para demoledor amarillo', 'puntas de los demoledores grande']::text[]),
  -- 5 pedidos historicos
  (6, 'Cepillo de acero c/ cabo', 'unid', 0, 0, 0, true,
     array['cepillo de acero', 'cepillos de acero con cabo', 'cepillos de acero mango largo', 'sepillo de acero']::text[]),
  -- 5 pedidos historicos
  (6, 'Franela', 'unid', 0, 0, 0, true,
     array['franelas']::text[]),
  -- 5 pedidos historicos
  (6, 'Maza de goma', 'unid', 0, 0, 0, true,
     array['masa de goma', 'masas de goma']::text[]),
  -- 5 pedidos historicos
  (6, 'Pila alcalina AAA', 'unid', 0, 0, 0, true,
     array['pilas aaa', 'pilas triple a']::text[]),
  -- 5 pedidos historicos
  (6, 'Punta Phillips PH2 p/ atornillador', 'unid', 0, 0, 0, true,
     array['punta filip', 'puntas filip', 'puntas philips']::text[]),
  -- 5 pedidos historicos
  (6, 'Tarugo p/ ladrillo hueco 8mm', 'unid', 0, 0, 0, true,
     array['tacos del 8 ladrillo hueco', 'tacos para ladrillos hueco n8', 'tornillos n8 fischer ladrillo hueco']::text[]),
  -- 4 pedidos historicos -- contenido en el nombre, envase en `unidad`
  (6, 'Detergente x 5lts', 'unid', 0, 0, 0, true,
     array['detergente']::text[]),
  -- 4 pedidos historicos
  (6, 'Escobillón', 'unid', 0, 0, 0, true,
     array['escobillon chico con cabo', 'escobillones']::text[]),
  -- 4 pedidos historicos -- contenido en el nombre, envase en `unidad`
  (6, 'Lavandina x 5lts', 'unid', 0, 0, 0, true,
     array['lavandina', 'lavandinas']::text[]),
  -- 4 pedidos historicos -- alias 'francesa + 1kg de electrodos' BORRADO
  (6, 'Llave francesa 10"', 'unid', 0, 0, 0, true,
     array['francesa', 'llave francesa grande para la maquina']::text[]),
  -- 4 pedidos historicos
  (6, 'Lubricante penetrante en aerosol (WD-40)', 'unid', 0, 0, 0, true,
     array['wd 40', 'wd 40 de 432cm3', 'lubricante', 'aerosol lubricante']::text[]),
  -- 4 pedidos historicos
  (6, 'Martillo carpintero c/ saca clavos', 'unid', 0, 0, 0, true,
     array['martillo', 'martillos saca clavos', 'martilo']::text[]),
  -- 4 pedidos historicos
  (6, 'Rueda p/ portón corredizo 80mm', 'unid', 0, 0, 0, true,
     array['ruedas 80mm', 'ruedas de 80 porton con carrito']::text[]),
  -- 3 pedidos historicos
  (6, 'Cable de acero 10mm', 'm', 0, 0, 0, true,
     array['cable de acero n10']::text[]),
  -- 3 pedidos historicos
  (6, 'Cinta de embalar transparente 48mm', 'rollo', 0, 0, 0, true,
     array['cinta de embalar', 'cinta 48mmx90 mts']::text[]),
  -- 3 pedidos historicos
  (6, 'Destornillador Phillips N°2 x 100mm', 'unid', 0, 0, 0, true,
     array['destornillador philips', 'destornillador phillips']::text[]),
  -- 3 pedidos historicos
  (6, 'Esponja', 'unid', 0, 0, 0, true,
     array['esponja para lavar los platos', 'esponjas']::text[]),
  -- 3 pedidos historicos
  (6, 'Fleje perforado galvanizado', 'rollo', 0, 0, 0, true,
     array['cinta perforada']::text[]),
  -- 3 pedidos historicos -- alias 'pinza de fuerza y alicate' BORRADO
  (6, 'Pinza de fuerza 10"', 'unid', 0, 0, 0, true,
     array['pinza de fuerza']::text[]),
  -- 3 pedidos historicos
  (6, 'Remache pop 4.0mm', 'unid', 0, 0, 0, true,
     array['remache', 'remaches']::text[]),
  -- 3 pedidos historicos
  (6, 'Tacho plástico 200lts', 'unid', 0, 0, 0, true,
     array['tacho de 200', 'tacho de 200lts vacio', 'tacho de 200 plastico, entero o a la mitad']::text[]),
  -- 3 pedidos historicos
  (6, 'Tirafondo 8mm', 'unid', 0, 0, 0, true,
     array['tirafondos del 8', 'tacos con tirafondo del 8']::text[]),
  -- 2 pedidos historicos -- movida desde rubro 3: vive en el mismo cajon del
  -- pañol que 'Punta Phillips PH2 p/ atornillador'
  (6, 'Boquilla p/ atornillador de autoperforantes', 'unid', 0, 0, 0, true,
     array['boquilla para autoperforantes', 'boquillas']::text[]),
  -- 2 pedidos historicos
  (6, 'Bolsa de consorcio', 'unid', 0, 0, 0, true,
     array['bolsas de consorcio', 'bolsas para basura']::text[]),
  -- 2 pedidos historicos
  (6, 'Cepillo p/ ropa', 'unid', 0, 0, 0, true,
     array['cepillo para ropa mediano']::text[]),
  -- 2 pedidos historicos
  (6, 'Cilindro de cerradura europerfil c/ llaves', 'unid', 0, 0, 0, true,
     array['cilindro con llaves', 'cilindro euro perfil puerta entrada']::text[]),
  -- 2 pedidos historicos -- ver nota "GASOIL" al pie: queda a decision del dueño
  (6, 'Gasoil', 'lt', 0, 0, 0, true,
     array['gaosil']::text[]),
  -- 2 pedidos historicos
  (6, 'Llave grifa (stilson) 12"', 'unid', 0, 0, 0, true,
     array['grinfa del 12']::text[]),
  -- 2 pedidos historicos
  (6, 'Pila alcalina AA', 'unid', 0, 0, 0, true,
     array['pilas aa']::text[]),
  -- 2 pedidos historicos
  (6, 'Pinza pico de loro 10"', 'unid', 0, 0, 0, true,
     array['pico de loro', 'pico loro']::text[]),
  -- 2 pedidos historicos -- alias 'tanza' pelado se mudo a 'Tanza de replanteo'
  -- (10 pedidos contra 2). Esta fila se elige a mano.
  (6, 'Tanza p/ desmalezadora', 'unid', 0, 0, 0, true,
     '{}'::text[]),
  -- 2 pedidos historicos
  (6, 'Tarugo fisher 12mm c/tornillo', 'unid', 0, 0, 0, true,
     array['taco con tornillo del 12', 'tacos con tornillos del 12']::text[]),
  -- 2 pedidos historicos
  (6, 'Tope de puerta', 'unid', 0, 0, 0, true,
     array['topes de puerta']::text[]),
  -- 2 pedidos historicos
  (6, 'Tornillo madera 6x127mm', 'unid', 0, 0, 0, true,
     array['tornillo madera de 5 "', 'tornillos madera 5 "']::text[]),
  -- 2 pedidos historicos
  (6, 'Trapo rejilla', 'unid', 0, 0, 0, true,
     array['trapo rejilla amarilla', 'trapo rejilla cocina']::text[]),
  -- 2 pedidos historicos -- alias 'tuercas' pelado BORRADO: compite con los 5
  -- bulones c/tuerca (ids 140/141/389/390/391) y con el gancho J
  (6, 'Tuerca hexagonal 8mm', 'unid', 0, 0, 0, true,
     '{}'::text[]),
  -- 1 pedidos historicos
  (6, 'Cabo de madera p/ herramienta', 'unid', 0, 0, 0, true,
     array['cabo madera']::text[]),
  -- 1 pedidos historicos
  (6, 'Hoja de trincheta', 'unid', 0, 0, 0, true,
     array['hojas de trincheta']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 7 - Herrería  (14 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 10 pedidos historicos -- nombre alineado con la familia 'Disco <tipo> <mm>'
  -- (id 441 'Disco diamantado 115mm', 167 'Disco corte 115mm', 717 'Disco flap
  -- 115mm'). OJO: el 441 se queda con los 11 alias que dicen 'widia 4 1/2', asi
  -- que un pedido escrito como widia va a seguir cayendo alli aunque sea para
  -- porcelanato. Se acepta: 'widia' no dice continuo ni segmentado.
  (7, 'Disco diamantado continuo 115mm', 'unid', 0, 0, 0, true,
     array['disco para porcelanato', 'disco para porcelanato 4 1/2', 'disco porcelanato 4 1/2', 'disco para ceramico 4 1/2', 'disco ceramico 4”', 'disco para porcelanato de 4"']::text[]),
  -- 7 pedidos historicos
  (7, 'Mecha widia 10mm', 'unid', 0, 0, 0, true,
     array['mecha de widia n10', 'mecha widia n10', 'mecha widia del 10, de 20cm o mas', 'mecha con encastre n10, largo de 30 cm']::text[]),
  -- 5 pedidos historicos
  (7, 'Disco diamantado 180mm', 'unid', 0, 0, 0, true,
     array['disco de widia de 7', 'disco de widia de7', 'disco de widia n7']::text[]),
  -- 5 pedidos historicos
  (7, 'Mecha widia 8mm', 'unid', 0, 0, 0, true,
     array['mecha del 8 widia', 'mecha widia n8']::text[]),
  -- 4 pedidos historicos
  (7, 'Caño estructural 20x20x1.6', 'unid', 0, 0, 0, true,
     array['cano estrutural 20x20', 'canos 20x20', 'tramo de 1 metro de 20x20', 'tubos 20x20']::text[]),
  -- 4 pedidos historicos
  (7, 'Ángulo 1" x 3/16" x 6m', 'unid', 0, 0, 0, true,
     array['angulo 1" x 3/16', 'angulo 1"x 3/16', 'angulo 1"x3/16"x6', 'angulos 1" x 3/16']::text[]),
  -- 3 pedidos historicos -- alias 'estructural 40x100 1.6' BORRADO: 1.6mm de
  -- espesor, no 2mm
  (7, 'Caño estructural 100x40x2', 'unid', 0, 0, 0, true,
     array['cano 40x100x2.0', 'estructural 40x100x2']::text[]),
  -- 3 pedidos historicos
  (7, 'Mecha widia 12mm', 'unid', 0, 0, 0, true,
     array['mecha widia 12', 'mechas de widia nro 12', 'mecha del 12']::text[]),
  -- 3 pedidos historicos
  (7, 'Mecha widia 6mm', 'unid', 0, 0, 0, true,
     array['mecha del 6', 'mecha del 6 con encastre', 'mecha del 6 de widia, de 12cm de largo']::text[]),
  -- 2 pedidos historicos
  (7, 'Caño redondo 3" x 6m', 'unid', 0, 0, 0, true,
     array['canos mecanicos 3"']::text[]),
  -- 2 pedidos historicos -- alias 'chapon de 1.50x2' BORRADO: otra medida
  (7, 'Chapón de hierro liso 1/8" 1.22x2.44', 'unid', 0, 0, 0, true,
     array['chapon de 120x210 de 1/8 liso']::text[]),
  -- 2 pedidos historicos -- nombre alineado con la familia 'Disco <tipo> <mm>'
  (7, 'Disco desbaste 115mm', 'unid', 0, 0, 0, true,
     array['discos de desbaste 4 1/2']::text[]),
  -- 2 pedidos historicos -- nombre alineado con la familia 'Mecha <tipo> <mm>'
  -- (445 'Mecha acero rápido 10mm', 447 'Mecha copa bimetálica 32mm')
  (7, 'Mecha madera 12mm', 'unid', 0, 0, 0, true,
     array['mecha de madera nro 12', 'mecha para madera 12']::text[]),
  -- 2 pedidos historicos
  (7, 'Regatón plástico p/ caño 30x30', 'unid', 0, 0, 0, true,
     array['regatones 30x30']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 8 - Aislación e impermeab.  (2 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 5 pedidos historicos
  (8, 'Sellador acrílico pintable x 300ml', 'unid', 0, 0, 0, true,
     array['sikacryl', 'sikacryl profesional', 'silicona blanca pintable', 'siliconas blancas pintables', 'siliconas pintables']::text[]),
  -- 2 pedidos historicos
  (8, 'Cinta de aluminio autoadhesiva 48mm', 'rollo', 0, 0, 0, true,
     array['cinta metalizada']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 9 - Techado y cubiertas  (4 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 14 pedidos historicos
  (9, 'Babeta de chapa plegada', 'm', 0, 0, 0, true,
     array['babeta de 10ml', 'babeta de 3ml', 'babetas 6ml', 'babetas de 2ml', 'babetas de 2,5ml cada una', 'babetas de 3ml cada una']::text[]),
  -- 10 pedidos historicos -- nombre sin marca, alineado con la familia
  -- 'Sellador <quimica> x 300ml' (id 179 'Sellador poliuretano x 300ml', que es
  -- el gris). El 3M 550 es poliuretano negro; la marca baja a los alias.
  (9, 'Sellador poliuretano negro x 300ml', 'unid', 0, 0, 0, true,
     array['sellador 3m 550', 'sellador canaletas', 'sellador de canaleta 3m 550 negro', 'sellador de canaletas', 'sellador para canaletas']::text[]),
  -- 7 pedidos historicos -- alias 'chapas de zingueria calibre25 1.22x240'
  -- BORRADO: es chapa suelta, no un rollo (pertenece a la familia 'Chapa lisa
  -- 1.25x2.50 N°..', ids 429/430)
  (9, 'Chapa galvanizada lisa C25', 'rollo', 0, 0, 0, true,
     array['rollo chapa calibre 25 x 20 mts', 'rollo de chapa', 'rollo de chapa cal 25', 'rollo de chapa calibre 25', 'rollo de chapa galvanizada lisa calibre 25']::text[]),
  -- 2 pedidos historicos
  (9, 'Gancho J c/ tuerca y arandela', 'unid', 0, 0, 0, true,
     array['ganchos j con tuercas y arandelas', 'grampas para techo']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 10 - Aberturas  (2 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 2 pedidos historicos
  (10, 'Traba p/ ventana de aluminio', 'unid', 0, 0, 0, true,
     array['trabas ventana aluminio']::text[]),
  -- 1 pedidos historicos
  (10, 'Tela mosquitera', 'm2', 0, 0, 0, true,
     array['telas mosquiteras']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 11 - Pisos y revestimientos  (4 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 4 pedidos historicos
  (11, 'Listel de terminación acero inoxidable 2.5m', 'unid', 0, 0, 0, true,
     array['listel 1/4 de cana x 2,5m acero inoxidable', 'listel acero inoxidable 10x10 mm brillante', 'listeles 1/4 de cana x2.50m acero inoxidable']::text[]),
  -- 3 pedidos historicos
  (11, 'Cerámico piso 33x33', 'm2', 0, 0, 0, true,
     array['ceramico esmaltado mate forte blanco 33x33', 'ceramicos blancos 33x33', 'piezas ceramico 33x33 sn lorenzo']::text[]),
  -- 3 pedidos historicos
  (11, 'Rueda de repuesto p/ cortadora de cerámica', 'unid', 0, 0, 0, true,
     array['repuesto de cortadora', 'repuesto de cortadora de porcelanato', 'repuesto de la cortadora']::text[]),
  -- 2 pedidos historicos
  (11, 'Porcelanato 30x60', 'm2', 0, 0, 0, true,
     array['porcelanato 30x59', 'porcelanato 60x30 blanco']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 12 - Instalación de gas  (3 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 2 pedidos historicos
  (12, 'Caño de cobre 1/4"', 'm', 0, 0, 0, true,
     array['cano cobre 1/4']::text[]),
  -- 2 pedidos historicos
  (12, 'Flexible gas 1/2" x 60cm', 'unid', 0, 0, 0, true,
     array['flexible gas de 60cm']::text[]),
  -- 1 pedidos historicos
  (12, 'Cáñamo p/ sellado de roscas', 'unid', 0, 0, 0, true,
     array['canamo', 'hilo para sella rosca']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 13 - Carpintería  (2 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 5 pedidos historicos
  (13, 'Tirante pino 3x3" x 3.05m', 'unid', 0, 0, 0, true,
     array['tirantes 3”x3”x 3,05 m', 'tirantes 3"x3"x3,05m', 'tirantes 3x3x3.05', 'tirantes de 3x3x3.5']::text[]),
  -- 1 pedidos historicos
  (13, 'Serrucho', 'unid', 0, 0, 0, true,
     array['serruchos']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 14 - Hormigón y estructura  (2 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 2 pedidos historicos
  (14, 'Mortero de reparación estructural x 25kg', 'bolsa', 0, 0, 0, true,
     array['mono top']::text[]),
  -- 2 pedidos historicos
  (14, 'Puntal metálico regulable 2.5m', 'unid', 0, 0, 0, true,
     array['puntales de 2.5']::text[]);

-- -----------------------------------------------------------------------------
-- Rubro 15 - Seguridad y EPP  (9 materiales)
-- -----------------------------------------------------------------------------
insert into public.stock_materiales
  (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias)
values
  -- 10 pedidos historicos
  (15, 'Mandil de trabajo', 'unid', 0, 0, 0, true,
     array['mandil', 'mandiles', 'mandil goma espuma']::text[]),
  -- 5 pedidos historicos
  (15, 'Malla naranja de cerramiento', 'rollo', 0, 0, 0, true,
     array['tela de precaucion', 'tela naranja']::text[]),
  -- 4 pedidos historicos
  (15, 'Cono de señalización vial 50cm', 'unid', 0, 0, 0, true,
     array['conos', 'conos grandes']::text[]),
  -- 3 pedidos historicos -- los 2m son el ANCHO del rollo, no el alto: el
  -- nombre v1 se contradecia con su propio alias
  (15, 'Media sombra 2m', 'm', 0, 0, 0, true,
     array['mediasombra', 'rafia verdad de 2m de ancho']::text[]),
  -- 3 pedidos historicos
  (15, 'Poste delimitador de obra', 'unid', 0, 0, 0, true,
     array['pilotes para delimitar', 'postes de precaucion', 'postes perimetrales']::text[]),
  -- 2 pedidos historicos
  (15, 'Lona de obra', 'm2', 0, 0, 0, true,
     array['lonas de obra']::text[]),
  -- 1 pedidos historicos
  (15, 'Capa de lluvia naranja', 'unid', 0, 0, 0, true,
     array['capas naranja']::text[]),
  -- 1 pedidos historicos -- comillas dobles, como los ids 666/667/668
  (15, 'Cartel "Salida de emergencia"', 'unid', 0, 0, 0, true,
     array['cartel salida de emergencia']::text[]),
  -- 1 pedidos historicos
  (15, 'Protector facial', 'unid', 0, 0, 0, true,
     array['mascara facial']::text[]);


-- =============================================================================
-- BLOQUE 2 - renombres y reparto de alias sobre filas ya existentes
-- -----------------------------------------------------------------------------
-- Dos cosas:
--   (a) 2 RENOMBRES (ids 76 y 77) para cerrar la familia de tornillos T1/T2.
--   (b) el reparto de los alias que la Fase 1 sembro sobre la fila equivocada.
-- Regla que la v1 violaba y esta version respeta: cuando un alias se muda, se
-- mudan TAMBIEN sus gemelos singular/plural. Que 'lijas 120' caiga en una fila
-- y 'lija 120' en otra --decidido por una 's'-- es peor que no tener el alias.
-- Los array_remove son idempotentes; los agregados usan array_agg(distinct) asi
-- que tampoco duplican si el bloque se corre dos veces.
-- =============================================================================

-- (a) RENOMBRES ---------------------------------------------------------------
-- id 76: pasa a ser explicitamente la de punta aguja y suelta 't1 mecha'
-- (se va a la fila nueva) y 'punta aguja' pelado (no distingue T1/T2/T3).
update public.stock_materiales
   set nombre = 'Tornillo T1 punta aguja',
       alias  = array_remove(array_remove(alias, 't1 mecha'), 'punta aguja')
 where activo and nombre = 'Tornillo T1 autoperforante';

-- id 77: idem
update public.stock_materiales
   set nombre = 'Tornillo T2 punta aguja',
       alias  = array_remove(array_remove(alias, 't2 mecha'), 'punta aguja')
 where activo and nombre = 'Tornillo T2 autoperforante';

-- (b) ALIAS QUE SE VAN A LAS FILAS NUEVAS -------------------------------------
-- Arena a granel (ids 89 y 90) -> 'Arena x 25kg'
update public.stock_materiales
   set alias = array_remove(array_remove(array_remove(array_remove(alias, 'arena bolsas'), 'bolsa arena'), 'bolsa de arena'), 'bolsas de arena')
 where activo and nombre in ('Arena fina', 'Arena gruesa');

-- Piedra partida a granel (id 91, unidad tn) -> 'Piedra partida 1-3 x 25kg'.
-- Se van los 8 alias que dicen 'bolsa'; quedan los de granel ('1 al 3',
-- 'piedra 1 al 3', 'ripio'). 'bolsas de ripio bruto fino' NO se muda a la fila
-- nueva: describe otra granulometria (bruto/fino, no 1-3); se descarta.
update public.stock_materiales
   set alias = (select coalesce(array_agg(distinct e order by e), '{}'::text[])
                  from unnest(alias) e
                 where e <> all (array[
                       'bolsa de ripio', 'bolsa ripio 1 al 3', 'bolsas 1 al 3',
                       'bolsas de piedra 1 al 3', 'bolsas de ripio',
                       'bolsas de ripio 1 al 3', 'bolsas de ripio bruto fino',
                       'bolsas piedra 1 al 3']::text[]))
 where activo and nombre = 'Piedra partida';

-- Delantal de cuero soldador (id 662) -> 'Mandil de trabajo'
update public.stock_materiales
   set alias = array_remove(array_remove(array_remove(alias, 'mandil'), 'mandil goma espuma'), 'mandiles')
 where activo and nombre = 'Delantal de cuero soldador';

-- Prolongación 10m (id 281) -> 'Prolongación 15m'
update public.stock_materiales
   set alias = array_remove(alias, 'alargue 15ml')
 where activo and nombre = 'Prolongación 10m';

-- Rodillo pelo corto (id 126) -> 'Rodillo lana pelo largo 23cm'.
-- Se van los DOS ('rodillo peludo' y 'rodillos peludos'), no solo el plural.
update public.stock_materiales
   set alias = array_remove(array_remove(alias, 'rodillo peludo'), 'rodillos peludos')
 where activo and nombre = 'Rodillo lana pelo corto 23cm';

-- Sellador poliuretano x 300ml (id 179) -> 'Sellador poliuretano negro x 300ml'
update public.stock_materiales
   set alias = array_remove(alias, 'sellador 3m 550')
 where activo and nombre = 'Sellador poliuretano x 300ml';

-- (c) ALIAS QUE SE QUEDAN Y ADEMAS ABSORBEN LOS DE LAS ALTAS DESCARTADAS -------
-- Membrana líquida x 20kg (id 173) YA ES la fibrada: sus alias son
-- 'sikafill fibrado', 'sikafill fibrado blanco', 'baldes sikafill fibrado rojo
-- 20 kg'. No se inserta una segunda fila balde/20kg; se le suman las variantes
-- que faltaban. NO se renombra para no romper la familia
-- 'Membrana líquida x 5kg / x 10kg / x 20kg' (ids 453/174/173).
update public.stock_materiales
   set alias = (select coalesce(array_agg(distinct e order by e), '{}'::text[])
                  from unnest(alias || array['membrana liquida fibrada',
                                             'membrana liquida fibrada blanca']::text[]) e)
 where activo and nombre = 'Membrana líquida x 20kg';

-- Tarugo fisher 8mm c/tornillo (id 383): NO se le saca 'tornillos para taco del
-- 8'. El corralon entrega el fisher CON tornillo, asi que la fila del tornillo
-- suelto no se crea y todos los pedidos 'tornillos para taco del 8' se quedan
-- aca. Se le suman las variantes que la v1 se llevaba a la fila descartada.
update public.stock_materiales
   set alias = (select coalesce(array_agg(distinct e order by e), '{}'::text[])
                  from unnest(alias || array['tornillos apra tacos del 8',
                                             'tornillo dorado para el taco del 8']::text[]) e)
 where activo and nombre = 'Tarugo fisher 8mm c/tornillo';

-- Tarugo fisher 6mm c/tornillo (id 382): idem.
-- 'tornillo del 6' NO se suma: generico, compite con media ferreteria.
update public.stock_materiales
   set alias = (select coalesce(array_agg(distinct e order by e), '{}'::text[])
                  from unnest(alias || array['tornillos para taco 6',
                                             'tornillos para tacos del 6']::text[]) e)
 where activo and nombre = 'Tarugo fisher 6mm c/tornillo';


-- =============================================================================
-- CAMBIOS v1 -> v2  (que se saco y por que)
-- =============================================================================
--
-- ALTAS ELIMINADAS DEL INSERT: 8 filas (185 -> 177)
-- --------------------------------------------------
-- Van al modulo Herramientas, no a stock (decision del dueño 2026-09-02: el
-- bien durable que se persigue entre obras se rastrea por Herramientas; la
-- herramienta de mano barata y reponible se queda en stock). Hay 99 pedidos
-- historicos de traslado entre obras que lo justifican:
--   1. Carretilla                        (rubro 4, 16 pedidos)
--   2. Tablón metálico p/ andamio        (rubro 6,  5 pedidos)
--   3. Caja de herramientas vacía        (rubro 6,  6 pedidos)
--   4. Juego de llaves tubo              (rubro 6,  3 pedidos)
--
-- Duplicado semantico con una fila que ya existe:
--   5. Membrana líquida fibrada x 20kg   (rubro 8) -- el id 173 'Membrana
--      líquida x 20kg' YA es la fibrada (todos sus alias dicen 'sikafill
--      fibrado'). Se le suman los alias en el BLOQUE 2 (c).
--   6. Tornillo p/ tarugo N°8            (rubro 6) -- el id 383 'Tarugo fisher
--      8mm c/tornillo' es el combo que entrega el corralon. Tres filas
--      peleandose los pedidos que dicen 'del 8' terminaban en tornillos sin
--      tacos. Alias absorbidos por el 383.
--   7. Tornillo p/ tarugo N°6            (rubro 6) -- idem con el id 382.
--
-- Ambigua contra una familia dimensionada que ya existe:
--   8. Correa perfil C galvanizada x 6m  (rubro 9, 1 pedido) -- conviviria sin
--      seccion con los ids 153/154/155/412/413 ('Perfil C 80x40x15 x 6m', etc).
--      Su unico alias, 'perfiles de correa x 6 ml', tampoco trae la seccion, asi
--      que no hay a que fila colgarlo: se descarta el alias tambien. Cuando
--      aparezca un pedido con seccion, se usa la fila de rubro 7 que corresponda.
--
-- RENOMBRES DE FILAS EXISTENTES: 2  (BLOQUE 2 (a))
-- ------------------------------------------------
--   id 76  'Tornillo T1 autoperforante' -> 'Tornillo T1 punta aguja'
--   id 77  'Tornillo T2 autoperforante' -> 'Tornillo T2 punta aguja'
--
-- NOMBRES CORREGIDOS EN EL INSERT (rompian la familia o se contradecian)
-- ----------------------------------------------------------------------
--   'Pincel N°25 (2-1/2")'                    -> 'Pincel 2-1/2"'
--   'Pincel N°15 (1-1/2")'                    -> 'Pincel 1-1/2"'
--   'Clavos 2 1/2"'                           -> 'Clavos 2.5"'
--   'Cartel salida de emergencia'             -> 'Cartel "Salida de emergencia"'
--   'Disco de desbaste 115mm'                 -> 'Disco desbaste 115mm'
--   'Mecha para madera 12mm'                  -> 'Mecha madera 12mm'
--   'Disco diamantado continuo p/ porcelanato 115mm'
--                                             -> 'Disco diamantado continuo 115mm'
--   'Sellador de carrocería 3M 550 negro x 300ml'
--                                             -> 'Sellador poliuretano negro x 300ml'
--   'Tornillo T3 autoperforante'              -> 'Tornillo T3 punta aguja'
--   'Flexible cromado 40cm p/ desagüe de pileta'
--                                             -> 'Desagüe flexible cromado 40cm p/ pileta'
--   'Térmica tripolar 3x32A curva C'          -> 'Térmica tripolar'   (los 32A y
--        la curva C estaban inventados: el unico pedido dice 'llave termica
--        tripolar general'. Comprar mal el calibre es plata y un tablero rehecho)
--   'Media sombra 2m de alto'                 -> 'Media sombra 2m'    (los 2m son
--        el ancho del rollo, como dice su propio alias)
--
-- UNIDADES CORREGIDAS (contenido al nombre, envase a `unidad`)
-- ------------------------------------------------------------
--   'Ácido muriático' (lt)  -> 'Ácido muriático x 1lt' (unid)
--   'Lavandina'       (lt)  -> 'Lavandina x 5lts'      (unid)
--   'Detergente'      (lt)  -> 'Detergente x 5lts'     (unid)
--   Con 'lt' el capataz que cargaba "2" no sabia si pedia 2 litros o 2 bidones.
--   El CHECK de `unidad` no tiene 'bidón', asi que el envase queda en 'unid',
--   igual que el id 326 'Hidrófugo x 5lts'.
--
-- RUBRO CORREGIDO: 1
-- ------------------
--   'Boquilla p/ atornillador de autoperforantes': rubro 3 -> rubro 6, para que
--   viva en el mismo cajon del pañol que 'Punta Phillips PH2 p/ atornillador'.
--
-- ALIAS BORRADOS: 19
-- ------------------
-- (i) Describen OTRA MEDIDA que la fila que los recibia -> hacian comprar mal:
--   'desplazador 3 cm'                      (iba a Desplazador p/ inodoro 5cm)
--   'placas cielorraso 1.2x0.6'             (iba a Placa 60x60; 1.2x0.6 es la de 60x120)
--   'chapas de zingueria calibre25 1.22x240'(iba a Chapa galvanizada lisa C25, unidad rollo)
--   'chapon de 1.50x2'                      (iba a Chapón 1.22x2.44)
--   'estructural 40x100 1.6'                (iba a Caño estructural 100x40x2)
--   'bolsas de ripio bruto fino'            (otra granulometria que 1-3)
--
-- (ii) Genericos que roban pedidos ajenos (si el alias no alcanza para elegir
--      una fila sin preguntar, no es alias):
--   'punta'              (Punta cincel) -- competia con 'punta filip' y 'punta aguja'
--   'grampas'            (Grampa p/ caño rígido 3/4") -- vs id 276 y 'grampas para techo'
--   'tuercas'            (Tuerca hexagonal 8mm) -- vs los 5 bulones c/tuerca
--   'masa'               (Maza de acero 3kg) -- vs 'masa de goma' y 'masilla' (id 80)
--   'cable tipo taller'  (2x1.5mm²) -- no distingue del 3x2.5mm²
--   'punta aguja'        (ids 76 y 77) -- no distingue T1 de T2 de T3
--   'tanza'              MOVIDO de 'Tanza p/ desmalezadora' (2 pedidos) a
--                        'Tanza de replanteo' (10 pedidos)
--   'tornillo del 6' / 'tornillos del 8' -- no se sembraron: chocan con
--                        tirafondos, tarugos y autoperforantes del mismo numero
--
-- (iii) Pedidos combinados o con ruido (no identifican una fila):
--   'escoba + cepillo de acero', 'escoba (fina, que barra!!!)'
--   'francesa + 1kg de electrodos'
--   'pinza de fuerza y alicate'
--   'alargue o tablero', 'alargue + tablero'
--   'palo extensible o palo de escoba largo'
--
-- ALIAS AGREGADOS
-- ---------------
--   Los 8 con 'bolsa' que estaban en 'Piedra partida' (tn) -> a la fila en bolsa.
--   'rodillo peludo' (faltaba el singular) -> a 'Rodillo lana pelo largo 23cm'.
--   'membrana liquida fibrada' + '...blanca' -> al id 173.
--   'tornillos apra tacos del 8', 'tornillo dorado para el taco del 8' -> id 383.
--   'tornillos para taco 6', 'tornillos para tacos del 6' -> id 382.
--   'tanza' -> 'Tanza de replanteo'.
--   Plurales sembrados en filas que entraban con alias vacio (era el unico
--   mecanismo por el que se las iba a encontrar): trapos de piso, franelas,
--   esponjas, escobillones, serruchos, telas mosquiteras, picos, palas de
--   punta / pala punta, alambrones, lavandina(s), detergente, acido muriatico,
--   cartel salida de emergencia, lija 180, mecha para madera 12.
--
-- LO QUE QUEDA PENDIENTE DE UNA DECISION DEL DUEÑO (no bloquea, pero anotado)
-- ---------------------------------------------------------------------------
--   * KILAJE A CONFIRMAR: 'Arena x 25kg' y 'Piedra partida 1-3 x 25kg'. En los
--     corralones de la zona hay bolsas de 25 y de 30kg. Si el nombre miente hay
--     que rehacer estas dos filas. Tampoco distinguen arena fina de gruesa,
--     como si lo hace el granel (ids 89 y 90).
--   * GASOIL (rubro 6): el ERP ya lo trackea por gastos de logistica. Si queda
--     en el catalogo de materiales se cuenta dos veces. Se dejo por ahora.
--   * Nombres incompletos que el pañol no puede pedir sin llamar por telefono:
--     'Prensacable PG' (falta PG7/PG9/PG11), 'Remache pop 4.0mm' (falta el
--     largo), 'Tirafondo 8mm' (falta el largo), 'Estaño p/ soldar' (¿rollo?
--     ¿100g?). Se dejaron como los escribe la obra; se completan cuando compras
--     confirme el articulo que efectivamente se compra.
--   * 'Plafón LED 24W' junta en una fila el cuadrado luz fria y el circular luz
--     neutra (asi lo dicen sus dos alias). Si se mezclan en un mismo cielorraso
--     se ve; evaluar desdoblarla.
--   * 10 filas de limpieza y pañol (Detergente, Lavandina, Esponja, Trapo de
--     piso, Trapo rejilla, Franela, Virulana, Escoba, Escobillón, Bolsa de
--     consorcio) cayeron en 'Ferretería general' porque no hay rubro mejor.
--     Candidato a un rubro 17 'Limpieza y pañol'.
--   * Unidades opinables: 'Lona de obra' y 'Tela mosquitera' en m2, 'Malla
--     plástica p/ revoque' en m2 (viene en rollo), y las bolsas en 'unid'
--     cuando el corralon las vende por paquete de 10/25.
--   * created_by / updated_by quedan en NULL para las 177 filas: la auditoria no
--     va a poder decir quien cargo el catalogo. Si existe un usuario de sistema,
--     setearlo antes de aplicar.
--
-- =============================================================================
-- Verificacion sugerida post-aplicacion:
--   select count(*) from public.stock_materiales where activo;  -- esperado 895
--   -- ningun alias repetido entre dos filas activas:
--   select a, count(*) from public.stock_materiales, unnest(alias) a
--    where activo group by a having count(*) > 1;
--   -- la familia de tornillos T1/T2/T3 tiene que dar 5 filas:
--   select id, nombre, alias from public.stock_materiales
--    where activo and nombre like 'Tornillo T%' order by nombre;
-- =============================================================================
