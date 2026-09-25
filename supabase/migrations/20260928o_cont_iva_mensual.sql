-- =====================================================================
-- 20260928o — Contabilidad: asiento mensual de IVA (DDJJ) (2026-09-24)
--
-- Por qué: sin este asiento las cuentas de IVA (débito, crédito,
-- percepciones y retenciones) acumulan saldo mes tras mes y el balance
-- arrastra basura. El asiento del mes CANCELA los saldos del MAYOR del
-- período y deja la posición en IVA a pagar o en saldo a favor.
--
--   · Trabaja por CUENTAS distintas, no por clave de mapeo: en producción
--     percepciones de IVA (compras.tributo) y retenciones de IVA
--     (cobros.retencion) van a la MISMA cuenta. Roles: débito
--     (ventas.iva_df), crédito (compras.iva_cf) y pagos a cuenta
--     (percepcion_iva | iva). Si una cuenta cae en dos roles gana el primero
--     y se avisa CUENTA_EN_DOS_ROLES.
--   · El mayor manda; la posición FISCAL (los libros, calculada en el
--     backend) es el CONTROL: si difiere, 409 IVA_DIFIERE_DE_LIBROS, que se
--     puede forzar a sabiendas (queda `forzado`).
--   · Arrastre de saldos a favor del mes anterior: cont_config
--     iva_ddjj_arrastre (apagado por default, P-I1).
--   · Un asiento vigente por período (índice parcial). tipo 'ajuste',
--     origen_tabla 'cont_iva_mensual', origen_evento 'ddjj': el lote de
--     automáticos NO lo toma (solo mira 'registro') y cont_guardar_asiento /
--     cont_anular_asiento lo rechazan (tiene origen); se regenera o anula
--     solo desde acá. Si después se contabiliza algo del mes, el hash lo
--     marca desactualizado (el backend frena el cierre, forzable).
--
-- Flag `contabilizar` para generar/anular. Grants solo service_role.
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

-- ── 1) Tabla ───────────────────────────────────────────────────────────
create table public.cont_iva_mensual (
  id                    bigserial primary key,
  periodo_id            bigint not null references public.cont_periodos(id),
  estado                text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  debito_fiscal         numeric(14,2) not null,
  credito_fiscal        numeric(14,2) not null,
  pagos_a_cuenta        numeric(14,2) not null,
  determinado           numeric(14,2) not null,
  arrastre_tecnico      numeric(14,2) not null default 0,
  arrastre_libre        numeric(14,2) not null default 0,
  a_pagar               numeric(14,2) not null default 0,
  saldo_tecnico         numeric(14,2) not null default 0,
  libre_disponibilidad  numeric(14,2) not null default 0,
  cuentas               jsonb not null,
  fiscal                jsonb,
  diferencias           jsonb not null default '[]'::jsonb,
  forzado               boolean not null default false,
  asiento_id            bigint references public.cont_asientos(id),
  motivo_anulacion      text,
  anulado_por           uuid,
  anulado_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,
  constraint cont_iva_mensual_anulado_chk check (estado = 'vigente' or (motivo_anulacion is not null and anulado_at is not null))
);
create unique index cont_iva_mensual_vigente_uidx on public.cont_iva_mensual (periodo_id) where estado = 'vigente';
create index cont_iva_mensual_asiento_idx on public.cont_iva_mensual (asiento_id) where asiento_id is not null;

comment on table public.cont_iva_mensual is
  'Asiento mensual de IVA (posición del mes): una fila vigente por período con la foto del cálculo (mayor), la posición fiscal que mandó el backend y las diferencias. El asiento es tipo ajuste, origen cont_iva_mensual/ddjj. 20260928o.';

-- ── 2) Cálculo (única fuente) ──────────────────────────────────────────
create or replace function public._cont_mes_txt(p_fecha date)
returns text language sql immutable set search_path = public, pg_temp as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                'septiembre','octubre','noviembre','diciembre'])[extract(month from p_fecha)::int]
         || ' ' || extract(year from p_fecha)::int
$$;

