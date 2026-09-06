-- 20260906i — Térmicas de todos los polos y amperajes por marca (Schneider Easy9, ABB SH200L, Sica Limit) + Elibet (selectores de fase y conmutadoras 1-0-2)
--
-- User 2026-09-06: "cargá las térmicas de todos los amperajes, unipolar, bipolar,
-- tripolar, tetrapolar; también tenemos selectores de fase y conmutadoras Elibet".
-- Precios Mercado Libre 06/09/2026 (final, con IVA), marcados ESTIMADO; la URL de
-- la publicación queda en obs. Escalera: 1P 10–40 A, 2P 10–63 A, 3P y 4P 16–63 A.
-- Cada calibre tiene su fila "sin marca" (las genéricas existentes se renombran,
-- las que faltaban se crean en $0) y una fila por marca. 2x16/2x25/2x40 ya
-- estaban (20260906h). Sica Limit (3 kA) no fabrica 16 A: para 1x16, 3x16 y 4x16
-- se cargó la línea de 6 kA / 4,5 kA y se aclara en el nombre. Elibet: nombre con
-- polos, corriente, montaje (panel / riel DIN) y modelo de fábrica.

-- ═══ 1) escalera de genéricos "sin marca" ═════════════════════════════════
create temp table escalera (polos int, amperes int, generic_id int);
insert into escalera values
  (1, 10, 241),
  (1, 16, 45),
  (1, 20, 46),
  (1, 25, 47),
  (1, 32, null),
  (1, 40, null),
  (2, 10, 974),
  (2, 16, 242),
  (2, 20, 48),
  (2, 25, 243),
  (2, 32, 49),
  (2, 40, 244),
  (2, 50, null),
  (2, 63, 1230),
  (3, 16, null),
  (3, 20, null),
  (3, 25, null),
  (3, 32, null),
  (3, 40, null),
  (3, 50, null),
  (3, 63, null),
  (4, 16, null),
  (4, 20, null),
  (4, 25, null),
  (4, 32, null),
  (4, 40, null),
  (4, 50, null),
  (4, 63, null);

update public.stock_materiales m
   set nombre = 'Térmica ' || e.polos || 'x' || e.amperes || 'A sin marca',
       alias = array(select distinct x from unnest(coalesce(m.alias,'{}') || array['termica ' || e.polos || 'x' || e.amperes, 'llave termica ' || e.polos || 'x' || e.amperes, 'termomagnetica ' || e.polos || 'x' || e.amperes,
                     'termica ' || case e.polos when 1 then 'unipolar' when 2 then 'bipolar' when 3 then 'tripolar' else 'tetrapolar' end || ' ' || e.amperes]) x where x !~ '(abb|schneider|sica)'),
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: queda para los renglones que no dicen marca; Schneider, ABB y Sica tienen fila propia.',
       updated_at = now()
  from escalera e where m.id = e.generic_id and m.nombre not like '%sin marca%';

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select 'Térmica ' || e.polos || 'x' || e.amperes || 'A sin marca', 'unid', 0, 2,
       array['termica ' || e.polos || 'x' || e.amperes, 'llave termica ' || e.polos || 'x' || e.amperes, 'termomagnetica ' || e.polos || 'x' || e.amperes,
             'termica ' || case e.polos when 1 then 'unipolar' when 2 then 'bipolar' when 3 then 'tripolar' else 'tetrapolar' end || ' ' || e.amperes,
             'termica ' || case e.polos when 1 then 'unipolar' when 2 then 'bipolar' when 3 then 'tripolar' else 'tetrapolar' end || ' ' || e.amperes || 'a'],
       'material', true, 'Alta 2026-09-06 (escalera de térmicas). Sin marca ni precio: las marcas tienen fila propia.'
from escalera e
where e.generic_id is null
  and not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower('Térmica ' || e.polos || 'x' || e.amperes || 'A sin marca'));

