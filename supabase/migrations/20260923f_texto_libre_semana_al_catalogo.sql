-- 20260923f — Texto libre de la semana (desde el vie 18/09) al catálogo (user 2026-09-23)
--
-- De los 46 renglones sin ficha, el user aprobó dos grupos:
--   1. Ya tenían ficha: se vinculan y se suma el sinónimo con que se pidió.
--   2. Material de obra que se va a volver a pedir: ficha nueva + vínculo.
-- El resto (estacionamientos, flota, a medida, ambiguos) queda como está.
--
-- Afuera a propósito:
--   · 4348 "TORNILLO, TACOS Y MECHA DEL 8" se compró como kit a $8.000;
--     vincularlo al tarugo de $60 ensuciaría su "última compra".
--   · 4346 "tapon y teflon" son dos cosas: habría que desdoblarlo.
--
-- 4304 (cargador de amoladora) va a C1313, que es HERRAMIENTA: el renglón pasa
-- a clase herramienta (el trigger lo lleva al pañol) y sale de la cuenta de
-- CC-004, donde estaba a $0 y sin cobro. Mismo evento que 20260915a.
--
-- Precios: solo los que tienen compra esta semana, por fijar_precio_ref con
-- fuente 'compra' (CLAUDE.md §5.14). Las demás nacen en $0, a tasar.
-- Los vínculos no mueven stock: son renglones ya resueltos sin ficha.

-- ── 1. Sinónimos en fichas existentes ─────────────────────────────────────
update public.stock_materiales m
   set alias = array(select distinct a from unnest(m.alias || v.nuevos) a order by a)
  from (values
    (203,  array['cupla 25 ff', 'cupla 25 hh', 'cupla 25 hembra hembra']),
    (33,   array['teflon grande']),
    (1149, array['esponja de acero', 'esponja acero']),
    (1313, array['cargador de amoladora', 'cargador amoladora inalambrica'])
  ) as v(id, nuevos)
 where m.id = v.id;

-- ── 2. Fichas nuevas ──────────────────────────────────────────────────────
insert into public.stock_materiales (rubro_id, nombre, unidad, alias, clase, created_by, updated_by)
select v.rubro_id, v.nombre, v.unidad, v.alias, 'material',
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
from (values
  (4,  'Ladrillo refractario',                                   'unid', array['ladrillo refractario', 'ladrillos refractarios']),
  (4,  'Tierra refractaria x 5kg',                               'unid', array['tierra refractaria', 'bolsa de tierra refractaria']),
  (7,  'Mecha SDS-plus 6x110mm',                                 'unid', array['mecha sds 6', 'mecha sds 6x110', 'mecha sds plus 6']),
  (4,  'Malla de metal desplegado',                              'unid', array['metal desplegado', 'malla metal desplegado', 'malla desplegada']),
  (1,  'Válvula de carga y descarga p/ inodoro (mochila)',       'unid', array['valvula carga y descarga inodoro', 'valvula de carga y descarga', 'valvula carga y descarga']),
  (1,  'Válvula de admisión de aire (cloacal)',                  'unid', array['valvula de admision', 'valvula admision', 'valvula de admision de aire']),
  (1,  'Flor de ducha',                                          'unid', array['flor de ducha', 'flor ducha', 'regadera']),
  (1,  'Brazo de ducha 40cm',                                    'unid', array['brazo largo para ducha', 'brazo de ducha', 'brazo ducha 40']),
  (2,  'Cable tipo taller 4x2.5mm² sin marca',                   'm',    array['cable trifasico 2,5', 'cable trifasico 2.5', 'cable trifasico 2,5 tipo taller', 'taller 4x2.5']),
  (2,  'Ficha trifásica',                                        'unid', array['enchufe trifasico', 'ficha trifasica']),
  (7,  'Bisagra p/ soldar 60x8x2.5',                             'unid', array['bisagra para soldar', 'bisagra p/ soldar', 'bisagra 60x8']),
  (6,  'Retén a rodillo cincado (portón)',                       'unid', array['reten a rodillo', 'reten a rodillo cincado', 'reten rodillo porton']),
  (1,  'Tapa puerta de inspección 40x40',                        'unid', array['tapa de inspeccion 40x40', 'puerta de inspeccion 40x40', 'tapa puerta de inspeccion 40x40']),
  (3,  'Perfil perimetral PVC p/ cielorraso 10mm x 3m',          'unid', array['perfil perimetral pvc', 'perimetral pvc', 'perfil perimetral para cielorraso de pvc']),
  (6,  'Pico (capuchón) p/ pistola de sellador',                 'unid', array['capucho pistola sellador', 'capuchon pistola sellador', 'pico para sellador', 'capucho 3d']),
  (11, 'Césped sintético 20mm',                                  'm2',   array['cesped sintetico', 'pasto sintetico'])
) as v(rubro_id, nombre, unidad, alias);

