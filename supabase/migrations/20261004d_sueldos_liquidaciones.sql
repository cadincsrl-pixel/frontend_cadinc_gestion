-- =====================================================================
-- 20261004d — Sueldos: liquidaciones, recibos y asiento (2026-09-26)
--
-- Por qué: el backend calcula las líneas del recibo (TS puro); la base
-- persiste, valida las sumas y lleva el ciclo borrador → cerrada → (reabrir
-- | anular), con el asiento contable al cerrar.
--
--   · sueldos_crear_liquidacion: numera LIQ-0001 (secuencia). Quincena solo
--     en convenios quincenales, mensual solo en mensuales; una vigente por
--     convenio/tipo/período(/quincena) para quincena y mensual.
--   · sueldos_guardar_recibo: reemplaza las líneas del recibo del legajo en
--     una liquidación BORRADOR; los totales los calcula la base desde las
--     líneas y, si el backend manda los suyos, tienen que coincidir ±0,01
--     (neto = remunerativo + no remunerativo − descuentos).
--   · sueldos_cerrar_liquidacion: cierra liquidación y recibos y arma el
--     asiento con los mapeos sueldos.* (20261004b). Si falta un mapeo, el
--     período está cerrado o el asiento no cuadra, la liquidación CIERRA
--     IGUAL y quedan los avisos (SIN_MAPEO…) en `avisos`; después se
--     reintenta con sueldos_contabilizar_liquidacion.
--   · El asiento: tipo 'ajuste', origen_tabla 'sueldos_liquidaciones',
--     origen_evento 'liquidacion' — el lote de automáticos (cont_contabilizar
--     / cont_pendientes) solo mira origen_evento 'registro', así que NO lo
--     toma (si lo tomara, _cont_propuesta tiraría ORIGEN_INVALIDO); y
--     cont_anular_asiento lo rechaza por tener origen (ASIENTO_AUTOMATICO):
--     se anula solo desde Sueldos. Mismo patrón que el IVA mensual y las
--     amortizaciones. Fecha = fin del período devengado (día 15 para la 1ª
--     quincena, fin de mes para lo demás). Las líneas de gasto van a la obra
--     habitual del legajo (obra_cod_habitual).
--   · Reabrir: solo si el asiento está en un período abierto (se anula).
--     Anular: período abierto → se anula el asiento; cerrado → contraasiento
--     en el primer día abierto.
--
-- Permisos (permisos.sueldos, default false): `liquidar` (crear
-- liquidación, guardar/borrar recibos), `cerrar_liquidaciones` (cerrar,
-- reabrir, anular, contabilizar).
-- =====================================================================

-- ── 1) JSON de lectura ───────────────────────────────────────────────
create or replace function public.sueldos_recibo_json(p_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(r)
         || jsonb_build_object(
              'legajo', jsonb_build_object('id', l.id, 'leg', l.leg, 'chofer_id', l.chofer_id,
                                           'nombre', l.nombre_mostrar, 'categoria_id', l.categoria_id,
                                           'categoria_nombre', l.categoria_nombre, 'incompleto', l.incompleto,
                                           'faltantes', to_jsonb(l.faltantes)),
              'lineas', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden, x.id)
                                    from public.sueldos_recibo_lineas x where x.recibo_id = r.id), '[]'::jsonb))
    from public.sueldos_recibos r
    join public.v_sueldos_legajos l on l.id = r.legajo_id
   where r.id = p_id
$$;

create or replace function public.sueldos_liquidacion_json(p_id bigint, p_con_lineas boolean default false)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(q)
         || jsonb_build_object(
              'convenio', jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nombre', c.nombre,
                                             'periodicidad', c.periodicidad, 'unidad_basico', c.unidad_basico),
              'asiento', (select jsonb_build_object('id', a.id, 'numero', a.numero, 'estado', a.estado, 'fecha', a.fecha,
                                                    'total', a.total, 'revertido_por_id', a.revertido_por_id)
                            from public.cont_asientos a where a.id = q.asiento_id),
              'totales', (select jsonb_build_object(
                                   'recibos', count(*),
                                   'remunerativo', coalesce(sum(r.total_remunerativo), 0),
                                   'no_remunerativo', coalesce(sum(r.total_no_remunerativo), 0),
                                   'descuentos', coalesce(sum(r.total_descuentos), 0),
                                   'neto', coalesce(sum(r.neto), 0),
                                   'contribuciones', coalesce(sum(r.total_contribuciones), 0),
                                   'fondo_cese', coalesce(sum(r.fondo_cese), 0))
                            from public.sueldos_recibos r where r.liquidacion_id = q.id),
              'recibos', coalesce((
                select jsonb_agg(case when p_con_lineas then public.sueldos_recibo_json(r.id)
                                      else to_jsonb(r) - 'snapshot' - 'entradas'
                                           || jsonb_build_object('legajo', jsonb_build_object(
                                                'id', l.id, 'leg', l.leg, 'chofer_id', l.chofer_id, 'nombre', l.nombre_mostrar,
                                                'categoria_nombre', l.categoria_nombre, 'incompleto', l.incompleto)) end
                                 order by l.nombre_mostrar, r.id)
                  from public.sueldos_recibos r join public.v_sueldos_legajos l on l.id = r.legajo_id
                 where r.liquidacion_id = q.id), '[]'::jsonb))
    from public.sueldos_liquidaciones q
    join public.sueldos_convenios c on c.id = q.convenio_id
   where q.id = p_id
