-- create_liquidacion_con_reintegros v3: acepta la modalidad pct.
--
-- Cuatro parámetros nuevos con default (modalidad, pct_aplicado, base_neta,
-- subtotal_pct) — una llamada vieja sin ellos crea una liquidación km_jornal
-- idéntica a la de siempre. El resto del cuerpo es EL MISMO de la migración
-- 20260716 (validaciones de pertenencia + vinculación atómica); solo cambia
-- el insert.

drop function if exists public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid,
  numeric, numeric, integer[], integer[], numeric);

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
  p_tramo_chofer_ids    integer[]  default '{}',
  p_estadia_ids         integer[]  default '{}',
  p_total_estadias      numeric    default 0,
  p_modalidad           text       default 'km_jornal',
  p_pct_aplicado        numeric    default null,
  p_base_neta           numeric    default null,
  p_subtotal_pct        numeric    default null
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
  v_estadia_id  integer;
begin
  if p_modalidad not in ('km_jornal', 'pct') then
    raise exception 'MODALIDAD_INVALIDA';
  end if;
  -- En pct, los tres componentes viajan juntos o la liquidación no se explica.
  if p_modalidad = 'pct' and (p_pct_aplicado is null or p_base_neta is null or p_subtotal_pct is null) then
    raise exception 'PCT_INCOMPLETO' using detail = 'Modalidad pct requiere pct_aplicado, base_neta y subtotal_pct.';
  end if;

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

  if array_length(p_estadia_ids, 1) > 0 then
    perform 1 from estadias
    where id = any(p_estadia_ids)
      and (chofer_id <> p_chofer_id or liquidacion_id is not null);
    if found then
      raise exception 'ESTADIA_INVALIDA' using detail = 'Alguna estadia no es valida (otro chofer / ya liquidada).';
    end if;
  end if;

  insert into liquidaciones (
    chofer_id, fecha_desde, fecha_hasta, dias_trabajados,
    basico_dia, km_totales, precio_km,
    subtotal_basico, subtotal_km,
    subtotal_km_cargado, subtotal_km_vacio,
    total_adelantos, total_reintegros, total_estadias, total_neto,
    modalidad, pct_aplicado, base_neta, subtotal_pct,
    obs, estado, created_by, updated_by
  ) values (
    p_chofer_id, p_fecha_desde, p_fecha_hasta, p_dias_trabajados,
    p_basico_dia, p_km_totales, p_precio_km,
    p_subtotal_basico, p_subtotal_km,
    p_subtotal_km_cargado, p_subtotal_km_vacio,
    p_total_adelantos, p_total_reintegros, p_total_estadias, p_total_neto,
    p_modalidad, p_pct_aplicado, p_base_neta, p_subtotal_pct,
    p_obs, 'borrador', p_user_id, p_user_id
  ) returning * into v_liq;

  foreach v_tramo_id in array p_tramo_ids loop
    update tramos set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_tramo_id;
  end loop;

  foreach v_tc_id in array p_tramo_chofer_ids loop
    update tramo_choferes set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_tc_id;
  end loop;

  foreach v_adelanto_id in array p_adelanto_ids loop
    update adelantos set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_adelanto_id;
  end loop;

  foreach v_gasto_id in array p_gasto_ids loop
    update gastos_logistica set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_gasto_id;
  end loop;

  foreach v_estadia_id in array p_estadia_ids loop
    update estadias set liquidacion_id = v_liq.id, updated_by = p_user_id where id = v_estadia_id;
  end loop;

  return v_liq;
end
$function$;

comment on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid,
  numeric, numeric, integer[], integer[], numeric, text, numeric, numeric, numeric) is
  'Crea la liquidación (km_jornal o pct) y vincula tramos/relevos/adelantos/gastos/estadías atómicamente, validando pertenencia al chofer.';

revoke all on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid,
  numeric, numeric, integer[], integer[], numeric, text, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.create_liquidacion_con_reintegros(
  integer, date, date, integer, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, integer[], integer[], integer[], uuid,
  numeric, numeric, integer[], integer[], numeric, text, numeric, numeric, numeric)
  to service_role;
