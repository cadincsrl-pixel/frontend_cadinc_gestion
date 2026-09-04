-- 20260904bb — Escaleras: los cuatro tipos que tiene CADINC
-- User (2026-09-04): "escaleras de madera tijera, de aluminio tijera, de fibra
-- tijera o extensibles tenemos". Se suman tijera de madera y tijera de fibra;
-- las dos escaleras de madera de los pedidos pasan a la de madera. La fila
-- "Escalera recta (simple)" queda para las 4 salidas que dicen explícitamente
-- recta / de fierro / metálica.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', 0, (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'), v.alias, 'herramienta',
       'Alta 2026-09-04: tipo de escalera del pañol (user). La unidad concreta es la ficha HER.'
from (values
  ('Escalera tijera de madera', array['escalera de madera','escalera madera','escalera madera tijera','escalera tijera madera','escalera de madera tijera','escalera de madera tijera larga','escalera tijera de madera larga']),
  ('Escalera tijera de fibra',  array['escalera de fibra','escalera fibra','escalera tijera fibra','escalera fibra tijera','escalera de fibra de vidrio','escalera dielectrica','escalera para electricista','escalera tijera de fibra de vidrio'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- La tijera de aluminio ya no debe atraer "escalera de madera".
update public.stock_materiales
   set alias = array_remove(alias, 'escalera de madera')
 where nombre = 'Escalera tijera de aluminio';
update public.stock_materiales
   set alias = array_remove(alias, 'escalera de madera'),
       nombre = 'Escalera recta metálica (simple)'
 where nombre = 'Escalera recta (simple)';

create temp table vinc (item_id int, nombre text);
insert into vinc values (1950, 'Escalera tijera de madera'), (3111, 'Escalera tijera de madera');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'herramientas al catalogo 2026-09-04', 'material_id', m.id, 'material_anterior', i.material_id, 'desc_canonica', m.nombre)
from vinc v join public.solicitud_compra_item i on i.id = v.item_id join public.stock_materiales m on m.nombre = v.nombre
where i.material_id is distinct from m.id;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre, clase = 'herramienta'
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where i.id = v.item_id and i.material_id is distinct from m.id;

update public.herr_entregas e
   set descripcion = m.nombre, descripcion_norm = public.norm_txt(m.nombre), material_id = m.id, updated_at = now()
  from vinc v join public.stock_materiales m on m.nombre = v.nombre
 where e.item_id = v.item_id and e.estado <> 'anulada'
   and (e.descripcion is distinct from m.nombre or e.material_id is distinct from m.id);
drop table vinc;