$$;

-- ── 2) Crear / editar liquidación ─────────────────────────────────────
create or replace function public.sueldos_crear_liquidacion(p_liq jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_conv  public.sueldos_convenios%rowtype;
  v_tipo  text := lower(btrim(coalesce(p_liq ->> 'tipo', '')));
  v_per   date;
  v_q     smallint;
  v_pago  date;
  v_otro  public.sueldos_liquidaciones%rowtype;
  v_id    bigint;
begin
  perform public._sueldos_requiere(p_user_id, 'liquidar');
  select * into v_conv from public.sueldos_convenios where id = public._sueldos_convenio_id(p_liq);
  if not found or not v_conv.activo then
    perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id'));
  end if;
  if v_tipo not in ('quincena', 'mensual', 'sac', 'vacaciones', 'final', 'ajuste') then
    perform public._sueldos_error('TIPO_INVALIDO', jsonb_build_object('campo', 'tipo'));
  end if;
  begin
    v_per  := date_trunc('month', (p_liq ->> 'periodo')::date)::date;
    v_q    := nullif(p_liq ->> 'quincena', '')::smallint;
    v_pago := nullif(p_liq ->> 'fecha_pago', '')::date;
  exception when others then
    perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
  end;
  if v_per is null then perform public._sueldos_error('PERIODO_REQUERIDO', jsonb_build_object('campo', 'periodo')); end if;
  if v_tipo = 'quincena' and (v_q is null or v_q not in (1, 2)) then
    perform public._sueldos_error('QUINCENA_INVALIDA', jsonb_build_object('campo', 'quincena'));
  end if;
  if v_tipo <> 'quincena' then v_q := null; end if;
  if (v_tipo = 'quincena' and v_conv.periodicidad <> 'quincenal') or (v_tipo = 'mensual' and v_conv.periodicidad <> 'mensual') then
    perform public._sueldos_error('TIPO_NO_CORRESPONDE_CONVENIO',
      jsonb_build_object('campo', 'tipo', 'tipo', v_tipo, 'periodicidad', v_conv.periodicidad));
  end if;
  if v_tipo in ('quincena', 'mensual') then
    select * into v_otro from public.sueldos_liquidaciones
     where convenio_id = v_conv.id and tipo = v_tipo and periodo = v_per and coalesce(quincena, 0) = coalesce(v_q, 0)
       and estado <> 'anulada';
    if found then
      perform public._sueldos_error('LIQUIDACION_DUPLICADA',
        jsonb_build_object('liquidacion_id', v_otro.id, 'codigo', v_otro.codigo, 'estado', v_otro.estado));
    end if;
  end if;

  insert into public.sueldos_liquidaciones (convenio_id, tipo, periodo, quincena, fecha_pago, obs, created_by, updated_by)
  values (v_conv.id, v_tipo, v_per, v_q, v_pago, coalesce(btrim(p_liq ->> 'obs'), ''), p_user_id, p_user_id)
  returning id into v_id;
  return public.sueldos_liquidacion_json(v_id);
end $$;

create or replace function public.sueldos_editar_liquidacion(p_id bigint, p_cambios jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q public.sueldos_liquidaciones%rowtype;
  v_pago date;
begin
  perform public._sueldos_requiere(p_user_id, 'liquidar');
  select * into q from public.sueldos_liquidaciones where id = p_id for update;
  if not found then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  if q.estado = 'anulada' then perform public._sueldos_error('LIQUIDACION_ANULADA', jsonb_build_object('id', p_id)); end if;
  if p_cambios ? 'fecha_pago' then
    if q.estado <> 'borrador' then
      perform public._sueldos_error('LIQUIDACION_NO_BORRADOR', jsonb_build_object('id', p_id, 'estado', q.estado));
    end if;
    begin
      v_pago := nullif(p_cambios ->> 'fecha_pago', '')::date;
    exception when others then
      perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('campo', 'fecha_pago'));
    end;
    update public.sueldos_liquidaciones set fecha_pago = v_pago, updated_by = p_user_id where id = p_id;
  end if;
  if p_cambios ? 'obs' then
    update public.sueldos_liquidaciones set obs = coalesce(btrim(p_cambios ->> 'obs'), ''), updated_by = p_user_id where id = p_id;
  end if;
  return public.sueldos_liquidacion_json(p_id);
end $$;

-- ── 3) Recibos ───────────────────────────────────────────────────────
create or replace function public.sueldos_guardar_recibo(
  p_liquidacion_id bigint, p_legajo_id bigint, p_recibo jsonb, p_lineas jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q      public.sueldos_liquidaciones%rowtype;
  l      public.sueldos_legajos%rowtype;
  k      public.sueldos_conceptos%rowtype;
  e      jsonb;
  i      int;
  v_rec  jsonb := coalesce(p_recibo, '{}'::jsonb);
  v_lin  jsonb := '[]'::jsonb;
  v_tipo text;
  v_dest text;
  v_imp  numeric;
  v_rem  numeric := 0;
  v_nor  numeric := 0;
  v_des  numeric := 0;
  v_con  numeric := 0;
  v_fc   numeric := 0;
  v_neto numeric;
  v_snap jsonb;
  v_id   bigint;
  v_env  numeric;
  v_k    text;
begin
  perform public._sueldos_requiere(p_user_id, 'liquidar');
  select * into q from public.sueldos_liquidaciones where id = p_liquidacion_id for update;
  if not found then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_liquidacion_id)); end if;
  if q.estado <> 'borrador' then
    perform public._sueldos_error('LIQUIDACION_NO_BORRADOR', jsonb_build_object('id', q.id, 'estado', q.estado));
  end if;
  select * into l from public.sueldos_legajos where id = p_legajo_id;
  if not found then perform public._sueldos_error('LEGAJO_NO_EXISTE', jsonb_build_object('id', p_legajo_id)); end if;
  if l.convenio_id <> q.convenio_id then
    perform public._sueldos_error('LEGAJO_OTRO_CONVENIO', jsonb_build_object('legajo_id', l.id, 'convenio_id', l.convenio_id));
  end if;
  if jsonb_typeof(v_rec) <> 'object' then perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('campo', 'recibo')); end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    perform public._sueldos_error('LINEAS_INVALIDAS', jsonb_build_object('campo', 'lineas'));
  end if;
  if jsonb_array_length(p_lineas) > 200 then
    perform public._sueldos_error('DEMASIADAS_LINEAS', jsonb_build_object('max', 200));
  end if;

  -- Normalizar y validar cada línea.
  for e, i in select x, (n - 1)::int from jsonb_array_elements(p_lineas) with ordinality as t(x, n) loop
    k := null;
    if nullif(e ->> 'concepto_id', '') is not null then
      select * into k from public.sueldos_conceptos where id = (e ->> 'concepto_id')::bigint;
      if not found then
        perform public._sueldos_error('CONCEPTO_NO_EXISTE', jsonb_build_object('indice', i, 'concepto_id', e -> 'concepto_id'));
      end if;
      if k.convenio_id is not null and k.convenio_id <> q.convenio_id then
        perform public._sueldos_error('CONCEPTO_OTRO_CONVENIO', jsonb_build_object('indice', i, 'concepto_id', k.id));
      end if;
    end if;
    v_tipo := coalesce(nullif(e ->> 'tipo', ''), k.tipo);
    if v_tipo is null or v_tipo not in ('remunerativo', 'no_remunerativo', 'descuento', 'contribucion') then
      perform public._sueldos_error('LINEA_TIPO_INVALIDO', jsonb_build_object('indice', i, 'campo', 'tipo'));
    end if;
    if k.id is not null and k.tipo <> v_tipo then
      perform public._sueldos_error('LINEA_TIPO_NO_COINCIDE', jsonb_build_object('indice', i, 'tipo', v_tipo, 'tipo_concepto', k.tipo));
    end if;
    if length(btrim(coalesce(e ->> 'nombre', k.nombre, ''))) < 1 then
      perform public._sueldos_error('LINEA_NOMBRE_REQUERIDO', jsonb_build_object('indice', i, 'campo', 'nombre'));
    end if;
    begin
      v_imp := round((e ->> 'importe')::numeric, 2);
    exception when others then v_imp := null;
    end;
    if v_imp is null or abs(v_imp) >= 1e12 then
      perform public._sueldos_error('LINEA_IMPORTE_INVALIDO', jsonb_build_object('indice', i, 'campo', 'importe'));
    end if;
    if v_tipo in ('descuento', 'contribucion') then
      v_dest := coalesce(nullif(e ->> 'destino', ''), k.destino, 'otros');
      if v_dest not in ('f931', 'sindicato', 'fondo_cese', 'prestamo', 'otros') then
        perform public._sueldos_error('LINEA_DESTINO_INVALIDO', jsonb_build_object('indice', i, 'campo', 'destino'));
      end if;
    else
      v_dest := null;
    end if;
    if coalesce(nullif(e ->> 'codigo_arca', ''), k.codigo_arca) !~ '^[0-9]{6}$' then
      perform public._sueldos_error('LINEA_CODIGO_ARCA_INVALIDO', jsonb_build_object('indice', i, 'campo', 'codigo_arca'));
    end if;
    if nullif(e ->> 'unidad', '') is not null and e ->> 'unidad' not in ('horas', 'dias', 'km', '%', '$', 'anios', 'unidades') then
      perform public._sueldos_error('LINEA_UNIDAD_INVALIDA', jsonb_build_object('indice', i, 'campo', 'unidad'));
    end if;

    case v_tipo
      when 'remunerativo'    then v_rem := v_rem + v_imp;
      when 'no_remunerativo' then v_nor := v_nor + v_imp;
      when 'descuento'       then v_des := v_des + v_imp;
      else
        if v_dest = 'fondo_cese' then v_fc := v_fc + v_imp; else v_con := v_con + v_imp; end if;
    end case;

    v_lin := v_lin || jsonb_build_object(
      'concepto_id', k.id,
      'codigo_arca', coalesce(nullif(e ->> 'codigo_arca', ''), k.codigo_arca),
      'nombre', left(btrim(coalesce(nullif(e ->> 'nombre', ''), k.nombre)), 200),
      'tipo', v_tipo, 'destino', v_dest,
      'grupo_contribucion', case when v_tipo = 'contribucion' then coalesce(nullif(e ->> 'grupo_contribucion', ''), k.grupo_contribucion) end,
      'cantidad', e -> 'cantidad', 'unidad', nullif(e ->> 'unidad', ''), 'base', e -> 'base', 'porcentaje', e -> 'porcentaje',
      'importe', v_imp,
      'manual', coalesce((e ->> 'manual')::boolean, k.id is null),
      'en_recibo', coalesce((e ->> 'en_recibo')::boolean, k.en_recibo, true),
      'orden', coalesce(nullif(e ->> 'orden', '')::int, i));
  end loop;

  v_neto := v_rem + v_nor - v_des;
  -- Totales que manda el backend: tienen que coincidir.
  foreach v_k in array array['total_remunerativo', 'total_no_remunerativo', 'total_descuentos', 'total_contribuciones',
                             'fondo_cese', 'neto'] loop
    if nullif(v_rec ->> v_k, '') is not null then
      begin
        v_env := (v_rec ->> v_k)::numeric;
      exception when others then
        perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('campo', v_k));
      end;
      if abs(v_env - case v_k when 'total_remunerativo' then v_rem when 'total_no_remunerativo' then v_nor
                              when 'total_descuentos' then v_des when 'total_contribuciones' then v_con
                              when 'fondo_cese' then v_fc else v_neto end) > 0.01 then
        perform public._sueldos_error(case when v_k = 'neto' then 'NETO_NO_CUADRA' else 'TOTALES_NO_CUADRAN' end,
          jsonb_build_object('campo', v_k, 'enviado', v_env,
            'calculado', case v_k when 'total_remunerativo' then v_rem when 'total_no_remunerativo' then v_nor
                                  when 'total_descuentos' then v_des when 'total_contribuciones' then v_con
                                  when 'fondo_cese' then v_fc else v_neto end));
      end if;
    end if;
  end loop;

  -- Snapshot: lo que mande el backend, o el legajo/categoría/escala de hoy.
  v_snap := case when jsonb_typeof(v_rec -> 'snapshot') = 'object' and v_rec -> 'snapshot' <> '{}'::jsonb then v_rec -> 'snapshot'
                 else (select jsonb_build_object(
                         'legajo', to_jsonb(vl) - 'created_at' - 'updated_at' - 'created_by' - 'updated_by',
                         'escala', public.sueldos_valor_escala(vl.categoria_id, vl.zona,
                                     case when q.tipo = 'quincena' and q.quincena = 1 then q.periodo + 14
                                          else (q.periodo + interval '1 month - 1 day')::date end))
                         from public.v_sueldos_legajos vl where vl.id = l.id) end;

  begin
    insert into public.sueldos_recibos (liquidacion_id, legajo_id, snapshot, entradas, dias_trabajados, horas_trabajadas,
      total_remunerativo, total_no_remunerativo, total_descuentos, neto, total_contribuciones, fondo_cese, obs,
      created_by, updated_by)
    values (q.id, l.id, v_snap, coalesce(case when jsonb_typeof(v_rec -> 'entradas') = 'object' then v_rec -> 'entradas' end, '{}'::jsonb),
      nullif(v_rec ->> 'dias_trabajados', '')::numeric, nullif(v_rec ->> 'horas_trabajadas', '')::numeric,
      v_rem, v_nor, v_des, v_neto, v_con, v_fc, coalesce(btrim(v_rec ->> 'obs'), ''), p_user_id, p_user_id)
    on conflict (liquidacion_id, legajo_id) do update
      set snapshot = excluded.snapshot, entradas = excluded.entradas, dias_trabajados = excluded.dias_trabajados,
          horas_trabajadas = excluded.horas_trabajadas, total_remunerativo = excluded.total_remunerativo,
          total_no_remunerativo = excluded.total_no_remunerativo, total_descuentos = excluded.total_descuentos,
          neto = excluded.neto, total_contribuciones = excluded.total_contribuciones, fondo_cese = excluded.fondo_cese,
          obs = excluded.obs, estado = 'borrador', updated_by = p_user_id
    returning id into v_id;
  exception when invalid_text_representation or numeric_value_out_of_range then
    perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
  end;

  delete from public.sueldos_recibo_lineas where recibo_id = v_id;
  begin
    insert into public.sueldos_recibo_lineas (recibo_id, concepto_id, codigo_arca, nombre, tipo, destino, grupo_contribucion,
      cantidad, unidad, base, porcentaje, importe, manual, en_recibo, orden)
    select v_id, (x ->> 'concepto_id')::bigint, x ->> 'codigo_arca', x ->> 'nombre', x ->> 'tipo', x ->> 'destino',
           x ->> 'grupo_contribucion', nullif(x ->> 'cantidad', '')::numeric, x ->> 'unidad',
           round(nullif(x ->> 'base', '')::numeric, 2), nullif(x ->> 'porcentaje', '')::numeric,
           (x ->> 'importe')::numeric, (x ->> 'manual')::boolean, (x ->> 'en_recibo')::boolean, (x ->> 'orden')::smallint
      from jsonb_array_elements(v_lin) x;
  exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
    perform public._sueldos_error('LINEAS_INVALIDAS', jsonb_build_object('mensaje', sqlerrm));
  end;

  update public.sueldos_liquidaciones set updated_by = p_user_id where id = q.id;
  return public.sueldos_recibo_json(v_id);
