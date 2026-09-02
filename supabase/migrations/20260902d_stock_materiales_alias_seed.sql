-- 20260902d_stock_materiales_alias_seed.sql
--
-- Siembra `stock_materiales.alias` con el vocabulario REAL de obra.
--
-- Contexto: 97,3% de los items de solicitud_compra_item se cargan como texto
-- libre porque la obra pide por el NOMBRE DE OBRA y el catalogo guarda el
-- NOMBRE TECNICO ("lija 150" vs "Lija al agua N°150", "alargue" vs
-- "Prolongacion 10m", "fletacho" vs "Fratacho espuma"). Este seed carga esas
-- formas de pedir como alias para que el buscador las cruce.
--
-- Fuente: analisis de los 3.108 items historicos de solicitud_compra_item.
-- Cada alias esta respaldado por al menos un pedido real del corpus.
--
-- Reglas aplicadas:
--   * Todo alias pasa por norm_material() al insertarse => queda minuscula,
--     sin tildes/ñ y con espacios colapsados. No hace falta pre-normalizar.
--   * No se carga el propio nombre del material (ya se busca por nombre).
--   * Se incluyen singular/plural, tipeos reales y siglas ('t1', 't2').
--
-- Idempotente: reemplaza el array completo por fila.

-- Helper efimero: normaliza + deduplica el array de alias de una fila.
-- Se dropea al final de la migracion.
create function public._seed_mk_alias(variadic p_alias text[])
returns text[] language sql immutable as $fn$
  select coalesce(array_agg(distinct norm_material(a) order by norm_material(a)), '{}'::text[])
  from unnest(p_alias) a
  where coalesce(trim(a), '') <> ''
$fn$;


-- ==========================================================================
-- BLOQUE A — familias del mapeo obra->catalogo (926 pedidos)
-- ==========================================================================

-- Disco corte 115mm
update stock_materiales set alias = public._seed_mk_alias(
  'disco de 115mm','disco de corte 115mm','disco de corte','discos de corte',
  'disco corte 4 1/2','disco de 4 1/2','disco de 4.1/2','disco de cort 4 1/2',
  'discos de corte 4 1/2','discos de corte de 4 1/2','disco de corte 4.1/2',
  'disco de corte metal','discos de corte metal','disco de corte metal 4.1/2',
  'disco de corte metal 115mm'
) where id = 167;

-- Cemento Portland x 25kg
update stock_materiales set alias = public._seed_mk_alias(
  'cemento','cementos','bolsa cemento','bolsas cemento',
  'bolsa de cemento','bolsas de cemento'
) where id = 87;

-- Tornillo T1 autoperforante
update stock_materiales set alias = public._seed_mk_alias(
  't1','t1 aguja','t1 mecha','t1 punta aguja','punta aguja','tornillo t1','tornillos t1'
) where id = 76;

-- Tornillo T2 autoperforante
update stock_materiales set alias = public._seed_mk_alias(
  't2','t2 aguja','t2 mecha','t2 punta aguja','punta aguja','tornillo t2','tornillos t2',
  'tornillos t2 aguja'
) where id = 77;

-- Guante de tela
update stock_materiales set alias = public._seed_mk_alias(
  'guantes','guantes de tela','guante tela','guantes tela','guantes de tela pares',
  'pares de guantes'
) where id = 692;

-- Electrodo 2.5mm x kg
update stock_materiales set alias = public._seed_mk_alias(
  'electrodo','electrodos','electrodo 2.5','electrodo 2,5','electrodos 2.5',
  'electrodos 2,5','electro 1/2 kg'
) where id = 165;

-- Balde de albañil 12lts
update stock_materiales set alias = public._seed_mk_alias(
  'balde','baldes','balde albañil','balde de albañil','baldes de albañil','balde + palita'
) where id = 340;

-- Estopa x bolsa
update stock_materiales set alias = public._seed_mk_alias(
  'estopa','estopas','estopà','estopa bolsa','bolsa de estopa','bolsas de estopa',
  'paquete de estopa'
) where id = 691;

-- Prolongación 10m
update stock_materiales set alias = public._seed_mk_alias(
  'alargue','alargues','alargador','alargadores','alalgue','alargue largo',
  'alargue corto','alargue cortos','alargue monofasico','alargue 15ml'
) where id = 281;

