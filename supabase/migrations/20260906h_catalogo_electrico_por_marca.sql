-- 20260906h — Catálogo eléctrico por marca (user 2026-09-06): llaves/tomas (Kalop, Cambre, Jeluz, Sica), cables (Prysmian, IMSA, Argenplas) y protecciones (Schneider, ABB, Sica)
--
-- "Tomas, puntos, cables, etc. hay que diferenciarlos por marca: la diferencia
-- de precio es muy grande y cada obra pide una marca". Misma receta que los
-- selladores PU (20260906b): una fila por familia + marca. Las filas genéricas
-- de hoy pasan a "sin marca" y se quedan con los renglones viejos que no dicen
-- marca. Los renglones comprados a VOLTAJE pasan a Kalop (sus presupuestos
-- cotizan Kalop) y los comprados por Mercado Libre que decían Cambre, a Cambre.
-- Cables y protecciones: sin movimientos (Voltaje no dice marca).
--
-- Precios: Mercado Libre 06/09/2026, precio final, marcados como estimados
-- (publicaciones en scratchpad ml_*.csv y en obs). Excepciones con compra real:
-- las filas Kalop toman el precio actual del genérico cuando viene de Voltaje
-- (compra real) y la tapa 1 módulo Cambre toma la compra de ML ($3.600).
-- Cimet no tiene estas familias en ML: se usó Argenplas. Jeluz no tiene tapa
-- 10x5 de 1 ni 2 módulos (se arma con tapa de 3 + tapones). Sica Limit es de
-- 3 kA contra 4,5 kA de Schneider/ABB.

-- ═══ 1) llaves, tomas, módulos, tapas ══════════════════════════════════════
create temp table fam_marca (clave text, generic_id int, marca text, precio numeric, codigos text[]);
insert into fam_marca values
  ('modulo_punto', 1274, 'Kalop', 2094.75, array['kl40100','kd40100']::text[]),
  ('modulo_punto', 1274, 'Cambre', 2240.37, array['cambre 6900','6900 siglo xxi']::text[]),
  ('modulo_punto', 1274, 'Jeluz', 2041, array['jeluz 20051','verona 20051']::text[]),
  ('modulo_punto', 1274, 'Sica', 2079, array['sica 550112','sica life 550112']::text[]),
  ('modulo_toma10', 1277, 'Kalop', 2601.96, array['kl40245','kd40245']::text[]),
  ('modulo_toma10', 1277, 'Cambre', 3088, array['cambre 6904']::text[]),
  ('modulo_toma10', 1277, 'Jeluz', 2055, array['jeluz 20068','verona 20068']::text[]),
  ('modulo_toma10', 1277, 'Sica', 2083.42, array['sica 550912']::text[]),
  ('modulo_toma20', 1279, 'Kalop', 3459.43, array['kl40235','kd40235']::text[]),
  ('modulo_toma20', 1279, 'Cambre', 4892.5, array['cambre 6915']::text[]),
  ('modulo_toma20', 1279, 'Jeluz', 2850, array['jeluz 20059','verona 20059']::text[]),
  ('modulo_toma20', 1279, 'Sica', 3498.46, array['sica 353231']::text[]),
  ('modulo_comb', 251, 'Kalop', 4743.29, array['kd40115','kl40115']::text[]),
  ('modulo_comb', 251, 'Cambre', 2477.1, array['cambre 6901','cambre 021-09501']::text[]),
  ('modulo_comb', 251, 'Jeluz', 2245, array['jeluz 20053','verona 20053']::text[]),
  ('modulo_comb', 251, 'Sica', 2250.6, array['sica 550122']::text[]),
  ('bastidor3', 962, 'Kalop', 2749.05, array['kd40702','ks40702','bastidor kalop']::text[]),
  ('bastidor3', 962, 'Cambre', 2337.21, array['cambre 6970','cambre 021-06950','bastidor 4 modulos cambre']::text[]),
  ('bastidor3', 962, 'Jeluz', 536.22, array['jeluz 15080','bastidor verona']::text[]),
  ('bastidor3', 962, 'Sica', 1870, array['sica 397403','bastidor life']::text[]),
  ('tapa3', 1001, 'Kalop', 3850, array['kd40710','ks40710','tapa kalop 3']::text[]),
  ('tapa3', 1001, 'Cambre', 2032.91, array['cambre 4133','cambre 021-04503']::text[]),
  ('tapa3', 1001, 'Jeluz', 1909.79, array['jeluz 35098','tapa verona 3 modulos']::text[]),
  ('tapa3', 1001, 'Sica', 1832, array['sica 397300','tapa life 3 modulos']::text[]),
  ('tapa1', 1173, 'Kalop', 4275, array['tapa 1 modulo kalop civil']::text[]),
  ('tapa1', 1173, 'Cambre', 2185, array['cambre 4131','cambre 021-04501']::text[]),
  ('tapa1', 1173, 'Sica', 4730.05, array['sica 397100']::text[]),
  ('tapa2', 1176, 'Kalop', 4275, array['tapa 2 modulos kalop civil']::text[]),
  ('tapa2', 1176, 'Cambre', 1285.3, array['cambre 4132','cambre 021-04502']::text[]),
  ('tapa2', 1176, 'Sica', 715, array['sica 397200']::text[]),
  ('llave1p', 53, 'Kalop', 4750, array['ks40750','kalop ks40750']::text[]),
  ('llave1p', 53, 'Cambre', 5073.75, array['llave 1 punto siglo xxi']::text[]),
  ('llave1p', 53, 'Jeluz', 3356.09, array['llave 1 punto verona']::text[]),
  ('llave1p', 53, 'Sica', 2850, array['llave 1 punto life']::text[]),
  ('llave2p', 54, 'Kalop', 7415, array['ks40751','kalop ks40751']::text[]),
  ('llave2p', 54, 'Cambre', 6700, array['llave 2 puntos siglo xxi']::text[]),
  ('llave2p', 54, 'Jeluz', 4198.49, array['llave 2 puntos verona']::text[]),
  ('llave2p', 54, 'Sica', 3499, array['llave 2 puntos life']::text[]),
  ('llave_pt', 55, 'Kalop', 6356, array['ks40754','kalop ks40754']::text[]),
  ('llave_pt', 55, 'Cambre', 7057.8, array['punto y toma siglo xxi']::text[]),
  ('llave_pt', 55, 'Jeluz', 4210.19, array['punto y toma verona']::text[]),
  ('llave_pt', 55, 'Sica', 3605.25, array['punto y toma life']::text[]),
  ('toma_doble', 52, 'Kalop', 5673, array['ks40753','kd40251','kalop ks40753']::text[]),
  ('toma_doble', 52, 'Cambre', 8450, array['toma doble siglo xxi']::text[]),
  ('toma_doble', 52, 'Jeluz', 6091, array['toma doble verona']::text[]),
  ('toma_doble', 52, 'Sica', 3883, array['toma doble life']::text[]),
  ('toma20', 748, 'Kalop', 5812, array['ks40759','kalop ks40759']::text[]),
  ('toma20', 748, 'Cambre', 7416.75, array['toma 20a siglo xxi']::text[]),
  ('toma20', 748, 'Jeluz', 6042, array['toma 20a verona']::text[]),
  ('toma20', 748, 'Sica', 5964.95, array['sica 545224','toma 20a life']::text[]);

