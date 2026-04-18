-- =====================================================================
-- Stock en Depósito: rubros, materiales, movimientos + seed
-- =====================================================================

-- ── Rubros ───────────────────────────────────────────────────────────
create table if not exists stock_rubros (
  id     serial primary key,
  nombre text not null,
  icono  text,
  orden  int not null default 0,
  activo boolean not null default true
);

alter table stock_rubros enable row level security;
create policy "stock_rubros_all" on stock_rubros for all using (true) with check (true);

-- ── Materiales ───────────────────────────────────────────────────────
create table if not exists stock_materiales (
  id            serial primary key,
  rubro_id      int not null references stock_rubros(id),
  nombre        text not null,
  unidad        text not null default 'unid'
    check (unidad in ('unid', 'kg', 'tn', 'lt', 'm', 'm2', 'm3', 'gl', 'rollo', 'bolsa', 'balde', 'lata')),
  stock_actual  numeric not null default 0,
  stock_minimo  numeric not null default 0,
  precio_ref    numeric not null default 0,
  obs           text,
  activo        boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  created_by    uuid references auth.users(id),
  updated_by    uuid references auth.users(id)
);

alter table stock_materiales enable row level security;
create policy "stock_materiales_all" on stock_materiales for all using (true) with check (true);

-- ── Movimientos ──────────────────────────────────────────────────────
create table if not exists stock_movimientos (
  id                 serial primary key,
  material_id        int not null references stock_materiales(id),
  tipo               text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad           numeric not null,
  motivo             text not null check (motivo in ('compra', 'despacho_obra', 'devolucion', 'ajuste_inventario')),
  obra_cod           text references obras(cod),
  solicitud_item_id  int references solicitud_compra_item(id),
  obs                text,
  fecha              date not null default current_date,
  created_at         timestamptz default now(),
  created_by         uuid references auth.users(id)
);

alter table stock_movimientos enable row level security;
create policy "stock_movimientos_all" on stock_movimientos for all using (true) with check (true);

-- ── Agregar material_id a solicitud_compra_item para vincular al catálogo ──
alter table solicitud_compra_item
  add column if not exists material_id int references stock_materiales(id);

-- =====================================================================
-- SEED: Rubros y materiales de construcción
-- =====================================================================

insert into stock_rubros (nombre, icono, orden) values
  ('Sanitaria',             '🚿', 1),
  ('Electricidad',          '⚡', 2),
  ('Construcción en seco',  '🏗️', 3),
  ('Albañilería',           '🧱', 4),
  ('Pintura',               '🎨', 5),
  ('Ferretería general',    '🔩', 6),
  ('Herrería',              '⚙️', 7),
  ('Aislación e impermeab.','🛡️', 8)
on conflict do nothing;

-- ── Sanitaria ──
with r as (select id from stock_rubros where nombre = 'Sanitaria')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Caño PVC 40mm x 4m',      'unid'),
  ((select id from r), 'Caño PVC 50mm x 4m',      'unid'),
  ((select id from r), 'Caño PVC 63mm x 4m',      'unid'),
  ((select id from r), 'Caño PVC 110mm x 4m',     'unid'),
  ((select id from r), 'Codo PVC 40mm',            'unid'),
  ((select id from r), 'Codo PVC 50mm',            'unid'),
  ((select id from r), 'Codo PVC 110mm',           'unid'),
  ((select id from r), 'Te PVC 40mm',              'unid'),
  ((select id from r), 'Te PVC 50mm',              'unid'),
  ((select id from r), 'Te PVC 110mm',             'unid'),
  ((select id from r), 'Cupla PVC 40mm',           'unid'),
  ((select id from r), 'Cupla PVC 50mm',           'unid'),
  ((select id from r), 'Cupla PVC 110mm',          'unid'),
  ((select id from r), 'Reducción PVC 110 a 50mm', 'unid'),
  ((select id from r), 'Caño termofusión 20mm',    'm'),
  ((select id from r), 'Caño termofusión 25mm',    'm'),
  ((select id from r), 'Codo termofusión 20mm',    'unid'),
  ((select id from r), 'Codo termofusión 25mm',    'unid'),
  ((select id from r), 'Te termofusión 20mm',      'unid'),
  ((select id from r), 'Cupla termofusión 20mm',   'unid'),
  ((select id from r), 'Canilla esférica 1/2"',    'unid'),
  ((select id from r), 'Canilla esférica 3/4"',    'unid'),
  ((select id from r), 'Flotante p/ tanque',       'unid'),
  ((select id from r), 'Tanque agua 500lts',       'unid'),
  ((select id from r), 'Tanque agua 1000lts',      'unid'),
  ((select id from r), 'Pileta cocina acero',      'unid'),
  ((select id from r), 'Pileta baño',              'unid'),
  ((select id from r), 'Inodoro',                  'unid'),
  ((select id from r), 'Mochila p/ inodoro',       'unid'),
  ((select id from r), 'Bidet',                    'unid'),
  ((select id from r), 'Sifón 40mm',               'unid'),
  ((select id from r), 'Flexible 1/2" x 40cm',     'unid'),
  ((select id from r), 'Cinta teflón',             'unid'),
  ((select id from r), 'Adhesivo PVC x 250cc',     'unid'),
  ((select id from r), 'Rejilla de piso 15x15',    'unid');

