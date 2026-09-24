-- Ventas: la tab `finnegans` pasa a llamarse `impuestos` (24/09).
--
-- El dueño decidió dejar Finnegans: «manejaremos desde acá la contabilidad, no
-- registraremos nada ahí». La bandeja de «registrar en Finnegans» sale de la
-- pantalla y la tab queda para los impuestos: posición de IVA del mes y Libro
-- IVA Digital de ventas y de compras.
--
-- Se reemplaza la clave EN SU LUGAR dentro de `permisos.facturacion.tabs` (el
-- orden importa: la página redirige al primer tab permitido). Al 24/09 la tiene
-- una sola persona (Mariana Dibe) y ningún rol. El flag `registrar_finnegans`
-- se deja donde está: ya nada lo lee y no molesta.
--
-- El backend acepta `impuestos` y `finnegans` en las rutas de los libros, así
-- que el orden entre este cambio y el deploy no importa.

update public.profiles p
set permisos = jsonb_set(
  p.permisos, '{facturacion,tabs}',
  (select jsonb_agg(case when t = 'finnegans' then 'impuestos' else t end order by ord)
     from jsonb_array_elements_text(p.permisos->'facturacion'->'tabs') with ordinality as x(t, ord))
)
where p.permisos->'facturacion'->'tabs' ? 'finnegans';

update public.roles r
set permisos = jsonb_set(
  r.permisos, '{facturacion,tabs}',
  (select jsonb_agg(case when t = 'finnegans' then 'impuestos' else t end order by ord)
     from jsonb_array_elements_text(r.permisos->'facturacion'->'tabs') with ordinality as x(t, ord))
)
where r.permisos->'facturacion'->'tabs' ? 'finnegans';
