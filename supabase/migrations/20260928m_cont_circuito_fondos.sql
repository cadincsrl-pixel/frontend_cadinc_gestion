-- =====================================================================
-- 20260928m — Contabilidad: circuito «fondos» en el motor de automáticos
-- (2026-09-24)
--
-- Por qué: los movimientos de fondos (20260928l) son un circuito más del
-- motor, igual que ventas, cobros, compras y pagos: batch idempotente por
-- (origen_tabla, origen_id, 'registro') + origen_hash, sin triggers.
--
--   · _cont_fuentes(): la lista de tablas de origen en UN lugar. Reemplaza la
--     lista literal repetida en _cont_propuesta, cont_propuesta,
--     cont_contabilizar y cont_pendientes (la conciliación bancaria solo va a
--     tener que tocar esta función y sumar su rama).
--   · _cont_prop_fondos: egreso = concepto al debe / tesorería al haber;
--     ingreso al revés; transferencia = destino al debe / origen al haber.
--     Siempre por importe_ars. La cuenta del concepto sale del mapeo
--     `fondos.concepto` (subclave = id del concepto); la de tesorería, de
--     tesoreria_cuentas.cuenta_id. Sin cualquiera de las dos → pendiente.
--     Anulado → el motor anula (período abierto) o revierte (cerrado, en el
--     primer día abierto ≥ la fecha de anulación).
--   · Circuito 'fondos' en _cont_circuito y en el Libro Diario resumido.
--   · Mapeo `fondos.concepto`: CHECK de cont_mapeos (lista completa vigente +
--     la clave nueva; 20260928n la vuelve a rehacer con las de IVA y bienes),
--     catálogo, subclave válida, etiqueta, en uso y listado.
--
-- Nada de esto toca los asientos existentes: las propuestas de las otras
-- cinco fuentes no cambian (mismo hash).
--
-- Parches por ancla sobre la definición viva (pg_get_functiondef).
-- =====================================================================

create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

-- Igual, con una expresión regular (para la lista literal, que en cada
-- función está cortada en dos renglones con distinta sangría).
create or replace function pg_temp._una_re(p_txt text, p_re text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  select count(*) into v_n from regexp_matches(p_txt, p_re, 'g');
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_re, 120);
  end if;
  return regexp_replace(p_txt, p_re, p_nuevo);
end $f$;

-- ── 1) Fuentes del motor ───────────────────────────────────────────────
create or replace function public._cont_fuentes()
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select array['ventas_facturas', 'ventas_comprobantes_externos', 'ventas_cobros',
               'pagos_facturas', 'pagos_ordenes', 'tesoreria_movimientos']::text[]
$$;
comment on function public._cont_fuentes() is
  'Tablas de origen del motor de asientos automáticos. Única lista: la usan _cont_propuesta, cont_propuesta, cont_contabilizar y cont_pendientes. 20260928m.';

