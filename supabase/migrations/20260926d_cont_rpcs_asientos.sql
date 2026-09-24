-- =====================================================================
-- Contabilidad fase 1: RPC de asientos manuales (2026-09-26)
--
-- Por qué: guardar un asiento toca encabezado + N líneas y tiene que ser
-- atómico; y las reglas de anulación dependen del estado del período:
--   · borrador → se borra físicamente (cont_borrar_asiento);
--   · confirmado en período abierto → estado 'anulado' (queda sin número);
--   · confirmado en período cerrado → CONTRAASIENTO (tipo 'ajuste', debe y
--     haber invertidos) fechado en un período abierto; el original queda con
--     revertido_por_id.
--
-- Concurrencia: FOR SHARE sobre el/los período(s) y FOR UPDATE sobre el
-- asiento. cont_cerrar_periodo toma FOR UPDATE del período, así que cerrar y
-- guardar en el mismo mes se serializan (y el estado del período se lee
-- DESPUÉS de tomar el lock).
--
-- Todas: p_user_id explícito (nunca auth.uid()), flag asientos_manuales,
-- y prenden cadinc.cont_rpc para pasar las guardas de 20260926a.
-- =====================================================================

-- Lock del período de una fecha y validación de que esté abierto.
create or replace function public._cont_lock_periodo_abierto(p_fecha date)
returns public.cont_periodos
language plpgsql set search_path = public, pg_temp as $$
declare
  v_p   public.cont_periodos%rowtype;
  v_est text;
begin
  select p.* into v_p from public.cont_periodos p where p_fecha between p.desde and p.hasta for share;
  if not found then
    raise exception 'FECHA_SIN_PERIODO' using errcode = 'P0001', detail = json_build_object('fecha', p_fecha)::text;
  end if;
  if v_p.estado = 'cerrado' then
    raise exception 'PERIODO_CERRADO' using errcode = 'P0001',
      detail = json_build_object('periodo_id', v_p.id, 'fecha', p_fecha)::text;
  end if;
  select estado into v_est from public.cont_ejercicios where id = v_p.ejercicio_id;
  if v_est = 'cerrado' then
    raise exception 'EJERCICIO_CERRADO' using errcode = 'P0001',
      detail = json_build_object('ejercicio_id', v_p.ejercicio_id, 'fecha', p_fecha)::text;
  end if;
  return v_p;
end $$;

