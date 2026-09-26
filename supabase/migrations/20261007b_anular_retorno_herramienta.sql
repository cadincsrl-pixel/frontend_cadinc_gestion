-- =====================================================================
-- 20261007b — Pañol: anular un retorno desde la app
-- (2026-09-26, pedido del dueño en la revisión del circuito)
--
-- Registrar un retorno (o un cierre: perdida / rota / baja en obra,
-- 20261005d) no se podía deshacer desde la app. Esta RPC lo anula: la fila
-- pasa a `anulada` con el motivo en la nota, y trg_herr_entregas_devuelto
-- recalcula lo que queda en obra de la salida (cuenta solo las no anuladas).
--
-- Solo retornos cargados en el pañol (item_id null). Los que vienen de un
-- renglón «↩ Devuelve» del pedido cuelgan de `cantidad_enviada` del renglón
-- (fn_herr_entregas_sync los volvería a crear): se corrigen desde el pedido
-- (RETORNO_DEL_PEDIDO). Motivo obligatorio (MOTIVO_REQUERIDO).
-- =====================================================================

create or replace function public.anular_retorno_herramienta(
  p_id      bigint,
  p_motivo  text,
  p_user_id uuid
) returns herr_entregas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila herr_entregas;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001';
  end if;
  select * into v_fila from herr_entregas where id = p_id for update;
  if not found then
    raise exception 'RETORNO_NO_EXISTE' using errcode = 'P0001';
  end if;
  if v_fila.sentido <> 'devolucion' or v_fila.estado = 'anulada' then
    raise exception 'NO_ES_RETORNO_VIVO' using errcode = 'P0001';
  end if;
  if v_fila.item_id is not null then
    raise exception 'RETORNO_DEL_PEDIDO' using errcode = 'P0001', detail = v_fila.item_id::text;
  end if;

  update herr_entregas
     set estado     = 'anulada',
         nota       = coalesce(nota || ' | ', '') || 'Retorno anulado: ' || btrim(p_motivo),
         updated_by = p_user_id,
         updated_at = now()
   where id = p_id
  returning * into v_fila;
  return v_fila;
end $$;

comment on function public.anular_retorno_herramienta(bigint, text, uuid) is
  'Anula un retorno o cierre cargado en el pañol (no los de «↩ Devuelve» del pedido). Motivo obligatorio. 20261007b.';

revoke all on function public.anular_retorno_herramienta(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.anular_retorno_herramienta(bigint, text, uuid) to service_role;
