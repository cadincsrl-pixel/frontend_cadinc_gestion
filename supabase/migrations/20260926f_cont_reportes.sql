-- =====================================================================
-- Contabilidad fase 1: listados y reportes (2026-09-26)
--
-- Por qué RPC que devuelven UN jsonb: PostgREST recorta a 1000 filas por
-- respuesta (§5.7) y el diario/mayor crecen sin techo. Una función que
-- devuelve una sola fila jsonb no tiene ese tope, y la paginación la hace la
-- RPC (el saldo corriente del mayor se calcula sobre TODO el rango y recién
-- después se pagina, así la página 3 arranca con el saldo correcto).
--
-- Reglas de rango (mayor y sumas y saldos): desde ≤ hasta, las dos fechas
-- dentro de UN ejercicio. El saldo anterior arranca en ejercicio.desde: el
-- arrastre de las patrimoniales lo trae el asiento de apertura.
-- Solo cuentan los asientos CONFIRMADOS (borradores y anulados, nunca).
--
-- Las vistas v_cont_cuentas y v_cont_periodos quedaron en 20260926e.
-- Sin p_user_id: son de lectura y el backend ya aplicó lectura + tab.
-- =====================================================================

-- Valida un rango de reporte y devuelve su ejercicio.
create or replace function public._cont_rango_ejercicio(p_desde date, p_hasta date)
returns public.cont_ejercicios
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_pd public.cont_periodos%rowtype;
  v_ph public.cont_periodos%rowtype;
  v_e  public.cont_ejercicios%rowtype;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001',
      detail = json_build_object('campo', case when p_desde is null then 'desde' else 'hasta' end)::text;
  end if;
  if p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO' using errcode = 'P0001', detail = json_build_object('desde', p_desde, 'hasta', p_hasta)::text;
  end if;
  v_pd := public._cont_periodo_de(p_desde);
  if v_pd.id is null then
    raise exception 'FECHA_SIN_PERIODO' using errcode = 'P0001', detail = json_build_object('campo', 'desde', 'fecha', p_desde)::text;
  end if;
  v_ph := public._cont_periodo_de(p_hasta);
  if v_ph.id is null then
    raise exception 'FECHA_SIN_PERIODO' using errcode = 'P0001', detail = json_build_object('campo', 'hasta', 'fecha', p_hasta)::text;
  end if;
  if v_pd.ejercicio_id <> v_ph.ejercicio_id then
    raise exception 'RANGO_EXCEDE_EJERCICIO' using errcode = 'P0001', detail = json_build_object('desde', p_desde, 'hasta', p_hasta)::text;
  end if;
  select * into v_e from public.cont_ejercicios where id = v_pd.ejercicio_id;
  return v_e;
end $$;

-- ── 1) Listado de asientos (pantalla Asientos) ─────────────────────────
create or replace function public.cont_listar_asientos(
  p_desde date default null, p_hasta date default null, p_estado text default 'todos', p_tipo text default null,
  p_q text default null, p_cuenta_id bigint default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_estado text := coalesce(nullif(btrim(p_estado), ''), 'todos');
  v_tipo   text := nullif(nullif(btrim(p_tipo), ''), 'todos');
  v_q      text := nullif(btrim(p_q), '');
  v_qn     text;
  v_num    int;
  v_cod    text;
  v_lim    int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off    int := greatest(coalesce(p_offset, 0), 0);
  v_total  bigint;
  v_items  jsonb;
begin
  if v_estado not in ('todos', 'borrador', 'confirmado', 'anulado') then
    raise exception 'ESTADO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'estado', 'estado', p_estado)::text;
  end if;
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO' using errcode = 'P0001', detail = json_build_object('desde', p_desde, 'hasta', p_hasta)::text;
  end if;
  if p_cuenta_id is not null then
    select codigo into v_cod from public.cont_cuentas where id = p_cuenta_id;
    if v_cod is null then
      raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_id', 'id', p_cuenta_id)::text;
    end if;
  end if;
  if v_q is not null then
    v_qn := public.norm_txt(v_q);
    if v_q ~ '^[0-9]{1,9}$' then v_num := v_q::int; end if;
  end if;

  with base as (
    select a.id, a.fecha
      from public.cont_asientos a
     where (p_desde is null or a.fecha >= p_desde)
       and (p_hasta is null or a.fecha <= p_hasta)
       and (v_estado = 'todos' or a.estado = v_estado)
       and (v_tipo is null or a.tipo = v_tipo)
       and (v_q is null or (v_num is not null and a.numero = v_num) or public.norm_txt(a.glosa) like '%' || v_qn || '%')
       and (v_cod is null or exists (
             select 1 from public.cont_asiento_lineas l join public.cont_cuentas c on c.id = l.cuenta_id
              where l.asiento_id = a.id and (c.codigo = v_cod or c.codigo like v_cod || '.%'))))
  select (select count(*) from base),
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', a.id, 'fecha', a.fecha, 'numero', a.numero, 'tipo', a.tipo, 'estado', a.estado,
                   'glosa', a.glosa, 'total', a.total,
                   'cant_lineas', (select count(*) from public.cont_asiento_lineas l where l.asiento_id = a.id),
                   'periodo_id', a.periodo_id, 'periodo_estado', p.estado,
                   'revierte_id', a.revierte_id, 'revertido_por_id', a.revertido_por_id,
                   'created_by_nombre', pr.nombre, 'created_at', a.created_at)
                 order by a.fecha desc, a.id desc), '[]'::jsonb)
            from (select id from base order by fecha desc, id desc limit v_lim offset v_off) x
            join public.cont_asientos a on a.id = x.id
            join public.cont_periodos p on p.id = a.periodo_id
            left join public.profiles pr on pr.id = a.created_by)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;

