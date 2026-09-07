-- 20260907e — Cintas aisladoras 3M por modelo (user 2026-09-07)
--
-- "En el catálogo de cintas aisladoras trabajamos con estos modelos. El precio neto es
-- el que vale, hay que sumarle IVA; el precio sugerido es el que nos sugiere vender en
-- caso que seamos revendedores." (captura del catálogo del proveedor, 07/09/2026).
--
-- Hasta hoy había UNA fila genérica (id 61 "Cinta aisladora") con 22 renglones cuyos
-- precios unitarios van de $1.135,56 a $7.559 — 6,6× de diferencia: la referencia no
-- significaba nada. Misma receta que el catálogo eléctrico por marca (20260906h): una
-- fila por modelo y el genérico pasa a "sin especificar" para los renglones viejos.
--
-- precio_ref = P. Neto × 1,21 (IVA 21 %), o sea precio FINAL, como todo el catálogo.
-- El "Sug. c/IVA" del proveedor es el precio de REVENTA sugerido: no es lo que pagamos,
-- no va en precio_ref, queda anotado en obs.
--
-- Lo que NO toca esta migración (queda para el user): las 29 unidades en stock del
-- genérico y los 21 renglones "Cinta aisladora" que no dicen modelo. Repartirlos por
-- precio sería adivinar.

create temp table modelos (codigo text, nombre text, neto numeric, sugerido numeric, alias text[]);
insert into modelos values
  ('66061', 'Cinta aisladora 3M 165 negra 9m',  1563.43,  2648.45,
     array['cinta aisladora 165 9m','aisladora 165 9m','3m 165 9m']),
  ('67049', 'Cinta aisladora 3M 165 negra 20m', 2575.06,  4362.15,
     array['cinta aisladora 165 20m','aisladora 165 20m','3m 165 20m']),
  ('67048', 'Cinta aisladora 3M 175 negra 20m', 4207.47,  7127.46,
     array['cinta aisladora 175 20m','aisladora 175 20m','3m 175 20m','cinta aisladora 3m grande']),
  ('45611', 'Cinta aisladora 3M Super 33+',     7702.62, 13048.24,
     array['cinta aisladora super 33','super 33+','super 33','3m 33+']);

-- ═══ 1) una fila por modelo ════════════════════════════════════════════════
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, activo, usa_color, obs)
select m.nombre, 'unid', round(m.neto * 1.21, 2), 2,
       array(select distinct x from unnest(m.alias || array[m.codigo]) x),
       'material', true, false,
       'Alta 2026-09-07 (cintas aisladoras 3M por modelo). Catálogo del proveedor 07/09/2026, código '
       || m.codigo || ': neto $' || m.neto || ' → final $' || round(m.neto * 1.21, 2)
       || ' (IVA 21 %). Sugerido de reventa c/IVA $' || m.sugerido || '.'
       || case when m.codigo = '45611' then ' El catálogo no indica el largo del rollo.' else '' end
from modelos m
where not exists (
  select 1 from public.stock_materiales s
   where s.activo and norm_material(s.nombre) = norm_material(m.nombre));

-- ═══ 2) el genérico queda para los renglones que no dicen modelo ═══════════
-- le saco los alias que ahora tienen fila propia ("super 33" y "3m grande", que la
-- propia obs documenta como 175 negra 20 m). "grande" y "chica" se quedan: son ambiguos.
update public.stock_materiales
   set nombre = 'Cinta aisladora sin especificar',
       alias  = array(select a from unnest(alias) a
                       where a not in ('cinta aisladora super 33','cinta aisladora 3m grande')),
       obs    = coalesce(obs || ' · ', '') ||
                '2026-09-07: queda para los renglones que no dicen modelo; 165 9m, 165 20m, 175 20m y Super 33+ '
                'tienen fila propia. Las 29 unid en stock son las 30 que compró ABC el 02/09/2026 '
                '(3M 175 negra 20 m) menos 1 despachada; moverlas de fila es decisión del user.',
       updated_at = now()
 where id = 61;

-- ═══ 3) el único renglón con modelo documentado ════════════════════════════
-- ABC "Cinta aisladora 3m grande" = 3M 175 negra 20 m (lo dice la obs del catálogo).
-- Cantidad 0 y sin fila en materiales_a_cuenta_cliente, así que no mueve plata.
insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Cintas aisladoras por modelo: pasa a ' || d.nombre
       || ' (la obs del catálogo documenta esa compra de ABC como 3M 175 negra 20 m)',
       jsonb_build_object('motivo','cintas aisladoras por modelo 2026-09-07',
                          'material_anterior', i.material_id, 'material_nuevo', d.id)
from public.solicitud_compra_item i
join public.stock_materiales d
  on d.activo and norm_material(d.nombre) = norm_material('Cinta aisladora 3M 175 negra 20m')
where i.id = 52 and i.material_id = 61;

update public.solicitud_compra_item i
   set material_id = d.id, descripcion = d.nombre
  from public.stock_materiales d
 where i.id = 52 and i.material_id = 61
   and d.activo and norm_material(d.nombre) = norm_material('Cinta aisladora 3M 175 negra 20m');