-- Cinta papel Durlock
update stock_materiales set alias = public._seed_mk_alias(
  'cinta de papel','cintas de papel','cinta papel','cinta de papel ancha',
  'cinta de papel amcha','rollos de cintas de papel 5cm'
) where id = 78;

-- Cinta aisladora
update stock_materiales set alias = public._seed_mk_alias(
  'cintas aisladoras','cinta aisladora chica','cinta aisladora grande',
  'cinta aisladora 3m grande','cinta aisladora super 33'
) where id = 61;

-- Lija al agua N°150
update stock_materiales set alias = public._seed_mk_alias(
  'lija 150','lijas 150','lija n150','lijas n150'
) where id = 131;

-- Lentes seguridad transparentes
update stock_materiales set alias = public._seed_mk_alias(
  'antiparra','antiparras','antiparras transparentes','anteojo transparente',
  'anteojos transparentes','gafa','gafas','gafas transparentes'
) where id = 644;

-- Guante descarne corto
update stock_materiales set alias = public._seed_mk_alias(
  'guante de descarne','guantes de descarne','guantes de descarnes',
  'gantes de descarnes','pares de guantes de descarnes','guante de cuero',
  'guantes de cuero','guantes para los herreros'
) where id = 720;

-- Pastina x 5kg
update stock_materiales set alias = public._seed_mk_alias(
  'pastina','pastina blanca','pastina marfil','pastina color marfil',
  'pastina color nogal klaukol','pastina talco','pastina kg'
) where id = 110;

-- Sellador poliuretano x 300ml
update stock_materiales set alias = public._seed_mk_alias(
  'sellador','selladores','sellador chico','pomo sellador','sellador + pistola',
  'sellador gris + pistola','sellador 3m 550','sellador hidro 3 mediano'
) where id = 179;

-- Regla de aluminio 2m
update stock_materiales set alias = public._seed_mk_alias(
  'regla 2m','regla 2ml','regla de 2m','reglas de 2 m','reglas de 2 ml',
  'reglas de 2 mts','reglas de 2m','reglas de 2ml'
) where id = 336;

-- Poximix (adhesivo epoxi pasta)
update stock_materiales set alias = public._seed_mk_alias(
  'poximix','poxi mix','poximix exterior','poximix grande exterior','bolsas poximix'
) where id = 697;

-- Enduido interior x 25kg
update stock_materiales set alias = public._seed_mk_alias(
  'enduido','enduido interior','tacho de enduido','tachos de enduido',
  'tachos de enduido 25 kg','tachos enduido interior'
) where id = 118;

-- Disco flap 115mm  (id 169 quedo dado de baja en la limpieza; el activo es 717)
update stock_materiales set alias = public._seed_mk_alias(
  'disco flap','discos flap','disco flap 4 1/2','disco flap de 4 1/2','disco flap 4.1/2'
) where id = 717;

-- Diluyente x 4lts
update stock_materiales set alias = public._seed_mk_alias(
  'thinner','thiner','tinner','thinner o aguarras','thinner x 5 lts'
) where id = 125;

-- Tarugo fisher 8mm c/tornillo
update stock_materiales set alias = public._seed_mk_alias(
  'taco 8','tacos 8','taco n8','tacos n8','taco del 8','tacos del 8',
  'tacos con tornillos del 8','tacos y tornillos del 8','tacos y tornillos n8',
  'tornillos con tacos del 8','tornillos n8 cn tacos','tornillos y tacos del 8',
  'tornillos para taco del 8'
) where id = 383;

-- Tarugo fisher 6mm c/tornillo
update stock_materiales set alias = public._seed_mk_alias(
  'taco 6','tacos 6','taco n6','tacos n6','taco del 6','tacos del 6',
  'taco y tornillo del 6','tacos y tornillos del 6','tacos y tornillos n6',
  'tornillos del 6 con tacos'
) where id = 382;

-- Tarugo fisher 10mm c/tornillo
update stock_materiales set alias = public._seed_mk_alias(
  'taco 10','tacos 10','taco n10','tacos n10','taco del 10','tacos del 10'
) where id = 384;