-- ── 1) Guardar (alta o edición completa) ───────────────────────────────
create or replace function public.cont_guardar_asiento(p_asiento jsonb, p_lineas jsonb, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id      bigint;
  v_fecha   date;
  v_tipo    text := coalesce(nullif(btrim(p_asiento ->> 'tipo'), ''), 'manual');
  v_estado  text := nullif(btrim(p_asiento ->> 'estado'), '');
  v_glosa   text := btrim(coalesce(p_asiento ->> 'glosa', ''));
  v_a       public.cont_asientos%rowtype;
  v_per     public.cont_periodos%rowtype;
  v_eje     public.cont_ejercicios%rowtype;
  v_lin     jsonb;
  v_debe    numeric(14,2);
  v_haber   numeric(14,2);
  v_n       int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'asientos_manuales') then
    raise exception 'SIN_PERMISO_ASIENTOS' using errcode = 'P0001';
  end if;
  perform set_config('cadinc.cont_rpc', 'on', true);

  if p_asiento is null or jsonb_typeof(p_asiento) <> 'object' then
    raise exception 'DATOS_INVALIDOS' using errcode = 'P0001', detail = json_build_object('campo', 'asiento')::text;
  end if;
  begin
    v_id := nullif(p_asiento ->> 'id', '')::bigint;
  exception when others then
    raise exception 'ID_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'id')::text;
  end;
  begin
    v_fecha := nullif(btrim(p_asiento ->> 'fecha'), '')::date;
  exception when others then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'fecha')::text;
  end;

  -- Encabezado.
  if v_tipo not in ('manual', 'ajuste', 'apertura') then
    raise exception 'TIPO_NO_PERMITIDO' using errcode = 'P0001', detail = json_build_object('campo', 'tipo', 'tipo', v_tipo)::text;
  end if;
  if v_estado is null or v_estado not in ('borrador', 'confirmado') then
    raise exception 'ESTADO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'estado', 'estado', v_estado)::text;
  end if;
  if v_fecha is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'fecha')::text;
  end if;
  if length(v_glosa) < 3 then
    raise exception 'GLOSA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'glosa')::text;
  end if;

  -- Edición: lock del asiento y de su período viejo.
  if v_id is not null then
    select * into v_a from public.cont_asientos where id = v_id for update;
    if not found then
      raise exception 'ASIENTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', v_id)::text;
    end if;
    if v_a.estado = 'anulado' then
      raise exception 'ASIENTO_NO_EDITABLE' using errcode = 'P0001', detail = json_build_object('id', v_id, 'estado', v_a.estado)::text;
    end if;
    if v_a.revierte_id is not null then
      raise exception 'CONTRAASIENTO_NO_EDITABLE' using errcode = 'P0001', detail = json_build_object('id', v_id, 'revierte_id', v_a.revierte_id)::text;
    end if;
    if v_a.origen_tabla is not null then
      raise exception 'ASIENTO_AUTOMATICO' using errcode = 'P0001', detail = json_build_object('id', v_id, 'origen_tabla', v_a.origen_tabla)::text;
    end if;
    if v_a.revertido_por_id is not null then
      raise exception 'ASIENTO_YA_REVERTIDO' using errcode = 'P0001', detail = json_build_object('id', v_id, 'revertido_por_id', v_a.revertido_por_id)::text;
    end if;
    perform public._cont_lock_periodo_abierto(v_a.fecha);
  end if;

  -- Período nuevo.
  v_per := public._cont_lock_periodo_abierto(v_fecha);
  select * into v_eje from public.cont_ejercicios where id = v_per.ejercicio_id;

  if v_tipo = 'apertura' then
    if v_fecha <> v_eje.desde then
      raise exception 'APERTURA_FECHA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('campo', 'fecha', 'fecha', v_fecha, 'esperada', v_eje.desde)::text;
    end if;
    if exists (select 1 from public.cont_asientos x
                where x.ejercicio_id = v_eje.id and x.tipo = 'apertura' and x.estado <> 'anulado'
                  and x.id is distinct from v_id) then
      raise exception 'APERTURA_DUPLICADA' using errcode = 'P0001', detail = json_build_object('ejercicio_id', v_eje.id)::text;
    end if;
  end if;

  -- Líneas.
  v_lin := public._cont_validar_lineas(p_lineas, v_estado = 'confirmado');
  select coalesce(sum((e ->> 'debe')::numeric), 0), coalesce(sum((e ->> 'haber')::numeric), 0), count(*)
    into v_debe, v_haber, v_n
    from jsonb_array_elements(v_lin) e;
  if v_estado = 'confirmado' then
    if v_n < 2 then
      raise exception 'MENOS_DE_DOS_LINEAS' using errcode = 'P0001', detail = json_build_object('lineas', v_n)::text;
    end if;
    if v_debe <> v_haber then
      raise exception 'ASIENTO_DESBALANCEADO' using errcode = 'P0001',
        detail = json_build_object('asiento_id', v_id, 'debe', v_debe, 'haber', v_haber, 'diferencia', v_debe - v_haber)::text;
    end if;
    if v_debe = 0 then
      raise exception 'ASIENTO_TOTAL_CERO' using errcode = 'P0001', detail = json_build_object('asiento_id', v_id)::text;
    end if;
  end if;

  if v_id is null then
    insert into public.cont_asientos (fecha, tipo, estado, glosa, total, confirmado_por, confirmado_at, created_by, updated_by)
    values (v_fecha, v_tipo, v_estado, v_glosa, v_debe,
            case when v_estado = 'confirmado' then p_user_id end,
            case when v_estado = 'confirmado' then now() end,
            p_user_id, p_user_id)
    returning id into v_id;
  else
    delete from public.cont_asiento_lineas where asiento_id = v_id;
    update public.cont_asientos
       set fecha = v_fecha, tipo = v_tipo, estado = v_estado, glosa = v_glosa, total = v_debe,
           confirmado_por = case when v_estado = 'confirmado'
                                 then case when v_a.estado = 'confirmado' then v_a.confirmado_por else p_user_id end end,
           confirmado_at  = case when v_estado = 'confirmado'
                                 then case when v_a.estado = 'confirmado' then v_a.confirmado_at else now() end end,
           updated_by = p_user_id
     where id = v_id;
  end if;

  insert into public.cont_asiento_lineas (asiento_id, orden, cuenta_id, debe, haber,
                                          aux_cliente_id, aux_proveedor_id, aux_tesoreria_id, obra_cod, glosa)
  select v_id, n::smallint, (e ->> 'cuenta_id')::bigint, (e ->> 'debe')::numeric, (e ->> 'haber')::numeric,
         (e ->> 'aux_cliente_id')::bigint, (e ->> 'aux_proveedor_id')::bigint, (e ->> 'aux_tesoreria_id')::bigint,
         e ->> 'obra_cod', coalesce(e ->> 'glosa', '')
    from jsonb_array_elements(v_lin) with ordinality as t(e, n);

  return public._cont_asiento_json(v_id);
end $$;

