-- =====================================================================
-- Contabilidad fase 3: contabilizador de asientos automáticos (2026-09-27)
--
-- Por qué: batch idempotente, SIN triggers en las tablas de origen. Para
-- cada origen desde cont_config.automaticos_desde calcula la propuesta
-- (20260927e) y la compara con su asiento activo (tipo 'automatico',
-- origen_tabla/id/evento, origen_hash):
--
--   origen no vigente (anulado/borrado):
--     · sin asiento → nada · asiento en período abierto → se ANULA
--     · asiento en período cerrado → CONTRAASIENTO en el primer día abierto
--       ≥ la fecha de anulación · sin período abierto → pendiente
--   vigente con motivos (SIN_MAPEO, etc.) → pendiente (o desactualizado si
--     ya tenía asiento con otro hash; el asiento no se toca)
--   vigente sin motivos:
--     · sin asiento → se CREA (si su fecha cae en un período abierto)
--     · mismo hash → sin cambios
--     · asiento y fecha nueva en períodos abiertos → se REGENERA en el lugar
--     · asiento en período cerrado → desactualizado; solo con
--       p_revertir_cerrados: contraasiento en el primer día abierto ≥ hoy y
--       asiento nuevo en greatest(fecha, fecha del contraasiento)
--
-- Cada origen corre en su propio bloque de excepción y con la partida doble
-- chequeada en el momento (SET CONSTRAINTS … IMMEDIATE): un origen malo
-- queda en `detalle_errores` y no frena el lote.
--
-- Todo escribe con cadinc.cont_rpc (guardas de 20260926a). Grants solo
-- service_role.
-- =====================================================================

-- ── 1) Candidatos ──────────────────────────────────────────────────────
-- Las cinco fuentes vigentes en el rango (compras por su fecha contable) +
-- los orígenes con asiento activo en el rango (anulados, borrados o que se
-- fueron del rango). Ordenado por fecha, tabla e id.
create or replace function public._cont_candidatos(p_desde date, p_hasta date)
returns table (origen_tabla text, origen_id bigint, fecha date)
language sql stable set search_path = public, pg_temp as $$
  with modo as (select coalesce(public._cont_cfg('compras_fecha_contable') #>> '{}', 'mes_iva') as m),
  vivos as (
    select 'ventas_facturas'::text as t, v.id, v.fecha_cbte as f, 0 as pri
      from public.ventas_facturas v
     where v.ambiente = 'prod' and v.estado = 'autorizada' and v.fecha_cbte between p_desde and p_hasta
    union all
    select 'ventas_comprobantes_externos', x.id, x.fecha, 0
      from public.ventas_comprobantes_externos x where x.fecha between p_desde and p_hasta
    union all
    select 'ventas_cobros', c.id, c.fecha, 0
      from public.ventas_cobros c where c.ambiente = 'prod' and c.estado = 'vigente' and c.fecha between p_desde and p_hasta
    union all
    select 'pagos_facturas', q.id, q.fc, 0
      from (select f.id, case when (select m from modo) = 'mes_iva'
                                   and f.periodo_iva > date_trunc('month', f.fecha::timestamp)::date
                              then f.periodo_iva else f.fecha end as fc
              from public.pagos_facturas f where f.estado <> 'anulada') q
     where q.fc between p_desde and p_hasta
    union all
    select 'pagos_ordenes', o.id, o.fecha, 0
      from public.pagos_ordenes o
     where o.estado = 'emitida' and o.forma_pago <> 'nota_credito' and o.monto_pagado > 0
       and o.fecha between p_desde and p_hasta
    union all
    select a.origen_tabla, a.origen_id, a.fecha, 1
      from public.cont_asientos a
     where a.origen_tabla is not null and a.origen_evento = 'registro' and a.estado <> 'anulado'
       and a.revertido_por_id is null and a.revierte_id is null and a.fecha between p_desde and p_hasta
  )
  select u.t, u.id, u.f
    from (select distinct on (t, id) t, id, f from vivos order by t, id, pri) u
   order by u.f, u.t, u.id
$$;

-- ── 2) Piezas de escritura ─────────────────────────────────────────────
create or replace function public._cont_asiento_activo(p_tabla text, p_id bigint)
returns public.cont_asientos language sql stable set search_path = public, pg_temp as $$
  select a.* from public.cont_asientos a
   where a.origen_tabla = p_tabla and a.origen_id = p_id and a.origen_evento = 'registro'
     and a.estado <> 'anulado' and a.revertido_por_id is null and a.revierte_id is null
   limit 1
$$;

create or replace function public._cont_periodo_abierto(p_fecha date)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce((select p.estado = 'abierto' and e.estado = 'abierto'
                     from public.cont_periodos p join public.cont_ejercicios e on e.id = p.ejercicio_id
                    where p_fecha between p.desde and p.hasta), false)
$$;

-- Primer día ≥ p_desde que cae en un período abierto (null si no hay).
create or replace function public._cont_primer_dia_abierto(p_desde date)
returns date language sql stable set search_path = public, pg_temp as $$
  select greatest(p_desde, p.desde)
    from public.cont_periodos p join public.cont_ejercicios e on e.id = p.ejercicio_id
   where p.estado = 'abierto' and e.estado = 'abierto' and p.hasta >= p_desde
   order by p.desde
   limit 1
$$;

-- Líneas de la propuesta → formato de entrada de _cont_validar_lineas (aux_id).
create or replace function public._cont_lineas_de_prop(p_prop jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', e -> 'cuenta_id', 'debe', e -> 'debe', 'haber', e -> 'haber',
           -- ->> y no ->: un JSON null no es NULL y el coalesce se quedaría con él.
           'aux_id', coalesce(e ->> 'aux_cliente_id', e ->> 'aux_proveedor_id', e ->> 'aux_tesoreria_id'),
           'obra_cod', e -> 'obra_cod', 'glosa', e -> 'glosa') order by n), '[]'::jsonb)
    from jsonb_array_elements(p_prop -> 'lineas') with ordinality as t(e, n)
