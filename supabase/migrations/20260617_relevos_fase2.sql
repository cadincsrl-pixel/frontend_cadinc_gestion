-- Fase 2 de relevos: que el relevo llegue a la liquidación (plata) del chofer relevista.
-- 1) tramo_choferes.liquidacion_id → cada pata del relevo se liquida independiente.
-- 2) Consolidar create_liquidacion_con_reintegros en UN solo overload con p_tramo_chofer_ids.
-- 3) reabrir/eliminar liquidación desligan también tramo_choferes.

-- ── 1) Columna liquidacion_id en tramo_choferes ──────────────────────────────
-- FK SIN on delete cascade: al eliminar una liquidación, el RPC desliga las filas
-- (no las borra). Ver eliminar_liquidacion abajo.
alter table public.tramo_choferes
  add column if not exists liquidacion_id integer references public.liquidaciones(id);

create index if not exists tramo_choferes_liquidacion_idx
  on public.tramo_choferes (liquidacion_id);

-- ── 2) Consolidar el RPC create_liquidacion_con_reintegros ───────────────────
-- Hoy hay dos overloads (17 y 19 args). Los dropeamos y dejamos UNO solo para
-- evitar ambigüedad de PostgREST. El nuevo agrega p_tramo_chofer_ids (filas de
-- relevo a liquidar para este chofer) con DEFAULT '{}' → back-compat de deploy
-- (el backend viejo, que manda 19 keys, sigue funcionando).
drop function if exists public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid);

drop function if exists public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid, numeric, numeric);

create function public.create_liquidacion_con_reintegros(
  p_chofer_id           integer,
  p_fecha_desde         date,
  p_fecha_hasta         date,
  p_dias_trabajados     integer,
  p_basico_dia          numeric,
  p_km_totales          numeric,
  p_precio_km           numeric,
  p_subtotal_basico     numeric,
  p_subtotal_km         numeric,
  p_total_adelantos     numeric,
  p_total_reintegros    numeric,
  p_total_neto          numeric,
  p_obs                 text,
  p_tramo_ids           integer[],
  p_adelanto_ids        integer[],
  p_gasto_ids           integer[],
  p_user_id             uuid,
  p_subtotal_km_cargado numeric    default null,
  p_subtotal_km_vacio   numeric    default null,
  p_tramo_chofer_ids    integer[]  default '{}'
)
returns liquidaciones
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_liq         liquidaciones;
  v_tramo_id    integer;
  v_adelanto_id integer;
  v_gasto_id    integer;
  v_tc_id       integer;
begin
  if array_length(p_tramo_ids, 1) > 0 then
    perform 1 from tramos
    where id = any(p_tramo_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null or estado <> 'completado');
    if found then
      raise exception 'TRAMO_INVALIDO' using detail = 'Algun tramo no es valido (otro chofer / ya liquidado / no completado).';
    end if;
  end if;

  if array_length(p_tramo_chofer_ids, 1) > 0 then
    perform 1 from tramo_choferes
    where id = any(p_tramo_chofer_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null);
    if found then
      raise exception 'RELEVO_INVALIDO' using detail = 'Alguna fila de relevo no es valida (otro chofer / ya liquidada).';
    end if;
  end if;

  if array_length(p_adelanto_ids, 1) > 0 then
    perform 1 from adelantos
    where id = any(p_adelanto_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null);
    if found then
      raise exception 'ADELANTO_INVALIDO' using detail = 'Algun adelanto no es valido.';
    end if;
  end if;

  if array_length(p_gasto_ids, 1) > 0 then
    perform 1 from gastos_logistica
    where id = any(p_gasto_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null or estado <> 'aprobado' or pagado_por <> 'chofer' or deleted_at is not null);
    if found then
      raise exception 'GASTO_INVALIDO' using detail = 'Algun gasto no es valido para reintegrar.';
    end if;
  end if;

  insert into liquidaciones (
    chofer_id, fecha_desde, fecha_hasta, dias_trabajados,
    basico_dia, km_totales, precio_km,
    subtotal_basico, subtotal_km,
    subtotal_km_cargado, subtotal_km_vacio,
    total_adelantos, total_reintegros, total_neto,
    obs, estado, created_by, updated_by
  ) values (
    p_chofer_id, p_fecha_desde, p_fecha_hasta, p_dias_trabajados,
    p_basico_dia, p_km_totales, p_precio_km,
    p_subtotal_basico, p_subtotal_km,
    p_subtotal_km_cargado, p_subtotal_km_vacio,
    p_total_adelantos, p_total_reintegros, p_total_neto,
    p_obs, 'borrador', p_user_id, p_user_id
  ) returning * into v_liq;

  foreach v_tramo_id in array p_tramo_ids loop
    update tramos set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_tramo_id;
  end loop;

  -- Patas de relevo: cada fila tramo_choferes se vincula a esta liquidación.
  foreach v_tc_id in array p_tramo_chofer_ids loop
    update tramo_choferes set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_tc_id;
  end loop;

  foreach v_adelanto_id in array p_adelanto_ids loop
    update adelantos set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_adelanto_id;
  end loop;

  foreach v_gasto_id in array p_gasto_ids loop
    update gastos_logistica set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_gasto_id;
  end loop;

  return v_liq;
