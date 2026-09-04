-- 20260904ab — Aire acondicionado: cotización Pizarro Refrigeración 0001-00034636 (04/09/2026)
--
-- Fuente: datos-entrada/COTIZACIONX-.PDF (23 renglones, precios NETOS, IVA 21%
-- aparte). Todo queda como precio FINAL (neto × 1,21). Decisiones del user:
-- el cobre va POR METRO (Pizarro lo vende por kilo: $35.182,51/kg neto =
-- $42.570,84/kg final; se pasa a metro con el peso por metro que trae la
-- misma cotización), se pisan los 6 precios que ya existían y se dan de alta
-- los 17 que faltaban, con sinónimos.

-- 1) los que ya existían: precio, nombre más preciso y sinónimos ────────────
update public.stock_materiales set
  nombre     = 'Cinta PVC p/ aislación de caños 72mm x 20m',
  precio_ref = 1805.17,
  alias      = array(select distinct unnest(alias || array['enfasolar','cinta enfasolar','cinta de aire acondicionado','cinta 72mm'])),
  obs        = coalesce(obs || ' · ', '') || 'Precio Pizarro 04/09/2026 (cotización, final).'
where id = 1009;

update public.stock_materiales set
  nombre     = 'Aislante térmico p/ caño 1/4" (termotubo 6mm, tira 1.8m)',
  precio_ref = 752.69,
  alias      = array(select distinct unnest(alias || array['termotubo 1/4','aislacion termotubo 1/4','aislante cobre 1/4'])),
  obs        = coalesce(obs || ' · ', '') || 'Precio Pizarro 04/09/2026 (cotización, final).'
where id = 1010;

update public.stock_materiales set
  nombre     = 'Aislante térmico p/ caño 5/8" (termotubo 6mm, tira 1.8m)',
  precio_ref = 1601.04,
  alias      = array(select distinct unnest(alias || array['termotubo 5/8','aislacion termotubo 5/8','aislante cobre 5/8'])),
  obs        = coalesce(obs || ' · ', '') || 'Precio Pizarro 04/09/2026 (cotización, final).'
where id = 1006;

update public.stock_materiales set
  precio_ref = 3216.19,
  alias      = array(select distinct unnest(alias || array['cable taller 3x2.5','tpr 3x2.5'])),
  obs        = coalesce(obs || ' · ', '') || 'Precio Pizarro 04/09/2026 (cotización, final); Voltaje 28/08 lo cobró $3.655.'
where id = 749;

update public.stock_materiales set
  precio_ref = 5236.21,
  alias      = array(select distinct unnest(alias || array['cobre 1/4','rollo cobre 1/4','cano de cobre 1/4 por metro'])),
  obs        = coalesce(obs || ' · ', '') || 'POR METRO. Pizarro 04/09/2026: $42.570,84/kg final × 0,123 kg/m. La compra del 20/08 a $15.138 no era por metro.'
where id = 885;

update public.stock_materiales set
  precio_ref = 322.92,
  alias      = array(select distinct unnest(alias || array['tirafondo 1/4 x 2.5 con taco 10','tirafondo con taco 10','tirafondo taco 10'])),
  obs        = coalesce(obs || ' · ', '') || 'Precio Pizarro 04/09/2026 (tirafondo 1/4x2.5 + taco 10, final).'
where id = 384;

-- 2) altas ───────────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, v.unidad, v.precio_ref, v.rubro_id, v.alias, 'material',
       'Alta 2026-09-04 desde cotización Pizarro Refrigeración 0001-00034636 (04/09/2026). Precio final (neto × 1,21).' || coalesce(' ' || v.nota, '')