$$;

create or replace function public._cont_insertar_lineas(p_asiento_id bigint, p_lin jsonb)
returns numeric language plpgsql set search_path = public, pg_temp as $$
declare v_tot numeric(14,2);
begin
  insert into public.cont_asiento_lineas (asiento_id, orden, cuenta_id, debe, haber,
                                          aux_cliente_id, aux_proveedor_id, aux_tesoreria_id, obra_cod, glosa)
  select p_asiento_id, n::smallint, (e ->> 'cuenta_id')::bigint, (e ->> 'debe')::numeric, (e ->> 'haber')::numeric,
         (e ->> 'aux_cliente_id')::bigint, (e ->> 'aux_proveedor_id')::bigint, (e ->> 'aux_tesoreria_id')::bigint,
         e ->> 'obra_cod', coalesce(e ->> 'glosa', '')
    from jsonb_array_elements(p_lin) with ordinality as t(e, n);
  select coalesce(sum((e ->> 'debe')::numeric), 0) into v_tot from jsonb_array_elements(p_lin) e;
  return v_tot;
end $$;

create or replace function public._cont_crear_asiento(p_prop jsonb, p_fecha date, p_hash text, p_user_id uuid)
returns bigint language plpgsql set search_path = public, pg_temp as $$
declare
  v_lin jsonb := public._cont_validar_lineas(public._cont_lineas_de_prop(p_prop), true);
  v_id  bigint;
  v_tot numeric(14,2);
begin
  select coalesce(sum((e ->> 'debe')::numeric), 0) into v_tot from jsonb_array_elements(v_lin) e;
  insert into public.cont_asientos (fecha, tipo, estado, glosa, total, origen_tabla, origen_id, origen_evento, origen_hash,
                                    confirmado_por, confirmado_at, created_by, updated_by)
  values (p_fecha, 'automatico', 'confirmado', left(p_prop ->> 'glosa', 500), v_tot,
          p_prop ->> 'origen_tabla', (p_prop ->> 'origen_id')::bigint, 'registro', p_hash,
          p_user_id, now(), p_user_id, p_user_id)
  returning id into v_id;
  perform public._cont_insertar_lineas(v_id, v_lin);
  return v_id;
