-- =====================================================================
-- 20260928q — Contabilidad: corrida de amortizaciones de bienes de uso
-- (2026-09-24)
--
-- Por qué: el asiento de amortización del mes (o del ejercicio) sale del
-- inventario de bienes (20260928p), no se carga a mano.
--
--   cont_amortizar(p_hasta, p_user_id)
--     · Frecuencia = cont_config.bu_frecuencia. Mensual: un tramo por período
--       desde automaticos_desde hasta el que contiene p_hasta (p_hasta no
--       puede pasar del fin del mes de hoy). Anual: p_hasta tiene que ser el
--       cierre de un ejercicio; un solo tramo.
--     · Por tramo [d1, d2] y por bien con vida útil (alta ≤ d2, sin baja o
--       con baja > d1): importe = teórico(d2) − (inicial + corridas vigentes
--       con hasta < d1). Negativo → 0 con aviso. Catch-up: un mes cerrado sin
--       corrida o un cambio de vida útil se ajustan en el próximo tramo.
--     · Asiento: fecha d2, tipo 'ajuste', origen cont_amortizacion_corridas /
--       'amortizacion' (el lote de automáticos no lo toma y la edición a mano
--       lo rechaza). Gasto (con la obra del bien) al debe, amortización
--       acumulada al haber, agrupado por cuenta/obra.
--     · Idempotente: corrida vigente única por `hasta` + hash (asiento +
--       detalle por bien). Mismo hash → sin_cambios; otro hash en período
--       abierto → se regenera en el lugar; período cerrado → solo informa
--       (desactualizado / periodo_cerrado).
--   cont_amortizacion_anular(p_corrida_id, p_motivo, p_user_id): período
--     abierto; corrida y asiento anulados.
--
-- Además: las pruebas con rollback de la tanda consumieron números de las
-- secuencias nuevas (las secuencias no vuelven atrás con el rollback). Como
-- las tablas siguen vacías, se reinician para que el primer movimiento sea
-- MF-000001 y el primer bien BU-0001.
--
-- Flag contabilidad.bienes_uso. Grants solo service_role.
-- =====================================================================

create or replace function public._cont_corrida_json(p_id bigint)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
           'id', k.id, 'desde', k.desde, 'hasta', k.hasta, 'frecuencia', k.frecuencia, 'estado', k.estado,
           'total', k.total, 'asiento_id', k.asiento_id, 'asiento_numero', a.numero,
           'bienes', (select count(*) from public.cont_amortizaciones x where x.corrida_id = k.id),
           'motivo_anulacion', k.motivo_anulacion, 'anulado_at', k.anulado_at,
           'created_at', k.created_at, 'updated_at', k.updated_at)
    from public.cont_amortizacion_corridas k
    left join public.cont_asientos a on a.id = k.asiento_id
   where k.id = p_id
$$;