create or replace function public._cont_iva_calculo(p_periodo_id bigint, p_arrastre boolean)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  per      public.cont_periodos%rowtype;
  eje      public.cont_ejercicios%rowtype;
  p        jsonb;
  g        text;
  r        record;
  v_cuentas jsonb := '[]'::jsonb;
  v_avisos  jsonb := '[]'::jsonb;
  v_df     numeric(14,2) := 0;
  v_cf     numeric(14,2) := 0;
  v_pc     numeric(14,2) := 0;
  v_det    numeric(14,2);
  v_tec_c  bigint;
  v_lib_c  bigint;
  v_tec_a  numeric(14,2) := 0;
  v_lib_a  numeric(14,2) := 0;
  v_tec_u  numeric(14,2);
  v_x      numeric(14,2);
  v_lib_u  numeric(14,2);
  v_apag   numeric(14,2);
  v_stec   numeric(14,2);
  v_lnue   numeric(14,2);
  v_lin    jsonb;
begin
  select * into per from public.cont_periodos where id = p_periodo_id;
  if not found then
    raise exception 'PERIODO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  select * into eje from public.cont_ejercicios where id = per.ejercicio_id;
  g := 'IVA ' || public._cont_mes_txt(per.desde);
  p := public._cont_prop_nueva('cont_iva_mensual', p_periodo_id, true, per.hasta, 'Posición de IVA de ' || public._cont_mes_txt(per.desde));

  if not exists (select 1 from public.cont_mapeos where clave = 'ventas.iva_df') then
    p := public._cont_prop_motivo(p, 'SIN_MAPEO', jsonb_build_object('clave', 'ventas.iva_df', 'subclave', ''));
  end if;
  if not exists (select 1 from public.cont_mapeos where clave = 'compras.iva_cf') then
    p := public._cont_prop_motivo(p, 'SIN_MAPEO', jsonb_build_object('clave', 'compras.iva_cf', 'subclave', ''));
  end if;

  -- 1) Cuentas por rol (distintas) y su saldo del mes (sin apertura/cierre
  --    ni el propio asiento de IVA).
  for r in
    with m as (
      select distinct cuenta_id, 'debito'::text as rol, 1 as ord from public.cont_mapeos where clave = 'ventas.iva_df'
      union
      select distinct cuenta_id, 'credito', 2 from public.cont_mapeos where clave = 'compras.iva_cf'
      union
      select distinct cuenta_id, 'pagos_a_cuenta', 3 from public.cont_mapeos
       where (clave = 'compras.tributo' and split_part(subclave, '|', 1) = 'percepcion_iva')
          or (clave = 'cobros.retencion' and split_part(subclave, '|', 1) = 'iva')
    ),
    roles as (
      select distinct on (cuenta_id) cuenta_id, rol, ord, count(*) over (partition by cuenta_id) as n_roles
        from (select distinct cuenta_id, rol, ord from m) q
       order by cuenta_id, ord
    )
    select ro.cuenta_id, ro.rol, ro.ord, ro.n_roles, c.codigo, c.nombre, c.codigo_orden,
           coalesce(s.debe, 0)::numeric(14,2) as debe, coalesce(s.haber, 0)::numeric(14,2) as haber,
           (coalesce(s.debe, 0) - coalesce(s.haber, 0))::numeric(14,2) as saldo
      from roles ro
      join public.cont_cuentas c on c.id = ro.cuenta_id
      left join lateral (
        select sum(l.debe) as debe, sum(l.haber) as haber
          from public.cont_asiento_lineas l
          join public.cont_asientos a on a.id = l.asiento_id
         where l.cuenta_id = ro.cuenta_id and a.estado = 'confirmado'
           and a.fecha between per.desde and per.hasta
           and a.tipo not in ('apertura', 'cierre')
           and coalesce(a.origen_tabla, '') <> 'cont_iva_mensual') s on true
     order by ro.ord, c.codigo_orden
  loop
    if r.n_roles > 1 and not (v_avisos ? 'CUENTA_EN_DOS_ROLES') then
      v_avisos := v_avisos || to_jsonb('CUENTA_EN_DOS_ROLES'::text);
    end if;
    v_cuentas := v_cuentas || jsonb_build_object('cuenta_id', r.cuenta_id, 'codigo', r.codigo, 'nombre', r.nombre,
                                                 'rol', r.rol, 'debe', r.debe, 'haber', r.haber, 'saldo', r.saldo);
    if r.rol = 'debito' then
      v_df := v_df - r.saldo;
      p := public._cont_prop_linea(p, null, null, true, -r.saldo, null, null, null, g, r.cuenta_id);
    elsif r.rol = 'credito' then
      v_cf := v_cf + r.saldo;
      p := public._cont_prop_linea(p, null, null, false, r.saldo, null, null, null, g, r.cuenta_id);
    else
      v_pc := v_pc + r.saldo;
      p := public._cont_prop_linea(p, null, null, false, r.saldo, null, null, null, g, r.cuenta_id);
    end if;
  end loop;
  v_det := v_df - v_cf;

  -- 2) Arrastre de saldos a favor (saldo acumulado del ejercicio, apertura
  --    incluida, hasta el día anterior al mes).
  if coalesce(p_arrastre, false) then
    v_tec_c := public._cont_cuenta_mapeada('iva.ddjj', array['saldo_a_favor']);
    v_lib_c := public._cont_cuenta_mapeada('iva.ddjj', array['libre_disponibilidad', 'saldo_a_favor']);
    if v_tec_c is not null then
      select greatest(coalesce(sum(l.debe - l.haber), 0), 0) into v_tec_a
        from public.cont_asiento_lineas l join public.cont_asientos a on a.id = l.asiento_id
       where l.cuenta_id = v_tec_c and a.estado = 'confirmado' and a.fecha between eje.desde and per.desde - 1;
    end if;
    if v_lib_c is not null and v_lib_c is distinct from v_tec_c then
      select greatest(coalesce(sum(l.debe - l.haber), 0), 0) into v_lib_a
        from public.cont_asiento_lineas l join public.cont_asientos a on a.id = l.asiento_id
       where l.cuenta_id = v_lib_c and a.estado = 'confirmado' and a.fecha between eje.desde and per.desde - 1;
    end if;
  end if;

  v_tec_u := least(v_tec_a, greatest(v_det, 0));
  v_x     := greatest(v_det - v_tec_u, 0);
  v_lib_u := least(v_lib_a, greatest(v_x - v_pc, 0));
  v_apag  := greatest(v_x - v_pc - v_lib_u, 0);
  v_stec  := greatest(-v_det, 0);
  v_lnue  := case when v_det < 0 then v_pc else greatest(v_pc - v_x, 0) end;

  -- 3) Contrapartidas (SIN_MAPEO iva.ddjj solo si hacen falta).
  p := public._cont_prop_linea(p, 'iva.ddjj', array['saldo_a_favor'], true, v_stec, null, null, null, g);
  p := public._cont_prop_linea(p, 'iva.ddjj', array['saldo_a_favor'], false, v_tec_u, null, null, null, g);
  p := public._cont_prop_linea(p, 'iva.ddjj', array['libre_disponibilidad', 'saldo_a_favor'], true, v_lnue, null, null, null, g);
  p := public._cont_prop_linea(p, 'iva.ddjj', array['libre_disponibilidad', 'saldo_a_favor'], false, v_lib_u, null, null, null, g);
  p := public._cont_prop_linea(p, 'iva.ddjj', array['a_pagar'], false, v_apag, null, null, null, g);
  p := public._cont_prop_cerrar(p);

  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', (e ->> 'cuenta_id')::bigint, 'cuenta_codigo', c.codigo, 'cuenta_nombre', c.nombre,
           'debe', (e ->> 'debe')::numeric, 'haber', (e ->> 'haber')::numeric,
           'aux_tipo', null, 'aux_id', null, 'aux_nombre', null,
           'obra_cod', null, 'obra_nom', null, 'glosa', e ->> 'glosa') order by n), '[]'::jsonb)
    into v_lin
    from jsonb_array_elements(p -> 'lineas') with ordinality as t(e, n)
    join public.cont_cuentas c on c.id = (e ->> 'cuenta_id')::bigint;

  return jsonb_build_object(
    'periodo_id', per.id, 'desde', per.desde, 'hasta', per.hasta, 'fecha', per.hasta,
    'glosa', p ->> 'glosa', 'arrastre', coalesce(p_arrastre, false),
    'cuentas', v_cuentas,
    'debito_fiscal', v_df, 'credito_fiscal', v_cf, 'pagos_a_cuenta', v_pc, 'determinado', v_det,
    'arrastre_tecnico', v_tec_u, 'arrastre_libre', v_lib_u,
    'a_pagar', v_apag, 'saldo_tecnico', v_stec, 'libre_disponibilidad', v_lnue,
    'lineas', v_lin, 'motivos', p -> 'motivos', 'avisos', v_avisos,
    'hash', public._cont_hash(p),
    '_prop', p);