end $$;

-- Contraasiento automático: mismas líneas invertidas, mismo origen, revierte_id.
create or replace function public._cont_revertir_asiento(p_a public.cont_asientos, p_fecha date, p_motivo text, p_user_id uuid)
returns bigint language plpgsql set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  insert into public.cont_asientos (fecha, tipo, estado, glosa, total, origen_tabla, origen_id, origen_evento, revierte_id,
                                    confirmado_por, confirmado_at, created_by, updated_by)
  values (p_fecha, 'automatico', 'confirmado',
          left('Reversión automática del asiento N° ' || coalesce(p_a.numero::text, 's/n') || ' del '
               || to_char(p_a.fecha, 'DD/MM/YYYY') || ': ' || p_motivo, 500),
          p_a.total, p_a.origen_tabla, p_a.origen_id, p_a.origen_evento, p_a.id,
          p_user_id, now(), p_user_id, p_user_id)
  returning id into v_id;
  insert into public.cont_asiento_lineas (asiento_id, orden, cuenta_id, debe, haber,
                                          aux_cliente_id, aux_proveedor_id, aux_tesoreria_id, obra_cod, glosa)
  select v_id, l.orden, l.cuenta_id, l.haber, l.debe, l.aux_cliente_id, l.aux_proveedor_id, l.aux_tesoreria_id, l.obra_cod, l.glosa
    from public.cont_asiento_lineas l where l.asiento_id = p_a.id order by l.orden, l.id;
  update public.cont_asientos set revertido_por_id = v_id, updated_by = p_user_id where id = p_a.id;
  return v_id;
end $$;

-- ── 3) Aplicar una propuesta ───────────────────────────────────────────
-- Devuelve {accion, asiento_id, motivos}. accion ∈ nada, anulado, revertido,
-- pendiente, desactualizado, creado, sin_cambios, regenerado,
-- revertido_y_regenerado.
create or replace function public._cont_aplicar(p_prop jsonb, p_user_id uuid, p_revertir_cerrados boolean)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_t      text := p_prop ->> 'origen_tabla';
  v_oid    bigint := (p_prop ->> 'origen_id')::bigint;
  a        public.cont_asientos%rowtype;
  v_tiene  boolean;
  v_a_ab   boolean := false;
  v_mot    jsonb := coalesce(p_prop -> 'motivos', '[]'::jsonb);
  v_hash   text;
  v_fecha  date := (p_prop ->> 'fecha')::date;
  v_f      date;
  v_nuevo  bigint;
  v_lin    jsonb;
  v_tot    numeric(14,2);