create or replace function public.cont_amortizar(p_hasta date, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_frec    text := coalesce(public._cont_cfg('bu_frecuencia') #>> '{}', 'mensual');
  v_desde   date := public._cont_cfg_desde();
  v_tr      record;
  v_tramos  jsonb := '[]'::jsonb;
  v_total   numeric(14,2) := 0;
  k         public.cont_amortizacion_corridas%rowtype;
  b         public.cont_bienes_uso%rowtype;
  v_abierto boolean;
  v_teo     numeric;
  v_prev    numeric;
  v_imp     numeric(14,2);
  v_rows    jsonb;
  v_avisos  jsonb;
  r         jsonb;
  p         jsonb;
  g         text;
  v_hash    text;
  v_lin     jsonb;
  v_tot     numeric(14,2);
  v_aid     bigint;
  v_kid     bigint;
  v_acc     text;
  v_n       int := 0;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'bienes_uso') then
    raise exception 'SIN_PERMISO_BIENES' using errcode = 'P0001';
  end if;
  if p_hasta is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'hasta')::text;
  end if;
  if v_frec = 'mensual' then
    if p_hasta > (date_trunc('month', public.hoy_ar()::timestamp) + interval '1 month' - interval '1 day')::date then
      raise exception 'FECHA_FUTURA' using errcode = 'P0001',
        detail = json_build_object('campo', 'hasta', 'hasta', p_hasta, 'hoy', public.hoy_ar())::text;
    end if;
    if not exists (select 1 from public.cont_periodos p where p_hasta between p.desde and p.hasta) then
      raise exception 'FECHA_SIN_PERIODO' using errcode = 'P0001', detail = json_build_object('campo', 'hasta', 'fecha', p_hasta)::text;
    end if;
  elsif not exists (select 1 from public.cont_ejercicios e where e.hasta = p_hasta) then
    raise exception 'HASTA_INVALIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'hasta', 'hasta', p_hasta, 'frecuencia', v_frec)::text;
  end if;
  if not pg_try_advisory_xact_lock(hashtext('cont_amortizar')) then
    raise exception 'AMORTIZADOR_OCUPADO' using errcode = 'P0001';
  end if;
  perform set_config('cadinc.cont_rpc', 'on', true);

  for v_tr in
    select p.desde as d1, p.hasta as d2
      from public.cont_periodos p
     where v_frec = 'mensual' and p.hasta >= v_desde and p.desde <= p_hasta
    union all
    select e.desde, e.hasta
      from public.cont_ejercicios e
     where v_frec = 'anual' and e.hasta = p_hasta
     order by 1
  loop
    select * into k from public.cont_amortizacion_corridas where hasta = v_tr.d2 and estado = 'vigente' for update;
    v_abierto := public._cont_periodo_abierto(v_tr.d2);

    -- Detalle por bien.
    v_rows := '[]'::jsonb;
    v_avisos := '[]'::jsonb;
    for b in
      select * from public.cont_bienes_uso x
       where x.vida_util_anios is not null and x.fecha_alta <= v_tr.d2
         and (x.fecha_baja is null or x.fecha_baja > v_tr.d1)
       order by x.id
    loop
      v_teo  := public._cont_bu_teorico(b, v_tr.d2);
      v_prev := b.amort_acum_inicial + coalesce((
                  select sum(a.importe) from public.cont_amortizaciones a
                    join public.cont_amortizacion_corridas kk on kk.id = a.corrida_id and kk.estado = 'vigente'
                   where a.bien_id = b.id and kk.hasta < v_tr.d1), 0);
      v_imp := round(v_teo - v_prev, 2);
      if v_imp < 0 then
        v_avisos := v_avisos || jsonb_build_object('codigo', 'AMORTIZACION_NEGATIVA', 'bien_id', b.id, 'codigo_bien', b.codigo,
                                                   'importe', v_imp);
        v_imp := 0;
      end if;
      if v_imp > 0 then
        v_rows := v_rows || jsonb_build_object(
          'bien_id', b.id, 'importe', v_imp,
          'meses', public._cont_bu_meses(b, v_tr.d2) - public._cont_bu_meses(b, v_tr.d1 - 1),
          'acumulada', v_prev + v_imp, 'gasto', b.cuenta_gasto_id, 'amort', b.cuenta_amort_id, 'obra', b.obra_cod);
      end if;
    end loop;

    g := 'Amortizaciones de bienes de uso ' || case when v_frec = 'anual' then 'del ejercicio ' || to_char(v_tr.d1, 'YYYY') || '/' || to_char(v_tr.d2, 'YYYY')
                                                    else public._cont_mes_txt(v_tr.d1) end;
    p := public._cont_prop_nueva('cont_amortizacion_corridas', coalesce(k.id, 0), true, v_tr.d2, g);
    for r in select x from jsonb_array_elements(v_rows) x loop
      p := public._cont_prop_linea(p, null, null, true, (r ->> 'importe')::numeric, null, null, r ->> 'obra', g, (r ->> 'gasto')::bigint);
      p := public._cont_prop_linea(p, null, null, false, (r ->> 'importe')::numeric, null, null, null, g, (r ->> 'amort')::bigint);
    end loop;
    p := public._cont_prop_cerrar(p);
    if jsonb_array_length(p -> 'motivos') > 0 then
      raise exception 'BU_CUENTA_INVALIDA' using errcode = 'P0001',
        detail = json_build_object('hasta', v_tr.d2, 'motivos', p -> 'motivos')::text;
    end if;
    v_hash := md5(public._cont_hash(p) || coalesce((select string_agg((x ->> 'bien_id') || ':' || (x ->> 'importe'), ',' order by (x ->> 'bien_id')::bigint)
                                                    from jsonb_array_elements(v_rows) x), ''));
    select coalesce(sum((x ->> 'importe')::numeric), 0) into v_tot from jsonb_array_elements(v_rows) x;

    v_kid := k.id;
    v_aid := k.asiento_id;
    if not v_abierto then
      v_acc := case when k.id is null then 'periodo_cerrado'
                    when k.hash = v_hash then 'sin_cambios' else 'desactualizado' end;
    elsif k.id is not null and k.hash = v_hash then
      v_acc := 'sin_cambios';
    elsif jsonb_array_length(v_rows) = 0 then
      if k.id is not null then
        -- Ya no hay nada que amortizar en este tramo: la corrida vieja se anula.
        update public.cont_asientos
           set estado = 'anulado', motivo_anulacion = 'Amortización recalculada: sin importes en el tramo',
               anulado_por = p_user_id, anulado_at = now(), updated_by = p_user_id
         where id = k.asiento_id and estado <> 'anulado';
        update public.cont_amortizacion_corridas
           set estado = 'anulada', motivo_anulacion = 'Recalculada: sin importes en el tramo', anulado_por = p_user_id,
               anulado_at = now(), updated_by = p_user_id
         where id = k.id;
      end if;
      v_acc := 'sin_bienes';
      v_kid := null;
      v_aid := null;
    else
      v_lin := public._cont_validar_lineas(public._cont_lineas_de_prop(p), true);
      if k.id is not null then
        delete from public.cont_asiento_lineas where asiento_id = k.asiento_id;
        update public.cont_asientos
           set fecha = v_tr.d2, glosa = left(g, 500), total = (p ->> 'importe')::numeric, origen_hash = v_hash, updated_by = p_user_id
         where id = k.asiento_id;
        perform public._cont_insertar_lineas(k.asiento_id, v_lin);
        delete from public.cont_amortizaciones where corrida_id = k.id;
        update public.cont_amortizacion_corridas
           set total = v_tot, hash = v_hash, updated_by = p_user_id
         where id = k.id;
        v_acc := 'regenerado';
      else
        insert into public.cont_amortizacion_corridas (desde, hasta, frecuencia, total, hash, created_by, updated_by)
        values (v_tr.d1, v_tr.d2, v_frec, v_tot, v_hash, p_user_id, p_user_id)
        returning id into v_kid;
        insert into public.cont_asientos (fecha, tipo, estado, glosa, total, origen_tabla, origen_id, origen_evento, origen_hash,
                                          confirmado_por, confirmado_at, created_by, updated_by)
        values (v_tr.d2, 'ajuste', 'confirmado', left(g, 500), (p ->> 'importe')::numeric,
                'cont_amortizacion_corridas', v_kid, 'amortizacion', v_hash, p_user_id, now(), p_user_id, p_user_id)
        returning id into v_aid;
        perform public._cont_insertar_lineas(v_aid, v_lin);
        update public.cont_amortizacion_corridas set asiento_id = v_aid where id = v_kid;
        v_acc := 'creado';
      end if;
      insert into public.cont_amortizaciones (corrida_id, bien_id, hasta, meses, importe, acumulada_al_cierre)
      select v_kid, (x ->> 'bien_id')::bigint, v_tr.d2, (x ->> 'meses')::numeric, (x ->> 'importe')::numeric, (x ->> 'acumulada')::numeric
        from jsonb_array_elements(v_rows) x;
      set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas immediate;
      set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas deferred;
    end if;

    if v_acc in ('creado', 'regenerado', 'sin_cambios') then
      v_total := v_total + coalesce((select total from public.cont_amortizacion_corridas where id = v_kid), 0);
    end if;
    v_n := v_n + 1;
    v_tramos := v_tramos || jsonb_build_object(
      'desde', v_tr.d1, 'hasta', v_tr.d2, 'accion', v_acc, 'corrida_id', v_kid, 'asiento_id', v_aid,
      'total', case when v_acc in ('creado', 'regenerado') then v_tot
                    else coalesce((select total from public.cont_amortizacion_corridas where id = v_kid), 0) end,
      'bienes', case when v_acc in ('creado', 'regenerado') then jsonb_array_length(v_rows)
                     else coalesce((select count(*) from public.cont_amortizaciones where corrida_id = v_kid), 0) end,
      'avisos', v_avisos);
  end loop;

  return jsonb_build_object('frecuencia', v_frec, 'tramos', v_tramos, 'total', v_total);
