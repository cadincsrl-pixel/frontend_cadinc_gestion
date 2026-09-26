-- =====================================================================
-- 20261004h — Sueldos: correcciones de la revisión (2026-09-26)
--
-- Por qué: la revisión del módulo (antes de la primera liquidación real;
-- sueldos_liquidaciones y sueldos_recibos están vacías) encontró:
--
--   C1  Un préstamo de Tarja que se descuenta en el recibo (línea con
--       destino 'prestamo') nunca quedaba como 'descontado' en `prestamos`:
--       el saldo del operario en Tarja seguía debiendo lo que ya se le
--       descontó. Ahora cerrar inserta la fila 'descontado' (con
--       `sueldos_liquidacion_id` para poder deshacerla) y reabrir/anular la
--       borran. Legajos sin `leg` (choferes solos, sin ficha en Personal)
--       no tienen cuenta de préstamos en Tarja: aviso
--       PRESTAMO_SIN_LEGAJO_TARJA. sem_key = viernes de la semana
--       (viernes→jueves, §5.3) de la fecha de pago.
--   C2  Un recibo con neto negativo se guardaba y cerraba: NETO_NEGATIVO.
--   I4  Sin fecha de ingreso no hay antigüedad ni alta en el LSD:
--       cerrar exige fecha_ingreso en el legajo ACTUAL de cada recibo.
--   M3  Cerrar exige fecha de pago (la usa el sem_key del préstamo y el
--       LSD). La fecha de pago se puede corregir también con la liquidación
--       cerrada: no toca el asiento (va al devengado) pero recalcula el
--       sem_key de los préstamos descontados.
--   M1  La obra del gasto en el asiento salía del legajo de HOY; ahora del
--       snapshot del recibo (fallback: el legajo actual).
--   M2  «Contabilizar» con el período del devengado cerrado quedaba
--       trabado en PERIODO_CERRADO: ahora el asiento va al primer día
--       abierto con aviso ASIENTO_EN_OTRO_PERIODO. Cerrar la liquidación
--       sigue sin mover la fecha (deja el aviso PERIODO_CERRADO y el
--       usuario decide contabilizar).
--   I2  audit_cambios / audit_borrado sobre sueldos_legajos escribían CUIL
--       y CBU completos en audit_log. Los dos triggers aceptan ahora un 4º
--       argumento opcional con columnas a enmascarar ('cuil,cbu' →
--       «***1234»). Las demás tablas (60 triggers con 3 argumentos) no
--       cambian. audit_log no tenía filas de sueldos con cuil/cbu
--       (verificado 26/09), así que no hubo que depurar el log.
-- =====================================================================

