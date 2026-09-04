-- 20260904bc — Más tipos de herramienta del pañol (user 2026-09-04)
-- "tenemos taladros, sierras sensitivas, sierra de banco para madera, sierra
-- caladora, pistolas de calor, taladro de banco, cortadora de ladrillo de banco".
-- Taladro percutor, sierra caladora y pistola de calor ya existían.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', 0, (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'), v.alias, 'herramienta',
       'Alta 2026-09-04: tipo de herramienta del pañol (user). La unidad concreta es la ficha HER.'
from (values
  ('Sierra sensitiva (corte de metal)',       array['sierra sensitiva','sensitiva','sierra sentiviva','sierra sentitiva','sierra sensitiva 14','cortadora sensitiva','tronzadora','sierra de corte de metal','sierra de disco para metal']),
  ('Sierra de banco p/ madera (circular de mesa)', array['sierra de banco','sierra de mesa','sierra circular de banco','sierra circular de mesa','banco de sierra','sierra de banco para madera','mesa de sierra']),
  ('Taladro de banco',                        array['taladro de banco','agujereadora de banco','taladro de pie','taladro de columna','taladro de mesa']),
  ('Cortadora de ladrillos de banco (mesa)',  array['cortadora de ladrillo','cortadora de ladrillos','cortadora de ladrillo de banco','cortadora de ladrillos de banco','cortadora de mesa','cortadora de ladrillo de mesa','mesa de corte de ladrillo','cortadora de bloques','cortadora de banco'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['taladro de mano','taladro comun']))
 where nombre = 'Taladro percutor';