-- ── 2) Propuesta de un movimiento de fondos ────────────────────────────
create or replace function public._cont_prop_fondos(p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  m     public.tesoreria_movimientos%rowtype;
  o     public.tesoreria_cuentas%rowtype;
  d     public.tesoreria_cuentas%rowtype;
  v_con text;
  p     jsonb;
  g     text;
begin
  select * into m from public.tesoreria_movimientos where id = p_id;
  if not found then return null; end if;
  select * into o from public.tesoreria_cuentas where id = m.tesoreria_id;
  if m.tesoreria_destino_id is not null then
    select * into d from public.tesoreria_cuentas where id = m.tesoreria_destino_id;
  end if;
  select c.nombre into v_con from public.tesoreria_conceptos c where c.id = m.concepto_id;

  g := 'MF-' || lpad(m.numero::text, 6, '0') || ' — '
       || case m.tipo when 'transferencia' then 'Transferencia ' || o.nombre || ' → ' || coalesce(d.nombre, '?')
                      else coalesce(v_con, 'Concepto ' || m.concepto_id) || ' · ' || o.nombre end
       || coalesce(nullif(' · ' || btrim(m.referencia), ' · '), '');
  p := public._cont_prop_nueva('tesoreria_movimientos', p_id, m.estado = 'vigente', m.fecha, g,
                               (m.anulado_at at time zone 'America/Argentina/Buenos_Aires')::date);
  if not (p ->> 'vigente')::boolean then return p; end if;

  if o.cuenta_id is null then
    p := public._cont_prop_motivo(p, 'TESORERIA_SIN_CUENTA', jsonb_build_object('tesoreria_id', o.id));
  end if;
  if m.tipo = 'transferencia' and d.cuenta_id is null then
    p := public._cont_prop_motivo(p, 'TESORERIA_SIN_CUENTA', jsonb_build_object('tesoreria_id', m.tesoreria_destino_id));
  end if;

  if m.tipo = 'egreso' then
    p := public._cont_prop_linea(p, 'fondos.concepto', array[m.concepto_id::text], true, m.importe_ars, null, null, m.obra_cod, g);
    if o.cuenta_id is not null then
      p := public._cont_prop_linea(p, null, null, false, m.importe_ars, 'tesoreria', o.id, null, g, o.cuenta_id);
    end if;
  elsif m.tipo = 'ingreso' then
    if o.cuenta_id is not null then
      p := public._cont_prop_linea(p, null, null, true, m.importe_ars, 'tesoreria', o.id, null, g, o.cuenta_id);
    end if;
    p := public._cont_prop_linea(p, 'fondos.concepto', array[m.concepto_id::text], false, m.importe_ars, null, null, m.obra_cod, g);
  else
    if d.cuenta_id is not null then
      p := public._cont_prop_linea(p, null, null, true, m.importe_ars, 'tesoreria', d.id, null, g, d.cuenta_id);
    end if;
    if o.cuenta_id is not null then
      p := public._cont_prop_linea(p, null, null, false, m.importe_ars, 'tesoreria', o.id, null, g, o.cuenta_id);
    end if;
  end if;
  return public._cont_prop_cerrar(p);
end $$;

comment on function public._cont_prop_fondos(bigint) is
  'Propuesta de asiento de un movimiento de fondos (circuito fondos): concepto (mapeo fondos.concepto) contra la cuenta contable de la tesorería, o tesorería destino contra origen. Por importe_ars. 20260928m.';

-- ── 3) Candidatos (completo: es corto) ─────────────────────────────────
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
    select 'tesoreria_movimientos', t.id, t.fecha, 0
      from public.tesoreria_movimientos t
     where t.estado = 'vigente' and t.fecha between p_desde and p_hasta
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

-- ── 4) Circuito ────────────────────────────────────────────────────────
create or replace function public._cont_circuito(p_origen_tabla text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_origen_tabla
           when 'ventas_facturas' then 'ventas'
           when 'ventas_comprobantes_externos' then 'ventas'
           when 'ventas_cobros' then 'cobros'
           when 'pagos_facturas' then 'compras'
           when 'pagos_ordenes' then 'pagos'
           when 'tesoreria_movimientos' then 'fondos'
           else 'otros' end
$$;

-- ── 5) CHECK de cont_mapeos (lista completa vigente + fondos.concepto) ─
alter table public.cont_mapeos drop constraint cont_mapeos_clave_check;
alter table public.cont_mapeos add constraint cont_mapeos_clave_check check (clave in (
  'compras.concepto', 'compras.sin_imputar', 'compras.iva_cf', 'compras.tributo', 'compras.proveedores',
  'ventas.producto', 'ventas.externo', 'ventas.cliente', 'ventas.iva_df', 'ventas.tributo', 'ventas.deudores',
  'cobros.medio', 'cobros.retencion', 'pagos.puente', 'pagos.cheque_propio', 'pagos.cheque_tercero',
  'general.redondeo', 'fondos.concepto'));

-- ── 6) Parches por ancla ───────────────────────────────────────────────
do $m$
declare
  v    text;
  v_re constant text := $r$not in \('ventas_facturas', 'ventas_comprobantes_externos', 'ventas_cobros',\s*'pagos_facturas', 'pagos_ordenes'\)$r$;
