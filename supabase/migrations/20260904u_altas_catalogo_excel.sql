-- 20260904u — 48 altas al catálogo desde el Excel de compras de Nicolás
--
-- Productos comprados entre jul y sep 2026 que no tenían fila en el catálogo
-- (verificado por nombre y alias, activos e inactivos). Precio de referencia
-- FINAL (c/IVA), en la unidad del catálogo. El alias es la descripción con la
-- que vino en la factura, para que la próxima compra encuentre la fila sola.
-- OK del user 2026-09-04 ("dale de altas").
--
-- Rubros: 1 Sanitaria · 2 Electricidad · 5 Pintura · 6 Ferretería general ·
-- 7 Herrería · 8 Aislación e impermeab. · 12 Instalación de gas · 15 Seguridad y EPP

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, 'material',
       'Alta 2026-09-04 desde el Excel de compras (' || v.fuente || '). Precio final c/IVA.'
from (values
  -- Sanitaria (Castro: Ferrum línea Espacio / Andina, FV, DAC)
  ('Inodoro p/ discapacitados alto 48.5cm',            'unid', 315870.25, 1, array['fe ietmj inodoro at 48.5 cm espacio bco','inodoro alto discapacitados','inodoro espacio'],        'Castro 2026-08-05'),
  ('Depósito p/ inodoro discapacitados (línea Espacio)','unid', 249000.00, 1, array['fe dte6f deposito espacio codo discapacitado','deposito espacio','mochila discapacitados'],     'Castro 2026-08-05'),
  ('Depósito colgar p/ inodoro 4.5lt',                 'unid',  79590.55, 1, array['fe das4c deposito colgar andina redonda','deposito colgar','mochila colgar'],                    'Castro 2026-08-05'),
  ('Asiento p/ inodoro MDF blanco',                    'unid',  68305.54, 1, array['der asiento mdf andino bco','asiento inodoro mdf','tapa inodoro mdf'],                          'Castro 2026-08-05'),
  ('Asiento p/ inodoro abierto (línea Espacio)',       'unid',  59500.00, 1, array['fe tte3 asiento abierto espacio bco','asiento abierto','tapa inodoro abierta'],                  'Castro 2026-08-05'),
  ('Lavatorio Andina 46.5x42 1 agujero',               'unid',  46675.40, 1, array['fe lea1 lavatorio 1 ag andina bco 46.5x42','lavatorio andina','lavatorio 1 agujero'],           'Castro 2026-08-05'),
  ('Mingitorio oval',                                  'unid', 104159.99, 1, array['fe mingitorio oval clasica mtnf','mingitorio'],                                                 'Castro 2026-08-05'),
  ('Válvula automática p/ mingitorio cromo',           'unid', 125887.04, 1, array['fv 362.02 ecomatic mingitorio automatica','valvula mingitorio','ecomatic'],                     'Castro 2026-08-05'),
  ('Canilla pressmatic p/ lavatorio discapacitados',   'unid', 283349.87, 1, array['fv 361.03a canilla lavat discapacit cr pressmatic','canilla pressmatic','canilla discapacitados'],'Castro 2026-08-05'),
  ('Barral fijo p/ baño accesible 95cm',               'unid', 193500.01, 1, array['fe vefr9 barral fijo 95 cm espacio bco','barral fijo','barral 95'],                             'Castro 2026-08-05'),
  ('Barral rebatible p/ discapacitados 80cm',          'unid', 367000.32, 1, array['fe vteb8 barral rebat 80 cm espacio bco','barral rebatible','barral 80'],                       'Castro 2026-08-05'),
  ('Jabonera metálica',                                'unid',  19153.01, 1, array['dac jabonera etna metal','jabonera'],                                                           'Castro 2026-08-07'),
  ('Lubricante siliconado p/ caños x 400ml',           'unid',   5227.33, 1, array['lubricante siliconado p/canos 3 en 1 x 400','lubricante siliconado','lubricante para canos'],   'El Fontanero 2026-07-30'),
  ('Sellador de roscas x 50cc',                        'unid',   4503.31, 1, array['sellador hidro 3 x 50 cc','hidro 3 50cc','sella roscas 50'],                                     'El Fontanero 2026-07-28'),
  ('Tornillo bronce cabeza cromada hexagonal 22x80',   'unid',   1210.39, 1, array['tornillo bronce 22 x 80 c. cromo hexagonal','tornillo bronce inodoro','tornillo cromado inodoro'],'El Fontanero 2026-07-28'),
  -- Termofusión 25 / 32 / 50 y desagüe Duratop (El Fontanero)
  ('Válvula esférica termofusión 25mm',                'unid',  13136.87, 1, array['valvula ppr esfera y palanca metalica 25','valvula esferica 25','llave esferica fusion 25'],     'El Fontanero 2026-08-11'),
  ('Válvula esférica termofusión 32mm',                'unid',  18469.67, 1, array['valvula ppr esfera y palanca metalica 32','valvula esferica 32','llave esferica fusion 32'],     'El Fontanero 2026-08-11'),
  ('Curva termofusión 25mm 90°',                       'unid',   1804.46, 1, array['tf-curva a 90 fusion 25 mm','curva fusion 25','curva termofusion 25'],                          'El Fontanero 2026-08-11'),
  ('Curva termofusión 32mm 90°',                       'unid',   2815.14, 1, array['tf-curva a 90 fusion 32 mm','curva fusion 32','curva termofusion 32'],                          'El Fontanero 2026-08-11'),
  ('Buje reducción termofusión 32x25mm',               'unid',    967.76, 1, array['tf-buje de reduccion fusion 32 x 25 mm','buje 32x25','buje reduccion 32 25'],                   'El Fontanero 2026-07-28'),
  ('Buje reducción plano termofusión 32x25mm',         'unid',    564.47, 1, array['tf-buje de reduccion plano fusion 32 x 25','buje plano 32x25'],                                  'El Fontanero 2026-08-11'),
  ('Reducción termofusión 50 a 32mm',                  'unid',   4136.39, 1, array['tf-buje de reduccion fusion 50 x 32 mm','buje 50x32','reduccion 50 32'],                        'El Fontanero 2026-07-28'),
  ('Cupla termofusión 50mm',                           'unid',   2800.61, 1, array['tf-union simple fusion 50 mm','cupla fusion 50','union simple 50'],                              'El Fontanero 2026-07-28'),
  ('Unión doble termofusión 32mm',                     'unid',   4261.70, 1, array['tf-union doble fusion 32 mm plastica','union doble 32','union doble fusion 32'],                 'El Fontanero 2026-08-11'),
  ('Rosca macho termofusión 32mm x 1"',                'unid',   8358.09, 1, array['tf-tubo macho fusion 32 mm x 1','rosca macho 32','tubo macho fusion 32'],                        'El Fontanero 2026-08-11'),
  ('Te termofusión reducción 32x25mm',                 'unid',   1775.07, 1, array['tf-te red. central fusion 32 x 25 x 32 mm','te reduccion 32x25','te reducida 32 25'],           'El Fontanero 2026-08-11'),
  ('Manguito de reparación desagüe 40mm',              'unid',   1557.68, 1, array['manguito de reparacion 40 mm duratop','manguito 40','manguito duratop'],                        'El Fontanero 2026-07-30'),
  ('Codo poliangular desagüe 40mm',                    'unid',   2639.09, 1, array['codo poliangular 40 mm duratop','codo poliangular 40','poliangular 40'],                        'El Fontanero 2026-07-30'),
  ('Ramal PVC 110mm 87°30''',                          'unid',   5587.96, 1, array['r1 ramal 87 30 mh 110 x 110 mm','ramal 110','ramal pvc 110'],                                    'El Fontanero 2026-09-02'),
  -- Gas
  ('Ventilación gas 15x30 (200cm²)',                   'unid',   3284.38, 12, array['rejilla vent. aprob. 15 x 30 (200 cm2)','rejilla ventilacion 15x30','ventilacion 200 cm2','rejilla de gas 15x30'], 'El Fontanero 2026-09-02'),
  -- Electricidad (Voltaje / Kalop / ABB)
  ('Bastidor 3 módulos',                               'unid',    820.38, 2, array['bastidor 3 mod - kalop kd40702','bastidor 3 modulos','bastidor kalop'],                         'Voltaje 2026-09-02'),
  ('Tapa 3 módulos blanca',                            'unid',    786.50, 2, array['tapa 3 mod bl - kalop kd40710','tapa 3 modulos','tapa kalop 3'],                                 'Voltaje 2026-09-02'),
  ('Módulo tapón ciego',                               'unid',    214.17, 2, array['modulo tapon ciego bl - kalop kd40570','tapon ciego','modulo ciego'],                            'Voltaje 2026-09-02'),
  ('Térmica 2x10A',                                    'unid',  14042.05, 2, array['llave tm 2x10 a 4.5ka 2cds242001r0104p - abb','termica 2x10','llave termica 2x10'],              'Voltaje 2026-09-02'),
  ('Terminal puntera p/ cable 4mm²',                   'unid',     80.01, 2, array['puntera hueca tubular aisl. 1 cond. ctn 4','puntera 4mm','puntera 4'],                           'Voltaje 2026-07-28'),
  ('Terminal puntera doble p/ cable 4mm²',             'unid',    145.99, 2, array['puntera hueca tubular aisl. 2 cond. ng ctd 4','puntera doble 4mm','puntera doble 4'],            'Voltaje 2026-07-28'),
  ('Cupla p/ caño rígido 3/4"',                        'unid',    146.41, 2, array['union pvc 3/4 - 20 mm','cupla rigido 3/4','union rigido 3/4','cupla 3/4 pvc'],                  'Voltaje 2026-08-28'),
  ('Tortuga aluminio oval chica E27',                  'unid',  11796.29, 2, array['tortuga kron alum asador oval chico ng e27','tortuga oval','tortuga chica'],                     'Voltaje 2026-09-02'),
  -- Herrería / ferretería
  ('Caño estructural 50x50x1.6',                       'unid',  40129.64, 7, array['tubo est. cuadrado 50x50x1.60 (14,65 kg)','cano estructural 50x50','tubo estructural 50x50'],    'UNIMAX 2026-08-03'),
  ('Caño estructural 100x40x1.25',                     'unid',  45240.35, 7, array['tubo est. rectangular 40x100x1.25 (16,21 kg)','cano estructural 100x40','tubo estructural 40x100'],'UNIMAX 2026-08-18'),
  ('Remache pop 3.5x12mm',                             'unid',     20.35, 6, array['remache pop aluminio 3.5 x 12 mm cabeza','remache pop','remache 3.5'],                           'Mercado Libre, sin fecha'),
  ('Cincel plano SDS-Max 400x25mm',                    'unid',  14498.22, 6, array['cincel plano sds-max 400 x 25 x1 - bosch','cincel plano sds max','cincel plano demoledor'],       'sin proveedor, sin fecha'),
  ('Punta (punzón) de mano hex 16x250mm c/ protector', 'unid',   6399.02, 6, array['punta hex c/mango 24 x 16 x 250 mm - tolsen','punta de mano','punzon de mano'],                  'sin proveedor, sin fecha'),
  -- Pintura / selladores / EPP
  ('Enduido interior x 1lt',                           'unid',   7475.00, 5, array['enduido albaplast interior x 1 lt','enduido 1 litro','enduido chico'],                            'Silva 2026-08-25'),
  ('Rodillo epoxi N°8',                                'unid',   1727.00, 5, array['minirodillo epoxi n 8','rodillo epoxi 8','minirodillo 8'],                                        'Silva 2026-08-20'),
  ('Pinceleta 4"',                                     'unid',  20520.99, 5, array['pinceleta 6000 n40 rosarpin','pinceleta 4','pinceleta n40'],                                      'Silva 2026-08-20'),
  ('Sellador poliuretano gris x 600ml (Sikaflex 1A)',  'unid',  38752.60, 8, array['sikaflex 1a plus purform x 600 ml gris','sikaflex 1a','sikaflex gris 600'],                       'Adicem 2026-08-11'),
  ('Lentes seguridad amarillos',                       'unid',   9421.64, 15, array['anteojo sf103af-blu amarillo 1u - 3m','lentes amarillos','anteojos amarillos'],                  'sin proveedor, sin fecha')
) as v(nombre, unidad, precio_ref, rubro_id, alias, fuente)
where not exists (
  select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre)
);
