-- Catálogo: la chapa sinusoidal C25 de 2 m que faltaba en la familia
--
-- En FARMACIA AMERICA (CC-023) el renglón "Chapo sinusoidal Calibre 25
-- 1,10 x 2 mts" (item 3463, x4, 08/09) quedó en texto libre: la familia
-- del catálogo tiene 3, 4, 5 y 6 metros (fichas 467-470) y el metro lineal
-- (1015), pero no la de 2 m. Se crea con los mismos alias del resto de la
-- familia y precio_ref = 2 m x $13.159 (el $/m de la ficha 1015, ya usado
-- en el techo de LAMADRID y en el precio puesto hoy a este renglón).

insert into stock_materiales
  (rubro_id, nombre, unidad, clase, stock_actual, stock_minimo,
   precio_ref, precio_actualizado_en, alias, activo)
values
  (9, 'Chapa sinusoidal galv. C25 1.10x2m', 'unid', 'material', 0, 0,
   26318, '2026-09-08',
   array['acanalada','chapa acanalada','chapa calibre 25','chapa de 2 mts',
         'chapas 2 mts','chapa ranurada','chapas acanaladas',
         'chapas grises ranuradas','chapas ranuradas'],
   true);

-- El renglón toma la ficha (deja de ser texto libre)
update solicitud_compra_item
   set material_id = (select id from stock_materiales
                       where nombre = 'Chapa sinusoidal galv. C25 1.10x2m')
 where id = 3463;