-- ── I2) Auditoría con columnas enmascaradas ─────────────────────────
create or replace function public.audit_enmascarar(v jsonb)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then '∅'
    else '***' || right(regexp_replace(v #>> '{}', '[^0-9A-Za-z]', '', 'g'), 4)
  end
$$;
comment on function public.audit_enmascarar(jsonb) is
  'Valor de auditoría enmascarado: ***<últimos 4>. Lo usan audit_cambios/audit_borrado para las columnas del 4º argumento del trigger.';

-- Igual que antes + tg_argv[3] opcional: columnas a enmascarar separadas por coma.
create or replace function public.audit_cambios()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_modulo  text := tg_argv[0];
  v_entidad text := tg_argv[1];
  v_pk      text := tg_argv[2];
  v_ignorar text[] := array['created_at', 'updated_at', 'created_by', 'updated_by',
                            'precio_actualizado_en', 'stock_actual'];
  v_mascara text[] := case when tg_nargs > 3 then string_to_array(replace(tg_argv[3], ' ', ''), ',') else '{}'::text[] end;
  v_old     jsonb := to_jsonb(old);
  v_new     jsonb := to_jsonb(new);
  v_k       text;
  v_partes  text[] := '{}';
  v_uid     uuid;
  v_nombre  text;
begin
  for v_k in select jsonb_object_keys(v_new) loop
    if v_k = any(v_ignorar) then continue; end if;
    if v_old -> v_k is distinct from v_new -> v_k then
      if v_k = any(v_mascara) then
        v_partes := v_partes || format('%s: %s → %s', v_k,
          public.audit_enmascarar(v_old -> v_k), public.audit_enmascarar(v_new -> v_k));
      else
        v_partes := v_partes || format('%s: %s → %s', v_k,
          public.audit_fmt_valor(v_old -> v_k), public.audit_fmt_valor(v_new -> v_k));
      end if;
    end if;
  end loop;
  if coalesce(array_length(v_partes, 1), 0) = 0 then
    return new;
  end if;

  begin
    v_uid := public.usuario_actual();
  exception when others then
    v_uid := null;
  end;
  if v_uid is not null then
    select nombre into v_nombre from public.profiles where id = v_uid;
  end if;

  insert into public.audit_log (user_id, user_nombre, modulo, accion, entidad, entidad_id, detalle, ip)
  values (v_uid, v_nombre, v_modulo, 'cambio', v_entidad, v_new ->> v_pk,
          array_to_string(v_partes, ' · '), null);
  return new;
end $function$;

create or replace function public.audit_borrado()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_modulo  text := tg_argv[0];
  v_entidad text := tg_argv[1];
  v_pk      text := tg_argv[2];
  v_ignorar text[] := array['created_at', 'updated_at', 'created_by', 'updated_by'];
  v_mascara text[] := case when tg_nargs > 3 then string_to_array(replace(tg_argv[3], ' ', ''), ',') else '{}'::text[] end;
  v_old     jsonb := to_jsonb(old);
  v_k       text;
  v_partes  text[] := '{}';
  v_uid     uuid;
  v_nombre  text;
begin
  for v_k in select jsonb_object_keys(v_old) loop
    if v_k = any(v_ignorar) then continue; end if;
    if v_old ->> v_k is null then continue; end if;
    if v_k = any(v_mascara) then
      v_partes := v_partes || format('%s: %s', v_k, public.audit_enmascarar(v_old -> v_k));
    else
      v_partes := v_partes || format('%s: %s', v_k, public.audit_fmt_valor(v_old -> v_k));
    end if;
  end loop;

  begin
    v_uid := public.usuario_actual();
  exception when others then
    v_uid := null;
  end;
  if v_uid is not null then
    select nombre into v_nombre from public.profiles where id = v_uid;
  end if;

  insert into public.audit_log (user_id, user_nombre, modulo, accion, entidad, entidad_id, detalle, ip)
  values (v_uid, v_nombre, v_modulo, 'borrado', v_entidad, v_old ->> v_pk,
          array_to_string(v_partes, ' · '), null);
  return old;
end $function$;

drop trigger if exists trg_audit_cambios on public.sueldos_legajos;
create trigger trg_audit_cambios after update on public.sueldos_legajos
  for each row execute function public.audit_cambios('sueldos', 'legajo', 'id', 'cuil,cbu');
drop trigger if exists trg_audit_borrado on public.sueldos_legajos;
create trigger trg_audit_borrado after delete on public.sueldos_legajos
  for each row execute function public.audit_borrado('sueldos', 'legajo', 'id', 'cuil,cbu');

-- ── C1) prestamos ↔ liquidación ─────────────────────────────────────
alter table public.prestamos
  add column if not exists sueldos_liquidacion_id bigint null references public.sueldos_liquidaciones(id);
create index if not exists prestamos_sueldos_liquidacion_idx
  on public.prestamos (sueldos_liquidacion_id) where sueldos_liquidacion_id is not null;
comment on column public.prestamos.sueldos_liquidacion_id is
  'Si la fila es un descuento hecho en un recibo de Sueldos: la liquidación. La crea sueldos_cerrar_liquidacion y la borran reabrir/anular. No editar a mano.';

-- Viernes de la semana (viernes→jueves) que contiene la fecha, como sem_key.
-- isodow: lun 1 … dom 7 → (isodow + 2) % 7 = días desde el viernes (vie 0, jue 6, sáb 1).
create or replace function public._sueldos_sem_key(p_fecha date)
returns text language sql immutable set search_path = public, pg_temp as $$
  select to_char(p_fecha - ((extract(isodow from p_fecha)::int + 2) % 7), 'YYYY-MM-DD')
$$;

-- sem_key de los préstamos de una liquidación: fecha de pago o fin del período.
create or replace function public._sueldos_sem_key_liq(q public.sueldos_liquidaciones)
returns text language sql stable set search_path = public, pg_temp as $$
  select public._sueldos_sem_key(coalesce(q.fecha_pago, public._sueldos_fecha_asiento(q)))
$$;

-- Inserta los 'descontado' de la liquidación en prestamos; devuelve avisos.
create or replace function public._sueldos_descontar_prestamos(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  q       public.sueldos_liquidaciones%rowtype;
  v_sem   text;
  v_av    jsonb;
begin
  select * into q from public.sueldos_liquidaciones where id = p_id;
  v_sem := public._sueldos_sem_key_liq(q);
  delete from public.prestamos where sueldos_liquidacion_id = p_id;

  insert into public.prestamos (leg, sem_key, tipo, monto, concepto, created_by, sueldos_liquidacion_id)
  select l.leg, v_sem, 'descontado', x.imp, 'Descontado en sueldos ' || q.codigo, p_user_id, q.id
    from (select r.legajo_id, round(sum(li.importe), 2) as imp
            from public.sueldos_recibos r
            join public.sueldos_recibo_lineas li on li.recibo_id = r.id
           where r.liquidacion_id = p_id and r.estado <> 'anulado' and li.destino = 'prestamo'
           group by r.legajo_id) x
    join public.sueldos_legajos l on l.id = x.legajo_id
   where x.imp > 0 and l.leg is not null
   order by l.leg;

  select coalesce(jsonb_agg(jsonb_build_object('codigo', 'PRESTAMO_SIN_LEGAJO_TARJA',
                   'detalle', jsonb_build_object('legajo_id', vl.id, 'nombre', vl.nombre_mostrar, 'monto', x.imp))
                   order by vl.nombre_mostrar), '[]'::jsonb)
    into v_av
    from (select r.legajo_id, round(sum(li.importe), 2) as imp
            from public.sueldos_recibos r
            join public.sueldos_recibo_lineas li on li.recibo_id = r.id
           where r.liquidacion_id = p_id and r.estado <> 'anulado' and li.destino = 'prestamo'
           group by r.legajo_id) x
    join public.v_sueldos_legajos vl on vl.id = x.legajo_id
   where x.imp > 0 and vl.leg is null;
  return v_av;
end $$;

-- Avisos que no son del asiento y sobreviven a un reintento de contabilizar.
create or replace function public._sueldos_avisos_no_asiento(p_avisos jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_avisos, '[]'::jsonb)) e
   where e ->> 'codigo' in ('PRESTAMO_SIN_LEGAJO_TARJA')
$$;

-- ── M3) Editar liquidación: fecha de pago también cerrada ────────────
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
    begin
      v_pago := nullif(p_cambios ->> 'fecha_pago', '')::date;
    exception when others then
      perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('campo', 'fecha_pago'));
    end;
    if q.estado = 'cerrada' and v_pago is null then
      perform public._sueldos_error('FECHA_PAGO_REQUERIDA', jsonb_build_object('id', p_id, 'campo', 'fecha_pago'));
    end if;
    update public.sueldos_liquidaciones set fecha_pago = v_pago, updated_by = p_user_id where id = p_id
      returning * into q;
    -- Cerrada: el asiento no cambia (va al devengado); el préstamo descontado sí se mueve de semana.
    if q.estado = 'cerrada' then
      update public.prestamos set sem_key = public._sueldos_sem_key_liq(q)
       where sueldos_liquidacion_id = p_id;
    end if;
  end if;
  if p_cambios ? 'obs' then
    update public.sueldos_liquidaciones set obs = coalesce(btrim(p_cambios ->> 'obs'), ''), updated_by = p_user_id where id = p_id;
  end if;
  return public.sueldos_liquidacion_json(p_id);