end
$function$;

-- Re-aplicar grants (el DROP los borró). Patrón de 20260527: solo service_role
-- (el backend llama con supabaseAdmin). OJO: Supabase tiene default privileges que
-- otorgan EXECUTE a anon/authenticated al CREATE → hay que revocarlos explícitamente
-- (revocar de PUBLIC no alcanza, son grants explícitos por rol).
revoke all on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid, numeric, numeric, integer[]
) from public, anon, authenticated;

grant execute on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid, numeric, numeric, integer[]
) to service_role;

-- ── 3) reabrir / eliminar liquidación: desligar también tramo_choferes ───────
-- Sin esto, una liquidación con relevos deja las filas tramo_choferes colgadas
-- (liquidacion_id seteado para siempre → nunca re-liquidables), y eliminar la
-- liquidación quedaría bloqueado por la FK.
create or replace function public.reabrir_liquidacion(p_liquidacion_id integer, p_user_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado_actual text;
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
begin
  select estado into v_estado_actual
    from liquidaciones
   where id = p_liquidacion_id
   for update;

  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  if v_estado_actual = 'borrador' then
    raise exception 'LIQUIDACION_YA_EN_BORRADOR';
  end if;

  update tramos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_tramos_desligados = row_count;

  update tramo_choferes
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;

  update adelantos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_adelantos_desligados = row_count;

  update gastos_logistica
     set estado         = 'aprobado',
         liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_gastos_revertidos = row_count;

  update liquidaciones
     set estado     = 'borrador',
         updated_by = p_user_id
   where id = p_liquidacion_id;

  return jsonb_build_object(
    'success',              true,
    'liquidacion_id',       p_liquidacion_id,
    'tramos_desligados',    v_tramos_desligados,
    'adelantos_desligados', v_adelantos_desligados,
    'gastos_revertidos',    v_gastos_revertidos
  );
end;
$function$;

create or replace function public.eliminar_liquidacion(p_liquidacion_id integer, p_user_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tramos_desligados    integer;
  v_adelantos_desligados integer;
  v_gastos_revertidos    integer;
begin
  perform 1 from liquidaciones where id = p_liquidacion_id for update;
  if not found then
    raise exception 'LIQUIDACION_NO_EXISTE';
  end if;

  update tramos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_tramos_desligados = row_count;

  -- Desligar filas de relevo ANTES del DELETE (la FK sin cascade lo bloquearía).
  update tramo_choferes
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;

  update adelantos
     set liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_adelantos_desligados = row_count;

  update gastos_logistica
     set estado         = 'aprobado',
         liquidacion_id = null,
         updated_by     = p_user_id
   where liquidacion_id = p_liquidacion_id;
  get diagnostics v_gastos_revertidos = row_count;

  delete from liquidaciones where id = p_liquidacion_id;

  return jsonb_build_object(
    'success',              true,
    'liquidacion_id',       p_liquidacion_id,
    'tramos_desligados',    v_tramos_desligados,
    'adelantos_desligados', v_adelantos_desligados,
    'gastos_revertidos',    v_gastos_revertidos
  );
end;
$function$;
