-- Catálogo: film de enmascarar Sherwin Williams (el "film para tapar")
--
-- El renglón texto-libre "film para tapar" de FARMACIA AMERICA (item 2690,
-- 24/08, $7.850) es este producto según el user: Film Nylon Enmascarar
-- Sherwin Williams 4 x 150 m, para pintura. Ninguna ficha existente es
-- esto (el protector 3x4m y el washi Wells son otra cosa; los polietileno
-- de aislación otra). Va al rubro Pintura (5), donde viven los otros films
-- de pintor, con la marca en el nombre (criterio "pinturas por marca").
--
-- precio_ref $101.000: publicación de MercadoLibre que pasó el user
-- (precio final con IVA). OJO: el renglón de Americana quedó cobrado a
-- $7.850 — si lo que se despachó fue el rollo entero, está muy por debajo
-- del valor real; queda para que el user confirme si se ajusta.

insert into stock_materiales
  (rubro_id, nombre, unidad, clase, stock_actual, stock_minimo,
   precio_ref, precio_actualizado_en, alias, activo)
values
  (5, 'Film nylon p/ enmascarar Sherwin Williams 4x150m', 'unid', 'material', 0, 0,
   101000, '2026-09-08',
   array['film para tapar','film de enmascarar','nylon para tapar',
         'film pintura','nylon de enmascarar'],
   true);

update solicitud_compra_item
   set material_id = (select id from stock_materiales
                       where nombre = 'Film nylon p/ enmascarar Sherwin Williams 4x150m')
 where id = 2690;