-- Solera 35mm x 2.60m
update stock_materiales set alias = public._seed_mk_alias(
  'solera 35','solera de 35','solera de 35 mm','soleras 35','soleras 035',
  'soleras de 35','soleras de 035','soleras de 0.35'
) where id = 73;

-- Solera 70mm x 2.60m
update stock_materiales set alias = public._seed_mk_alias(
  'solera 70','solera de 70','solera de 70 mm','soleras 70','soleras 070',
  'soleras de 70','soleras de 070'
) where id = 74;

-- Montante 35mm x 2.60m  ('motante de 0.35' es tipeo de 35mm, no de 70mm)
update stock_materiales set alias = public._seed_mk_alias(
  'montante 35','montante de 35','montantes 35','montantes 035','montantes de 35',
  'montantes de 035','motante de 35','motante de 0.35'
) where id = 71;

-- Montante 70mm x 2.60m
update stock_materiales set alias = public._seed_mk_alias(
  'montante 70','montante de 70','montantes 70','montantes 070','montantes de 70',
  'montantes de 070'
) where id = 72;

-- Cable unipolar 2.5mm²
update stock_materiales set alias = public._seed_mk_alias(
  'cable 2.5','cable 2,5','cable de 2.5','cable 2,5 celeste','cable 2.5 celeste',
  'cable 2,5 rojo','cable rojo de 2.5','cable celeste de 2.5','cable 2.5 marron',
  'cable 2,5 verde amarillo','cable 2.5 verde amarillo'
) where id = 37;

-- Cable unipolar 1.5mm²
update stock_materiales set alias = public._seed_mk_alias(
  'cable 1.5','cable 1,5','cable de 1.5','cable 1,5 rojo','cable 1.5 blanco',
  'cable 1.5 celeste','cable 1.5 marron','cable 1x1.5 celeste y blanco',
  'cable cualquier color 1.5'
) where id = 36;

-- Codo PVC 110mm
update stock_materiales set alias = public._seed_mk_alias(
  'codo 110','codo de 110','codos de 110','codo 110 pvc','codo mh 110',
  'codo de 110 mh awaduct','codo 100','codo del 100'
) where id = 7;

-- Disco diamantado 115mm  (en obra: "widia")
update stock_materiales set alias = public._seed_mk_alias(
  'widia','disco widia','disco de widia','discos de widia','disco widia 4 1/2',
  'disco widia de 4 1/2','disco de widia 4.1/2','disco de widia de 4 1/2',
  'disco de widia n4.1/2','disco de 4 1/2 widia','discos de widia 4 1/2'
) where id = 441;

-- Placa Durlock STD 12.5mm
update stock_materiales set alias = public._seed_mk_alias(
  'placa 12.5','placa 12,5','placas 12.5','placas 12,5','placas de 12',
  'placas de 12.5','placa de durlock 12.5','placa durlock 12mm'
) where id = 68;

-- Masilla Durlock x 32kg
update stock_materiales set alias = public._seed_mk_alias(
  'masilla','masilla grande','masilla x 32','masilla x 32 kg','masilla x32'
) where id = 80;

-- Sikadur 31 (adhesivo epoxi)
update stock_materiales set alias = public._seed_mk_alias(
  'sikadur 31','sika 31','sika 31 normal','sikadur 31 normal','sikadur normal 31',
  'anclaje quimico sika 31'
) where id = 695;

-- Pincel 1"  (en obra el numero: n10)
update stock_materiales set alias = public._seed_mk_alias(
  'pincel chico','pincel 10','pincel n10','pincel d10','pincel de 10',
  'pinceles de 10','pinceles n10','pincel de 1'
) where id = 361;

-- Film polietileno 200 micrones
update stock_materiales set alias = public._seed_mk_alias(
  'plastico negro','plastico negro de 6x4'
) where id = 456;

-- Film polietileno 100 micrones
update stock_materiales set alias = public._seed_mk_alias(
  'plastico','plastico fil','plastico film transparente','pedazo de plastico',
  'rollo de plastico fil'
) where id = 455;

-- Cinta peligro amarilla/negra 200m
update stock_materiales set alias = public._seed_mk_alias(
  'cinta de peligro','rollo cinta de peligro','rollo ce cinta de peligro'
) where id = 665;

-- Arnés seguridad 3 puntos
update stock_materiales set alias = public._seed_mk_alias(
  'arnes','arneses','arnes completo','arneses completos','arnes nuevo',
  'arnes completo con cabo de vida'
) where id = 656;

