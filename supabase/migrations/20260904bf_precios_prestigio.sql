-- 20260904bf — Precios de Prestigio S.A. (Sherwin-Williams Tucumán): 5 facturas A, may–ago 2026
--
-- prestigio.pdf en datos-entrada/: 05132-00000499 (21/05), 543 (11/06), 589
-- (10/07), 602 (28/07), 619 (05/08). Cada renglón trae precio de lista NETO y
-- un descuento (28–35 %): el unitario real es precio × (1 − desc), y acá se
-- carga FINAL: × 1,21. Regla de siempre: el precio de referencia es el más
-- reciente; donde el Excel de Nicolás (fines de agosto) es posterior se deja.
--
-- Dos precios rotos que estas facturas destapan y se pisan aunque sean más
-- viejos: "Rodillo lana pelo largo 23cm" a $13,31 y "Latex p/ cielorraso x 20lts"
-- a $7.352 (una lata de 20 l no vale eso). Aguarrás x 4 lts ($26,62) y Fijador
-- x 20 lts ($78,65) siguen rotos: Prestigio no los vende en esa presentación.
--
-- Las bases "S.COLOR EW / DEEP" son bases para entonar (blanco / deep): van
-- como filas propias porque el color final cambia en cada compra.

-- 1) precios sobre filas existentes ─────────────────────────────────────────
update public.stock_materiales set precio_ref = v.p,
       alias = array(select distinct unnest(alias || v.al)),
       obs = coalesce(obs || ' · ', '') || v.n
from (values
  (704,  138163.50, array['colorin titanio negro','esmalte negro brillante 20','esmalte sintetico negro brillante x 20'], 'Prestigio 10/07/2026: Colorín Titanio esm. brill. negro x 20, $160.823,53 −29 % neto.'),
  (701,  141066.16, array['colorin titanio blanco','esmalte blanco brillante 20'],                                     'Prestigio 21/05/2026: Colorín Titanio esm. brill. blanco x 20, $164.202,26 −29 % neto.'),
  (697,   18751.63, array['poximix exterior x 5','poximix x 5 kg','bolsa de poximix 5'],                                'Bolsa de 5 kg. Prestigio 05/08/2026: $22.138,88 −30 % neto (21/05 salía $17.858,72 final).'),
  (170,   30617.36, array['corroles antioxido rojo','antioxido rojo 4','antioxido rojo x 4 lts'],                       'Prestigio 21/05/2026: Corroles antióxido rojo x 4, $35.638,88 −29 % neto.'),
  (132,     553.79, array['lija al agua 220','lija 220','lija n220','wells lija 220'],                                   'Por hoja. Prestigio 21/05/2026: pack x 10 $6.446,11 −29 % neto = $5.537,85 final el pack.'),
  (367,    4534.42, array['cinta multiuso 48x40','cinta de enmascarar 48','cinta de papel 48'],                         'Prestigio 21/05/2026: Wells cinta multiuso plus 48x40, $5.278,10 −29 % neto.'),
  (402,    5847.04, array['unipega silicona neutra','silicona neutra 100% transparente','silicona neutra cartucho'],    'Prestigio 21/05/2026: Unipega silicona neutra transp. 280 ml, $6.806,01 −29 % neto.'),
  (801,   12678.44, array['rodillo el galgo lana 22','rodillo lana 22','rodillo lanar 22cm'],                           'Prestigio 21/05/2026: rodillo El Galgo lana 22 cm, $14.758,98 −29 % neto. Reemplaza el $13,31 cargado en miles.'),
  (797,  108835.59, array['z10 supercubritivo cielorrasos','z10 cielorraso 20','latex cielorraso z10 20'],              'Prestigio 10/07/2026: Z10 supercubritivo cielorrasos x 20, $126.685,59 −29 % neto. Reemplaza el $7.352 que no era de una lata de 20.'),
  (1094, 163769.27, array['alba pisos verde tenis','alba pisos latex acrilico verde tenis','pintura pisos verde tenis 20'], 'Prestigio 28/07/2026: Alba Pisos látex acrílico mate verde tenis x 20, $207.785,86 −34,86 % neto.'),
  (795,   3264.15,  array['pincel silver n25','pincel cerda blanca 25'],                                                 'Prestigio 10/07/2026: pincel Silver cerda blanca N°25, $3.799,45 −29 % neto.')
) as v(id, p, al, n)
where stock_materiales.id = v.id;

