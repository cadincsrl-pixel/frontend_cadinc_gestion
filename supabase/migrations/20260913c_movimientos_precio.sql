-- v_movimientos_precio — todo cambio de precio, de los dos orígenes, en una lista
--
-- El user (10/09): "yo como jefe de Nicolás quiero saber todo lo que hace
-- porque soy desconfiado". El dato ya existía pero partido en dos tablas que
-- solo se miran por separado y renglón por renglón:
--
--   · solicitud_item_eventos con accion='precio_cambiado' — lo escribe el
--     trigger de materiales_a_cuenta_cliente desde el 08/09, con precio
--     anterior y nuevo en meta. Es lo que se le cobra al CLIENTE.
--   · stock_materiales_precios — lo escribe fijar_precio_ref, con fuente y
--     usuario. Es el precio de REFERENCIA del catálogo, que vale para todas
--     las obras.
--
-- El precio anterior del catálogo no está guardado: se deriva con lag() sobre
-- el historial de esa misma ficha. La primera fila de cada ficha queda con
-- anterior = null, que es la verdad (antes no había precio).
--
-- Ojo con `fuente` en los renglones: hoy dice 'sql' casi siempre porque el
-- backend no la setea (PostgREST no expone set_config), así que NO significa
-- "alguien tocó la base a mano". Para el catálogo sí es fiable.

create or replace view public.v_movimientos_precio as
with cat as (
  select h.id, h.created_at, h.user_id, h.material_id, h.item_id, h.precio, h.fuente, h.obs,
         lag(h.precio) over (partition by h.material_id order by h.desde, h.id) as anterior
    from public.stock_materiales_precios h
)
select
  'renglon'::text                                   as tipo,
  e.created_at                                      as fecha,
  e.user_id,
  s.obra_cod,
  o.nom                                             as obra_nom,
  e.item_id,
  i.descripcion,
  i.material_id,
  m.nombre                                          as ficha,
  (e.meta->>'precio_anterior')::numeric             as precio_anterior,
  (e.meta->>'precio_nuevo')::numeric                as precio_nuevo,
  (e.meta->>'total_anterior')::numeric              as total_anterior,
  (e.meta->>'total_nuevo')::numeric                 as total_nuevo,
  e.meta->>'fuente'                                 as fuente,
  null::text                                        as obs
from public.solicitud_item_eventos e
join public.solicitud_compra_item i on i.id = e.item_id
join public.solicitud_compra s      on s.id = i.solicitud_id
left join public.obras o            on o.cod = s.obra_cod
left join public.stock_materiales m on m.id = i.material_id
where e.accion = 'precio_cambiado'

union all

select
  'catalogo'::text,
  c.created_at,
  c.user_id,
  null::text,
  null::text,
  c.item_id,
  m.nombre,
  c.material_id,
  m.nombre,
  c.anterior,
  c.precio,
  null::numeric,
  null::numeric,
  c.fuente,
  c.obs
from cat c
join public.stock_materiales m on m.id = c.material_id;

comment on view public.v_movimientos_precio is
  'Cambios de precio de los dos orígenes (renglón de la cuenta del cliente y precio de referencia del catálogo) en una sola lista, para la pantalla de control de Admin. Solo lectura.';