-- Ficha macho 10A
update stock_materiales set alias = public._seed_mk_alias(
  'ficha macho','fichas macho'
) where id = 278;

-- Ficha hembra 10A
update stock_materiales set alias = public._seed_mk_alias(
  'ficha hembra','fichas hembra','foca hembra'
) where id = 279;

-- Cinta malla Durlock
update stock_materiales set alias = public._seed_mk_alias(
  'cinta tramada','cinta tramada chica','cinta tramada grande','cinta tramada grandes',
  'rollo de cinta tramada'
) where id = 79;

-- Alambre de atar N°18
update stock_materiales set alias = public._seed_mk_alias(
  'alambre','alambre fino','alanbre fino','kg de alambre','alambre de fardo',
  'un poco de alambre de fardo'
) where id = 317;

-- Casco seguridad c/ arnés
update stock_materiales set alias = public._seed_mk_alias(
  'casco','cascos','casco amarillo','cascos amarillos','cascos seguridad'
) where id = 643;

-- Aguarrás x 4lts
update stock_materiales set alias = public._seed_mk_alias('aguarras') where id = 357;

-- Tomacorriente doble
update stock_materiales set alias = public._seed_mk_alias(
  'toma doble','tomas dobles','tomas dobles completos','modulos de tomas',
  'llave 1 toma','llave 2 tomas 10a'
) where id = 52;

-- Rodillo lana pelo corto 23cm
update stock_materiales set alias = public._seed_mk_alias(
  'rodillo','rodillos','rodillo de 22 cm','rodillo para latex','rodillos para latex',
  'rodillos n22','rodillos comunes n22','rodillos comunes','rodillo peludo',
  'rodillos peludos'
) where id = 126;

-- Caño PVC 110mm x 4m
update stock_materiales set alias = public._seed_mk_alias(
  'caño de 110','caños de 110','caño pvc 110','caños 110 pvc','caños de 110 x 3.2',
  'un tramo de caño de 110'
) where id = 4;

-- Cinta teflón
update stock_materiales set alias = public._seed_mk_alias(
  'teflon','teflon grande','teflon alta densidad','teflon alta densidad 3/4',
  'teflon de 1/2'
) where id = 33;

-- Fenólico 18mm 1.22x2.44
update stock_materiales set alias = public._seed_mk_alias(
  'fenolico','fenolicos','fenolico de 2m x 0.60'
) where id = 589;

-- Tornillo autoperf. punta mecha 10mm
update stock_materiales set alias = public._seed_mk_alias(
  'autoperforante','autoperforantes','autos perforante','autos perforantes',
  'tornillo auto perforante','autoperforante y taco del 10'
) where id = 380;

-- Codo termofusión 25mm
update stock_materiales set alias = public._seed_mk_alias(
  'codo de 25','codo de 25 fusion','codo fusion 25','codos de 25 fusion',
  'codos fusion 25','codos fusion de 25','codos fucion de 25'
) where id = 18;

-- Membrana líquida x 20kg
update stock_materiales set alias = public._seed_mk_alias(
  'membrana liquida','menbrana liquida','membrana liquida fibrada x 20l',
  'tacho de membrana liquida','medio tacho de membrana liquida',
  'sikafill','sikafill fibrado','sikafill fibrado blanco','sikafill tapagoteras',
  'tapagoteras','baldes sikafill fibrado rojo 20 kg'
) where id = 173;

-- Niveladores piso (cuña + base)
update stock_materiales set alias = public._seed_mk_alias(
  'cuña','cuñas','cuñas niveladoras','arcos niveladores','bolsa de niveladores',
  'bolsas de niveladores','niveladores atrim','200 separadores con cuñas',
  'cuñas niveladoras violetas usadas'
) where id = 555;

-- Caja de luz octogonal
update stock_materiales set alias = public._seed_mk_alias(
  'caja octogonal','cajas octogonales','cajas octogonales pvc',
  'caja pvc octogonal chica','caja ortogonal','cajas ortogonales',
  'caja ortogonal grande pvc'
) where id = 57;