-- ── 2) Borrar (solo borradores) ────────────────────────────────────────
create or replace function public.cont_borrar_asiento(p_id bigint, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a public.cont_asientos%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'asientos_manuales') then
    raise exception 'SIN_PERMISO_ASIENTOS' using errcode = 'P0001';
  end if;
  perform set_config('cadinc.cont_rpc', 'on', true);

  select * into v_a from public.cont_asientos where id = p_id for update;
  if not found then
    raise exception 'ASIENTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if v_a.estado <> 'borrador' then
    raise exception 'ASIENTO_NO_BORRABLE' using errcode = 'P0001', detail = json_build_object('id', p_id, 'estado', v_a.estado)::text;
  end if;
  perform public._cont_lock_periodo_abierto(v_a.fecha);

  delete from public.cont_asientos where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- ── 3) Anular (período abierto) o revertir (período cerrado) ───────────
create or replace function public.cont_anular_asiento(p_id bigint, p_motivo text, p_user_id uuid, p_fecha date default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_a      public.cont_asientos%rowtype;
  v_pest   text;
  v_fecha  date;
  v_nuevo  bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'asientos_manuales') then
    raise exception 'SIN_PERMISO_ASIENTOS' using errcode = 'P0001';
  end if;
  perform set_config('cadinc.cont_rpc', 'on', true);

  if length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into v_a from public.cont_asientos where id = p_id for update;
  if not found then
    raise exception 'ASIENTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if v_a.estado = 'borrador' then
    raise exception 'ASIENTO_ES_BORRADOR' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if v_a.estado = 'anulado' then
    raise exception 'ASIENTO_YA_ANULADO' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if v_a.revertido_por_id is not null then
    raise exception 'ASIENTO_YA_REVERTIDO' using errcode = 'P0001',
      detail = json_build_object('id', p_id, 'revertido_por_id', v_a.revertido_por_id)::text;
  end if;
  if v_a.origen_tabla is not null then
    raise exception 'ASIENTO_AUTOMATICO' using errcode = 'P0001',
      detail = json_build_object('id', p_id, 'origen_tabla', v_a.origen_tabla)::text;
  end if;

  select estado into v_pest from public.cont_periodos where id = v_a.periodo_id for share;

  if v_pest = 'abierto' then
    update public.cont_asientos
       set estado = 'anulado', motivo_anulacion = v_motivo, anulado_por = p_user_id, anulado_at = now(), updated_by = p_user_id
     where id = p_id;
    -- Anular un contraasiento "des-revierte" al original (el guard lo deja
    -- aunque el original esté en un período cerrado).
    if v_a.revierte_id is not null then
      update public.cont_asientos set revertido_por_id = null, updated_by = p_user_id
       where id = v_a.revierte_id and revertido_por_id = p_id;
    end if;
    return jsonb_build_object('accion', 'anulado', 'asiento', public._cont_asiento_json(p_id), 'contraasiento', null);
  end if;

  -- Período cerrado: contraasiento.
  v_fecha := coalesce(p_fecha, public.hoy_ar());
  if v_fecha < v_a.fecha then
    raise exception 'FECHA_ANTERIOR_AL_ORIGINAL' using errcode = 'P0001',
      detail = json_build_object('campo', 'fecha', 'fecha', v_fecha, 'fecha_original', v_a.fecha)::text;
  end if;
  perform public._cont_lock_periodo_abierto(v_fecha);

  insert into public.cont_asientos (fecha, tipo, estado, glosa, total, revierte_id,
                                    confirmado_por, confirmado_at, created_by, updated_by)
  values (v_fecha, 'ajuste', 'confirmado',
          'Reversión del asiento N° ' || coalesce(v_a.numero::text, 's/n') || ' del ' || to_char(v_a.fecha, 'DD/MM/YYYY') || ': ' || v_motivo,
          v_a.total, p_id, p_user_id, now(), p_user_id, p_user_id)
  returning id into v_nuevo;

  -- Copia con debe y haber invertidos. NO se exige que la cuenta siga activa.
  insert into public.cont_asiento_lineas (asiento_id, orden, cuenta_id, debe, haber,
                                          aux_cliente_id, aux_proveedor_id, aux_tesoreria_id, obra_cod, glosa)
  select v_nuevo, l.orden, l.cuenta_id, l.haber, l.debe,
         l.aux_cliente_id, l.aux_proveedor_id, l.aux_tesoreria_id, l.obra_cod, l.glosa
    from public.cont_asiento_lineas l
   where l.asiento_id = p_id
   order by l.orden, l.id;

  update public.cont_asientos set revertido_por_id = v_nuevo, updated_by = p_user_id where id = p_id;

  return jsonb_build_object('accion', 'contraasiento',
                            'asiento', public._cont_asiento_json(p_id),
                            'contraasiento', public._cont_asiento_json(v_nuevo));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_lock_periodo_abierto(date)',
    'cont_guardar_asiento(jsonb, jsonb, uuid)',
    'cont_borrar_asiento(bigint, uuid)',
    'cont_anular_asiento(bigint, text, uuid, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