-- ═══ 2) filas por marca ═══════════════════════════════════════════════════
create temp table term_marca (marca text, polos int, amperes int, linea text, codigo text, precio numeric, url text);
insert into term_marca values
  ('ABB', 1, 10, 'SH200L, 4,5kA', 'sh201l-c10', 8838.0, 'https://www.mercadolibre.com.ar/p/MLA2070239047'),
  ('ABB', 1, 16, 'SH200L, 4,5kA', 'sh201l-c16', 8280.0, 'https://www.mercadolibre.com.ar/p/MLA2051896991'),
  ('ABB', 1, 20, 'SH200L, 4,5kA', 'sh201l-c20', 8280.0, 'https://articulo.mercadolibre.com.ar/MLA-897952900'),
  ('ABB', 1, 25, 'SH200L, 4,5kA', 'sh201l-c25', 8838.0, 'https://www.mercadolibre.com.ar/p/MLA2056947837'),
  ('ABB', 1, 32, 'SH200L, 4,5kA', 'sh201l-c32', 11080.0, 'https://articulo.mercadolibre.com.ar/MLA-760438312'),
  ('ABB', 1, 40, 'SH200L, 4,5kA', 'sh201l-c40', 11080.0, 'https://www.mercadolibre.com.ar/p/MLA2047321572'),
  ('ABB', 2, 10, 'SH200L, 4,5kA', 'sh202l-c10', 14993.0, 'https://articulo.mercadolibre.com.ar/MLA-3069838270'),
  ('ABB', 2, 20, 'SH200L, 4,5kA', 'sh202l-c20', 14993.0, 'https://articulo.mercadolibre.com.ar/MLA-2034291120'),
  ('ABB', 2, 32, 'SH200L, 4,5kA', 'sh202l-c32', 18999.0, 'https://www.mercadolibre.com.ar/p/MLA25946548'),
  ('ABB', 2, 50, 'SH200L, 4,5kA', 'sh202l-c50', 40400.0, 'https://www.mercadolibre.com.ar/p/MLA32447514'),
  ('ABB', 2, 63, 'SH200L, 4,5kA', 'sh202l-c63', 32653.0, 'https://www.mercadolibre.com.ar/p/MLA32630930'),
  ('ABB', 3, 16, 'SH200L, 4,5kA', 'sh203l-c16', 21300.0, 'https://www.mercadolibre.com.ar/p/MLA38674603'),
  ('ABB', 3, 20, 'SH200L, 4,5kA', 'sh203l-c20', 33953.0, 'https://www.mercadolibre.com.ar/p/MLA38674927'),
  ('ABB', 3, 25, 'SH200L, 4,5kA', 'sh203l-c25', 33953.0, 'https://www.mercadolibre.com.ar/p/MLA38676605'),
  ('ABB', 3, 32, 'SH200L, 4,5kA', 'sh203l-c32', 35602.0, 'https://www.mercadolibre.com.ar/p/MLA45902523'),
  ('ABB', 3, 40, 'SH200L, 4,5kA', 'sh203l-c40', 35602.0, 'https://www.mercadolibre.com.ar/p/MLA51391290'),
  ('ABB', 3, 50, 'SH200L, 4,5kA', 'sh203l-c50', 59500.0, 'https://www.mercadolibre.com.ar/p/MLA50528336'),
  ('ABB', 3, 63, 'SH200L, 4,5kA', 'sh203l-c63', 60415.0, 'https://www.mercadolibre.com.ar/p/MLA2048979643'),
  ('ABB', 4, 16, 'SH200L, 4,5kA', 'sh204l-c16', 39441.0, 'https://www.mercadolibre.com.ar/p/MLA2042549704'),
  ('ABB', 4, 20, 'SH200L, 4,5kA', 'sh204l-c20', 43192.0, 'https://www.mercadolibre.com.ar/p/MLA36943066'),
  ('ABB', 4, 25, 'SH200L, 4,5kA', 'sh204l-c25', 49990.0, 'https://articulo.mercadolibre.com.ar/MLA-1557008232'),
  ('ABB', 4, 32, 'SH200L, 4,5kA', 'sh204l-c32', 47200.0, 'https://www.mercadolibre.com.ar/p/MLA26107434'),
  ('ABB', 4, 40, 'SH200L, 4,5kA', 'sh204l-c40', 46600.0, 'https://articulo.mercadolibre.com.ar/MLA-784039514'),
  ('ABB', 4, 50, 'SH200L, 4,5kA', 'sh204l-c50', 82576.0, 'https://articulo.mercadolibre.com.ar/MLA-760895432'),
  ('ABB', 4, 63, 'SH200L, 4,5kA', 'sh204l-c63', 73200.0, 'https://www.mercadolibre.com.ar/p/MLA32675678'),
  ('Sica', 1, 10, 'Limit, 3kA', '782110', 5972.0, 'https://articulo.mercadolibre.com.ar/MLA-607381741'),
  ('Sica', 1, 16, '6kA', '763116', 5499.0, 'https://www.mercadolibre.com.ar/up/MLAU5081814881'),
  ('Sica', 1, 20, 'Limit, 3kA', '782120', 5972.0, 'https://articulo.mercadolibre.com.ar/MLA-607384293'),
  ('Sica', 1, 25, 'Limit, 3kA', '782125', 5082.0, 'https://www.mercadolibre.com.ar/up/MLAU3268818293'),
  ('Sica', 1, 32, 'Limit, 3kA', '782132', 5145.44, 'https://www.mercadolibre.com.ar/p/MLA2071304629'),
  ('Sica', 1, 40, 'Limit, 3kA', '782140', 6309.21, 'https://www.mercadolibre.com.ar/up/MLAU141849483'),
  ('Sica', 2, 10, 'Limit, 3kA', '782210', 8900.0, 'https://www.mercadolibre.com.ar/p/MLA2054858485'),
  ('Sica', 2, 20, 'Limit, 3kA', '782220', 10003.0, 'https://www.mercadolibre.com.ar/up/MLAU208224667'),
  ('Sica', 2, 32, 'Limit, 3kA', '782232', 9171.3, 'https://www.mercadolibre.com.ar/up/MLAU298812093'),
  ('Sica', 2, 50, 'Limit, 3kA', '782250', 13270.0, 'https://www.mercadolibre.com.ar/up/MLAU169277621'),
  ('Sica', 2, 63, 'Limit, 3kA', '782263', 21564.0, 'https://articulo.mercadolibre.com.ar/MLA-614135604'),
  ('Sica', 3, 16, '6kA', '763316', 17000.0, 'https://www.mercadolibre.com.ar/up/MLAU4723698604'),
  ('Sica', 3, 20, 'Limit, 3kA', '782320', 13200.0, 'https://www.mercadolibre.com.ar/up/MLAU3268816897'),
  ('Sica', 3, 25, 'Limit, 3kA', '782325', 20386.0, 'https://www.mercadolibre.com.ar/up/MLAU243439356'),
  ('Sica', 3, 32, 'Limit, 3kA', '782332', 15152.5, 'https://www.mercadolibre.com.ar/up/MLAU211549202'),
  ('Sica', 3, 40, 'Limit, 3kA', '782340', 11342.29, 'https://articulo.mercadolibre.com.ar/MLA-1412871456'),
  ('Sica', 3, 50, 'Limit, 3kA', '782350', 23620.67, 'https://www.mercadolibre.com.ar/p/MLA2054150047'),
  ('Sica', 3, 63, 'Limit, 3kA', '782363', 19743.0, 'https://www.mercadolibre.com.ar/up/MLAU186630284'),
  ('Sica', 4, 16, '4,5kA', '', 18630.0, 'https://www.mercadolibre.com.ar/p/MLA2049874708'),
  ('Sica', 4, 20, 'Limit, 3kA', '782420', 15106.44, 'https://www.mercadolibre.com.ar/up/MLAU347626797'),
  ('Sica', 4, 25, 'Limit, 3kA', '782425', 18681.0, 'https://www.mercadolibre.com.ar/p/MLA2059189852'),
  ('Sica', 4, 32, 'Limit, 3kA', '782432', 22800.0, 'https://www.mercadolibre.com.ar/p/MLA2046471742'),
  ('Sica', 4, 40, 'Limit, 3kA', '782440', 21279.71, 'https://www.mercadolibre.com.ar/p/MLA2048141692'),
  ('Sica', 4, 50, 'Limit, 3kA', '782450', 22999.0, 'https://www.mercadolibre.com.ar/p/MLA33510187'),
  ('Sica', 4, 63, 'Limit, 3kA', '782463', 29165.0, 'https://www.mercadolibre.com.ar/p/MLA2100117824'),
  ('Schneider', 1, 10, 'Easy9, 4,5kA', 'ez9f34110', 9066.63, 'https://www.mercadolibre.com.ar/p/MLA46044150'),
  ('Schneider', 1, 16, 'Easy9, 4,5kA', 'ez9f34116', 8811.09, 'https://www.mercadolibre.com.ar/p/MLA37795275'),
  ('Schneider', 1, 20, 'Easy9, 4,5kA', 'ez9f34120', 11169.18, 'https://www.mercadolibre.com.ar/up/MLAU384591655'),
  ('Schneider', 1, 25, 'Easy9, 4,5kA', 'ez9f34125', 10869.9, 'https://www.mercadolibre.com.ar/p/MLA27415246'),
  ('Schneider', 1, 32, 'Easy9, 4,5kA', 'ez9f34132', 15345.69, 'https://www.mercadolibre.com.ar/p/MLA28859949'),
  ('Schneider', 1, 40, 'Easy9, 4,5kA', 'ez9f34140', 12912.0, 'https://www.mercadolibre.com.ar/p/MLA37796579'),
  ('Schneider', 2, 10, 'Easy9, 4,5kA', 'ez9f34210', 15999.0, 'https://www.mercadolibre.com.ar/up/MLAU1480698691'),
  ('Schneider', 2, 20, 'Easy9, 4,5kA', 'ez9f34220', 22595.7, 'https://www.mercadolibre.com.ar/up/MLAU2918121743'),
  ('Schneider', 2, 32, 'Easy9, 4,5kA', 'ez9f34232', 21655.78, 'https://www.mercadolibre.com.ar/up/MLAU1484488990'),
  ('Schneider', 2, 50, 'Easy9, 4,5kA', 'ez9f34250', 32816.8, 'https://www.mercadolibre.com.ar/p/MLA38251166'),
  ('Schneider', 2, 63, 'Easy9, 4,5kA', 'ez9f34263', 34255.84, 'https://www.mercadolibre.com.ar/up/MLAU1487397064'),
  ('Schneider', 3, 16, 'Easy9, 4,5kA', 'ez9f34316', 35420.0, 'https://www.mercadolibre.com.ar/p/MLA32043456'),
  ('Schneider', 3, 20, 'Easy9, 4,5kA', 'ez9f34320', 38163.79, 'https://www.mercadolibre.com.ar/up/MLAU214093920'),
  ('Schneider', 3, 25, 'Easy9, 4,5kA', 'ez9f34325', 23712.36, 'https://www.mercadolibre.com.ar/up/MLAU183196339'),
  ('Schneider', 3, 32, 'Easy9, 4,5kA', 'ez9f34332', 37655.8, 'https://www.mercadolibre.com.ar/up/MLAU261527512'),
  ('Schneider', 3, 40, 'Easy9, 4,5kA', 'ez9f34340', 39144.04, 'https://www.mercadolibre.com.ar/p/MLA22813967'),
  ('Schneider', 3, 50, 'Easy9, 4,5kA', 'ez9f34350', 78266.69, 'https://www.mercadolibre.com.ar/up/MLAU251570857'),
  ('Schneider', 3, 63, 'Easy9, 4,5kA', 'ez9f34363', 62573.95, 'https://www.mercadolibre.com.ar/up/MLAU127573799'),
  ('Schneider', 4, 16, 'Easy9, 4,5kA', 'ez9f34416', 40499.0, 'https://www.mercadolibre.com.ar/p/MLA29045092'),
  ('Schneider', 4, 20, 'Easy9, 4,5kA', 'ez9f34420', 40499.0, 'https://www.mercadolibre.com.ar/p/MLA37781224'),
  ('Schneider', 4, 25, 'Easy9, 4,5kA', 'ez9f34425', 35000.0, 'https://www.mercadolibre.com.ar/p/MLA29524381'),
  ('Schneider', 4, 32, 'Easy9, 4,5kA', 'ez9f34432', 49899.0, 'https://www.mercadolibre.com.ar/p/MLA24748654'),
  ('Schneider', 4, 40, 'Easy9, 4,5kA', 'ez9f34440', 50550.0, 'https://www.mercadolibre.com.ar/up/MLAU295595410'),
  ('Schneider', 4, 50, 'Easy9, 4,5kA', 'ez9f34450', 77100.0, 'https://www.mercadolibre.com.ar/p/MLA2043124551'),
  ('Schneider', 4, 63, 'Easy9, 4,5kA', 'ez9f34463', 63639.88, 'https://www.mercadolibre.com.ar/p/MLA26771682');

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select 'Térmica ' || t.polos || 'x' || t.amperes || 'A ' || t.marca || ' (' || t.linea || ')', 'unid', t.precio, 2,
       array(select distinct x from unnest(array[
             'termica ' || t.polos || 'x' || t.amperes || ' ' || lower(t.marca),
             lower(t.marca) || ' ' || t.polos || 'x' || t.amperes,
             'llave termica ' || t.polos || 'x' || t.amperes || ' ' || lower(t.marca),
             'termica ' || case t.polos when 1 then 'unipolar' when 2 then 'bipolar' when 3 then 'tripolar' else 'tetrapolar' end || ' ' || t.amperes || ' ' || lower(t.marca),
             lower(split_part(t.linea, ',', 1)) || ' ' || t.polos || 'x' || t.amperes,
             nullif(t.codigo, '')]) x where x is not null),
       'material', true,
       'Alta 2026-09-06 (térmicas por marca). Referencia ESTIMADA: Mercado Libre 06/09/2026 $' || t.precio || ' (' || t.linea || case when t.codigo <> '' then ', cód. ' || upper(t.codigo) else '' end || '). ' || t.url || ' — ajustar con la primera compra real.'