create temp table generico as
select g.id, g.nombre, g.alias, g.precio_ref, g.unidad, g.rubro_id, g.usa_color,
       case when position('(' in g.nombre) > 0 then trim(substring(g.nombre from 1 for position('(' in g.nombre) - 1)) else g.nombre end as base,
       case when position('(' in g.nombre) > 0 then substring(g.nombre from position('(' in g.nombre)) else '' end as sufijo,
       array(select a from unnest(coalesce(g.alias,'{}')) a where a !~ '(kalop|cambre|jeluz|sica|kd4|ks4|kl4|021-|verona|life)') as alias_base
from public.stock_materiales g where g.id in (select distinct generic_id from fam_marca);

-- filas por marca
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, usa_color, obs)
select trim(g.base || ' ' || f.marca || ' ' || g.sufijo), g.unidad,
       case when f.marca = 'Kalop' and g.precio_ref > 0 and f.clave not in ('tapa1','tapa2') then g.precio_ref
            when f.marca = 'Cambre' and f.clave = 'tapa1' then 3600
            else f.precio end,
       g.rubro_id,
       array(select distinct x from unnest(
           array(select a || ' ' || lower(f.marca) from unnest(g.alias_base) a)
        || array(select lower(f.marca) || ' ' || a from unnest(g.alias_base) a where a !~ '^(1|2|un|dos|conjunto)')
        || f.codigos) x),
       'material', true, coalesce(g.usa_color, false),
       case when f.marca = 'Kalop' and g.precio_ref > 0 and f.clave not in ('tapa1','tapa2')
              then 'Alta 2026-09-06 (catálogo eléctrico por marca). Precio = última compra real a Voltaje (Kalop) $' || g.precio_ref || '; Mercado Libre 06/09/2026: $' || f.precio || '.'
            when f.marca = 'Cambre' and f.clave = 'tapa1'
              then 'Alta 2026-09-06 (catálogo eléctrico por marca). Precio = compra real por Mercado Libre $3.600; publicación ML 06/09/2026: $' || f.precio || '.'
            else 'Alta 2026-09-06 (catálogo eléctrico por marca). Referencia ESTIMADA: Mercado Libre 06/09/2026 $' || f.precio || ' (línea ' ||
                 case f.marca when 'Kalop' then 'Civil' when 'Cambre' then 'Siglo XXI' when 'Jeluz' then 'Verona' else 'Life' end || '). Ajustar con la primera compra real.' end
