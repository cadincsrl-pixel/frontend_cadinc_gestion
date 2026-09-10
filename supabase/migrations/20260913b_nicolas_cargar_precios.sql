-- Nicolás puede cargar precios (y con eso, llevar la compra al catálogo)
--
-- Buscando por qué el tilde "Poner este precio en el catálogo" nunca se usó
-- (cero filas con fuente 'compra' en stock_materiales_precios) apareció la
-- causa: el tilde se ve pero está deshabilitado sin el flag
-- certificaciones.cargar_precios, y NINGUNO de los nueve perfiles activos lo
-- tenía. Solo el admin podía marcarlo. No era olvido: no podían.
--
-- El user: "Habilitado a Nicolás". Es quien compra con la factura delante,
-- así que es el que puede devolverle al catálogo el precio real. Sosa queda
-- afuera a propósito: el 09/09 se le apagó precio_al_resolver (20260912p),
-- o sea que ni siquiera carga precio al comprar.
--
-- Con el flag, Nicolás además deja de necesitar el circuito de proponer y
-- esperar aprobación: carga el precio directo en "Cargar precios".

update public.profiles
   set permisos = jsonb_set(permisos, '{certificaciones,cargar_precios}', 'true'::jsonb, true)
 where id = '2e45e785-fa26-4e1a-8602-22fa093c39d8'
   and coalesce(permisos->'certificaciones'->>'cargar_precios', 'false') <> 'true';
