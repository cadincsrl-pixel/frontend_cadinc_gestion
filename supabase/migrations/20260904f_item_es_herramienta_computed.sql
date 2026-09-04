-- Campo calculado de PostgREST: `solicitud_compra_item.es_herramienta`.
--
-- Permite que el frontend sepa que renglon es herramienta SIN reimplementar el
-- predicado en TypeScript. Sin esto, la vista previa del remito (que existe
-- justamente para revisar antes de imprimir el definitivo) mostraria algo
-- distinto del papel final: el borrador solo conoce el tilde manual `clase`,
-- que cubre 4 de 256 casos.
--
-- Se selecciona como una columna mas: .select('*, es_herramienta').

create or replace function public.es_herramienta(i public.solicitud_compra_item)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select public.es_herramienta_item(i.clase, i.material_id, i.descripcion) is not null
$$;

comment on function public.es_herramienta(public.solicitud_compra_item) is
  'Campo calculado para PostgREST. Unica fuente: es_herramienta_item(). No duplicar la regla en el cliente.';