begin
  perform set_config('cadinc.cont_rpc', 'on', true);

  select * into a from public.cont_asientos x
   where x.origen_tabla = v_t and x.origen_id = v_oid and x.origen_evento = 'registro'
     and x.estado <> 'anulado' and x.revertido_por_id is null and x.revierte_id is null
   for update;
  v_tiene := found;
  if v_tiene then
    v_a_ab := public._cont_periodo_abierto(a.fecha)
              and exists (select 1 from public.cont_periodos p where p.id = a.periodo_id and p.estado = 'abierto');
  end if;

  -- 1) Origen no vigente.
  if not coalesce((p_prop ->> 'vigente')::boolean, false) then
    if not v_tiene then
      return jsonb_build_object('accion', 'nada', 'asiento_id', null, 'motivos', '[]'::jsonb);
    end if;
    if v_a_ab then
      update public.cont_asientos
         set estado = 'anulado', motivo_anulacion = 'Origen anulado', anulado_por = p_user_id, anulado_at = now(),
             updated_by = p_user_id
       where id = a.id;
      return jsonb_build_object('accion', 'anulado', 'asiento_id', a.id, 'motivos', '[]'::jsonb);
    end if;
    v_f := public._cont_primer_dia_abierto(greatest(a.fecha, coalesce((p_prop ->> 'anulado_el')::date, public.hoy_ar())));
    if v_f is null then
      return jsonb_build_object('accion', 'pendiente', 'asiento_id', a.id,
        'motivos', jsonb_build_array(jsonb_build_object('codigo', 'PERIODO_CERRADO', 'detalle', jsonb_build_object('fecha', a.fecha))));
    end if;
    v_nuevo := public._cont_revertir_asiento(a, v_f, 'origen anulado', p_user_id);
    return jsonb_build_object('accion', 'revertido', 'asiento_id', v_nuevo, 'motivos', '[]'::jsonb);
  end if;

  v_hash := public._cont_hash(p_prop);

  -- 2) Vigente con motivos: no se escribe.
  if jsonb_array_length(v_mot) > 0 then
    if v_tiene and a.origen_hash is distinct from v_hash then
      return jsonb_build_object('accion', 'desactualizado', 'asiento_id', a.id, 'motivos', v_mot);
    end if;
    return jsonb_build_object('accion', 'pendiente', 'asiento_id', case when v_tiene then a.id end, 'motivos', v_mot);
  end if;

  -- 3) Vigente sin motivos.
  if not v_tiene then
    if not public._cont_periodo_abierto(v_fecha) then
      return jsonb_build_object('accion', 'pendiente', 'asiento_id', null,
        'motivos', jsonb_build_array(jsonb_build_object('codigo', 'PERIODO_CERRADO', 'detalle', jsonb_build_object('fecha', v_fecha))));
    end if;
    v_nuevo := public._cont_crear_asiento(p_prop, v_fecha, v_hash, p_user_id);
    return jsonb_build_object('accion', 'creado', 'asiento_id', v_nuevo, 'motivos', '[]'::jsonb);
  end if;

  if a.origen_hash = v_hash then
    return jsonb_build_object('accion', 'sin_cambios', 'asiento_id', a.id, 'motivos', '[]'::jsonb);
  end if;

  if v_a_ab and public._cont_periodo_abierto(v_fecha) then
    v_lin := public._cont_validar_lineas(public._cont_lineas_de_prop(p_prop), true);
    delete from public.cont_asiento_lineas where asiento_id = a.id;
    select coalesce(sum((e ->> 'debe')::numeric), 0) into v_tot from jsonb_array_elements(v_lin) e;
    update public.cont_asientos
       set fecha = v_fecha, glosa = left(p_prop ->> 'glosa', 500), total = v_tot, origen_hash = v_hash, updated_by = p_user_id
     where id = a.id;
    perform public._cont_insertar_lineas(a.id, v_lin);
    return jsonb_build_object('accion', 'regenerado', 'asiento_id', a.id, 'motivos', '[]'::jsonb);
  end if;

  if v_a_ab then
    -- Asiento abierto pero la fecha nueva cae en un mes cerrado.
    return jsonb_build_object('accion', 'desactualizado', 'asiento_id', a.id,
      'motivos', jsonb_build_array(jsonb_build_object('codigo', 'PERIODO_CERRADO', 'detalle', jsonb_build_object('fecha', v_fecha))));
  end if;

  -- Asiento en un período cerrado.
  if not coalesce(p_revertir_cerrados, false) then
    return jsonb_build_object('accion', 'desactualizado', 'asiento_id', a.id, 'motivos', '[]'::jsonb);
  end if;
  v_f := public._cont_primer_dia_abierto(public.hoy_ar());
  if v_f is null or not public._cont_periodo_abierto(greatest(v_fecha, v_f)) then
    return jsonb_build_object('accion', 'pendiente', 'asiento_id', a.id,
      'motivos', jsonb_build_array(jsonb_build_object('codigo', 'PERIODO_CERRADO', 'detalle', jsonb_build_object('fecha', v_fecha))));
  end if;
  perform public._cont_revertir_asiento(a, v_f, 'el origen cambió', p_user_id);
  -- Se guarda el hash de la PROPUESTA (con su fecha): así la próxima corrida da
  -- sin_cambios aunque el asiento haya quedado en un día posterior.
  v_nuevo := public._cont_crear_asiento(p_prop, greatest(v_fecha, v_f), v_hash, p_user_id);
  return jsonb_build_object('accion', 'revertido_y_regenerado', 'asiento_id', v_nuevo, 'motivos', '[]'::jsonb);
