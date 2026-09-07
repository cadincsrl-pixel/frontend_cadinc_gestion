-- 20260908a — Los cables unipolares se parten por color (user 2026-09-07:
-- "los cables electricos es super importante tenerlo por color, ya que son
-- normas que dependen del color del cable")
--
-- POR QUE FICHAS NUEVAS Y NO EL CAMPO QUE YA EXISTIA:
-- `stock_materiales.usa_color` ya estaba prendido en las 7 fichas de unipolar y
-- hace aparecer un campo "color" de texto libre en el renglon del pedido. No
-- alcanza, por dos razones que los datos dejan a la vista:
--   1) Nadie lo llena. De 3.375 renglones cargados, 17 tienen color. De los 27
--      de cable unipolar, 3. Y uno de esos tres dice "rojo, celeste, verde
--      amarillo" en un solo renglon de 150 m.
--   2) Aunque se llene, MUERE EN EL DEPOSITO. `stock_movimientos` no tiene
--      columna de color y `stock_actual` es un numero solo. Hoy la ficha de
--      1,5mm2 esta en -100 m mezclando todos los colores: el galpon no puede
--      decir cuanto celeste o cuanto verde-amarillo tiene.
-- Es el mismo criterio de la Sikafill (20260907s): si el color decide que se
-- despacha, es ficha, no atributo.
--
-- 6 colores x 4 secciones. Las de 10, 16 y 25 mm2 quedan como estan: nunca
-- tuvieron un renglon ni un precio. El precio de cada color es el de su ficha
-- generica: el color no cambia lo que sale el metro.
--
-- `usa_color` queda en FALSE en las nuevas (default): el color ya esta en el
-- nombre, y dejar el campo libre encima invita a contradecirlo.
insert into public.stock_materiales
  (rubro_id, nombre, unidad, clase, activo, stock_actual, precio_ref, alias, obs)
select 2,
       'Cable unipolar ' || s.punto || 'mm² ' || c.nombre,
       'm', 'material', true, 0, s.precio,
       array(select distinct e from unnest(array[
           'cable ' || s.coma,
           'cable de ' || s.punto,
           'cable de ' || s.coma,
           'cable ' || s.coma  || ' ' || c.plano,
           'cable ' || s.punto || ' ' || c.plano,
           'cable ' || c.plano || ' de ' || s.punto,
           'cable unipolar ' || s.punto || ' ' || c.plano
         ] || case c.rol
                when 'neutro' then array['cable ' || s.punto || ' neutro', 'cable neutro ' || s.punto]
                when 'tierra' then array['cable ' || s.punto || ' tierra', 'cable tierra ' || s.punto]
                else '{}'::text[]
              end) e),
       'Seccion ' || s.punto || ' mm2. ' || c.rol_desc ||
       ' Salio de partir la ficha generica ' || s.gid || ' el 07/09.'
from (values ('1.5','1,5',36,602.58), ('2.5','2,5',37,971.63),
             ('4','4',38,1181.00),    ('6','6',39,2152.35))
       as s(punto, coma, gid, precio)
cross join (values
  ('marrón',        'marron',        'fase',   'Fase (vivo). AEA 90364 admite marron, negro y rojo.'),
  ('negro',         'negro',         'fase',   'Fase (vivo). AEA 90364 admite marron, negro y rojo.'),
  ('rojo',          'rojo',          'fase',   'Fase (vivo). AEA 90364 admite marron, negro y rojo.'),
  ('celeste',       'celeste',       'neutro', 'NEUTRO. Color exclusivo por norma AEA 90364: ningun otro conductor puede ser celeste.'),
  ('verde-amarillo','verde amarillo','tierra', 'TIERRA / conductor de proteccion (PE). Color exclusivo por norma AEA 90364.'),
  ('blanco',        'blanco',        'otro',   'Sin rol normativo asignado; se usa en obra pero AEA no lo reserva para fase, neutro ni tierra.')
) as c(nombre, plano, rol, rol_desc);

-- Las cuatro genericas salen del buscador del pedido. Se renombran a "sin
-- especificar" (mismo criterio que la membrana, 20260907s) y se les vacian los
-- alias, que se mudaron arriba: quien escriba "cable 2,5" ahora ve los seis
-- colores y tiene que elegir uno. Sus renglones viejos NO se tocan: nunca
-- dijeron el color y son documentos emitidos.
update public.stock_materiales
set nombre = replace(nombre, ' sin marca', '') || ' sin especificar',
    activo = false,
    alias  = '{}',
    obs    = 'Retirada el 07/09 al partir el cable por color. No se puede saber que color eran sus renglones viejos, por eso quedan colgando de esta ficha. Si alguna vez hace falta cargar cable sin saber el color, reactivar; lo correcto es elegir el color.'
where id in (36, 37, 38, 39);

-- La de 1,5 arrastra -100 m de despachos que nunca tuvieron entrada. Se cierra
-- en cero, pendiente de aprobar como todos los ajustes. No se puede repartir
-- entre los colores: los renglones viejos no lo dicen.
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
values
  (36, 'ajuste', 100, 'ajuste_inventario', 'error_carga', 'pendiente', '2026-09-07',
   'Cierre de la ficha generica de cable unipolar 1,5mm2, que se retira al partir el cable por color. Estaba en -100 m: salieron 100 metros que nunca entraron. No se puede imputar a un color porque los renglones viejos no lo dicen.',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