-- Caño termofusión 25mm
update stock_materiales set alias = public._seed_mk_alias(
  'caño de 25','caños de 25','caño de termofusion 25','caños de 25 fusion',
  'caños fusion de 25','caño de 25 ff'
) where id = 16;

-- Protector auditivo copa
update stock_materiales set alias = public._seed_mk_alias(
  'protectores auditivos','protectores auditivos pares'
) where id = 647;

-- Llana de acero
update stock_materiales set alias = public._seed_mk_alias(
  'llana lisa','llana o espatula ancha'
) where id = 338;

-- Espátula 120mm
update stock_materiales set alias = public._seed_mk_alias(
  'espatula','espatulas','espatula 12 cm','espatula mediana'
) where id = 365;

-- Puntal metálico regulable 3m
update stock_materiales set alias = public._seed_mk_alias(
  'puntales','puntal acro','puntales acro','puntales acros','acro','acros','acro azul'
) where id = 636;

-- Hidrófugo x 5lts / x 20lts  (en obra: "ceresita", "sika 1")
update stock_materiales set alias = public._seed_mk_alias(
  'hidrofugo','ceresita','cerecita','sika 1','sika 1a','sika 1a plus'
) where id in (326, 111);

-- Geotextil no tejido 200g/m²
update stock_materiales set alias = public._seed_mk_alias(
  'velo','velos','velo geotextil','velo 1x75m','velo 20ml','rollo de velo'
) where id = 686;

-- Hierro plano 1/2" x 6m  (en obra: "planchuela")
update stock_materiales set alias = public._seed_mk_alias(
  'planchuela','planchuelas','planchuela 1/2','planchuelas 1/2',
  'planchuelas 1/2x1/8','planchuela 1/2 x 1/8 x 6mts'
) where id = 432;

-- Hierro plano 3/4" x 6m
update stock_materiales set alias = public._seed_mk_alias(
  'planchuela','planchuelas','planchuela 3/4','planchuelas 3/4',
  'planchuela 3/4 largo 2 mts','planchuelas galvanizado 3/4 x 2m'
) where id = 433;

-- Adhesivo PVC x 250cc
update stock_materiales set alias = public._seed_mk_alias(
  'pegamento pvc','pegamento para pvc','sellador de pvc','pegamento para caño'
) where id = 34;

-- Desmoldante p/ encofrado x 20lts
update stock_materiales set alias = public._seed_mk_alias(
  'desmoldante','desencofrante','aceite desencofrante'
) where id = 626;

-- Fratacho espuma
update stock_materiales set alias = public._seed_mk_alias(
  'fletacho','fletachos','fletacho + punta filip'
) where id = 339;

-- Cemento de albañilería x 25kg  (en obra: "plasticor")
update stock_materiales set alias = public._seed_mk_alias(
  'plasticor','bolsa plasticor','bolsas plasticor','bolsas de plasticor'
) where id = 301;

-- Alambre recocido N°16
update stock_materiales set alias = public._seed_mk_alias(
  'alambre 16','alambre n16','alambre galvanizado n16','alambre galvanizado n16 48 mts'
) where id = 639;

-- Fibra polipropileno x 600g  (en obra: marca "fibermesh")
update stock_materiales set alias = public._seed_mk_alias(
  'fibermesh','fibermesh 150','fibermesh 150 x12 kg'
) where id = 625;

-- Chapa sinusoidal galv. C25  (en obra: "acanalada" / "ranurada")
update stock_materiales set alias = public._seed_mk_alias(
  'acanalada','chapa acanalada','chapas acanaladas','chapa ranurada',
  'chapas ranuradas','chapas grises ranuradas','chapa calibre 25'
) where id in (469, 470);

update stock_materiales set alias = public._seed_mk_alias(
  'acanalada','chapa acanalada','chapas acanaladas','chapa ranurada',
  'chapas ranuradas','chapas grises ranuradas','chapa calibre 25',
  'chapa acanalada de 1.10x3ml'
) where id = 467;

update stock_materiales set alias = public._seed_mk_alias(
  'acanalada','chapa acanalada','chapas acanaladas','chapa ranurada',
  'chapas ranuradas','chapas grises ranuradas','chapa calibre 25',
  'chapas 4 mts','chapa de 4 mts'
) where id = 468;


-- ==========================================================================
-- BLOQUE B — sinonimos adicionales minados del corpus completo
-- ==========================================================================