-- ── 2) Libro diario (solo confirmados, nunca parte un asiento) ─────────
create or replace function public.cont_libro_diario(p_desde date, p_hasta date, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_lim   int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   int := greatest(coalesce(p_offset, 0), 0);
  v_n     bigint;
  v_debe  numeric(14,2);
  v_haber numeric(14,2);
  v_items jsonb;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'FECHA_REQUERIDA' using errcode = 'P0001',
      detail = json_build_object('campo', case when p_desde is null then 'desde' else 'hasta' end)::text;
  end if;
  if p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO' using errcode = 'P0001', detail = json_build_object('desde', p_desde, 'hasta', p_hasta)::text;
  end if;

  select count(*) into v_n
    from public.cont_asientos a
   where a.estado = 'confirmado' and a.fecha between p_desde and p_hasta;
  select coalesce(sum(l.debe), 0), coalesce(sum(l.haber), 0) into v_debe, v_haber
    from public.cont_asiento_lineas l join public.cont_asientos a on a.id = l.asiento_id
   where a.estado = 'confirmado' and a.fecha between p_desde and p_hasta;

  select coalesce(jsonb_agg(public._cont_asiento_json(x.id) order by x.fecha, x.numero nulls last, x.id), '[]'::jsonb)
    into v_items
    from (select a.id, a.fecha, a.numero
            from public.cont_asientos a
           where a.estado = 'confirmado' and a.fecha between p_desde and p_hasta
           order by a.fecha, a.numero nulls last, a.id
           limit v_lim offset v_off) x;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'total_asientos', v_n,
                            'total_debe', v_debe, 'total_haber', v_haber, 'items', v_items);
end $$;