end $$;
comment on function public.sueldos_guardar_recibo(bigint, bigint, jsonb, jsonb, uuid) is
  'Crea o reemplaza el recibo del legajo en una liquidación borrador. Totales calculados desde las líneas; los del backend se validan ±0,01. Ver shape en el resumen de 20261004d.';

create or replace function public.sueldos_borrar_recibo(p_liquidacion_id bigint, p_legajo_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.sueldos_liquidaciones%rowtype;
begin
  perform public._sueldos_requiere(p_user_id, 'liquidar');
  select * into q from public.sueldos_liquidaciones where id = p_liquidacion_id for update;
  if not found then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_liquidacion_id)); end if;
  if q.estado <> 'borrador' then
    perform public._sueldos_error('LIQUIDACION_NO_BORRADOR', jsonb_build_object('id', q.id, 'estado', q.estado));
  end if;
  delete from public.sueldos_recibos where liquidacion_id = q.id and legajo_id = p_legajo_id;
  if not found then
    perform public._sueldos_error('RECIBO_NO_EXISTE', jsonb_build_object('liquidacion_id', q.id, 'legajo_id', p_legajo_id));
  end if;
  return public.sueldos_liquidacion_json(q.id);
end $$;

-- ── 4) Asiento ───────────────────────────────────────────────────────
create or replace function public._sueldos_fecha_asiento(q public.sueldos_liquidaciones)
returns date language sql immutable set search_path = public, pg_temp as $$
  select case when q.tipo = 'quincena' and q.quincena = 1 then q.periodo + 14
              else (q.periodo + interval '1 month - 1 day')::date end
