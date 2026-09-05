-- 20260904bu — Catálogo de herramientas: andamio multidireccional (rosetas) y cuerpos armados
--
-- Pedido del user 2026-09-04: cargar todo lo del andamio multidireccional que
-- tienen — parantes de 1 a 6 rosetas, travesaños, diagonales, ruedas, tablones —
-- y los cuerpos de andamio que ya vienen armados (tubular de marcos).
-- Tipos de herramienta (rubro 26), sin precio. Los parantes llevan la altura
-- entre paréntesis (una roseta cada 50 cm) porque en los pedidos escriben
-- "andamio de 6 roseta" para pedir el parante de 3 m. Se agregan base
-- regulable (husillo) y tablón de madera, que van con el mismo sistema.
-- El cuerpo tubular (1131) se renombra "Cuerpo de andamio tubular (marco armado)"
-- y se propaga a sus renglones y al pañol.

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', 0, 26, v.alias, 'herramienta', 'Alta 2026-09-04: andamio multidireccional (rosetas).'
from (values
  ('Parante p/ andamio multidireccional 1 roseta (0,50m)',
     array['parante 1 roseta','parante de 1 roseta','parante de una roseta','poste 1 roseta','parante 0.50','parante 50 cm','vertical 1 roseta','andamio de 1 roseta']),
  ('Parante p/ andamio multidireccional 2 rosetas (1m)',
     array['parante 2 rosetas','parante de 2 rosetas','parante de dos rosetas','poste 2 rosetas','parante 1 m','parante de 1 metro','vertical 2 rosetas','andamio de 2 rosetas','andamio de 2 roseta']),
  ('Parante p/ andamio multidireccional 3 rosetas (1,50m)',
     array['parante 3 rosetas','parante de 3 rosetas','parante de tres rosetas','poste 3 rosetas','parante 1.50','parante de 1,5 m','vertical 3 rosetas','andamio de 3 rosetas','andamio de 3 roseta']),
  ('Parante p/ andamio multidireccional 4 rosetas (2m)',
     array['parante 4 rosetas','parante de 4 rosetas','parante de cuatro rosetas','poste 4 rosetas','parante 2 m','parante de 2 metros','vertical 4 rosetas','andamio de 4 rosetas','andamio de 4 roseta']),
  ('Parante p/ andamio multidireccional 5 rosetas (2,50m)',
     array['parante 5 rosetas','parante de 5 rosetas','parante de cinco rosetas','poste 5 rosetas','parante 2.50','parante de 2,5 m','vertical 5 rosetas','andamio de 5 rosetas','andamio de 5 roseta']),
  ('Parante p/ andamio multidireccional 6 rosetas (3m)',
     array['parante 6 rosetas','parante de 6 rosetas','parante de seis rosetas','poste 6 rosetas','parante 3 m','parante de 3 metros','vertical 6 rosetas','andamio de 6 rosetas','andamio de 6 roseta']),
  ('Travesaño (horizontal) p/ andamio multidireccional',
     array['travesaño de andamio','travesaños de andamio','travesano andamio','travesaños andamio','horizontal de andamio','horizontales andamio','larguero de andamio','travesaño multidireccional','travesaño roseta','barral de andamio']),
  ('Diagonal p/ andamio multidireccional',
     array['diagonal de andamio','diagonales de andamio','diagonales andamio','diagonal multidireccional','diagonal roseta','cruz de andamio','diagonales multidireccional','arriostre de andamio']),
  ('Rueda p/ andamio (c/ freno)',
     array['rueda de andamio','ruedas de andamio','ruedas para andamio','rueda andamio con freno','ruedas andamio','rueda giratoria de andamio','ruedas para el andamio']),
  ('Base regulable (husillo) p/ andamio',
     array['husillo','husillos','husillo de andamio','base regulable de andamio','base regulable andamio','pie regulable andamio','bases de andamio','pata regulable andamio']),
  ('Tablón de madera p/ andamio',
     array['tablon de madera','tablones de madera','tablon de andamio de madera','tablon madera andamio','tablones de madera para andamio'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

-- tablón metálico: más formas de pedirlo
update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['tablon','tablones','tablones metalicos','tablon multidireccional','plataforma metalica de andamio','tablon de andamio multidireccional','tablones para el andamio']))
 where id = 1112;

-- cuerpo tubular armado: nombre más claro y aliases
update public.stock_materiales
   set nombre = 'Cuerpo de andamio tubular (marco armado)',
       alias = array(select distinct unnest(alias || array['andamio tubular (cuerpo completo)','andamio armado','cuerpo armado','andamio de marco','marco de andamio','cuerpo de andamio azul','cuerpo de andamio tubular','andamio de cuerpos','cuerpos armados'])),
       obs = coalesce(obs || ' · ', '') || 'Era "Andamio tubular (cuerpo completo)" (2026-09-04). Es el andamio de marcos que viene armado; el multidireccional de rosetas tiene sus propias filas (parantes, travesaños, diagonales).'
 where id = 1131 and nombre = 'Andamio tubular (cuerpo completo)';

update public.solicitud_compra_item set descripcion = 'Cuerpo de andamio tubular (marco armado)'
 where material_id = 1131 and descripcion = 'Andamio tubular (cuerpo completo)';
update public.herr_entregas set descripcion = 'Cuerpo de andamio tubular (marco armado)', descripcion_norm = public.norm_txt('Cuerpo de andamio tubular (marco armado)'), updated_at = now()
 where material_id = 1131 and descripcion = 'Andamio tubular (cuerpo completo)';