from (values
  -- ménsulas (Ferretería general)
  ('Ménsula p/ aire acondicionado 42cm (par)',       'unid', 10774.71, 6,  array['mensula aire 42','mensula split 42','soporte aire acondicionado 42','mensulas para aire acondicionado','brazo 42'], null),
  ('Ménsula p/ aire acondicionado 52cm (par)',       'unid', 13874.30, 6,  array['mensula aire 52','mensula split 52','soporte aire acondicionado 52','brazo 52'], null),
  ('Ménsula p/ aire acondicionado 62cm (par)',       'unid', 20663.85, 6,  array['mensula aire 62','mensula split 62','soporte aire acondicionado 62','brazo 62'], null),
  ('Ménsula reforzada p/ aire acondicionado 80cm',   'unid', 32545.55, 6,  array['mensula reforzada 80','mensula aire 80','soporte reforzado aire acondicionado','mensula reforzada'], null),
  -- caño de cobre, por metro (Instalación de gas, como el 1/4 que ya estaba)
  ('Caño de cobre 3/8"',                             'm',     8216.17, 12, array['cano cobre 3/8','cobre 3/8','rollo cobre 3/8','cano de cobre 3/8 por metro'], 'POR METRO: $42.570,84/kg × 0,193 kg/m.'),
  ('Caño de cobre 1/2"',                             'm',    11621.84, 12, array['cano cobre 1/2','cobre 1/2','rollo cobre 1/2','cano de cobre 1/2 por metro'], 'POR METRO: $42.570,84/kg × 0,273 kg/m.'),
  ('Caño de cobre 5/8"',                             'm',    14303.80, 12, array['cano cobre 5/8','cobre 5/8','rollo cobre 5/8','cano de cobre 5/8 por metro'], 'POR METRO: $42.570,84/kg × 0,336 kg/m.'),
  ('Caño de cobre 3/4"',                             'm',    17326.33, 12, array['cano cobre 3/4','cobre 3/4','rollo cobre 3/4','cano de cobre 3/4 por metro'], 'POR METRO: $42.570,84/kg × 0,407 kg/m.'),
  -- termotubo (Aislación)
  ('Aislante térmico p/ caño 3/8" (termotubo 6mm, tira 1.8m)', 'unid', 1400.20, 8, array['aislante 3/8','termotubo 3/8','aislacion termotubo 3/8','aislante cobre 3/8'], null),
  ('Aislante térmico p/ caño 3/4" (termotubo 6mm, tira 1.8m)', 'unid', 1505.35, 8, array['aislante 3/4','termotubo 3/4','aislacion termotubo 3/4','aislante cobre 3/4'], null),
  -- cable tipo taller (Electricidad)
  ('Cable tipo taller 3x1.5mm²',                     'm',     2105.94, 2,  array['cable taller 3x1.5','cable tipo taller 3x1,5','tpr 3x1.5','cable taller 3 x 1.5'], null),
  ('Cable tipo taller 5x1.5mm²',                     'm',     3227.49, 2,  array['cable taller 5x1.5','cable tipo taller 5x1,5','tpr 5x1.5','cable taller 5 x 1.5'], null),
  ('Cable tipo taller 5x2.5mm²',                     'm',     5202.37, 2,  array['cable taller 5x2.5','cable tipo taller 5x2,5','tpr 5x2.5','cable taller 5 x 2.5'], null),
  -- ferretería
  ('Tarugo fisher SX 10mm (solo, sin tornillo)',     'unid',   220.05, 6,  array['taco fischer 10 sx','taco 10 solo','taco sx 10','tarugo 10 sin tornillo','taco hueco 10'], null),
  ('Arandela plana 1/4"',                            'unid',    17.48, 6,  array['arandela 1/4','arandelas de 1/4','arandela plana de 1/4'], null),
  ('Bulón 1/4" x 1 1/4" c/ tuerca y arandelas',      'unid',    62.00, 6,  array['bulon 1/4','tornillo con tuerca 1/4','tornillo 1/4 x 1 1/4','bulon 1/4 x 1 1/4','tornillo con tuerca y arandelas'], null),
  ('Manguera cristal 5/8" (16x20)',                  'm',      822.00, 1,  array['manguera cristal','manguera transparente 5/8','manguera de desague de aire','manguera 16x20','manguera cristal 16x20'], 'POR METRO.')
) as v(nombre, unidad, precio_ref, rubro_id, alias, nota)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));