end $$;

-- Propuesta sin excepción por origen borrado (para el lote y los listados).
create or replace function public._cont_propuesta_o_borrado(p_tabla text, p_id bigint, p_fecha date default null)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
begin
  return public._cont_propuesta(p_tabla, p_id);
exception when sqlstate 'P0001' then
  if sqlerrm = 'ORIGEN_NO_EXISTE' then
    return public._cont_prop_nueva(p_tabla, p_id, false, p_fecha, 'Origen borrado (' || p_tabla || ' ' || p_id || ')');
  end if;
  raise;
end $$;

-- ── 4) Estado de un origen (para pendientes y la propuesta) ────────────
create or replace function public._cont_estado_origen(p_tabla text, p_id bigint, p_fecha date default null)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_p    jsonb := public._cont_propuesta_o_borrado(p_tabla, p_id, p_fecha);
  a      public.cont_asientos%rowtype;
  v_hash text := public._cont_hash(v_p);
  v_mot  jsonb := coalesce(v_p -> 'motivos', '[]'::jsonb);
  v_est  text;
  v_pest text;
begin
  select * into a from public._cont_asiento_activo(p_tabla, p_id);
  if a.id is not null then
    select p.estado into v_pest from public.cont_periodos p where p.id = a.periodo_id;
  end if;

  if not coalesce((v_p ->> 'vigente')::boolean, false) then
    v_est := case when a.id is not null then 'a_revertir' else 'al_dia' end;
  elsif jsonb_array_length(v_mot) > 0 then
    v_est := case when a.id is not null and a.origen_hash is distinct from v_hash then 'desactualizado' else 'pendiente' end;
  elsif a.id is null then
    if public._cont_periodo_abierto((v_p ->> 'fecha')::date) then
      v_est := 'sin_contabilizar';
    else
      v_est := 'pendiente';
      v_mot := v_mot || jsonb_build_object('codigo', 'PERIODO_CERRADO', 'detalle', jsonb_build_object('fecha', v_p -> 'fecha'));
    end if;
  elsif a.origen_hash = v_hash then
    v_est := 'al_dia';
  else
    v_est := 'desactualizado';
  end if;

  return jsonb_build_object(
    'origen_tabla', p_tabla, 'origen_id', p_id,
    'fecha', coalesce(v_p ->> 'fecha', a.fecha::text, p_fecha::text),
    'fuente', case p_tabla when 'ventas_facturas' then 'Factura de venta'
                           when 'ventas_comprobantes_externos' then 'Comprobante externo'
                           when 'ventas_cobros' then 'Cobro'
                           when 'pagos_facturas' then 'Factura de compra'
                           when 'pagos_ordenes' then 'Orden de pago' end,
    'descripcion', coalesce(v_p ->> 'glosa', a.glosa),
    'importe', case when (v_p ->> 'vigente')::boolean then (v_p ->> 'importe')::numeric else a.total end,
    'estado', v_est, 'motivos', v_mot,
    'asiento_id', a.id, 'asiento_periodo_estado', v_pest,
    'hash', v_hash);
end $$;

-- ── 5) Vista de pendientes (security_invoker) ──────────────────────────
create or replace view public.v_cont_pendientes with (security_invoker = true) as
select c.origen_tabla,
       c.origen_id,
       (s.e ->> 'fecha')::date                 as fecha,
       s.e ->> 'fuente'                        as fuente,
       s.e ->> 'descripcion'                   as descripcion,
       (s.e ->> 'importe')::numeric(14,2)      as importe,
       s.e ->> 'estado'                        as estado,
       s.e -> 'motivos'                        as motivos,
       (s.e ->> 'asiento_id')::bigint          as asiento_id,
       s.e ->> 'asiento_periodo_estado'        as asiento_periodo_estado
  from public._cont_candidatos(public._cont_cfg_desde(), public.hoy_ar()) c
  cross join lateral (select public._cont_estado_origen(c.origen_tabla, c.origen_id, c.fecha) as e) s
 where s.e ->> 'estado' <> 'al_dia';