-- Solo sinónimos (el precio vigente es más nuevo que la factura de Prestigio)
update public.stock_materiales set alias = array(select distinct unnest(alias || v.al)), obs = coalesce(obs || ' · ', '') || v.n
from (values
  (366, array['cinta multiuso 24x40','cinta de enmascarar 24','wells cinta 24'], 'Prestigio 21/05/2026: $2.271,94 final.'),
  (691, array['estopa de lustre','estopa 350 g'],                                'Prestigio 05/08/2026: $1.042,88 final.'),
  (173, array['sikafill techos','sikafill techos blanco 20','membrana liquida techos 20'], 'Prestigio 05/08/2026: Sikafill techos membr. líq. blanco x 20, $123.808,56 final.'),
  (361, array['pincel silver n10','pincel cerda blanca 10'],                      'Prestigio 10/07/2026: $1.317,73 final.')
) as v(id, al, n)
where stock_materiales.id = v.id;

-- 2) altas (precio final) ────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, (select id from public.stock_rubros where nombre = v.rubro), v.alias, 'material',
       'Alta 2026-09-04 desde factura Prestigio ' || v.fuente || '. Precio final (neto con descuento × 1,21).'
from (values
  ('Pintura p/ pisos Alba látex acrílico mate grafito x 20lts',          'lata', 163769.26, 'Pintura', array['alba pisos grafito','pintura pisos grafito','latex pisos grafito 20','alba pisos gris'],                              '05132-00000499 21/05/2026'),
  ('Látex frentes Loxon Larga Duración superelástico x 18lts (base EW)', 'lata', 235896.55, 'Pintura', array['loxon frentes superelastico','loxon ld frentes','loxon superelastico 18','lox ld frentes sup elast','loxon frentes 18'],  '05132-00000499 21/05/2026'),
  ('Esmalte al agua satinado blanco x 1lt (Kem Satinado)',               'lata',  15808.93, 'Pintura', array['kem satinado blanco 1','kem satinado 1 lt','esmalte al agua satinado 1'],                                        '05132-00000499 21/05/2026'),
  ('Látex interior Loxon Larga Duración Soft Touch blanco x 20lts',      'lata', 224353.35, 'Pintura', array['loxon interior soft touch','loxon ld interior soft touch','loxon soft touch 20','sw7100','loxon soft touch blanco'], '05132-00000499 21/05/2026'),
  ('Aguarrás x 200lts (tambor)',                                         'unid', 609381.83, 'Pintura', array['hydrarras 200','tambor de aguarras','aguarras tambor','aguarras x 200'],                                          '05132-00000499 21/05/2026'),
  ('Thinner x 200lts (tambor)',                                          'unid', 653183.45, 'Pintura', array['thinner solvex 200','tambor de thinner','thinner tambor','solvex hydra','thinner x 200'],                         '05132-00000499 21/05/2026'),
  ('Film protector c/ cinta washi 1,4m (Wells)',                         'unid',   6053.78, 'Pintura', array['film protector con cinta','film wells','film con cinta washi','film protector transparente con cinta'],           '05132-00000499 21/05/2026'),
  ('Viruta de acero mediana x 330g',                                     'unid',   3684.46, 'Pintura', array['viruta de acero','viruta mediana','lana de acero','virulana gruesa','viruta de acero 330'],                       '05132-00000499 21/05/2026'),
  ('Laca acrílica brillante Melacril x 4lts (Petrilac)',                 'lata', 119797.64, 'Pintura', array['laca melacril','melacril brillante 4','laca acrilica brillante','laca melacril 4'],                               '05132-00000499 21/05/2026'),
  ('Diluyente p/ lacas y barnices x 1lt (Petrilac)',                     'lata',  22463.24, 'Pintura', array['diluyente petrilac','diluyente para lacas','diluyente barnices','diluyente para lacas y barnices 1'],              '05132-00000499 21/05/2026'),
  ('Tinta p/ madera Petrilac caoba x 240ml',                             'unid',   7928.49, 'Pintura', array['tinta petrilac caoba','tinta color caoba','tinta teka caoba','tinta para madera caoba'],                          '05132-00000499 21/05/2026'),
  ('Impregnante p/ ladrillo incoloro Brik-Col x 4lts',                   'lata',  61861.63, 'Pintura', array['brik col','brikcol incoloro','impregnante ladrillo visto','impregnacion ladrillo','brik-col 4'],                  '05132-00000499 21/05/2026'),
  ('Enduido exterior Casablanca blanco x 20lts',                         'balde', 44371.42, 'Pintura', array['enduido exterior casablanca','enduido exterior 20','casablanca enduido exterior','enduido casablanca'],           '05132-00000499 21/05/2026'),
  ('Aire acondicionado split inverter 3000 frig. BGH R32 (3650 W)',      'unid', 651387.01, 'Ferretería general', array['aire acondicionado 3000','split 3000 frigorias','bgh inverter 3000','aire split bgh','split inverter r32','aire bgh 3139'], '05132-00000543 11/06/2026'),
  ('Látex exterior Loxon Larga Duración mate x 18lts (base Deep)',       'lata', 156956.51, 'Pintura', array['loxon exterior mate deep','lox ld ext mate deep','loxon ld exterior deep 18','loxon exterior color oscuro'],      '05132-00000589 10/07/2026'),
  ('Látex exterior Loxon Larga Duración mate x 18lts (base EW)',         'lata', 152785.81, 'Pintura', array['loxon exterior mate ew','loxon exterior mate blanco 18','lox ld ext mate ew','loxon ld exterior 18'],            '05132-00000589 10/07/2026'),
  ('Esmalte al agua satinado Kem x 3,6lts (base EW)',                    'lata',  54170.65, 'Pintura', array['kem satinado 3.6','kem satinado ew 3,6','kem satinado 4','kem satinado color'],                                    '05132-00000589 10/07/2026'),
  ('Revestimiento texturado Shertex travertino medio x 25kg',            'balde', 87387.57, 'Pintura', array['shertex travertino','revestimiento texturado medio','shertex 25','texturado travertino','revestimiento plastico texturado'], '05132-00000589 10/07/2026'),
  ('Látex interior Loxon Larga Duración mate x 18lts (base EW)',         'lata', 172992.91, 'Pintura', array['loxon interior mate ew','lox ld int mate','loxon ld interior 18','loxon interior 18','loxon interior mate blanco'], '05132-00000619 05/08/2026'),
  ('Látex exterior/interior Sherwin Pro 720 x 20lts',                    'lata',  85454.52, 'Pintura', array['sherwin pro 720','pro 720','latex pro 720 20','sherwin 720'],                                                    '05132-00000619 05/08/2026'),
  ('Sellador acrílico Sikacryl blanco x 5kg',                            'unid',  56012.54, 'Pintura', array['sikacryl x 5','sikacryl 5 kg','sellador sikacryl balde','sikacryl blanco 5'],                                       '05132-00000619 05/08/2026')
) as v(nombre, unidad, precio_ref, rubro, alias, fuente)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- 3) Clínica Salta: dos renglones sin precio que ahora tienen precio en el catálogo ──
create temp table precios (item_id int, precio numeric, fuente text);
insert into precios
select i.id, m.precio_ref, 'precio de referencia del catálogo (' || m.nombre || ', Prestigio)'
from public.solicitud_compra_item i
join public.solicitud_compra s on s.id = i.solicitud_id
join public.stock_materiales m on m.id = i.material_id
where s.obra_cod = 'CC CLINICA SALTA' and m.id in (170, 1094) and coalesce(i.precio_unit, 0) = 0;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Precio cargado: $' || p.precio || ' (' || p.fuente || ')',
       jsonb_build_object('motivo', 'CC CLINICA SALTA precios 2026-09-04', 'precio_anterior', i.precio_unit, 'precio_nuevo', p.precio)
from precios p join public.solicitud_compra_item i on i.id = p.item_id;
update public.solicitud_compra_item i set precio_unit = p.precio from precios p where i.id = p.item_id;
update public.materiales_a_cuenta_cliente c set precio_unit = p.precio, precio_total = round(c.cantidad * p.precio, 2), updated_at = now()
  from precios p where c.item_id = p.item_id and c.precio_unit = 0 and c.cobro_id is null;
drop table precios;