-- ── Electricidad ──
with r as (select id from stock_rubros where nombre = 'Electricidad')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Cable unipolar 1.5mm²',    'm'),
  ((select id from r), 'Cable unipolar 2.5mm²',    'm'),
  ((select id from r), 'Cable unipolar 4mm²',      'm'),
  ((select id from r), 'Cable unipolar 6mm²',      'm'),
  ((select id from r), 'Cable unipolar 10mm²',     'm'),
  ((select id from r), 'Cable subterráneo 3x2.5mm²', 'm'),
  ((select id from r), 'Cable subterráneo 3x4mm²',   'm'),
  ((select id from r), 'Tablero embutir 12 bocas',   'unid'),
  ((select id from r), 'Tablero embutir 24 bocas',   'unid'),
  ((select id from r), 'Térmica 1x16A',            'unid'),
  ((select id from r), 'Térmica 1x20A',            'unid'),
  ((select id from r), 'Térmica 1x25A',            'unid'),
  ((select id from r), 'Térmica 2x20A',            'unid'),
  ((select id from r), 'Térmica 2x32A',            'unid'),
  ((select id from r), 'Diferencial 2x25A 30mA',   'unid'),
  ((select id from r), 'Diferencial 2x40A 30mA',   'unid'),
  ((select id from r), 'Tomacorriente doble',       'unid'),
  ((select id from r), 'Interruptor simple',        'unid'),
  ((select id from r), 'Interruptor doble',         'unid'),
  ((select id from r), 'Combinación toma+inter',    'unid'),
  ((select id from r), 'Caja de luz rectangular',   'unid'),
  ((select id from r), 'Caja de luz octogonal',     'unid'),
  ((select id from r), 'Caja de paso',              'unid'),
  ((select id from r), 'Caño corrugado 3/4"',      'm'),
  ((select id from r), 'Caño corrugado 1"',        'm'),
  ((select id from r), 'Cinta aisladora',           'unid'),
  ((select id from r), 'Fotocelda',                 'unid'),
  ((select id from r), 'Portalámpara E27',          'unid'),
  ((select id from r), 'Lámpara LED 10W',           'unid'),
  ((select id from r), 'Tubo LED 18W',              'unid'),
  ((select id from r), 'Jabalina puesta a tierra',  'unid');

-- ── Construcción en seco ──
with r as (select id from stock_rubros where nombre = 'Construcción en seco')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Placa Durlock STD 9.5mm',    'unid'),
  ((select id from r), 'Placa Durlock STD 12.5mm',   'unid'),
  ((select id from r), 'Placa Durlock RH 12.5mm',    'unid'),
  ((select id from r), 'Placa Durlock RF 12.5mm',    'unid'),
  ((select id from r), 'Montante 35mm x 2.60m',      'unid'),
  ((select id from r), 'Montante 70mm x 2.60m',      'unid'),
  ((select id from r), 'Solera 35mm x 2.60m',        'unid'),
  ((select id from r), 'Solera 70mm x 2.60m',        'unid'),
  ((select id from r), 'Tornillo fix 8mm',            'unid'),
  ((select id from r), 'Tornillo T1 autoperforante',  'unid'),
  ((select id from r), 'Tornillo T2 autoperforante',  'unid'),
  ((select id from r), 'Cinta papel Durlock',         'rollo'),
  ((select id from r), 'Cinta malla Durlock',         'rollo'),
  ((select id from r), 'Masilla Durlock x 32kg',      'balde'),
  ((select id from r), 'Masilla Durlock x 7kg',       'balde'),
  ((select id from r), 'Esquinero metálico 2.60m',    'unid'),
  ((select id from r), 'Lana de vidrio 50mm',         'm2'),
  ((select id from r), 'Lana de vidrio 100mm',        'm2'),
  ((select id from r), 'Perfil omega',                'unid'),
  ((select id from r), 'Suspenso p/ cielorraso',      'unid');

