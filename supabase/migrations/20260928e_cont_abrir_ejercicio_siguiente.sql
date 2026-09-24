-- =====================================================================
-- Contabilidad: abrir el ejercicio siguiente desde la pantalla (2026-09-28)
--
-- Por qué: hasta hoy el único ejercicio (2026/27) se sembró en 20260926a y
-- el 2027/28 se hubiera creado con otra migración. Regla del dueño: todo lo
-- operativo se hace desde la pantalla. Sin el ejercicio siguiente, desde el
-- 01/07/2027 las fechas dan FECHA_SIN_PERIODO.
--
-- cont_abrir_ejercicio_siguiente(p_user_id):
--   - flag `cerrar_periodos` (admin bypass, como cerrar/reabrir);
--   - crea el ejercicio de 12 meses que sigue al ÚLTIMO (desde = hasta + 1,
--     julio a junio) con sus 12 períodos abiertos; nombre «AAAA/AA»;
--   - EJERCICIO_SIGUIENTE_YA_EXISTE si el último todavía no empezó (el
--     siguiente al de hoy ya está abierto): así dos clics no abren dos años;
--   - EJERCICIO_NO_EXISTE si no hay ninguno del cual seguir.
-- Security definer, solo service_role (patrón de las cont_*).
-- =====================================================================

create or replace function public.cont_abrir_ejercicio_siguiente(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ult    public.cont_ejercicios%rowtype;
  v_desde  date;
  v_hasta  date;
  v_nombre text;
  v_id     bigint;
  v_n      int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'cerrar_periodos') then
    raise exception 'SIN_PERMISO_CERRAR' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('cont_abrir_ejercicio_siguiente'));

  select * into v_ult from public.cont_ejercicios order by hasta desc, id desc limit 1;
  if not found then
    raise exception 'EJERCICIO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('motivo', 'sin_ejercicios')::text;
  end if;
  if v_ult.desde > public.hoy_ar() then
    raise exception 'EJERCICIO_SIGUIENTE_YA_EXISTE' using errcode = 'P0001',
      detail = json_build_object('ejercicio_id', v_ult.id, 'nombre', v_ult.nombre, 'desde', v_ult.desde, 'hasta', v_ult.hasta)::text;
  end if;

  v_desde  := v_ult.hasta + 1;
  v_hasta  := (v_desde + interval '12 months' - interval '1 day')::date;
  v_nombre := to_char(v_desde, 'YYYY') || '/' || to_char(v_hasta, 'YY');

  insert into public.cont_ejercicios (nombre, desde, hasta, created_by, updated_by)
  values (v_nombre, v_desde, v_hasta, p_user_id, p_user_id)
  returning id into v_id;

  insert into public.cont_periodos (ejercicio_id, numero, desde, hasta, created_by, updated_by)
  select v_id, row_number() over (order by m)::smallint, m::date, (m + interval '1 month' - interval '1 day')::date,
         p_user_id, p_user_id
    from generate_series(v_desde::timestamp, (v_desde + interval '11 months')::timestamp, interval '1 month') m;
  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'ejercicio', (select jsonb_build_object('id', e.id, 'nombre', e.nombre, 'desde', e.desde, 'hasta', e.hasta, 'estado', e.estado)
                    from public.cont_ejercicios e where e.id = v_id),
    'periodos', v_n);
end $$;

comment on function public.cont_abrir_ejercicio_siguiente(uuid) is
  'Crea el ejercicio de 12 meses que sigue al último (julio a junio) con sus 12 períodos abiertos. Flag cerrar_periodos. EJERCICIO_SIGUIENTE_YA_EXISTE si el último todavía no empezó. 20260928e.';

revoke all on function public.cont_abrir_ejercicio_siguiente(uuid) from public, anon, authenticated;
grant execute on function public.cont_abrir_ejercicio_siguiente(uuid) to service_role;