-- ── 3) Mayor de una cuenta (o de un título: suma sus descendientes) ────
create or replace function public.cont_mayor(
  p_cuenta_id bigint, p_desde date, p_hasta date, p_obra_cod text default null, p_aux_id bigint default null,
  p_limit int default 500, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eje    public.cont_ejercicios%rowtype;
  v_c      public.cont_cuentas%rowtype;
  v_obra   text := nullif(btrim(p_obra_cod), '');
  v_lim    int := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_off    int := greatest(coalesce(p_offset, 0), 0);
  v_sa     numeric(14,2);
  v_debe   numeric(14,2);
  v_haber  numeric(14,2);
  v_n      bigint;
  v_items  jsonb;
begin
  v_eje := public._cont_rango_ejercicio(p_desde, p_hasta);
  select * into v_c from public.cont_cuentas where id = p_cuenta_id;
  if not found then
    raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta_id', 'id', p_cuenta_id)::text;
  end if;
  if p_aux_id is not null and v_c.auxiliar = 'none' then
    raise exception 'AUXILIAR_NO_CORRESPONDE' using errcode = 'P0001', detail = json_build_object('campo', 'aux_id', 'cuenta_id', p_cuenta_id)::text;
  end if;

  select coalesce(sum(l.debe - l.haber), 0) into v_sa
    from public.cont_asiento_lineas l
    join public.cont_asientos a on a.id = l.asiento_id
    join public.cont_cuentas c on c.id = l.cuenta_id
   where a.estado = 'confirmado'
     and a.fecha >= v_eje.desde and a.fecha < p_desde
     and (c.id = v_c.id or c.codigo like v_c.codigo || '.%')
     and (v_obra is null or l.obra_cod = v_obra)
     and (p_aux_id is null or case v_c.auxiliar when 'cliente'   then l.aux_cliente_id = p_aux_id
                                                when 'proveedor' then l.aux_proveedor_id = p_aux_id
                                                when 'tesoreria' then l.aux_tesoreria_id = p_aux_id end);

  with movs as (
    select row_number() over w as rn, l.id as linea_id, a.id as asiento_id, a.numero, a.fecha, a.tipo,
           a.glosa as glosa_asiento, l.glosa, l.cuenta_id, c.codigo as cuenta_codigo,
           l.debe, l.haber, (v_sa + sum(l.debe - l.haber) over w)::numeric(14,2) as saldo,
           l.obra_cod,
           case when l.aux_cliente_id is not null then 'cliente'
                when l.aux_proveedor_id is not null then 'proveedor'
                when l.aux_tesoreria_id is not null then 'tesoreria'
                else c.auxiliar end as aux_tipo,
           coalesce(l.aux_cliente_id, l.aux_proveedor_id, l.aux_tesoreria_id) as aux_id,
           coalesce(vc.razon_social, pp.razon_social, tc.nombre) as aux_nombre
      from public.cont_asiento_lineas l
      join public.cont_asientos a on a.id = l.asiento_id
      join public.cont_cuentas c on c.id = l.cuenta_id
      left join public.ventas_clientes vc on vc.id = l.aux_cliente_id
      left join public.pagos_proveedores pp on pp.id = l.aux_proveedor_id
      left join public.tesoreria_cuentas tc on tc.id = l.aux_tesoreria_id
     where a.estado = 'confirmado'
       and a.fecha between p_desde and p_hasta
       and (c.id = v_c.id or c.codigo like v_c.codigo || '.%')
       and (v_obra is null or l.obra_cod = v_obra)
       and (p_aux_id is null or case v_c.auxiliar when 'cliente'   then l.aux_cliente_id = p_aux_id
                                                  when 'proveedor' then l.aux_proveedor_id = p_aux_id
                                                  when 'tesoreria' then l.aux_tesoreria_id = p_aux_id end)
    window w as (order by a.fecha, a.numero nulls last, a.id, l.orden, l.id
                 rows between unbounded preceding and current row))
  select count(*), coalesce(sum(debe), 0), coalesce(sum(haber), 0),
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'linea_id', m.linea_id, 'asiento_id', m.asiento_id, 'numero', m.numero, 'fecha', m.fecha, 'tipo', m.tipo,
                   'glosa_asiento', m.glosa_asiento, 'glosa', m.glosa, 'cuenta_id', m.cuenta_id, 'cuenta_codigo', m.cuenta_codigo,
                   'debe', m.debe, 'haber', m.haber, 'saldo', m.saldo, 'obra_cod', m.obra_cod,
                   'aux_tipo', m.aux_tipo, 'aux_id', m.aux_id, 'aux_nombre', m.aux_nombre) order by m.rn), '[]'::jsonb)
            from (select * from movs order by rn limit v_lim offset v_off) m)
    into v_n, v_debe, v_haber, v_items
    from movs;

  return jsonb_build_object(
    'cuenta', jsonb_build_object('id', v_c.id, 'codigo', v_c.codigo, 'nombre', v_c.nombre, 'rubro', v_c.rubro,
                                 'naturaleza', public._cont_naturaleza(v_c.rubro), 'imputable', v_c.imputable,
                                 'auxiliar', v_c.auxiliar),
    'desde', p_desde, 'hasta', p_hasta,
    'saldo_anterior', v_sa, 'total_debe', v_debe, 'total_haber', v_haber,
    'saldo_final', v_sa + v_debe - v_haber,
    'total_movimientos', v_n, 'items', v_items);
end $$;