comment on view public.v_cont_pendientes is
  'Orígenes (desde automaticos_desde hasta hoy) cuyo asiento automático no está al día: sin_contabilizar, pendiente (con motivos), desactualizado o a_revertir. 20260927f.';

-- ── 6) Contabilizar (lote) ─────────────────────────────────────────────
create or replace function public.cont_contabilizar(p_hasta date, p_user_id uuid, p_fuentes text[] default null,
                                                    p_revertir_cerrados boolean default false,
                                                    p_cursor jsonb default null, p_limite int default 300)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lim    int := least(greatest(coalesce(p_limite, 300), 1), 500);
  v_desde  date := public._cont_cfg_desde();
  v_cf     date;
  v_ct     text;
  v_ci     bigint;
  c        record;
  v_prop   jsonb;
  v_res    jsonb;
  v_n      int := 0;
  v_hay    boolean := false;
  v_last   record;
  v_cnt    jsonb := jsonb_build_object('procesados', 0, 'creados', 0, 'regenerados', 0, 'anulados', 0, 'revertidos', 0,
                                       'sin_cambios', 0, 'pendientes', 0, 'desactualizados', 0, 'errores', 0);
  v_errs   jsonb := '[]'::jsonb;
  v_k      text;
  v_cur    jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'contabilizar') then
    raise exception 'SIN_PERMISO_CONTABILIZAR' using errcode = 'P0001';
  end if;
  if p_hasta is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'hasta')::text;
  end if;
  if p_hasta > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001',
      detail = json_build_object('campo', 'hasta', 'hasta', p_hasta, 'hoy', public.hoy_ar())::text;
  end if;
  if coalesce(p_revertir_cerrados, false) and not public._cont_flag(p_user_id, 'cerrar_periodos') then
    raise exception 'SIN_PERMISO_CERRAR' using errcode = 'P0001';
  end if;
  if p_fuentes is not null and exists (select 1 from unnest(p_fuentes) f
        where f not in ('ventas_facturas', 'ventas_comprobantes_externos', 'ventas_cobros', 'pagos_facturas', 'pagos_ordenes')) then
    raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001', detail = json_build_object('fuentes', p_fuentes)::text;
  end if;
  if not pg_try_advisory_xact_lock(hashtext('cont_contabilizar')) then
    raise exception 'CONTABILIZADOR_OCUPADO' using errcode = 'P0001';
  end if;

  if p_cursor is not null and jsonb_typeof(p_cursor) = 'object' then
    v_cf := (p_cursor ->> 'fecha')::date;
    v_ct := p_cursor ->> 'tabla';
    v_ci := (p_cursor ->> 'id')::bigint;
  end if;

  for c in
    select x.origen_tabla, x.origen_id, x.fecha
      from public._cont_candidatos(v_desde, p_hasta) x
     where (p_fuentes is null or x.origen_tabla = any (p_fuentes))
       and (v_cf is null or (x.fecha, x.origen_tabla, x.origen_id) > (v_cf, v_ct, v_ci))
     order by x.fecha, x.origen_tabla, x.origen_id
     limit v_lim + 1
  loop
    v_n := v_n + 1;
    if v_n > v_lim then v_hay := true; exit; end if;
    v_last := c;
    begin
      v_prop := public._cont_propuesta_o_borrado(c.origen_tabla, c.origen_id, c.fecha);
      v_res := public._cont_aplicar(v_prop, p_user_id, p_revertir_cerrados);
      -- La partida doble es diferida: se chequea acá para atribuir el error a este origen.
      set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas immediate;
      set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas deferred;
      v_k := case v_res ->> 'accion'
               when 'creado' then 'creados' when 'regenerado' then 'regenerados' when 'anulado' then 'anulados'
               when 'revertido' then 'revertidos' when 'revertido_y_regenerado' then 'revertidos'
               when 'sin_cambios' then 'sin_cambios' when 'pendiente' then 'pendientes'
               when 'desactualizado' then 'desactualizados' end;
      if v_k is not null then
        v_cnt := jsonb_set(v_cnt, array[v_k], to_jsonb((v_cnt ->> v_k)::int + 1));
      end if;
    exception when others then
      v_cnt := jsonb_set(v_cnt, '{errores}', to_jsonb((v_cnt ->> 'errores')::int + 1));
      if jsonb_array_length(v_errs) < 50 then
        v_errs := v_errs || jsonb_build_object('origen_tabla', c.origen_tabla, 'origen_id', c.origen_id,
                                               'codigo', 'ERROR_INTERNO', 'mensaje', sqlerrm, 'sqlstate', sqlstate);
      end if;
    end;
    v_cnt := jsonb_set(v_cnt, '{procesados}', to_jsonb((v_cnt ->> 'procesados')::int + 1));
  end loop;

  if v_hay then
    v_cur := jsonb_build_object('fecha', v_last.fecha, 'tabla', v_last.origen_tabla, 'id', v_last.origen_id);
  end if;
  return v_cnt || jsonb_build_object('hay_mas', v_hay, 'cursor', v_cur, 'detalle_errores', v_errs);