from fam_marca f join generico g on g.id = f.generic_id
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(trim(g.base || ' ' || f.marca || ' ' || g.sufijo)));

-- genéricos: "sin marca", sin los códigos de marca
update public.stock_materiales m
   set nombre = trim(g.base || ' sin marca ' || g.sufijo),
       alias = g.alias_base,
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: queda para los renglones que no dicen marca; las marcas (Kalop, Cambre, Jeluz, Sica) tienen fila propia.',
       updated_at = now()
  from generico g where m.id = g.id;

-- movimientos de renglones: Voltaje → Kalop; Mercado Libre / texto "cambre" → Cambre
create temp table mov as
select i.id as item_id, i.solicitud_id, i.estado, i.material_id as de, g.base, g.sufijo,
       case when p.nombre = 'VOLTAJE' then 'Kalop'
            when p.nombre = 'Mercado Libre' or exists (select 1 from public.solicitud_item_eventos e where e.item_id = i.id and e.comentario ilike '%cambre%') then 'Cambre'
       end as marca
from public.solicitud_compra_item i join generico g on g.id = i.material_id left join public.proveedores p on p.id = i.proveedor_id;
delete from mov where marca is null;

create temp table mov_dest as
select mv.*, m.id as a, m.nombre as nuevo_nombre
from mov mv join public.stock_materiales m on lower(m.nombre) = lower(trim(mv.base || ' ' || mv.marca || ' ' || mv.sufijo));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select item_id, solicitud_id, 'correccion', null, estado, 'Catálogo eléctrico por marca: pasa a ' || nuevo_nombre || ' (' || case marca when 'Kalop' then 'comprado a Voltaje, que cotiza Kalop' else 'el pedido o la compra decían Cambre' end || ')',
       jsonb_build_object('motivo', 'electrico por marca 2026-09-06', 'material_anterior', de, 'material_nuevo', a, 'marca', marca)
from mov_dest;
update public.solicitud_compra_item i set material_id = d.a, descripcion = d.nuevo_nombre from mov_dest d where i.id = d.item_id;
update public.materiales_a_cuenta_cliente c set descripcion = d.nuevo_nombre, updated_at = now() from mov_dest d where c.item_id = d.item_id and c.cobro_id is null;

-- ═══ 2) cables ═════════════════════════════════════════════════════════════
create temp table cab_marca (generic_id int, marca text, precio numeric, linea text, nota text);
insert into cab_marca values
  (36, 'Prysmian', 738.0, 'Superastic', 'rollo de 100 m'),
  (36, 'IMSA', 656.48, 'Plastix CF', 'rollo de 100 m'),
  (36, 'Argenplas', 673.2, '', 'rollo de 100 m'),
  (37, 'Prysmian', 1097.0, 'Superastic', 'rollo de 100 m'),
  (37, 'IMSA', 1066.14, 'Plastix CF', 'rollo de 100 m'),
  (37, 'Argenplas', 997.56, '', 'rollo de 100 m'),
  (38, 'Prysmian', 1979.31, 'Superastic', 'rollo de 100 m'),
  (38, 'IMSA', 1621.53, 'Plastix CF', 'rollo de 100 m'),
  (38, 'Argenplas', 1555.5, '', 'rollo de 100 m'),
  (39, 'Prysmian', 2521.0, 'Superastic', 'rollo de 100 m'),
  (39, 'IMSA', 2360.33, 'Plastix CF', 'rollo de 100 m'),
  (39, 'Argenplas', 2244.0, '', 'rollo de 100 m'),
  (746, 'Prysmian', 2300.8, 'Superastic', 'rollo de 100 m'),
  (746, 'IMSA', 1905.62, 'Plastix CF', 'rollo de 100 m'),
  (746, 'Argenplas', 1489.01, '', 'rollo de 100 m'),
  (1246, 'IMSA', 3010.98, 'Plastix CF', 'rollo de 50 m'),
  (1246, 'Argenplas', 2953.55, '', 'rollo de 100 m'),
  (749, 'Prysmian', 5796.0, 'Superastic', 'rollo de 40 m'),
  (749, 'IMSA', 4021.82, 'Plastix CF', 'rollo de 100 m'),
  (749, 'Argenplas', 4207.55, '', 'rollo de 100 m');