-- Lija al agua N°100 / Lija p/ madera N°120
update stock_materiales set alias = public._seed_mk_alias(
  'lija 100','lijas 100','lija n100','lijas n100'
) where id = 130;

update stock_materiales set alias = public._seed_mk_alias(
  'lija 120','lijas 120','lija n120','lijas n120'
) where id = 374;

-- Protector auditivo endoaural  (en obra: "tapones")
update stock_materiales set alias = public._seed_mk_alias(
  'tapones auditivos','tapones'
) where id = 646;

-- Cabo vida 1.5m c/ mosquetón
update stock_materiales set alias = public._seed_mk_alias('cabo de vida') where id = 657;

-- Interruptor doble  (en obra: "llave de 2 puntos")
update stock_materiales set alias = public._seed_mk_alias('llave 2 puntos') where id = 54;

-- Caja de luz rectangular
update stock_materiales set alias = public._seed_mk_alias(
  'caja rectangular','cajas rectangular','cajas rectangulares',
  'caja rectangular de embutir','cajas rectangulares de embutir pvc'
) where id = 56;

-- Delantal de cuero soldador  (en obra: "mandil")
update stock_materiales set alias = public._seed_mk_alias(
  'mandil','mandiles','mandil goma espuma'
) where id = 662;

-- Chaleco reflectivo
update stock_materiales set alias = public._seed_mk_alias(
  'chaleco','chalecos','chaleco naranja','chalecos naranja'
) where id = 658;

-- Cantonera PVC 2.60m
update stock_materiales set alias = public._seed_mk_alias('cantonera','cantoneras') where id = 615;

-- Arena fina / Arena gruesa  (la obra pide en bolsas; el catalogo esta en tn)
update stock_materiales set alias = public._seed_mk_alias(
  'bolsa arena','bolsa de arena','bolsas de arena','arena bolsas'
) where id in (90, 89);

-- Piedra partida  (en obra: "ripio", "1 al 3")
update stock_materiales set alias = public._seed_mk_alias(
  'ripio','bolsa de ripio','bolsas de ripio','bolsa ripio 1 al 3',
  'bolsas de ripio 1 al 3','bolsas de ripio bruto fino','1 al 3','bolsas 1 al 3',
  'piedra 1 al 3','bolsas piedra 1 al 3','bolsas de piedra 1 al 3'
) where id = 91;

-- Ladrillo común / hueco 12 / hueco 18  (en obra: "del 12", "del 18")
update stock_materiales set alias = public._seed_mk_alias('ladrillos comunes') where id = 92;

update stock_materiales set alias = public._seed_mk_alias(
  'ladrillo del 12','ladrillos del 12'
) where id = 94;

update stock_materiales set alias = public._seed_mk_alias(
  'ladrillo del 18','ladrillos del 18','ladrillos hueco n18','ladrillos huecos del 18'
) where id = 95;

-- Hierro redondo: la obra dice "del 6" / "del 8" / "del 10" / "del 12"
update stock_materiales set alias = public._seed_mk_alias('hierro del 6','hierros del 6') where id = 98;
update stock_materiales set alias = public._seed_mk_alias('hierro del 8','hierros del 8') where id = 99;
update stock_materiales set alias = public._seed_mk_alias('hierro del 10','hierros del 10') where id = 100;
update stock_materiales set alias = public._seed_mk_alias('hierro del 12','hierros del 12') where id = 101;

-- Pegamento p/ cerámicos x 30kg
update stock_materiales set alias = public._seed_mk_alias(
  'bolsa de pegamento','bolsas de pegamento','pegamento fluido'
) where id = 109;

-- Pincel 2" / 3"  (numeracion de obra n20 / n30, consistente con n10 = 1")
update stock_materiales set alias = public._seed_mk_alias(
  'pincel 20','pincel n20','pincel de 20','pinceles de 20','pinceles n20'
) where id = 128;

update stock_materiales set alias = public._seed_mk_alias(
  'pincel 30','pincel n30','pincel de 30','pinceles de 30','pinceles n30'
) where id = 129;

-- Flexible 1/2" x 40cm
update stock_materiales set alias = public._seed_mk_alias('flexible cromado') where id = 32;


drop function public._seed_mk_alias(text[]);