from term_marca t
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower('Térmica ' || t.polos || 'x' || t.amperes || 'A ' || t.marca || ' (' || t.linea || ')'));

-- ═══ 3) Elibet ════════════════════════════════════════════════════════════
create temp table elibet (nombre text, precio numeric, alias text[], url text, nota text);
insert into elibet values
  ('Selector de fase trifásico c/ neutro 20A Elibet (panel, 20603N/0)', 24867.0, array['selector de fase 20','selectora de fase 20','selector de fase 20a','llave selectora de fase 20','selector de fase elibet 20','selector de fase eliber 20','elibet 20603n/0','selector de fase c/ neutro 20','selector de fase panel 20']::text[], 'https://articulo.mercadolibre.com.ar/MLA-1414058231', '+50'),
  ('Selector de fase trifásico c/ neutro 20A Elibet (riel DIN, 20603N/2)', 26283.0, array['selector de fase 20','selectora de fase 20','selector de fase 20a','llave selectora de fase 20','selector de fase elibet 20','selector de fase eliber 20','elibet 20603n/2','selector de fase c/ neutro 20','selector de fase riel din 20']::text[], 'https://www.mercadolibre.com.ar/p/MLA59581906', '+100'),
  ('Selector de fase trifásico sin neutro 20A Elibet (panel, 20601/0)', 23989.0, array['selector de fase 20','selectora de fase 20','selector de fase 20a','llave selectora de fase 20','selector de fase elibet 20','selector de fase eliber 20','elibet 20601/0','selector de fase sin neutro 20','selector de fase panel 20']::text[], 'https://articulo.mercadolibre.com.ar/MLA-747984000', 'sin neutro'),
  ('Selector de fase trifásico c/ neutro 32A Elibet (panel, 32603N/0)', 52533.0, array['selector de fase 32','selectora de fase 32','selector de fase 32a','llave selectora de fase 32','selector de fase elibet 32','selector de fase eliber 32','elibet 32603n/0','selector de fase c/ neutro 32','selector de fase panel 32']::text[], 'https://articulo.mercadolibre.com.ar/MLA-925824450', 'otra 48.639'),
  ('Selector de fase trifásico sin neutro 32A Elibet (panel, 32601/0)', 32051.0, array['selector de fase 32','selectora de fase 32','selector de fase 32a','llave selectora de fase 32','selector de fase elibet 32','selector de fase eliber 32','elibet 32601/0','selector de fase sin neutro 32','selector de fase panel 32']::text[], 'https://articulo.mercadolibre.com.ar/MLA-899500507', 'sin neutro, +25'),
  ('Selector de fase trifásico c/ neutro 40A Elibet (panel, 40603N/0)', 41392.0, array['selector de fase 40','selectora de fase 40','selector de fase 40a','llave selectora de fase 40','selector de fase elibet 40','selector de fase eliber 40','elibet 40603n/0','selector de fase c/ neutro 40','selector de fase panel 40']::text[], 'https://articulo.mercadolibre.com.ar/MLA-3366501994', '+100, el más vendido'),
  ('Selector de fase trifásico c/ neutro 40A Elibet (riel DIN, 40603N/2)', 51774.0, array['selector de fase 40','selectora de fase 40','selector de fase 40a','llave selectora de fase 40','selector de fase elibet 40','selector de fase eliber 40','elibet 40603n/2','selector de fase c/ neutro 40','selector de fase riel din 40']::text[], 'https://articulo.mercadolibre.com.ar/MLA-1111708765', '+50'),
  ('Selector de fase trifásico sin neutro 40A Elibet (panel, 40601/0)', 35861.0, array['selector de fase 40','selectora de fase 40','selector de fase 40a','llave selectora de fase 40','selector de fase elibet 40','selector de fase eliber 40','elibet 40601/0','selector de fase sin neutro 40','selector de fase panel 40']::text[], 'https://www.mercadolibre.com.ar/p/MLA28064085', 'sin neutro, +1000'),
  ('Selector de fase trifásico c/ neutro 63A Elibet (panel, 63603N/0)', 67979.0, array['selector de fase 63','selectora de fase 63','selector de fase 63a','llave selectora de fase 63','selector de fase elibet 63','selector de fase eliber 63','elibet 63603n/0','selector de fase c/ neutro 63','selector de fase panel 63']::text[], 'https://articulo.mercadolibre.com.ar/MLA-727100097', 'otra 71.900 +50'),
  ('Selector de fase trifásico c/ neutro 63A Elibet (riel DIN, 63603N/2)', 77999.0, array['selector de fase 63','selectora de fase 63','selector de fase 63a','llave selectora de fase 63','selector de fase elibet 63','selector de fase eliber 63','elibet 63603n/2','selector de fase c/ neutro 63','selector de fase riel din 63']::text[], 'https://articulo.mercadolibre.com.ar/MLA-2722313896', ''),
  ('Selector de fase trifásico sin neutro 63A Elibet (panel, 63601/0)', 63000.0, array['selector de fase 63','selectora de fase 63','selector de fase 63a','llave selectora de fase 63','selector de fase elibet 63','selector de fase eliber 63','elibet 63601/0','selector de fase sin neutro 63','selector de fase panel 63']::text[], 'https://www.mercadolibre.com.ar/p/MLA49345366', 'sin neutro, +100'),
  ('Selector de fase trifásico c/ neutro 80A Elibet (panel, 80603N/0)', 106400.0, array['selector de fase 80','selectora de fase 80','selector de fase 80a','llave selectora de fase 80','selector de fase elibet 80','selector de fase eliber 80','elibet 80603n/0','selector de fase c/ neutro 80','selector de fase panel 80']::text[], 'https://articulo.mercadolibre.com.ar/MLA-606740293', 'máximo manual Elibet'),
  ('Conmutadora 1-0-2 bipolar 20A Elibet (panel, 20102/0)', 23886.0, array['conmutadora bipolar 20','llave conmutadora bipolar 20','conmutadora 20 bipolar','conmutadora grupo electrogeno 20 bipolar','llave inversora bipolar 20','conmutadora elibet 20 bipolar','conmutadora eliber 20 bipolar','elibet 20102/0','conmutadora bipolar 20 panel']::text[], 'https://articulo.mercadolibre.com.ar/MLA-661294484', '+100'),
  ('Conmutadora 1-0-2 bipolar 20A Elibet (riel DIN, 20102/2)', 25344.0, array['conmutadora bipolar 20','llave conmutadora bipolar 20','conmutadora 20 bipolar','conmutadora grupo electrogeno 20 bipolar','llave inversora bipolar 20','conmutadora elibet 20 bipolar','conmutadora eliber 20 bipolar','elibet 20102/2','conmutadora bipolar 20 riel din']::text[], 'https://articulo.mercadolibre.com.ar/MLA-876290309', '+100'),
  ('Conmutadora 1-0-2 bipolar 32A Elibet (panel, 32102/0)', 36274.0, array['conmutadora bipolar 32','llave conmutadora bipolar 32','conmutadora 32 bipolar','conmutadora grupo electrogeno 32 bipolar','llave inversora bipolar 32','conmutadora elibet 32 bipolar','conmutadora eliber 32 bipolar','elibet 32102/0','conmutadora bipolar 32 panel']::text[], 'https://www.mercadolibre.com.ar/p/MLA35419668', '+500'),
  ('Conmutadora 1-0-2 bipolar 32A Elibet (riel DIN, RCO2.32)', 33607.0, array['conmutadora bipolar 32','llave conmutadora bipolar 32','conmutadora 32 bipolar','conmutadora grupo electrogeno 32 bipolar','llave inversora bipolar 32','conmutadora elibet 32 bipolar','conmutadora eliber 32 bipolar','elibet rco2.32','conmutadora bipolar 32 riel din']::text[], 'https://www.mercadolibre.com.ar/p/MLA47336676', '+1000'),
  ('Conmutadora 1-0-2 bipolar 40A Elibet (panel, 40102/0)', 39687.0, array['conmutadora bipolar 40','llave conmutadora bipolar 40','conmutadora 40 bipolar','conmutadora grupo electrogeno 40 bipolar','llave inversora bipolar 40','conmutadora elibet 40 bipolar','conmutadora eliber 40 bipolar','elibet 40102/0','conmutadora bipolar 40 panel']::text[], 'https://articulo.mercadolibre.com.ar/MLA-661291081', '+100'),
  ('Conmutadora 1-0-2 bipolar 40A Elibet (riel DIN, RCO2.40)', 47704.0, array['conmutadora bipolar 40','llave conmutadora bipolar 40','conmutadora 40 bipolar','conmutadora grupo electrogeno 40 bipolar','llave inversora bipolar 40','conmutadora elibet 40 bipolar','conmutadora eliber 40 bipolar','elibet rco2.40','conmutadora bipolar 40 riel din']::text[], 'https://articulo.mercadolibre.com.ar/MLA-1122064339', '+100'),
  ('Conmutadora 1-0-2 bipolar 63A Elibet (panel, 63102/0)', 66042.0, array['conmutadora bipolar 63','llave conmutadora bipolar 63','conmutadora 63 bipolar','conmutadora grupo electrogeno 63 bipolar','llave inversora bipolar 63','conmutadora elibet 63 bipolar','conmutadora eliber 63 bipolar','elibet 63102/0','conmutadora bipolar 63 panel']::text[], 'https://articulo.mercadolibre.com.ar/MLA-814764526', 'otra 62.238 +50'),
  ('Conmutadora 1-0-2 bipolar 63A Elibet (riel DIN, 63102/2)', 92748.0, array['conmutadora bipolar 63','llave conmutadora bipolar 63','conmutadora 63 bipolar','conmutadora grupo electrogeno 63 bipolar','llave inversora bipolar 63','conmutadora elibet 63 bipolar','conmutadora eliber 63 bipolar','elibet 63102/2','conmutadora bipolar 63 riel din']::text[], 'https://www.mercadolibre.com.ar/p/MLA2098495570', '+100'),
  ('Conmutadora 1-0-2 bipolar 100A Elibet (riel DIN, 100102/2)', 106854.0, array['conmutadora bipolar 100','llave conmutadora bipolar 100','conmutadora 100 bipolar','conmutadora grupo electrogeno 100 bipolar','llave inversora bipolar 100','conmutadora elibet 100 bipolar','conmutadora eliber 100 bipolar','elibet 100102/2','conmutadora bipolar 100 riel din']::text[], 'https://articulo.mercadolibre.com.ar/MLA-3226815726', 'publicación por mayor'),
  ('Conmutadora 1-0-2 tetrapolar 20A Elibet (panel, 20104/0)', 47756.0, array['conmutadora tetrapolar 20','llave conmutadora tetrapolar 20','conmutadora 20 tetrapolar','conmutadora grupo electrogeno 20 tetrapolar','llave inversora tetrapolar 20','conmutadora elibet 20 tetrapolar','conmutadora eliber 20 tetrapolar','elibet 20104/0','conmutadora tetrapolar 20 panel']::text[], 'https://articulo.mercadolibre.com.ar/MLA-861758606', ''),
  ('Conmutadora 1-0-2 tetrapolar 32A Elibet (panel, 32104/0)', 67526.0, array['conmutadora tetrapolar 32','llave conmutadora tetrapolar 32','conmutadora 32 tetrapolar','conmutadora grupo electrogeno 32 tetrapolar','llave inversora tetrapolar 32','conmutadora elibet 32 tetrapolar','conmutadora eliber 32 tetrapolar','elibet 32104/0','conmutadora tetrapolar 32 panel']::text[], 'https://www.mercadolibre.com.ar/p/MLA74453434', '+25'),
  ('Conmutadora 1-0-2 tetrapolar 32A Elibet (riel DIN, 32103N/2)', 67670.0, array['conmutadora tetrapolar 32','llave conmutadora tetrapolar 32','conmutadora 32 tetrapolar','conmutadora grupo electrogeno 32 tetrapolar','llave inversora tetrapolar 32','conmutadora elibet 32 tetrapolar','conmutadora eliber 32 tetrapolar','elibet 32103n/2','conmutadora tetrapolar 32 riel din']::text[], 'https://articulo.mercadolibre.com.ar/MLA-1684600662', '+100'),
  ('Conmutadora 1-0-2 tetrapolar 40A Elibet (panel, 40103N/0)', 67780.0, array['conmutadora tetrapolar 40','llave conmutadora tetrapolar 40','conmutadora 40 tetrapolar','conmutadora grupo electrogeno 40 tetrapolar','llave inversora tetrapolar 40','conmutadora elibet 40 tetrapolar','conmutadora eliber 40 tetrapolar','elibet 40103n/0','conmutadora tetrapolar 40 panel']::text[], 'https://www.mercadolibre.com.ar/p/MLA26913928', '+500'),
  ('Conmutadora 1-0-2 tetrapolar 40A Elibet (riel DIN, 40103N/2)', 81521.0, array['conmutadora tetrapolar 40','llave conmutadora tetrapolar 40','conmutadora 40 tetrapolar','conmutadora grupo electrogeno 40 tetrapolar','llave inversora tetrapolar 40','conmutadora elibet 40 tetrapolar','conmutadora eliber 40 tetrapolar','elibet 40103n/2','conmutadora tetrapolar 40 riel din']::text[], 'https://articulo.mercadolibre.com.ar/MLA-1289641818', ''),
  ('Conmutadora 1-0-2 tetrapolar 63A Elibet (panel, 63103N/0)', 101484.0, array['conmutadora tetrapolar 63','llave conmutadora tetrapolar 63','conmutadora 63 tetrapolar','conmutadora grupo electrogeno 63 tetrapolar','llave inversora tetrapolar 63','conmutadora elibet 63 tetrapolar','conmutadora eliber 63 tetrapolar','elibet 63103n/0','conmutadora tetrapolar 63 panel']::text[], 'https://www.mercadolibre.com.ar/p/MLA27106974', '+500'),
  ('Conmutadora 1-0-2 tetrapolar 63A Elibet (riel DIN, 63103N/2)', 161500.0, array['conmutadora tetrapolar 63','llave conmutadora tetrapolar 63','conmutadora 63 tetrapolar','conmutadora grupo electrogeno 63 tetrapolar','llave inversora tetrapolar 63','conmutadora elibet 63 tetrapolar','conmutadora eliber 63 tetrapolar','elibet 63103n/2','conmutadora tetrapolar 63 riel din']::text[], 'https://www.mercadolibre.com.ar/p/MLA61623529', '+100'),
  ('Conmutadora 1-0-2 tetrapolar 80A Elibet (panel, 80103N/0)', 156266.0, array['conmutadora tetrapolar 80','llave conmutadora tetrapolar 80','conmutadora 80 tetrapolar','conmutadora grupo electrogeno 80 tetrapolar','llave inversora tetrapolar 80','conmutadora elibet 80 tetrapolar','conmutadora eliber 80 tetrapolar','elibet 80103n/0','conmutadora tetrapolar 80 panel']::text[], 'https://articulo.mercadolibre.com.ar/MLA-661289133', '+25'),
  ('Conmutadora 1-0-2 tetrapolar 125A Elibet (panel, 125103N/0)', 194431.0, array['conmutadora tetrapolar 125','llave conmutadora tetrapolar 125','conmutadora 125 tetrapolar','conmutadora grupo electrogeno 125 tetrapolar','llave inversora tetrapolar 125','conmutadora elibet 125 tetrapolar','conmutadora eliber 125 tetrapolar','elibet 125103n/0','conmutadora tetrapolar 125 panel']::text[], 'https://articulo.mercadolibre.com.ar/MLA-661288897', ''),
  ('Conmutadora 1-0-2 unipolar 16A Elibet (riel DIN, 16101/2)', 15926.0, array['conmutadora unipolar 16','llave conmutadora unipolar 16','conmutadora 16 unipolar elibet','elibet 16101/2']::text[], 'https://articulo.mercadolibre.com.ar/MLA-1777074153', ''),
  ('Conmutadora 1-0-2 unipolar 25A Elibet (riel DIN, 25101/2)', 25891.0, array['conmutadora unipolar 25','llave conmutadora unipolar 25','conmutadora 25 unipolar elibet','elibet 25101/2']::text[], 'https://articulo.mercadolibre.com.ar/MLA-1386643311', '');

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select e.nombre, 'unid', e.precio, 2, e.alias, 'material', true,
       'Alta 2026-09-06 (Elibet). Referencia ESTIMADA: Mercado Libre 06/09/2026 $' || e.precio || case when e.nota <> '' then ' (' || e.nota || ')' else '' end || '. ' || e.url || ' — ajustar con la primera compra real.'
from elibet e
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(e.nombre));

drop table elibet; drop table term_marca; drop table escalera;