-- ── Albañilería ──
with r as (select id from stock_rubros where nombre = 'Albañilería')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Cemento Portland x 50kg',   'bolsa'),
  ((select id from r), 'Cal hidráulica x 30kg',     'bolsa'),
  ((select id from r), 'Arena gruesa',               'tn'),
  ((select id from r), 'Arena fina',                 'tn'),
  ((select id from r), 'Piedra partida',             'tn'),
  ((select id from r), 'Ladrillo común',             'unid'),
  ((select id from r), 'Ladrillo hueco 8cm',         'unid'),
  ((select id from r), 'Ladrillo hueco 12cm',        'unid'),
  ((select id from r), 'Ladrillo hueco 18cm',        'unid'),
  ((select id from r), 'Bloque H 13cm',              'unid'),
  ((select id from r), 'Bloque H 19cm',              'unid'),
  ((select id from r), 'Hierro Ø 6mm x 12m',        'unid'),
  ((select id from r), 'Hierro Ø 8mm x 12m',        'unid'),
  ((select id from r), 'Hierro Ø 10mm x 12m',       'unid'),
  ((select id from r), 'Hierro Ø 12mm x 12m',       'unid'),
  ((select id from r), 'Hierro Ø 16mm x 12m',       'unid'),
  ((select id from r), 'Malla sima 15x15 Ø 4.2mm',  'unid'),
  ((select id from r), 'Malla sima 15x15 Ø 6mm',    'unid'),
  ((select id from r), 'Alambre negro N°17',         'kg'),
  ((select id from r), 'Alambre galvanizado',        'kg'),
  ((select id from r), 'Clavos 2"',                  'kg'),
  ((select id from r), 'Clavos 3"',                  'kg'),
  ((select id from r), 'Pegamento p/ cerámicos x 30kg', 'bolsa'),
  ((select id from r), 'Pastina x 5kg',              'unid'),
  ((select id from r), 'Hidrófugo x 20lts',          'balde');

-- ── Pintura ──
with r as (select id from stock_rubros where nombre = 'Pintura')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Latex interior x 20lts',      'lata'),
  ((select id from r), 'Latex interior x 10lts',      'lata'),
  ((select id from r), 'Latex interior x 4lts',       'lata'),
  ((select id from r), 'Latex exterior x 20lts',      'lata'),
  ((select id from r), 'Latex exterior x 10lts',      'lata'),
  ((select id from r), 'Latex exterior x 4lts',       'lata'),
  ((select id from r), 'Enduido interior x 25kg',     'balde'),
  ((select id from r), 'Enduido exterior x 25kg',     'balde'),
  ((select id from r), 'Fijador sellador x 20lts',    'lata'),
  ((select id from r), 'Fijador sellador x 4lts',     'lata'),
  ((select id from r), 'Esmalte sintético x 4lts',    'lata'),
  ((select id from r), 'Esmalte sintético x 1lt',     'lata'),
  ((select id from r), 'Diluyente x 18lts',           'lata'),
  ((select id from r), 'Diluyente x 4lts',            'lata'),
  ((select id from r), 'Rodillo lana 23cm',           'unid'),
  ((select id from r), 'Rodillo esponja 23cm',        'unid'),
  ((select id from r), 'Pincel 2"',                   'unid'),
  ((select id from r), 'Pincel 3"',                   'unid'),
  ((select id from r), 'Lija al agua N°100',          'unid'),
  ((select id from r), 'Lija al agua N°150',          'unid'),
  ((select id from r), 'Lija al agua N°220',          'unid');