begin
  -- _cont_propuesta: lista → _cont_fuentes() + rama nueva.
  v := pg_get_functiondef('public._cont_propuesta(text,bigint)'::regprocedure);
  v := pg_temp._una_re(v, v_re, '<> all (public._cont_fuentes())');
  v := pg_temp._una(v,
$a$         when 'pagos_ordenes'                then public._cont_prop_orden(p_id)$a$,
$a$         when 'pagos_ordenes'                then public._cont_prop_orden(p_id)
         when 'tesoreria_movimientos'        then public._cont_prop_fondos(p_id)$a$);
  execute v;

  -- cont_propuesta
  v := pg_get_functiondef('public.cont_propuesta(text,bigint)'::regprocedure);
  v := pg_temp._una_re(v, v_re, '<> all (public._cont_fuentes())');
  execute v;

  -- cont_contabilizar
  v := pg_get_functiondef('public.cont_contabilizar(date,uuid,text[],boolean,jsonb,integer)'::regprocedure);
  v := pg_temp._una_re(v, v_re, '<> all (public._cont_fuentes())');
  execute v;

  -- cont_pendientes (versión de 20260928h, 8 parámetros)
  v := pg_get_functiondef('public.cont_pendientes(date,date,text,text,text,integer,integer,text[])'::regprocedure);
  v := pg_temp._una_re(v, v_re, '<> all (public._cont_fuentes())');
  execute v;

  -- _cont_estado_origen: etiqueta de la fuente.
  v := pg_get_functiondef('public._cont_estado_origen(text,bigint,date)'::regprocedure);
  v := pg_temp._una(v,
$a$when 'pagos_ordenes' then 'Orden de pago' end,$a$,
$a$when 'pagos_ordenes' then 'Orden de pago'
                           when 'tesoreria_movimientos' then 'Movimiento de fondos' end,$a$);
  execute v;

  -- Libro Diario resumido: etiqueta del circuito.
  v := pg_get_functiondef('public.cont_libro_diario_resumido(date,date,text,integer,integer)'::regprocedure);
  v := pg_temp._una(v, $a$when 'pagos' then 'Pagos'$a$, $a$when 'pagos' then 'Pagos' when 'fondos' then 'Movimientos de fondos'$a$);
  execute v;

  -- Catálogo de mapeos.
  v := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v := pg_temp._una(v, $a${"clave":"general.redondeo",$a$,
$a${"clave":"fondos.concepto","etiqueta":"Movimientos de fondos por concepto","descripcion":"Contrapartida de cada concepto de ingreso o egreso de fondos sin factura (comisiones, impuesto al cheque, VEP, sueldos, retiros…). La otra pata es la cuenta contable de la cuenta de tesorería.","rubros":["activo","pasivo","pn","ingreso","egreso"],"auxiliares":["none"],"subclave_tipo":"concepto_fondos","subclaves":[],"lookup":"exacto"},
    {"clave":"general.redondeo",$a$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_valida(text,text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'cbte_externo' then$a$,
$a$    when 'concepto_fondos' then
      return p_sub ~ '^[0-9]{1,18}$' and exists (select 1 from public.tesoreria_conceptos c where c.id = p_sub::bigint);
    when 'cbte_externo' then$a$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when p_clave = 'ventas.externo' then$a$,
$a$    when p_clave = 'fondos.concepto' then
      coalesce((select c.nombre || case when c.activo then '' else ' (baja)' end
                  from public.tesoreria_conceptos c where p_sub ~ '^[0-9]{1,18}$' and c.id = p_sub::bigint), 'Concepto ' || p_sub)
    when p_clave = 'ventas.externo' then$a$);
  execute v;

  v := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v := pg_temp._una(v,
$a$    else
      v_n := 0;$a$,
$a$    when 'fondos.concepto' then
      if p_sub ~ '^[0-9]{1,18}$' then
        select count(*) into v_n from public.tesoreria_movimientos t
         where t.estado = 'vigente' and t.fecha >= p_desde and t.concepto_id = p_sub::bigint;
      end if;
    else
      v_n := 0;$a$);
  execute v;

  v := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v := pg_temp._una(v,
$a$      union select c.id::text from public.pagos_conceptos c where r ->> 'clave' = 'compras.concepto'$a$,
$a$      union select c.id::text from public.pagos_conceptos c where r ->> 'clave' = 'compras.concepto'
      union select c.id::text from public.tesoreria_conceptos c where r ->> 'clave' = 'fondos.concepto'$a$);
  execute v;
end $m$;

-- ── 7) Grants ──────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array['_cont_fuentes()', '_cont_prop_fondos(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