$$;

create or replace function public._sueldos_prop_liquidacion(p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  q      public.sueldos_liquidaciones%rowtype;
  v_conv text;
  v_subs text[];
  g      text;
  p      jsonb;
  x      record;
begin
  select * into q from public.sueldos_liquidaciones where id = p_id;
  if not found then return null; end if;
  select codigo into v_conv from public.sueldos_convenios where id = q.convenio_id;
  v_subs := array[v_conv, ''];
  g := q.codigo || ' — Sueldos ' || upper(v_conv) || ' · '
       || case q.tipo when 'quincena' then q.quincena || 'ª quincena ' when 'mensual' then 'mes '
                      when 'sac' then 'SAC ' when 'vacaciones' then 'vacaciones ' when 'final' then 'liquidación final '
                      else 'ajuste ' end
       || to_char(q.periodo, 'MM/YYYY');
  p := public._cont_prop_nueva('sueldos_liquidaciones', q.id, q.estado <> 'anulada', public._sueldos_fecha_asiento(q), g);

  -- Debe: gasto por tipo, por obra habitual del legajo.
  for x in
    select case when li.tipo = 'remunerativo' then 'sueldos.remunerativo'
                when li.tipo = 'no_remunerativo' then 'sueldos.no_remunerativo'
                when li.destino = 'fondo_cese' then 'sueldos.fondo_cese'
                else 'sueldos.contribuciones' end as clave,
           l.obra_cod_habitual as obra, sum(li.importe) as imp
      from public.sueldos_recibos r
      join public.sueldos_legajos l on l.id = r.legajo_id
      join public.sueldos_recibo_lineas li on li.recibo_id = r.id
     where r.liquidacion_id = q.id and r.estado <> 'anulado' and li.tipo in ('remunerativo', 'no_remunerativo', 'contribucion')
     group by 1, 2
     order by 1, 2 nulls first
  loop
    p := public._cont_prop_linea(p, x.clave, v_subs, true, x.imp, null, null, x.obra, g);
  end loop;

  -- Haber: neto a pagar.
  p := public._cont_prop_linea(p, 'sueldos.a_pagar', v_subs, false,
         (select coalesce(sum(r.neto), 0) from public.sueldos_recibos r where r.liquidacion_id = q.id and r.estado <> 'anulado'),
         null, null, null, g);

  -- Haber: descuentos y contribuciones por destino.
  for x in
    select case li.destino when 'f931' then 'sueldos.aportes_a_pagar' when 'sindicato' then 'sueldos.sindicato_a_pagar'
                           when 'fondo_cese' then 'sueldos.fondo_cese_a_pagar' when 'prestamo' then 'sueldos.prestamos'
                           else 'sueldos.otros_a_pagar' end as clave,
           sum(li.importe) as imp
      from public.sueldos_recibos r
      join public.sueldos_recibo_lineas li on li.recibo_id = r.id
     where r.liquidacion_id = q.id and r.estado <> 'anulado' and li.tipo in ('descuento', 'contribucion')
     group by 1 order by 1
  loop
    p := public._cont_prop_linea(p, x.clave, v_subs, false, x.imp, null, null, null, g);
  end loop;

  return public._cont_prop_cerrar(p);
end $$;

create or replace function public.sueldos_asiento_propuesta(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p jsonb;
begin
  p := public._sueldos_prop_liquidacion(p_id);
  if p is null then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  return p || jsonb_build_object('lineas', coalesce((
    select jsonb_agg(e || jsonb_build_object('cuenta_codigo', c.codigo, 'cuenta_nombre', c.nombre) order by n)
      from jsonb_array_elements(p -> 'lineas') with ordinality as t(e, n)
      left join public.cont_cuentas c on c.id = (e ->> 'cuenta_id')::bigint), '[]'::jsonb),
    'periodo_abierto', public._cont_periodo_abierto((p ->> 'fecha')::date));
end $$;
comment on function public.sueldos_asiento_propuesta(bigint) is
  'Vista previa del asiento de la liquidación (sin escribir): {fecha, glosa, importe, lineas[{cuenta_id, cuenta_codigo, cuenta_nombre, debe, haber, obra_cod, glosa}], motivos[{codigo, detalle}], periodo_abierto}.';

-- Intenta crear el asiento. Nunca tira error: devuelve {asiento_id, avisos}.
create or replace function public._sueldos_generar_asiento(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  p      jsonb := public._sueldos_prop_liquidacion(p_id);
  v_f    date := (p ->> 'fecha')::date;
  v_lin  jsonb;
  v_tot  numeric(14,2);
  v_aid  bigint;
begin
  if jsonb_array_length(coalesce(p -> 'motivos', '[]'::jsonb)) > 0 then
    return jsonb_build_object('asiento_id', null, 'avisos', p -> 'motivos');
  end if;
  if jsonb_array_length(coalesce(p -> 'lineas', '[]'::jsonb)) = 0 then
    return jsonb_build_object('asiento_id', null,
      'avisos', jsonb_build_array(jsonb_build_object('codigo', 'SIN_IMPORTES', 'detalle', null)));
  end if;
  if not public._cont_periodo_abierto(v_f) then
    return jsonb_build_object('asiento_id', null,
      'avisos', jsonb_build_array(jsonb_build_object('codigo', 'PERIODO_CERRADO', 'detalle', jsonb_build_object('fecha', v_f))));
  end if;
  begin
    perform set_config('cadinc.cont_rpc', 'on', true);
    v_lin := public._cont_validar_lineas(public._cont_lineas_de_prop(p), true);
    select coalesce(sum((e ->> 'debe')::numeric), 0) into v_tot from jsonb_array_elements(v_lin) e;
    insert into public.cont_asientos (fecha, tipo, estado, glosa, total, origen_tabla, origen_id, origen_evento, origen_hash,
                                      confirmado_por, confirmado_at, created_by, updated_by)
    values (v_f, 'ajuste', 'confirmado', left(p ->> 'glosa', 500), v_tot,
            'sueldos_liquidaciones', p_id, 'liquidacion', public._cont_hash(p), p_user_id, now(), p_user_id, p_user_id)
    returning id into v_aid;
    perform public._cont_insertar_lineas(v_aid, v_lin);
    set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas immediate;
    set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas deferred;
  exception when others then
    return jsonb_build_object('asiento_id', null,
      'avisos', jsonb_build_array(jsonb_build_object('codigo', 'ERROR_ASIENTO',
                                                     'detalle', jsonb_build_object('mensaje', sqlerrm, 'sqlstate', sqlstate))));
  end;
  return jsonb_build_object('asiento_id', v_aid, 'avisos', '[]'::jsonb);
end $$;

-- Anula (período abierto) o revierte (cerrado) el asiento vigente de la liquidación.
create or replace function public._sueldos_bajar_asiento(p_id bigint, p_motivo text, p_user_id uuid, p_permitir_contraasiento boolean)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  a      public.cont_asientos%rowtype;
  v_f    date;
  v_nuevo bigint;
begin
  select * into a from public.cont_asientos x
   where x.origen_tabla = 'sueldos_liquidaciones' and x.origen_id = p_id and x.origen_evento = 'liquidacion'
     and x.estado <> 'anulado' and x.revertido_por_id is null and x.revierte_id is null
   for update;
  if not found then return jsonb_build_object('accion', 'nada'); end if;
  perform set_config('cadinc.cont_rpc', 'on', true);
  if public._cont_periodo_abierto(a.fecha)
     and exists (select 1 from public.cont_periodos pp where pp.id = a.periodo_id and pp.estado = 'abierto') then
    update public.cont_asientos
       set estado = 'anulado', motivo_anulacion = left(p_motivo, 500), anulado_por = p_user_id, anulado_at = now(),
           updated_by = p_user_id
     where id = a.id;
    return jsonb_build_object('accion', 'anulado', 'asiento_id', a.id);
  end if;
  if not p_permitir_contraasiento then
    perform public._sueldos_error('PERIODO_CERRADO', jsonb_build_object('asiento_id', a.id, 'fecha', a.fecha));
  end if;
  v_f := public._cont_primer_dia_abierto(greatest(a.fecha, public.hoy_ar()));
  if v_f is null then
    perform public._sueldos_error('PERIODO_CERRADO', jsonb_build_object('asiento_id', a.id, 'fecha', a.fecha));
  end if;
  v_nuevo := public._cont_revertir_asiento(a, v_f, p_motivo, p_user_id);
  set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas immediate;
  set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas deferred;
  return jsonb_build_object('accion', 'contraasiento', 'asiento_id', a.id, 'contraasiento_id', v_nuevo);
end $$;

-- ── 5) Cerrar / contabilizar / reabrir / anular ──────────────────────
create or replace function public.sueldos_cerrar_liquidacion(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q     public.sueldos_liquidaciones%rowtype;
  v_res jsonb;
begin
  perform public._sueldos_requiere(p_user_id, 'cerrar_liquidaciones');
  select * into q from public.sueldos_liquidaciones where id = p_id for update;
  if not found then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  if q.estado <> 'borrador' then
    perform public._sueldos_error('LIQUIDACION_NO_BORRADOR', jsonb_build_object('id', p_id, 'estado', q.estado));
  end if;
  if not exists (select 1 from public.sueldos_recibos where liquidacion_id = p_id and estado <> 'anulado') then
    perform public._sueldos_error('SIN_RECIBOS', jsonb_build_object('id', p_id));
  end if;

  update public.sueldos_recibos set estado = 'cerrado', updated_by = p_user_id where liquidacion_id = p_id and estado = 'borrador';
  update public.sueldos_liquidaciones
     set estado = 'cerrada', cerrada_por = p_user_id, cerrada_at = now(), updated_by = p_user_id
   where id = p_id;

  v_res := public._sueldos_generar_asiento(p_id, p_user_id);
  update public.sueldos_liquidaciones
     set asiento_id = (v_res ->> 'asiento_id')::bigint, avisos = coalesce(v_res -> 'avisos', '[]'::jsonb), updated_by = p_user_id
   where id = p_id;

  return jsonb_build_object('liquidacion', public.sueldos_liquidacion_json(p_id),
                            'asiento_id', (v_res ->> 'asiento_id')::bigint, 'avisos', v_res -> 'avisos');
end $$;

create or replace function public.sueldos_contabilizar_liquidacion(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q     public.sueldos_liquidaciones%rowtype;
  v_res jsonb;
begin
  perform public._sueldos_requiere(p_user_id, 'cerrar_liquidaciones');
  select * into q from public.sueldos_liquidaciones where id = p_id for update;
  if not found then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  if q.estado <> 'cerrada' then
    perform public._sueldos_error('LIQUIDACION_NO_CERRADA', jsonb_build_object('id', p_id, 'estado', q.estado));
  end if;
  if exists (select 1 from public.cont_asientos x
              where x.origen_tabla = 'sueldos_liquidaciones' and x.origen_id = p_id and x.origen_evento = 'liquidacion'
                and x.estado <> 'anulado' and x.revertido_por_id is null and x.revierte_id is null) then
    perform public._sueldos_error('ASIENTO_YA_GENERADO', jsonb_build_object('id', p_id, 'asiento_id', q.asiento_id));
  end if;
  v_res := public._sueldos_generar_asiento(p_id, p_user_id);
  update public.sueldos_liquidaciones
     set asiento_id = (v_res ->> 'asiento_id')::bigint, avisos = coalesce(v_res -> 'avisos', '[]'::jsonb), updated_by = p_user_id
   where id = p_id;
  return jsonb_build_object('liquidacion', public.sueldos_liquidacion_json(p_id),
                            'asiento_id', (v_res ->> 'asiento_id')::bigint, 'avisos', v_res -> 'avisos');
end $$;

create or replace function public.sueldos_reabrir_liquidacion(p_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q     public.sueldos_liquidaciones%rowtype;
  v_res jsonb;
begin
  perform public._sueldos_requiere(p_user_id, 'cerrar_liquidaciones');
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    perform public._sueldos_error('MOTIVO_REQUERIDO', jsonb_build_object('campo', 'motivo'));
  end if;
  select * into q from public.sueldos_liquidaciones where id = p_id for update;
  if not found then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  if q.estado <> 'cerrada' then
    perform public._sueldos_error('LIQUIDACION_NO_CERRADA', jsonb_build_object('id', p_id, 'estado', q.estado));
  end if;
  -- Solo con el asiento en un período abierto (si está cerrado: PERIODO_CERRADO).
  v_res := public._sueldos_bajar_asiento(p_id, 'Liquidación ' || q.codigo || ' reabierta: ' || btrim(p_motivo), p_user_id, false);

  update public.sueldos_recibos set estado = 'borrador', updated_by = p_user_id where liquidacion_id = p_id and estado = 'cerrado';
  update public.sueldos_liquidaciones
     set estado = 'borrador', cerrada_por = null, cerrada_at = null, asiento_id = null, avisos = '[]'::jsonb,
         obs = left(btrim(obs || case when btrim(obs) = '' then '' else E'\n' end
                    || 'Reabierta ' || to_char(public.hoy_ar(), 'DD/MM/YYYY') || ': ' || btrim(p_motivo)), 2000),
         updated_by = p_user_id
   where id = p_id;
  return jsonb_build_object('liquidacion', public.sueldos_liquidacion_json(p_id), 'asiento', v_res);
end $$;

create or replace function public.sueldos_anular_liquidacion(p_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q     public.sueldos_liquidaciones%rowtype;
  v_res jsonb;
begin
  perform public._sueldos_requiere(p_user_id, 'cerrar_liquidaciones');
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    perform public._sueldos_error('MOTIVO_REQUERIDO', jsonb_build_object('campo', 'motivo'));
  end if;
  select * into q from public.sueldos_liquidaciones where id = p_id for update;
  if not found then perform public._sueldos_error('LIQUIDACION_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  if q.estado = 'anulada' then perform public._sueldos_error('LIQUIDACION_ANULADA', jsonb_build_object('id', p_id)); end if;

  v_res := public._sueldos_bajar_asiento(p_id, 'Liquidación ' || q.codigo || ' anulada: ' || btrim(p_motivo), p_user_id, true);

  update public.sueldos_recibos set estado = 'anulado', updated_by = p_user_id where liquidacion_id = p_id;
  update public.sueldos_liquidaciones
     set estado = 'anulada', motivo_anulacion = left(btrim(p_motivo), 500), anulada_por = p_user_id, anulada_at = now(),
         updated_by = p_user_id
   where id = p_id;
  return jsonb_build_object('liquidacion', public.sueldos_liquidacion_json(p_id), 'asiento', v_res);
end $$;

-- ── 6) Historial para SAC / vacaciones ──────────────────────────────
create or replace function public.sueldos_historial_remuneraciones(p_legajo_id bigint, p_desde date, p_hasta date)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'periodo', x.periodo, 'tipo', x.tipo, 'total_remunerativo', x.rem, 'total_no_remunerativo', x.nor,
           'dias_trabajados', x.dias, 'horas_trabajadas', x.horas, 'recibos', x.n) order by x.periodo, x.tipo), '[]'::jsonb)
    from (select q.periodo, q.tipo, sum(r.total_remunerativo) as rem, sum(r.total_no_remunerativo) as nor,
                 sum(r.dias_trabajados) as dias, sum(r.horas_trabajadas) as horas, count(*) as n
            from public.sueldos_recibos r
            join public.sueldos_liquidaciones q on q.id = r.liquidacion_id
           where r.legajo_id = p_legajo_id and q.estado = 'cerrada' and r.estado = 'cerrado'
             and q.periodo between date_trunc('month', p_desde)::date and p_hasta
           group by q.periodo, q.tipo) x
$$;
comment on function public.sueldos_historial_remuneraciones(bigint, date, date) is
  'Recibos cerrados del legajo agrupados por período y tipo de liquidación (para SAC = 50 % de la mejor remuneración mensual del semestre, y vacaciones). El backend decide qué tipos suma (normalmente quincena + mensual + ajuste).';

-- ── 7) Grants ─────────────────────────────────────────────────────────
do $g$
declare f text;
begin
  foreach f in array array[
    'sueldos_recibo_json(bigint)', 'sueldos_liquidacion_json(bigint,boolean)',
    'sueldos_crear_liquidacion(jsonb,uuid)', 'sueldos_editar_liquidacion(bigint,jsonb,uuid)',
    'sueldos_guardar_recibo(bigint,bigint,jsonb,jsonb,uuid)', 'sueldos_borrar_recibo(bigint,bigint,uuid)',
    '_sueldos_fecha_asiento(public.sueldos_liquidaciones)', '_sueldos_prop_liquidacion(bigint)',
    'sueldos_asiento_propuesta(bigint)', '_sueldos_generar_asiento(bigint,uuid)',
    '_sueldos_bajar_asiento(bigint,text,uuid,boolean)',
    'sueldos_cerrar_liquidacion(bigint,uuid)', 'sueldos_contabilizar_liquidacion(bigint,uuid)',
    'sueldos_reabrir_liquidacion(bigint,text,uuid)', 'sueldos_anular_liquidacion(bigint,text,uuid)',
    'sueldos_historial_remuneraciones(bigint,date,date)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;