end $$;

comment on function public._cont_iva_calculo(bigint, boolean) is
  'Posición de IVA del período según el MAYOR y la propuesta de asiento que cancela las cuentas de IVA. Única fuente del cálculo (posición, generar, estados). `_prop` es interno. 20260928o.';

-- ── 3) Posición (lectura) ──────────────────────────────────────────────
create or replace function public.cont_iva_posicion(p_periodo_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_c    jsonb := public._cont_iva_calculo(p_periodo_id,
                    coalesce((public._cont_cfg('iva_ddjj_arrastre') #>> '{}')::boolean, false));
  f      public.cont_iva_mensual%rowtype;
  v_hash text;
  v_pest text;
  v_est  text;
begin
  select * into f from public.cont_iva_mensual where periodo_id = p_periodo_id and estado = 'vigente';
  select estado into v_pest from public.cont_periodos where id = p_periodo_id;
  if f.id is not null then
    select origen_hash into v_hash from public.cont_asientos where id = f.asiento_id;
    v_est := case when v_hash = v_c ->> 'hash' then 'al_dia' else 'desactualizado' end;
  elsif (v_c ->> 'debito_fiscal')::numeric = 0 and (v_c ->> 'credito_fiscal')::numeric = 0
        and (v_c ->> 'pagos_a_cuenta')::numeric = 0 and (v_c ->> 'arrastre_tecnico')::numeric = 0
        and (v_c ->> 'arrastre_libre')::numeric = 0 then
    v_est := 'sin_movimientos';
  else
    v_est := 'sin_generar';
  end if;

  return (v_c - '_prop') || jsonb_build_object(
    'estado', v_est,
    'periodo_estado', v_pest,
    'registro', case when f.id is not null then jsonb_build_object(
                  'id', f.id, 'forzado', f.forzado, 'created_at', f.created_at, 'updated_at', f.updated_at,
                  'created_by_nombre', (select nombre from public.profiles where id = f.created_by),
                  'asiento_id', f.asiento_id, 'fiscal', f.fiscal, 'diferencias', f.diferencias,
                  'a_pagar', f.a_pagar, 'saldo_tecnico', f.saldo_tecnico, 'libre_disponibilidad', f.libre_disponibilidad) end,
    'asiento', case when f.asiento_id is not null then public._cont_asiento_json(f.asiento_id) end);
end $$;

-- Diferencias mayor vs libros (misma regla que el backend, tolerancia $0,05).
create or replace function public._cont_iva_diferencias(p_calc jsonb, p_fiscal jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('componente', x.comp, 'contable', x.cont, 'fiscal', x.fisc,
                                               'diferencia', round(x.cont - x.fisc, 2)) order by x.ord), '[]'::jsonb)
    from (
      select 1 as ord, 'debito' as comp, (p_calc ->> 'debito_fiscal')::numeric as cont,
             coalesce((p_fiscal ->> 'debito_fiscal')::numeric, 0) as fisc
      union all
      select 2, 'credito', (p_calc ->> 'credito_fiscal')::numeric, coalesce((p_fiscal ->> 'credito_fiscal')::numeric, 0)
      union all
      select 3, 'pagos_a_cuenta', (p_calc ->> 'pagos_a_cuenta')::numeric,
             coalesce((p_fiscal ->> 'percepciones_iva')::numeric, 0) + coalesce((p_fiscal ->> 'retenciones_iva')::numeric, 0)
      union all
      select 4, 'excluidos', 0::numeric,
             coalesce((p_fiscal ->> 'excluidos_ventas')::numeric, 0) + coalesce((p_fiscal ->> 'excluidos_compras')::numeric, 0)
    ) x
   where p_fiscal is not null and jsonb_typeof(p_fiscal) = 'object'
     and ((x.comp <> 'excluidos' and abs(x.cont - x.fisc) > 0.05) or (x.comp = 'excluidos' and x.fisc > 0))
$$;

-- ── 4) Generar / regenerar ─────────────────────────────────────────────
create or replace function public.cont_iva_generar(p_periodo_id bigint, p_fiscal jsonb, p_forzar boolean, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  per    public.cont_periodos%rowtype;
  v_c    jsonb;
  v_p    jsonb;
  v_dif  jsonb;
  f      public.cont_iva_mensual%rowtype;
  v_hash text;
  v_lin  jsonb;
  v_tot  numeric(14,2);
  v_aid  bigint;
  v_acc  text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'contabilizar') then
    raise exception 'SIN_PERMISO_CONTABILIZAR' using errcode = 'P0001';
  end if;
  select * into per from public.cont_periodos where id = p_periodo_id;
  if not found then
    raise exception 'PERIODO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  perform public._cont_lock_periodo_abierto(per.hasta);
  perform pg_advisory_xact_lock(hashtext('cont_iva_' || p_periodo_id));

  v_c := public._cont_iva_calculo(p_periodo_id, coalesce((public._cont_cfg('iva_ddjj_arrastre') #>> '{}')::boolean, false));
  v_p := v_c -> '_prop';
  if jsonb_array_length(v_c -> 'motivos') > 0 then
    raise exception 'IVA_SIN_MAPEO' using errcode = 'P0001',
      detail = json_build_object('periodo_id', p_periodo_id, 'motivos', v_c -> 'motivos')::text;
  end if;
  if jsonb_array_length(v_p -> 'lineas') = 0 then
    raise exception 'IVA_SIN_MOVIMIENTOS' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  v_dif := public._cont_iva_diferencias(v_c, p_fiscal);
  if jsonb_array_length(v_dif) > 0 and not coalesce(p_forzar, false) then
    raise exception 'IVA_DIFIERE_DE_LIBROS' using errcode = 'P0001',
      detail = json_build_object('periodo_id', p_periodo_id, 'diferencias', v_dif)::text;
  end if;

  select * into f from public.cont_iva_mensual where periodo_id = p_periodo_id and estado = 'vigente' for update;
  if f.id is not null then
    select origen_hash into v_hash from public.cont_asientos where id = f.asiento_id;
    if v_hash = v_c ->> 'hash' then
      return jsonb_build_object('accion', 'sin_cambios', 'posicion', public.cont_iva_posicion(p_periodo_id));
    end if;
  end if;

  perform set_config('cadinc.cont_rpc', 'on', true);
  v_lin := public._cont_validar_lineas(public._cont_lineas_de_prop(v_p), true);
  select coalesce(sum((e ->> 'debe')::numeric), 0) into v_tot from jsonb_array_elements(v_lin) e;

  if f.id is not null and f.asiento_id is not null
     and exists (select 1 from public.cont_asientos a where a.id = f.asiento_id and a.estado = 'confirmado') then
    delete from public.cont_asiento_lineas where asiento_id = f.asiento_id;
    update public.cont_asientos
       set fecha = per.hasta, glosa = left(v_p ->> 'glosa', 500), total = v_tot, origen_hash = v_c ->> 'hash',
           updated_by = p_user_id
     where id = f.asiento_id;
    perform public._cont_insertar_lineas(f.asiento_id, v_lin);
    v_aid := f.asiento_id;
    v_acc := 'regenerado';
  else
    if f.id is null then
      insert into public.cont_iva_mensual (periodo_id, debito_fiscal, credito_fiscal, pagos_a_cuenta, determinado, cuentas,
                                           created_by, updated_by)
      values (p_periodo_id, 0, 0, 0, 0, '[]'::jsonb, p_user_id, p_user_id)
      returning * into f;
    end if;
    insert into public.cont_asientos (fecha, tipo, estado, glosa, total, origen_tabla, origen_id, origen_evento, origen_hash,
                                      confirmado_por, confirmado_at, created_by, updated_by)
    values (per.hasta, 'ajuste', 'confirmado', left(v_p ->> 'glosa', 500), v_tot,
            'cont_iva_mensual', f.id, 'ddjj', v_c ->> 'hash', p_user_id, now(), p_user_id, p_user_id)
    returning id into v_aid;
    perform public._cont_insertar_lineas(v_aid, v_lin);
    v_acc := case when f.asiento_id is null then 'creado' else 'regenerado' end;
  end if;

  update public.cont_iva_mensual
     set debito_fiscal = (v_c ->> 'debito_fiscal')::numeric, credito_fiscal = (v_c ->> 'credito_fiscal')::numeric,
         pagos_a_cuenta = (v_c ->> 'pagos_a_cuenta')::numeric, determinado = (v_c ->> 'determinado')::numeric,
         arrastre_tecnico = (v_c ->> 'arrastre_tecnico')::numeric, arrastre_libre = (v_c ->> 'arrastre_libre')::numeric,
         a_pagar = (v_c ->> 'a_pagar')::numeric, saldo_tecnico = (v_c ->> 'saldo_tecnico')::numeric,
         libre_disponibilidad = (v_c ->> 'libre_disponibilidad')::numeric,
         cuentas = v_c -> 'cuentas', fiscal = p_fiscal, diferencias = v_dif,
         forzado = coalesce(p_forzar, false) and jsonb_array_length(v_dif) > 0,
         asiento_id = v_aid, updated_by = p_user_id
   where id = f.id;

  -- La partida doble es diferida: se chequea acá para que el error sea de esta RPC.
  set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas immediate;
  set constraints public.trg_cont_partida_doble_asiento, public.trg_cont_partida_doble_lineas deferred;

  return jsonb_build_object('accion', v_acc, 'posicion', public.cont_iva_posicion(p_periodo_id));
end $$;

-- ── 5) Anular ──────────────────────────────────────────────────────────
create or replace function public.cont_iva_anular(p_periodo_id bigint, p_motivo text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  per public.cont_periodos%rowtype;
  f   public.cont_iva_mensual%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'contabilizar') then
    raise exception 'SIN_PERMISO_CONTABILIZAR' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  select * into per from public.cont_periodos where id = p_periodo_id;
  if not found then
    raise exception 'PERIODO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  perform public._cont_lock_periodo_abierto(per.hasta);
  perform pg_advisory_xact_lock(hashtext('cont_iva_' || p_periodo_id));
  select * into f from public.cont_iva_mensual where periodo_id = p_periodo_id and estado = 'vigente' for update;
  if not found then
    raise exception 'IVA_NO_GENERADO' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;

  perform set_config('cadinc.cont_rpc', 'on', true);
  if f.asiento_id is not null then
    update public.cont_asientos
       set estado = 'anulado', motivo_anulacion = left('DDJJ de IVA anulada: ' || btrim(p_motivo), 500),
           anulado_por = p_user_id, anulado_at = now(), updated_by = p_user_id
     where id = f.asiento_id and estado <> 'anulado';
  end if;
  update public.cont_iva_mensual
     set estado = 'anulado', motivo_anulacion = left(btrim(p_motivo), 500), anulado_por = p_user_id, anulado_at = now(),
         updated_by = p_user_id
   where id = f.id;
  return public.cont_iva_posicion(p_periodo_id);
end $$;

-- ── 6) Estados del ejercicio (columna «IVA» de Períodos) ───────────────
create or replace function public.cont_iva_estados(p_ejercicio_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'periodo_id', p.id, 'desde', p.desde, 'hasta', p.hasta, 'periodo_estado', p.estado,
           'estado', x.pos ->> 'estado',
           'a_pagar', (x.pos ->> 'a_pagar')::numeric, 'saldo_tecnico', (x.pos ->> 'saldo_tecnico')::numeric,
           'libre_disponibilidad', (x.pos ->> 'libre_disponibilidad')::numeric,
           'asiento_id', (x.pos -> 'asiento' ->> 'id')::bigint, 'asiento_numero', (x.pos -> 'asiento' ->> 'numero')::int)
         order by p.desde), '[]'::jsonb)
    from public.cont_periodos p
    cross join lateral (select public.cont_iva_posicion(p.id) - 'lineas' - 'cuentas' as pos) x
   where p.ejercicio_id = p_ejercicio_id
$$;

-- ── 7) «En uso» del mapeo iva.ddjj ─────────────────────────────────────
do $m$
declare v text;
begin
  v := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'fondos.concepto' then$a$,