create temp table cab_gen as
select g.id, g.nombre, g.alias, g.unidad, g.rubro_id from public.stock_materiales g where g.id in (select distinct generic_id from cab_marca);

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select g.nombre || ' ' || c.marca, g.unidad, c.precio, g.rubro_id,
       array(select distinct x from unnest(
           array(select a || ' ' || lower(c.marca) from unnest(coalesce(g.alias,'{}')) a)
        || array(select lower(c.marca) || ' ' || a from unnest(coalesce(g.alias,'{}')) a)
        || case c.marca when 'Prysmian' then array['superastic ' || split_part(lower(g.nombre), ' ', 3), 'pirelli ' || split_part(lower(g.nombre), ' ', 3)]
                        when 'IMSA' then array['plastix ' || split_part(lower(g.nombre), ' ', 3)] else '{}'::text[] end) x),
       'material', true,
       'Alta 2026-09-06 (catálogo eléctrico por marca). POR METRO. Referencia ESTIMADA: Mercado Libre 06/09/2026 $' || c.precio || '/m (' || c.nota || case when c.linea <> '' then ', ' || c.linea else '' end || '). Ajustar con la primera compra real.'
from cab_marca c join cab_gen g on g.id = c.generic_id
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(g.nombre || ' ' || c.marca));

update public.stock_materiales m
   set nombre = g.nombre || ' sin marca',
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: queda para los renglones que no dicen marca; Prysmian, IMSA y Argenplas tienen fila propia (Cimet no vende estas secciones en ML).',
       updated_at = now()
  from cab_gen g where m.id = g.id;

-- ═══ 3) protecciones ══════════════════════════════════════════════════════
create temp table prot_marca (generic_id int, marca text, precio numeric, linea text, codigo text);
insert into prot_marca values
  (242, 'Schneider', 15199, 'Easy9, 4,5kA', 'ez9f34216'),
  (242, 'ABB', 14993, 'SH200L, 4,5kA', 'sh202l-c16'),
  (242, 'Sica', 8900, 'Limit, 3kA', '782216'),
  (243, 'Schneider', 15999, 'Easy9, 4,5kA', 'ez9f34225'),
  (243, 'ABB', 17000, 'SH200L, 4,5kA', 'sh202l-c25'),
  (243, 'Sica', 8455, 'Limit, 3kA', '782225'),
  (244, 'Schneider', 21655, 'Easy9, 4,5kA', 'ez9f34240'),
  (244, 'ABB', 21350, 'SH200L, 4,5kA', 'sh202l-c40'),
  (244, 'Sica', 8999, 'Limit, 3kA', '782240'),
  (50, 'Schneider', 57990, 'Easy9', 'ez9r36225'),
  (50, 'ABB', 41500, 'FH200', '1tmf202006r1250p'),
  (50, 'Sica', 33000, 'Limit', '785625'),
  (51, 'Schneider', 63300, 'Easy9', 'ez9r36240'),
  (51, 'ABB', 72566, 'FH200', '1tmf202006r1400p'),
  (51, 'Sica', 39059, 'Limit', '785640');

create temp table prot_gen as
select g.id, g.nombre, g.alias, g.unidad, g.rubro_id from public.stock_materiales g where g.id in (select distinct generic_id from prot_marca);

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select g.nombre || ' ' || p.marca || ' (' || p.linea || ')', g.unidad, p.precio, g.rubro_id,
       array(select distinct x from unnest(
           array(select a || ' ' || lower(p.marca) from unnest(coalesce(g.alias,'{}')) a)
        || array(select lower(p.marca) || ' ' || a from unnest(coalesce(g.alias,'{}')) a)
        || array[p.codigo, lower(split_part(p.linea, ',', 1)) || ' ' || lower(split_part(g.nombre, ' ', 2))]) x),
       'material', true,
       'Alta 2026-09-06 (catálogo eléctrico por marca). Referencia ESTIMADA: Mercado Libre 06/09/2026 $' || p.precio || ' (' || p.linea || ', cód. ' || upper(p.codigo) || '). Ajustar con la primera compra real.'
from prot_marca p join prot_gen g on g.id = p.generic_id
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(g.nombre || ' ' || p.marca || ' (' || p.linea || ')'));

update public.stock_materiales m
   set nombre = g.nombre || ' sin marca',
       alias = array(select a from unnest(coalesce(m.alias,'{}')) a where a !~ '(abb|schneider|sica)'),
       obs = coalesce(m.obs || ' · ', '') || '2026-09-06: queda para los renglones que no dicen marca; Schneider, ABB y Sica tienen fila propia.',
       updated_at = now()
  from prot_gen g where m.id = g.id;

drop table mov_dest; drop table mov; drop table generico; drop table fam_marca; drop table cab_gen; drop table cab_marca; drop table prot_gen; drop table prot_marca;