-- ── 3. Vínculos renglón → ficha ───────────────────────────────────────────
update public.solicitud_compra_item i
   set material_id = coalesce(v.material_id,
         (select m.id from public.stock_materiales m where m.nombre = v.nombre and m.activo))
  from (values
    (4334, 203,  null::text),
    (4328, 33,   null),
    (4270, 1149, null),
    (4341, null, 'Ladrillo refractario'),
    (4420, null, 'Ladrillo refractario'),
    (4342, null, 'Tierra refractaria x 5kg'),
    (4279, null, 'Mecha SDS-plus 6x110mm'),
    (4312, null, 'Malla de metal desplegado'),
    (4327, null, 'Válvula de carga y descarga p/ inodoro (mochila)'),
    (4332, null, 'Válvula de admisión de aire (cloacal)'),
    (4330, null, 'Flor de ducha'),
    (4331, null, 'Brazo de ducha 40cm'),
    (4425, null, 'Cable tipo taller 4x2.5mm² sin marca'),
    (4426, null, 'Ficha trifásica'),
    (4422, null, 'Bisagra p/ soldar 60x8x2.5'),
    (4423, null, 'Retén a rodillo cincado (portón)'),
    (4201, null, 'Tapa puerta de inspección 40x40'),
    (4271, null, 'Perfil perimetral PVC p/ cielorraso 10mm x 3m'),
    (4305, null, 'Pico (capuchón) p/ pistola de sellador'),
    (4188, null, 'Césped sintético 20mm')
  ) as v(item_id, material_id, nombre)
 where i.id = v.item_id and i.material_id is null;

-- ── 4. El cargador es herramienta: al pañol y fuera de la cuenta ──────────
insert into public.solicitud_item_eventos
  (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
select c.item_id, c.solicitud_id, 'sacado_de_cuenta_cliente', null, i.estado, c.cantidad,
       'El renglón se vinculó a una ficha de herramienta: sale de la cuenta de la obra y va al pañol (' || c.descripcion || ')',
       jsonb_build_object('motivo', 'vinculado a herramienta', 'material_id', 1313,
                          'origen_mcc', c.origen, 'obra_cod', c.obra_cod, 'a_cargo_de', c.a_cargo_de,
                          'precio_unit', c.precio_unit, 'migracion', '20260923f'),
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
  from public.materiales_a_cuenta_cliente c
  join public.solicitud_compra_item i on i.id = c.item_id
 where c.item_id = 4304 and c.cobro_id is null and c.certificado_id is null;

delete from public.materiales_a_cuenta_cliente
 where item_id = 4304 and cobro_id is null and certificado_id is null;

update public.solicitud_compra_item
   set material_id = 1313, clase = 'herramienta'
 where id = 4304 and material_id is null;

-- ── 5. Precio de referencia de las que tienen compra esta semana ──────────
select public.fijar_precio_ref(i.material_id, i.precio_unit, 'compra', i.id, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8')
  from public.solicitud_compra_item i
 where i.id in (4188, 4201, 4271, 4279, 4312, 4420, 4422, 4423)
   and i.material_id is not null and i.precio_unit > 0;