end $$;

comment on function public.cont_amortizar(date, uuid) is
  'Genera / regenera las corridas de amortización hasta p_hasta (mensual: por período; anual: el ejercicio). Idempotente por hash. Flag contabilidad.bienes_uso. 20260928q.';

create or replace function public.cont_amortizacion_anular(p_corrida_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  k public.cont_amortizacion_corridas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'bienes_uso') then
    raise exception 'SIN_PERMISO_BIENES' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into k from public.cont_amortizacion_corridas where id = p_corrida_id for update;
  if not found then
    raise exception 'CORRIDA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_corrida_id)::text;
  end if;
  if k.estado = 'anulada' then
    raise exception 'CORRIDA_YA_ANULADA' using errcode = 'P0001', detail = json_build_object('id', p_corrida_id)::text;
  end if;
  perform public._cont_lock_periodo_abierto(k.hasta);
  if not pg_try_advisory_xact_lock(hashtext('cont_amortizar')) then
    raise exception 'AMORTIZADOR_OCUPADO' using errcode = 'P0001';
  end if;

  perform set_config('cadinc.cont_rpc', 'on', true);
  if k.asiento_id is not null then
    update public.cont_asientos
       set estado = 'anulado', motivo_anulacion = left('Amortización anulada: ' || btrim(p_motivo), 500),
           anulado_por = p_user_id, anulado_at = now(), updated_by = p_user_id
     where id = k.asiento_id and estado <> 'anulado';
  end if;
  update public.cont_amortizacion_corridas
     set estado = 'anulada', motivo_anulacion = left(btrim(p_motivo), 500), anulado_por = p_user_id, anulado_at = now(),
         updated_by = p_user_id
   where id = k.id;
  return public._cont_corrida_json(k.id);
end $$;

-- Secuencias consumidas por las pruebas con rollback (tablas vacías).
select setval('public.tesoreria_movimientos_numero_seq', 1, false)
 where not exists (select 1 from public.tesoreria_movimientos);
select setval('public.cont_bienes_uso_codigo_seq', 1, false)
 where not exists (select 1 from public.cont_bienes_uso);

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_corrida_json(bigint)',
    'cont_amortizar(date, uuid)',
    'cont_amortizacion_anular(bigint, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