-- ── Ferretería general ──
with r as (select id from stock_rubros where nombre = 'Ferretería general')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Tornillo madera 4x40mm',      'unid'),
  ((select id from r), 'Tornillo madera 4x50mm',      'unid'),
  ((select id from r), 'Tornillo madera 5x60mm',      'unid'),
  ((select id from r), 'Tornillo madera 6x70mm',      'unid'),
  ((select id from r), 'Tarugo nylon 6mm',             'unid'),
  ((select id from r), 'Tarugo nylon 8mm',             'unid'),
  ((select id from r), 'Tarugo nylon 10mm',            'unid'),
  ((select id from r), 'Bulón 8x80mm c/tuerca',       'unid'),
  ((select id from r), 'Bulón 10x100mm c/tuerca',     'unid'),
  ((select id from r), 'Bisagra 3"',                   'unid'),
  ((select id from r), 'Bisagra 4"',                   'unid'),
  ((select id from r), 'Cerradura de embutir',         'unid'),
  ((select id from r), 'Cerradura de sobreponer',      'unid'),
  ((select id from r), 'Candado 40mm',                 'unid'),
  ((select id from r), 'Arandela plana 8mm',           'unid'),
  ((select id from r), 'Arandela grower 8mm',          'unid'),
  ((select id from r), 'Silicona transparente 280ml',  'unid'),
  ((select id from r), 'Silicona blanca 280ml',        'unid'),
  ((select id from r), 'Espuma poliuretano 750ml',     'unid'),
  ((select id from r), 'Precintos plásticos 20cm',     'unid');

-- ── Herrería ──
with r as (select id from stock_rubros where nombre = 'Herrería')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Perfil C 80x40x15 x 6m',    'unid'),
  ((select id from r), 'Perfil C 100x50x15 x 6m',   'unid'),
  ((select id from r), 'Perfil C 120x50x15 x 6m',   'unid'),
  ((select id from r), 'Ángulo 1" x 1/8" x 6m',     'unid'),
  ((select id from r), 'Ángulo 1-1/2" x 1/8" x 6m', 'unid'),
  ((select id from r), 'Ángulo 2" x 1/8" x 6m',     'unid'),
  ((select id from r), 'Caño estructural 40x40x1.6',  'unid'),
  ((select id from r), 'Caño estructural 50x30x1.6',  'unid'),
  ((select id from r), 'Caño estructural 60x40x1.6',  'unid'),
  ((select id from r), 'Caño redondo 1" x 6m',        'unid'),
  ((select id from r), 'Planchuela 1" x 1/8" x 6m',  'unid'),
  ((select id from r), 'Planchuela 1-1/2" x 1/8" x 6m', 'unid'),
  ((select id from r), 'Electrodo 2.5mm x kg',        'kg'),
  ((select id from r), 'Electrodo 3.25mm x kg',       'kg'),
  ((select id from r), 'Disco corte 115mm',            'unid'),
  ((select id from r), 'Disco corte 230mm',            'unid'),
  ((select id from r), 'Disco flap 115mm',             'unid'),
  ((select id from r), 'Antióxido x 4lts',             'lata'),
  ((select id from r), 'Convertidor de óxido x 1lt',   'unid');

-- ── Aislación e impermeabilización ──
with r as (select id from stock_rubros where nombre = 'Aislación e impermeab.')
insert into stock_materiales (rubro_id, nombre, unidad) values
  ((select id from r), 'Membrana asfáltica 4mm x 10m²', 'rollo'),
  ((select id from r), 'Membrana líquida x 20kg',       'balde'),
  ((select id from r), 'Membrana líquida x 10kg',       'balde'),
  ((select id from r), 'Primer asfáltico x 18lts',      'lata'),
  ((select id from r), 'Barrera de vapor polietileno',   'rollo'),
  ((select id from r), 'Poliestireno expandido 25mm',    'm2'),
  ((select id from r), 'Poliestireno expandido 50mm',    'm2'),
  ((select id from r), 'Sellador poliuretano x 300ml',   'unid'),
  ((select id from r), 'Cinta butílica autoadhesiva',     'rollo');
