-- =====================================================================
-- Catálogo de materiales — altas que esperaban una definición del dueño
--
-- Eran 8 materiales que el análisis no podía clasificar solo, porque la
-- palabra que usa la obra es ambigua. El dueño respondió 6 y los datos
-- resolvieron una séptima; la octava se queda como texto libre.
--
--   cuña          → de ENCOFRADO (no la niveladora de porcelanato)
--   corta fierro  → el CINCEL de mano (no la tijera cortahierro)
--   tacho de 20l  → el ENVASE VACÍO (no un balde de pintura)
--   velo          → el de FIBRA que refuerza la membrana (no el geotextil)
--   punteras 2,5  → sí, TERMINALES PUNTERA de tablero
--   grasera       → SON DOS COSAS DISTINTAS, ver abajo
--   estabilizador → del PORTÓN corredizo (lo resolvieron los datos, no
--                   el dueño: los 4 pedidos son de la misma obra, la
--                   misma persona y el mismo día, y dos dicen "de portón")
--   kit de amure  → NO se carga. Un solo pedido y nadie sabe qué es;
--                   inventarle una fila al catálogo es peor que dejarlo.
--
-- LA GRASERA SON DOS MATERIALES, no uno. En CC NORTE piden "grasera
-- manual" y "grasera con grasa" junto con grasa para rodamientos: esa es
-- la engrasadora de mantenimiento. En Clínica Salta piden "grasera de
-- 63", y 63mm es diámetro de caño: esa es la sanitaria. Cargarlas juntas
-- habría mezclado una herramienta con una pieza de desagüe.
-- =====================================================================

insert into public.stock_materiales (rubro_id, nombre, unidad, stock_actual, stock_minimo, precio_ref, activo, alias) values
  -- Albañilería
  (4,  'Cuña de madera p/ encofrado',        'unid', 0, 0, 0, true, array['cuna','cunas']),
  -- Ferretería general
  (6,  'Cortafierro (cincel) de mano',       'unid', 0, 0, 0, true, array['corta fierro','corta hierro','cortafierro','cortafierros']),
  (6,  'Tacho plástico vacío 20lts',         'unid', 0, 0, 0, true, array['tacho vacio de 20','tachos de 20 lts vacios','tacho de 20 para el agua','tachos vacio de 20l']),
  (6,  'Engrasadora manual',                 'unid', 0, 0, 0, true, array['grasera manual','grasera con grasa']),
  -- Sanitaria
  (1,  'Grasera sanitaria 63mm',             'unid', 0, 0, 0, true, array['grasera','grasera de 63']),
  -- Aislación e impermeabilización
  (8,  'Velo de fibra p/ refuerzo de membrana', 'm',  0, 0, 0, true, array['velo','velos']),
  -- Electricidad
  (2,  'Terminal puntera p/ cable 2.5mm²',   'unid', 0, 0, 0, true, array['punteras termicas 2,5','puntera termica','punteras termicas'])
;

-- ── Despegar los sinónimos que la siembra había asignado mal ─────────
-- La siembra de la fase 1b tuvo que adivinar con estos dos términos, y
-- adivinó al revés de lo que resultó ser. Las respuestas del dueño los
-- reasignan, así que hay que sacarlos de la fila vieja: si no, el mismo
-- término devolvería dos candidatos contradictorios en el buscador.
--   'cuña'  estaba en «Niveladores piso (cuña + base)» → es de ENCOFRADO
--   'velo'  estaba en «Geotextil no tejido 200g/m²»     → es el de FIBRA
update public.stock_materiales
   set alias = array_remove(array_remove(alias, 'cuna'), 'cunas')
 where activo and nombre = 'Niveladores piso (cuña + base)';

update public.stock_materiales
   set alias = array_remove(array_remove(alias, 'velo'), 'velos')
 where activo and nombre = 'Geotextil no tejido 200g/m²';
