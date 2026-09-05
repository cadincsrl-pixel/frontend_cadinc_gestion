-- 20260905u — Demoledores por tamaño (user 2026-09-05)
--
-- "Tengo un demoledor más grande que un Makita, para pavimento; y de los SDS-max
-- tenemos unos DeWalt también, que serían los medianos." Hasta hoy había un solo
-- tipo, "Martillo demoledor (SDS-max)" (1127), con chico/mediano/grande como
-- sinónimos. Se abre en:
--   · Rompepavimento (demoledor p/ pavimento)         — nuevo, el más grande
--   · Martillo demoledor grande (SDS-max, Makita)     — nuevo
--   · Martillo demoledor mediano (SDS-max, DeWalt)    — nuevo (los Bosch medianos también)
--   · Martillo demoledor chico                        — nuevo
--   · Martillo demoledor (SDS-max)                    — queda para los pedidos que
--     dicen solo "demoledor" (tamaño sin especificar), con esos sinónimos.
-- Los 17 renglones se reparten por lo que decía el texto original del pedido;
-- los 9 que no decían tamaño se quedan en el genérico. El pañol sigue a los
-- renglones (trigger) y además se actualiza directo.

-- 1) tipos nuevos ────────────────────────────────────────────────────────────
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, obs)
select v.nombre, 'unid', 0, (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'), v.alias, 'herramienta', true,
       'Alta 2026-09-05: demoledores por tamaño (antes todo en "Martillo demoledor (SDS-max)").'
from (values
  ('Rompepavimento (demoledor p/ pavimento)',      array['rompepavimento','rompepavimentos','rompe pavimento','martillo rompepavimento','demoledor de pavimento','demoledor para pavimento','demoledor pavimento','demoledor hexagonal','demoledor grande de pavimento']),
  ('Martillo demoledor grande (SDS-max, Makita)',  array['demoledor grande','demoledor makita','demoledor makita grande','martillo demoledor grande','makita grande','demoledor sds max grande','demoledor grande makita']),
  ('Martillo demoledor mediano (SDS-max, DeWalt)', array['demoledor mediano','demoledores mediano','demoledores medianos','demoledor dewalt','demoledor de walt','martillo demoledor mediano','demoledor mediano bosch','demoledor mediano dewalt']),
  ('Martillo demoledor chico',                     array['demoledor chico','demoledores chicos','demoledor chico bosch','demoledor pequeño','martillo demoledor chico','demoledorcito'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where m.nombre = v.nombre);

-- 2) el genérico pierde los sinónimos de tamaño y explica qué es ─────────────
update public.stock_materiales
   set alias = array(select a from unnest(alias) a where a not in ('demoledor chico','demoledor mediano','demoledor grande','demoledor makita','demoledor makita grande','rompepavimento')),
       obs = coalesce(obs || ' · ', '') || '2026-09-05: queda para los pedidos que dicen solo "demoledor" (tamaño sin especificar); los tamaños tienen tipo propio (chico / mediano DeWalt / grande Makita / rompepavimento).',
       updated_at = now()
 where id = 1127;

-- 3) reparto de renglones por el texto original ────────────────────────────
create temp table mov (item_id int, nombre text, texto text);
insert into mov values
  (1984, 'Martillo demoledor grande (SDS-max, Makita)',  'Demoledor Makita grande'),
  (2026, 'Martillo demoledor grande (SDS-max, Makita)',  'demoledor makita grande'),
  (764,  'Martillo demoledor mediano (SDS-max, DeWalt)', 'demoledor mediano bosch'),
  (3000, 'Martillo demoledor mediano (SDS-max, DeWalt)', 'demoledores mediano'),
  (763,  'Martillo demoledor chico',                     'demoledor chico bosch'),
  (2209, 'Martillo demoledor chico',                     'demoledor chico'),
  (3032, 'Martillo demoledor chico',                     'demoledor chico'),
  (3169, 'Martillo demoledor chico',                     'demoledor chico');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Demoledor por tamaño: el pedido decía "' || v.texto || '" → ' || m.nombre,
       jsonb_build_object('motivo', 'demoledores por tamaño 2026-09-05', 'material_anterior', i.material_id, 'material_nuevo', m.id)
from mov v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.nombre = v.nombre
where i.material_id = 1127;

update public.solicitud_compra_item i set material_id = m.id, descripcion = m.nombre
  from mov v join public.stock_materiales m on m.nombre = v.nombre where i.id = v.item_id and i.material_id = 1127;
update public.herr_entregas h set material_id = m.id, descripcion = m.nombre, descripcion_norm = public.norm_txt(m.nombre), updated_at = now()
  from mov v join public.stock_materiales m on m.nombre = v.nombre where h.item_id = v.item_id and h.material_id = 1127;
drop table mov;
