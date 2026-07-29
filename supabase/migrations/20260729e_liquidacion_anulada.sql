-- Estado 'anulada' para liquidaciones + RPC anular_liquidacion.
--
-- Por qué anular y no borrar: el 2026-07-26 quedaron dos liquidaciones
-- 'cerradas' vacías (la 23 de Gonzalez y la 25 de Zelarayan, gemelas de la 24 y
-- la 29) que los reportes contaban como plata real. Hay que sacarlas de circulación,
-- pero el borrado de liquidaciones es definitivo y los números de liquidación ya
-- salieron impresos en recibos: si mañana alguien pregunta por la N° 23, tiene
-- que quedar el rastro de que se anuló, cuándo y por qué. Decisión del dueño.
--
-- Sólo se puede anular una liquidación CERRADA y VACÍA. Anular una con contenido
-- dejaría tramos, adelantos y gastos apuntando a una liquidación nula: quedarían
-- marcados como liquidados sin liquidación válida, invisibles para el saldo del
-- chofer y para cualquier reliquidación. Para esas el camino es reabrir (que
-- desliga los hijos correctamente) y después eliminar el borrador.

alter table public.liquidaciones
  drop constraint if exists liquidaciones_estado_check;

alter table public.liquidaciones
  add constraint liquidaciones_estado_check
  check (estado in ('borrador', 'cerrada', 'anulada'));

alter table public.liquidaciones
  add column if not exists anulada_en      timestamptz,
  add column if not exists anulada_por     uuid references auth.users(id) on delete set null,
  add column if not exists anulacion_motivo text;

comment on column public.liquidaciones.anulacion_motivo is
  'Por qué se anuló. Obligatorio al anular: el número de liquidación ya circuló impreso y sin motivo el rastro no sirve de nada.';

create or replace function public.anular_liquidacion(
  p_liquidacion_id integer,
  p_user_id        uuid default null,
  p_motivo         text default null
)
returns liquidaciones
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_liq        liquidaciones%rowtype;
  v_tiene_algo boolean;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_liq
    from liquidaciones
   where id = p_liquidacion_id
   for update;

  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  -- Idempotente: anular dos veces no falla ni pisa el motivo original.
  if v_liq.estado = 'anulada' then
    return v_liq;
  end if;

  -- Un borrador no se anula, se elimina: no ensucia ningún reporte porque
  -- nada lo cuenta, y su número todavía no salió impreso en ningún recibo.
  if v_liq.estado <> 'cerrada' then
    raise exception 'LIQUIDACION_NO_CERRADA';
  end if;

  -- Anular una liquidación CON contenido dejaría sus hijos marcados como
  -- liquidados contra una liquidación nula: fuera del saldo del chofer y fuera
  -- de cualquier reliquidación futura. Esas se reabren, no se anulan.
  select exists (select 1 from tramos           where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from tramo_choferes   where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from adelantos        where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from gastos_logistica where liquidacion_id = p_liquidacion_id)
      or exists (select 1 from estadias         where liquidacion_id = p_liquidacion_id)
    into v_tiene_algo;

  if v_tiene_algo then
    raise exception 'LIQUIDACION_CON_CONTENIDO';
  end if;

  -- Tampoco si dejó una deuda arrastrada: el adelanto de saldo apunta acá y
  -- quedaría huérfano. Se reabre (la reapertura lo borra) y después se anula.
  if exists (select 1 from adelantos where liquidacion_origen_id = p_liquidacion_id) then
    raise exception 'LIQUIDACION_CON_SALDO_ARRASTRADO';
  end if;

  update liquidaciones
     set estado           = 'anulada',
         anulada_en       = now(),
         anulada_por      = p_user_id,
         anulacion_motivo = btrim(p_motivo),
         updated_by       = p_user_id
   where id = p_liquidacion_id
  returning * into v_liq;

  return v_liq;
end;
$function$;

comment on function public.anular_liquidacion(integer, uuid, text) is
  'Marca una liquidación cerrada y vacía como anulada, con motivo obligatorio. Rechaza si tiene contenido vinculado o si dejó un adelanto de saldo — esas se reabren.';

revoke all on function public.anular_liquidacion(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.anular_liquidacion(integer, uuid, text) to service_role;