end $$;

-- ── C2) Guardar recibo: neto negativo ────────────────────────────────
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

  -- 20261004h (C2): un recibo no puede dar neto negativo (los descuentos no pueden superar lo que se cobra).
  if v_neto < 0 then
    perform public._sueldos_error('NETO_NEGATIVO', jsonb_build_object('neto', v_neto));
  end if;

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
  'Crea o reemplaza el recibo del legajo en una liquidación borrador. Totales calculados desde las líneas; los del backend se validan ±0,01. Neto < 0 → NETO_NEGATIVO (20261004h). Ver shape en el resumen de 20261004d.';

-- ── M1) Asiento: obra del gasto desde el snapshot del recibo ─────────
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

  -- Debe: gasto por tipo, por obra habitual del legajo AL LIQUIDAR (snapshot; si no la tiene, la de hoy).
  for x in
    select case when li.tipo = 'remunerativo' then 'sueldos.remunerativo'
                when li.tipo = 'no_remunerativo' then 'sueldos.no_remunerativo'
                when li.destino = 'fondo_cese' then 'sueldos.fondo_cese'
                else 'sueldos.contribuciones' end as clave,
           coalesce(nullif(r.snapshot -> 'legajo' ->> 'obra_cod_habitual', ''), l.obra_cod_habitual) as obra,
           sum(li.importe) as imp
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

