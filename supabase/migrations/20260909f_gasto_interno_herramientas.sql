-- Las herramientas que compra un centro interno, que la cuenta no ve
--
-- `materiales_a_cuenta_cliente` excluye las herramientas a propósito (trigger
-- trg_mcc_sin_herramientas): una herramienta va y vuelve de la obra, no se le
-- factura a nadie. Perfecto para la cuenta del cliente, pero deja un agujero en
-- la pantalla de gasto interno — el pañol es justo donde se compran las
-- amoladoras, y si el número no las muestra, el primer mes alguien pregunta
-- dónde está la que compró.
--
-- No las meto en MCC (rompería el candado y las cinco escrituras de esa tabla).
-- Van en una columna aparte, etiquetada como patrimonio y no como consumo: se
-- calculan del pedido, que es donde queda el precio.
--
-- Criterio de "es herramienta": el mismo que usa el candado de MCC — la clase
-- del renglón O la clase de la ficha del catálogo.

create or replace function public.gasto_interno_herramientas(
  p_obras     text[] default null,
  p_obra_cod  text   default null,
  p_desde     date   default null,
  p_hasta     date   default null)
returns table(mes text, obra_cod text, obra_nom text, renglones integer, total numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select
    to_char(coalesce(i.fecha_resolucion, s.fecha)::timestamptz, 'YYYY-MM'),
    o.cod,
    o.nom,
    count(*)::integer,
    coalesce(sum(coalesce(nullif(i.cantidad_enviada, 0), i.cantidad) * i.precio_unit), 0)
  from public.solicitud_compra_item i
  join public.solicitud_compra s on s.id = i.solicitud_id
  join public.obras o            on o.cod = s.obra_cod
  left join public.stock_materiales m on m.id = i.material_id
  where o.es_interna
    and (i.clase = 'herramienta' or m.clase = 'herramienta')
    and i.estado in ('comprado', 'de_deposito', 'retirado', 'enviado')
    and (p_obras is null or o.cod = any(p_obras))
    and (p_obra_cod is null or o.cod = p_obra_cod)
    and (p_desde is null or coalesce(i.fecha_resolucion, s.fecha) >= p_desde)
    and (p_hasta is null or coalesce(i.fecha_resolucion, s.fecha) <= p_hasta)
  group by 1, 2, 3
$function$;

-- Las RPC SECURITY INVOKER las puede llamar el backend con cualquiera de sus
-- dos clientes; igual el permiso y el alcance por obra se validan ANTES, en el
-- handler, como el resto del módulo.
grant execute on function public.gasto_interno_herramientas(text[], text, date, date) to service_role;