end $$;

-- ── 7) Pendientes (una pasada, un solo jsonb) ──────────────────────────
create or replace function public.cont_pendientes(p_desde date default null, p_hasta date default null, p_fuente text default null,
                                                  p_estado text default null, p_motivo text default null,
                                                  p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_out jsonb;
begin
  with base as materialized (
    select c.origen_tabla, c.origen_id, c.fecha as fecha_cand,
           public._cont_estado_origen(c.origen_tabla, c.origen_id, c.fecha) as e
      from public._cont_candidatos(coalesce(p_desde, public._cont_cfg_desde()), coalesce(p_hasta, public.hoy_ar())) c
  ),
  pend as (
    select b.origen_tabla, b.origen_id, coalesce((b.e ->> 'fecha')::date, b.fecha_cand) as fecha,
           b.e ->> 'fuente' as fuente, b.e ->> 'descripcion' as descripcion, (b.e ->> 'importe')::numeric(14,2) as importe,
           b.e ->> 'estado' as estado, b.e -> 'motivos' as motivos, (b.e ->> 'asiento_id')::bigint as asiento_id,
           b.e ->> 'asiento_periodo_estado' as asiento_periodo_estado
      from base b
     where b.e ->> 'estado' <> 'al_dia'
  ),
  filt as (
    select * from pend
     where (p_fuente is null or origen_tabla = p_fuente)
       and (p_estado is null or estado = p_estado)
       and (p_motivo is null or exists (select 1 from jsonb_array_elements(motivos) m where m ->> 'codigo' = p_motivo))
  )
  select jsonb_build_object(
    'total', (select count(*) from filt),
    'resumen', jsonb_build_object(
      'por_estado', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*) as n from pend group by 1) x), '{}'::jsonb),
      'por_fuente', coalesce((select jsonb_object_agg(origen_tabla, n) from (select origen_tabla, count(*) as n from pend group by 1) x), '{}'::jsonb),
      'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'clave', clave, 'subclave', subclave, 'cantidad', n)
                                               order by n desc, codigo, clave, subclave)
                                from (select m ->> 'codigo' as codigo, m -> 'detalle' ->> 'clave' as clave,
                                             m -> 'detalle' ->> 'subclave' as subclave, count(*) as n
                                        from pend, jsonb_array_elements(pend.motivos) m group by 1, 2, 3) y), '[]'::jsonb)),
    'items', coalesce((select jsonb_agg(to_jsonb(z) order by z.fecha, z.origen_tabla, z.origen_id)
                         from (select * from filt order by fecha, origen_tabla, origen_id limit v_lim offset v_off) z), '[]'::jsonb))
    into v_out;
  return v_out;
end $$;