-- ── M2) Generar asiento: opción de mover al primer día abierto ───────
drop function if exists public._sueldos_generar_asiento(bigint, uuid);
create or replace function public._sueldos_generar_asiento(p_id bigint, p_user_id uuid, p_mover_a_abierto boolean default false)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  p      jsonb := public._sueldos_prop_liquidacion(p_id);
  v_f    date := (p ->> 'fecha')::date;
  v_f2   date;
  v_av   jsonb := '[]'::jsonb;
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
    v_f2 := case when p_mover_a_abierto then public._cont_primer_dia_abierto(v_f) end;
    if v_f2 is null then
      return jsonb_build_object('asiento_id', null,
        'avisos', jsonb_build_array(jsonb_build_object('codigo', 'PERIODO_CERRADO', 'detalle', jsonb_build_object('fecha', v_f))));
    end if;
    v_av := jsonb_build_array(jsonb_build_object('codigo', 'ASIENTO_EN_OTRO_PERIODO',
              'detalle', jsonb_build_object('fecha_original', v_f, 'fecha', v_f2)));
    p := p || jsonb_build_object('fecha', v_f2,
                                 'glosa', left((p ->> 'glosa') || ' (devengado ' || to_char(v_f, 'DD/MM/YYYY') || ')', 500));
    v_f := v_f2;
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
      'avisos', v_av || jsonb_build_array(jsonb_build_object('codigo', 'ERROR_ASIENTO',
                                                     'detalle', jsonb_build_object('mensaje', sqlerrm, 'sqlstate', sqlstate))));
  end;
  return jsonb_build_object('asiento_id', v_aid, 'avisos', v_av);
end $$;