-- ── 4) Sumas y saldos ──────────────────────────────────────────────────
create or replace function public.cont_sumas_saldos(p_desde date, p_hasta date, p_nivel smallint default null,
                                                    p_incluir_sin_movimiento boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eje    public.cont_ejercicios%rowtype;
  v_tot    jsonb;
  v_items  jsonb;
begin
  v_eje := public._cont_rango_ejercicio(p_desde, p_hasta);

  with mov as (
    select l.cuenta_id,
           sum(case when a.fecha <  p_desde then l.debe - l.haber else 0 end) as sa,
           sum(case when a.fecha >= p_desde then l.debe  else 0 end)          as d,
           sum(case when a.fecha >= p_desde then l.haber else 0 end)          as h
      from public.cont_asiento_lineas l
      join public.cont_asientos a on a.id = l.asiento_id
     where a.estado = 'confirmado' and a.fecha between v_eje.desde and p_hasta
     group by l.cuenta_id),
  hoja as (
    -- Una fila por cuenta con movimiento (las líneas solo van a imputables).
    select c.codigo, m.sa, m.d, m.h, (m.sa + m.d - m.h) as s
      from mov m join public.cont_cuentas c on c.id = m.cuenta_id),
  arbol as (
    select c.id, c.codigo, c.codigo_orden, c.nombre, c.nivel, c.rubro, c.imputable, c.padre_id, c.activo,
           coalesce(x.sa, 0)::numeric(14,2) as sa, coalesce(x.d, 0)::numeric(14,2) as d, coalesce(x.h, 0)::numeric(14,2) as h,
           x.n
      from public.cont_cuentas c
      left join lateral (
        select sum(h.sa) as sa, sum(h.d) as d, sum(h.h) as h, count(*) as n
          from hoja h
         where h.codigo = c.codigo or h.codigo like c.codigo || '.%') x on true)
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', t.id, 'codigo', t.codigo, 'nombre', t.nombre, 'nivel', t.nivel, 'rubro', t.rubro,
           'imputable', t.imputable, 'padre_id', t.padre_id,
           'saldo_anterior', t.sa, 'debe', t.d, 'haber', t.h, 'saldo', t.sa + t.d - t.h,
           'saldo_deudor', greatest(t.sa + t.d - t.h, 0), 'saldo_acreedor', greatest(-(t.sa + t.d - t.h), 0))
         order by t.codigo_orden), '[]'::jsonb)
    into v_items
    from arbol t
   where (p_nivel is null or t.nivel <= p_nivel)
     and (coalesce(t.n, 0) > 0 or (coalesce(p_incluir_sin_movimiento, false) and t.activo));

  -- Totales: SOLO imputables (sumar títulos contaría dos veces).
  with mov as (
    select l.cuenta_id,
           sum(case when a.fecha <  p_desde then l.debe - l.haber else 0 end) as sa,
           sum(case when a.fecha >= p_desde then l.debe  else 0 end)          as d,
           sum(case when a.fecha >= p_desde then l.haber else 0 end)          as h
      from public.cont_asiento_lineas l
      join public.cont_asientos a on a.id = l.asiento_id
     where a.estado = 'confirmado' and a.fecha between v_eje.desde and p_hasta
     group by l.cuenta_id)
  select jsonb_build_object(
           'saldo_anterior', coalesce(sum(m.sa), 0)::numeric(14,2),
           'debe',           coalesce(sum(m.d), 0)::numeric(14,2),
           'haber',          coalesce(sum(m.h), 0)::numeric(14,2),
           'saldo_deudor',   coalesce(sum(greatest(m.sa + m.d - m.h, 0)), 0)::numeric(14,2),
           'saldo_acreedor', coalesce(sum(greatest(-(m.sa + m.d - m.h), 0)), 0)::numeric(14,2))
    into v_tot
    from mov m join public.cont_cuentas c on c.id = m.cuenta_id
   where c.imputable;

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'cuadra', abs((v_tot ->> 'debe')::numeric - (v_tot ->> 'haber')::numeric) < 0.005
              and abs((v_tot ->> 'saldo_deudor')::numeric - (v_tot ->> 'saldo_acreedor')::numeric) < 0.005,
    'totales', v_tot,
    'items', v_items);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_rango_ejercicio(date, date)',
    'cont_listar_asientos(date, date, text, text, text, bigint, integer, integer)',
    'cont_libro_diario(date, date, integer, integer)',
    'cont_mayor(bigint, date, date, text, bigint, integer, integer)',
    'cont_sumas_saldos(date, date, smallint, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
