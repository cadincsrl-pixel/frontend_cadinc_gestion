-- Las devoluciones de una obra, a la vista en su cuenta corriente.
--
-- Pregunta del user (14/09), recién devueltos cinco renglones de 9 DE JULIO:
-- *"en la cuenta corriente, si yo no recuerdo si me lo devolvieron o no, ¿cómo
-- hago para verificar?"*. Y hoy no se puede. `devolver_material` (20260913k)
-- descuenta la devolución de la cuenta y, si vuelve todo, BORRA la fila de
-- MCC: en la cuenta corriente el renglón simplemente deja de estar. Lo único
-- que esa pantalla muestra es la nota de crédito, que existe solo cuando el
-- renglón YA estaba cobrado; las demás devoluciones (las cinco de hoy, y las
-- seis anteriores) no dejan rastro ahí. Para saberlo había que ir al historial
-- del renglón en el pedido, al historial de la ficha en Stock, o a la
-- auditoría, que no guarda la obra.
--
-- La fuente es `solicitud_item_eventos`: cada devolución escribe un evento
-- `devuelto` (o `cancelado`, 20260913p) con la obra, la cantidad antes y
-- después, y el id de la nota de crédito si la hubo. Es la única tabla con
-- TODAS las devoluciones y su obra: `stock_movimientos` se saltea los
-- renglones sin ficha, y las 5 devoluciones de abril no tienen ni obra ni
-- renglón, así que no se le pueden atribuir a nadie.
--
-- RPC de solo lectura, espejo de `cuenta_corriente_notas_detalle`. `monto` es
-- lo que la devolución le sacó a la deuda: el de la nota si hubo nota; si no,
-- cantidad × precio del renglón. Ese renglón pudo retasarse después, así que
-- en ese caso es el precio de HOY y no el del día — se acepta: la lista es
-- para verificar qué volvió, la plata firme vive en la nota y en la cuenta.

create or replace function public.cuenta_corriente_devoluciones_detalle(
  p_obra_cod text
) returns table(
  id               bigint,
  fecha            timestamptz,
  item_id          integer,
  solicitud_id     integer,
  descripcion      text,
  unidad           text,
  cantidad         numeric,
  cantidad_antes   numeric,
  cantidad_despues numeric,
  precio_unit      numeric,
  monto            numeric,
  -- 'nota_credito' (ya estaba cobrado: crédito aparte) · 'descontado' (se bajó
  -- de la cuenta) · 'cancelado' (volvió todo y nunca salió por remito).
  efecto           text,
  nota_credito_id  integer,
  nota_anulada     boolean,
  motivo           text,
  user_id          uuid,
  usuario          text,
  item_estado      text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select e.id,
         e.created_at,
         e.item_id,
         e.solicitud_id,
         i.descripcion,
         coalesce(i.unidad, 'unid'),
         e.cantidad,
         (e.meta->>'cantidad_antes')::numeric,
         (e.meta->>'cantidad_despues')::numeric,
         coalesce(n.precio_unit, i.precio_unit),
         coalesce(n.monto, round(e.cantidad * coalesce(i.precio_unit, 0), 2)),
         case
           when e.accion = 'cancelado' or coalesce((e.meta->>'cancelado')::boolean, false) then 'cancelado'
           when n.id is not null then 'nota_credito'
           else 'descontado'
         end,
         n.id,
         coalesce(n.anulada, false),
         e.comentario,
         e.user_id,
         p.nombre,
         i.estado
  from public.solicitud_item_eventos e
  join public.solicitud_compra_item i on i.id = e.item_id
  left join public.cuenta_cliente_notas_credito n on n.id = (e.meta->>'nota_credito_id')::integer
  left join public.profiles p on p.id = e.user_id
  where e.accion in ('devuelto', 'cancelado')
    and e.meta->>'obra_cod' = p_obra_cod
  order by e.created_at desc, e.id desc
$function$;

comment on function public.cuenta_corriente_devoluciones_detalle(text) is
  'Todas las devoluciones al depósito de una obra (eventos devuelto/cancelado), hayan dejado nota de crédito o no. Para la sección Devoluciones de la cuenta corriente.';

-- Solo el backend la llama (entra como service_role). La tabla de eventos ya
-- no es legible por anon/authenticated desde 20260914d/e, así que esto es
-- consistente con eso y no con las RPC viejas de la cuenta, que quedaron
-- abiertas a roles que ya no pueden leer lo que devuelven.
revoke all on function public.cuenta_corriente_devoluciones_detalle(text) from public, anon, authenticated;
grant execute on function public.cuenta_corriente_devoluciones_detalle(text) to service_role;

-- Los eventos son 16.500 y crecen con cada resolución; las devoluciones son
-- una docena. Índice parcial sobre la obra, solo para esas dos acciones:
-- la RPC toca únicamente las filas que va a devolver.
create index if not exists solicitud_item_eventos_devoluciones_obra_idx
  on public.solicitud_item_eventos ((meta->>'obra_cod'))
  where accion in ('devuelto', 'cancelado');