-- ── C1 / C2 / I4 / M3) Cerrar ───────────────────────────────────────
create or replace function public.sueldos_cerrar_liquidacion(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q     public.sueldos_liquidaciones%rowtype;
  v_res jsonb;
  v_pre jsonb;
  v_av  jsonb;
  v_x   jsonb;
  r     record;
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
  if q.fecha_pago is null then
    perform public._sueldos_error('FECHA_PAGO_REQUERIDA', jsonb_build_object('id', p_id, 'campo', 'fecha_pago'));
  end if;
  select jsonb_agg(jsonb_build_object('legajo_id', vl.id, 'nombre', vl.nombre_mostrar) order by vl.nombre_mostrar)
    into v_x
    from public.sueldos_recibos rr join public.v_sueldos_legajos vl on vl.id = rr.legajo_id
   where rr.liquidacion_id = p_id and rr.estado <> 'anulado' and vl.fecha_ingreso is null;
  if v_x is not null then
    perform public._sueldos_error('LEGAJOS_SIN_FECHA_INGRESO', jsonb_build_object('legajos', v_x));
  end if;
  select rr.legajo_id, rr.neto into r
    from public.sueldos_recibos rr
   where rr.liquidacion_id = p_id and rr.estado <> 'anulado' and rr.neto < 0
   order by rr.neto, rr.id limit 1;
  if found then
    perform public._sueldos_error('NETO_NEGATIVO', jsonb_build_object('legajo_id', r.legajo_id, 'neto', r.neto));
  end if;

  update public.sueldos_recibos set estado = 'cerrado', updated_by = p_user_id where liquidacion_id = p_id and estado = 'borrador';
  update public.sueldos_liquidaciones
     set estado = 'cerrada', cerrada_por = p_user_id, cerrada_at = now(), updated_by = p_user_id
   where id = p_id;

  -- Préstamos de Tarja descontados en los recibos.
  v_pre := public._sueldos_descontar_prestamos(p_id, p_user_id);

  v_res := public._sueldos_generar_asiento(p_id, p_user_id);
  v_av  := coalesce(v_res -> 'avisos', '[]'::jsonb) || v_pre;
  update public.sueldos_liquidaciones
     set asiento_id = (v_res ->> 'asiento_id')::bigint, avisos = v_av, updated_by = p_user_id
   where id = p_id;

  return jsonb_build_object('liquidacion', public.sueldos_liquidacion_json(p_id),
                            'asiento_id', (v_res ->> 'asiento_id')::bigint, 'avisos', v_av);
end $$;

-- ── M2) Contabilizar: período cerrado → primer día abierto ───────────
create or replace function public.sueldos_contabilizar_liquidacion(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q     public.sueldos_liquidaciones%rowtype;
  v_res jsonb;
  v_av  jsonb;
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
  v_res := public._sueldos_generar_asiento(p_id, p_user_id, true);
  -- Los avisos que no son del asiento (préstamos sin legajo de Tarja) se conservan.
  v_av  := coalesce(v_res -> 'avisos', '[]'::jsonb) || public._sueldos_avisos_no_asiento(q.avisos);
  update public.sueldos_liquidaciones
     set asiento_id = (v_res ->> 'asiento_id')::bigint, avisos = v_av, updated_by = p_user_id
   where id = p_id;
  return jsonb_build_object('liquidacion', public.sueldos_liquidacion_json(p_id),
                            'asiento_id', (v_res ->> 'asiento_id')::bigint, 'avisos', v_av);
end $$;

-- ── C1) Reabrir / anular: sacar los préstamos descontados ────────────
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

  delete from public.prestamos where sueldos_liquidacion_id = p_id;

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

  delete from public.prestamos where sueldos_liquidacion_id = p_id;

  update public.sueldos_recibos set estado = 'anulado', updated_by = p_user_id where liquidacion_id = p_id;
  update public.sueldos_liquidaciones
     set estado = 'anulada', motivo_anulacion = left(btrim(p_motivo), 500), anulada_por = p_user_id, anulada_at = now(),
         updated_by = p_user_id
   where id = p_id;
  return jsonb_build_object('liquidacion', public.sueldos_liquidacion_json(p_id), 'asiento', v_res);
end $$;

-- ── Grants ───────────────────────────────────────────────────────────
do $g$
declare f text;
begin
  foreach f in array array[
    'audit_enmascarar(jsonb)',
    '_sueldos_sem_key(date)', '_sueldos_sem_key_liq(public.sueldos_liquidaciones)',
    '_sueldos_descontar_prestamos(bigint,uuid)', '_sueldos_avisos_no_asiento(jsonb)',
    'sueldos_editar_liquidacion(bigint,jsonb,uuid)', 'sueldos_guardar_recibo(bigint,bigint,jsonb,jsonb,uuid)',
    '_sueldos_prop_liquidacion(bigint)', '_sueldos_generar_asiento(bigint,uuid,boolean)',
    'sueldos_cerrar_liquidacion(bigint,uuid)', 'sueldos_contabilizar_liquidacion(bigint,uuid)',
    'sueldos_reabrir_liquidacion(bigint,text,uuid)', 'sueldos_anular_liquidacion(bigint,text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;
