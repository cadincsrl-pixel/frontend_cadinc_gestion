-- Que las notas de crédito lleguen a la pantalla.
--
-- 20260913k creó la tabla y la RPC que las emite, pero NADIE las lee: todos los
-- totales de la cuenta corriente salen de dos fuentes —la suma de
-- `v_cuenta_corriente.precio_total` agrupada por estado, y la suma de
-- `cuenta_cliente_cobros.monto`— y la nota no está en ninguna. O sea que hoy
-- una devolución sobre un renglón cobrado baja la deuda de verdad pero el
-- saldo en pantalla sigue igual.
--
-- Va una RPC ESPEJO de `cuenta_corriente_pagos`, no una columna dentro de ella.
-- Esa RPC es literalmente "pagos por obra" y se muestra como "N pagos · $X":
-- meter ahí las notas haría que una devolución aparezca como plata cobrada, que
-- es justo lo que se decidió evitar al no usar un cobro negativo.
--
-- Tampoco se toca `v_cuenta_corriente`: es un ledger renglón a renglón y una
-- nota no es un renglón de la cuenta. El saldo la resta como término aparte:
--     saldo = deuda − pagos − notas

create or replace function public.cuenta_corriente_notas_credito(
  p_obras    text[] default null,
  p_obra_cod text   default null
) returns table(obra_cod text, notas integer, monto numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select n.obra_cod, count(*)::integer, coalesce(sum(n.monto), 0)
  from public.cuenta_cliente_notas_credito n
  where not n.anulada
    and (p_obras is null or n.obra_cod = any(p_obras))
    and (p_obra_cod is null or n.obra_cod = p_obra_cod)
  group by 1
$function$;

-- Detalle por obra, para el PDF y la pantalla de la obra: qué se devolvió,
-- cuándo y de qué renglón salió.
create or replace function public.cuenta_corriente_notas_detalle(
  p_obra_cod text
) returns table(
  id integer, fecha date, descripcion text, cantidad numeric, unidad text,
  precio_unit numeric, monto numeric, motivo text, item_id integer
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select n.id, n.fecha, n.descripcion, n.cantidad, n.unidad,
         n.precio_unit, n.monto, n.motivo, n.item_id
  from public.cuenta_cliente_notas_credito n
  where n.obra_cod = p_obra_cod and not n.anulada
  order by n.fecha desc, n.id desc
$function$;