$a$    when 'iva.ddjj' then
      select count(*) into v_n from public.cont_iva_mensual i where i.estado = 'vigente';
    when 'fondos.concepto' then$a$);
  execute v;
end $m$;

-- ── 8) Auditoría, RLS y grants ─────────────────────────────────────────
create trigger trg_cont_iva_mensual_touch before update on public.cont_iva_mensual
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.cont_iva_mensual
  for each row execute function public.audit_cambios('contabilidad', 'asiento de IVA', 'id');
create trigger trg_audit_borrado after delete on public.cont_iva_mensual
  for each row execute function public.audit_borrado('contabilidad', 'asiento de IVA', 'id');

alter table public.cont_iva_mensual enable row level security;
create policy cont_iva_mensual_all on public.cont_iva_mensual for all using (true) with check (true);
revoke all on table public.cont_iva_mensual from public, anon, authenticated;
grant all on table public.cont_iva_mensual to service_role;
revoke all on sequence public.cont_iva_mensual_id_seq from public, anon, authenticated;
grant usage, select on sequence public.cont_iva_mensual_id_seq to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_mes_txt(date)',
    '_cont_iva_calculo(bigint, boolean)',
    '_cont_iva_diferencias(jsonb, jsonb)',
    'cont_iva_posicion(bigint)',
    'cont_iva_generar(bigint, jsonb, boolean, uuid)',
    'cont_iva_anular(bigint, text, uuid)',
    'cont_iva_estados(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
