-- La escalera de acceso al andamio multidireccional
--
-- El user avisó el 17/09 que la había creado y que había dejado la foto en
-- `datos-entrada/fotos-catalogo/`. La foto estaba (captura de las 09:41: una
-- escalera azul de seis peldaños con DOS GANCHOS arriba, de las que se cuelgan
-- del travesaño para subir de un nivel al otro). La ficha NO: en todo el 17/09
-- el `audit_log` tiene una sola alta de material — "palo de escoba" (2775), de
-- Cristian Sosa. El alta de la escalera no llegó a la base.
--
-- POR QUÉ FALTABA Y NADIE LO NOTÓ. La familia del andamio multidireccional se
-- cargó entera el 05/09 y se completó el 11/09 (parantes de 1 a 6 rosetas,
-- travesaños de 1,273 y 2,50, diagonales, rueda con freno, base regulable,
-- tablón metálico y de madera). Está todo el andamio menos la manera de
-- subirse: la escalera de acceso no estaba en ninguna de las dos tandas.
--
-- QUÉ ES. Es parte del andamio, no una escalera de mano: se engancha del
-- travesaño y queda colgada adentro de la torre. Por eso va en la misma familia
-- y NO se confunde con las 6 escaleras que ya hay en el catálogo (tijera de
-- aluminio / de fibra / de madera, recta metálica, extensible, de hierro).
--
-- CLASE `herramienta`, como todo el resto de la familia: va y vuelve de la
-- obra, no se le cobra al cliente y desde 20260916c tampoco mueve stock — la
-- cuenta la lleva el pañol.
--
-- SIN PRECIO a propósito (§5.12): una herramienta no tiene precio de catálogo.
--
-- LOS SINÓNIMOS se chequearon uno por uno contra el matcher del Combobox
-- (substring sobre nombre + rubro + alias, §5.15): los 11 dan CERO fichas.
-- Deliberadamente NO va "escalera" suelto — pegaría en las 6 escaleras de mano
-- y en la de andamio a la vez, que es justo la confusión que hay que evitar.
-- Van las formas con y sin preposición ("escalera de andamio" y "escalera
-- andamio") porque el matcher es substring y no salta el "de".
--
-- LA MEDIDA NO ESTÁ EN EL NOMBRE. La foto no deja leer el largo y la familia
-- tiene travesaños de 1,273 y de 2,50: si la obra usa dos largos de escalera,
-- esto se desdobla en dos fichas como se hizo con los travesaños. Queda
-- genérica hasta que el user diga la medida.

insert into public.stock_materiales (nombre, rubro_id, unidad, clase, precio_ref, alias, activo)
select 'Escalera de acceso p/ andamio multidireccional (c/ ganchos)',
       26,          -- Herramientas y máquinas, igual que el resto del andamio
       'unid',
       'herramienta',
       0,
       array[
         'escalera de andamio',
         'escaleras de andamio',
         'escalera andamio',
         'escalera p/ andamio',
         'escalera para andamio',
         'escalera multidireccional',
         'escalera de andamios multidireccionales',
         'escalera de acceso andamio',
         'escalera de acceso',
         'escalera con ganchos',
         'escalera colgante'
       ],
       true
 where not exists (
   select 1 from public.stock_materiales
    where norm_material(nombre) = norm_material('Escalera de acceso p/ andamio multidireccional (c/ ganchos)')
 );