-- ── 8) Propuesta de un origen, enriquecida para la pantalla ────────────
create or replace function public.cont_propuesta(p_origen_tabla text, p_origen_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_p    jsonb;
  v_est  jsonb;
  a      public.cont_asientos%rowtype;
begin
  if p_origen_tabla is null or p_origen_tabla not in ('ventas_facturas', 'ventas_comprobantes_externos', 'ventas_cobros',
                                                      'pagos_facturas', 'pagos_ordenes') then
    raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001', detail = json_build_object('origen_tabla', p_origen_tabla)::text;
  end if;
  select * into a from public._cont_asiento_activo(p_origen_tabla, p_origen_id);
  if a.id is null then
    v_p := public._cont_propuesta(p_origen_tabla, p_origen_id);   -- ORIGEN_NO_EXISTE si no hay nada que mostrar
  else
    v_p := public._cont_propuesta_o_borrado(p_origen_tabla, p_origen_id, a.fecha);
  end if;
  v_est := public._cont_estado_origen(p_origen_tabla, p_origen_id, (v_p ->> 'fecha')::date);

  return (v_p - 'lineas' - 'motivos') || jsonb_build_object(
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cuenta_id', (e ->> 'cuenta_id')::bigint, 'cuenta_codigo', c.codigo, 'cuenta_nombre', c.nombre,
               'debe', (e ->> 'debe')::numeric, 'haber', (e ->> 'haber')::numeric,
               'aux_tipo', case when e ->> 'aux_cliente_id' is not null then 'cliente'
                                when e ->> 'aux_proveedor_id' is not null then 'proveedor'
                                when e ->> 'aux_tesoreria_id' is not null then 'tesoreria'
                                else c.auxiliar end,
               'aux_id', coalesce((e ->> 'aux_cliente_id')::bigint, (e ->> 'aux_proveedor_id')::bigint, (e ->> 'aux_tesoreria_id')::bigint),
               'aux_nombre', coalesce(vc.razon_social, pp.razon_social, tc.nombre),
               'obra_cod', e ->> 'obra_cod', 'obra_nom', o.nom, 'glosa', e ->> 'glosa') order by n)
        from jsonb_array_elements(v_p -> 'lineas') with ordinality as t(e, n)
        join public.cont_cuentas c on c.id = (e ->> 'cuenta_id')::bigint
        left join public.ventas_clientes vc on vc.id = (e ->> 'aux_cliente_id')::bigint
        left join public.pagos_proveedores pp on pp.id = (e ->> 'aux_proveedor_id')::bigint
        left join public.tesoreria_cuentas tc on tc.id = (e ->> 'aux_tesoreria_id')::bigint
        left join public.obras o on o.cod = e ->> 'obra_cod'), '[]'::jsonb),
    'motivos', v_est -> 'motivos',
    'hash', v_est ->> 'hash',
    'estado', v_est ->> 'estado',
    'asiento_actual', case when a.id is not null then public._cont_asiento_json(a.id) end,
    'diferente', a.id is not null and a.origen_hash is distinct from (v_est ->> 'hash'));
end $$;

-- ── 9) Grants ──────────────────────────────────────────────────────────
revoke all on table public.v_cont_pendientes from public, anon, authenticated;
grant select on table public.v_cont_pendientes to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_candidatos(date, date)',
    '_cont_asiento_activo(text, bigint)',
    '_cont_periodo_abierto(date)',
    '_cont_primer_dia_abierto(date)',
    '_cont_lineas_de_prop(jsonb)',
    '_cont_insertar_lineas(bigint, jsonb)',
    '_cont_crear_asiento(jsonb, date, text, uuid)',
    '_cont_revertir_asiento(cont_asientos, date, text, uuid)',
    '_cont_aplicar(jsonb, uuid, boolean)',
    '_cont_propuesta_o_borrado(text, bigint, date)',
    '_cont_estado_origen(text, bigint, date)',
    'cont_contabilizar(date, uuid, text[], boolean, jsonb, integer)',
    'cont_pendientes(date, date, text, text, text, integer, integer)',
    'cont_propuesta(text, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
