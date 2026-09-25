-- =====================================================================
-- 20260930k — Ventas › Cobranzas: gastos descontados en el cobro y carga de
-- la liquidación del cliente (Casilda) como cobro real (2026-09-25)
--
-- Casilda Combustibles vende los fletes de CADINC por cuenta y orden (CVLP,
-- 060) y días después paga con una «Liquidación»: los CVLP que cancela, lo
-- que DESCUENTA (Recupero Ley 25413, seguro de carga, pago de playa,
-- faltantes…) y los cheques. Hasta hoy el cobro no tenía dónde poner lo
-- descontado y los CVLP se marcaban «cobrada» con una nota.
--
-- 1) Catálogo `ventas_cobro_gasto_conceptos` (Ventas › Configuración, mismo
--    molde que los tipos de retención): nombre, sinónimos (`alias`, en
--    norm_txt: con ellos el lector de la liquidación reconoce el renglón),
--    activo, orden. Sin DELETE: se desactivan. RPCs
--    `ventas_cobro_gasto_conceptos_json` y `ventas_guardar_cobro_gasto_concepto`
--    (flag facturacion.configurar).
-- 2) `ventas_cobro_gastos`: renglones del cobro (concepto, importe, obs).
--    Se escriben sólo por la RPC (mismo guard que medios y retenciones).
-- 3) `ventas_cobros.total_gastos` y `liquidacion_numero` (+ índice único
--    por cliente y ambiente entre los vigentes: la misma liquidación no se
--    carga dos veces; anulado el cobro, se puede volver a cargar).
--    total = medios + retenciones + gastos.
-- 4) `ventas_cobro_medios.cheque_librador_cuit` (opcional, 11 dígitos) y el
--    adjunto `liquidacion`.
-- 5) Parches por ancla: `ventas_registrar_cobro` acepta `p_cobro -> 'gastos'`
--    y `p_cobro ->> 'liquidacion_numero'` (sin parámetro nuevo), y el CUIT
--    del librador en los medios; `_ventas_cobro_json` devuelve `gastos`;
--    `v_ventas_cobros` suma columnas; `ventas_estado_cuenta` muestra cada
--    gasto como un haber.
-- 6) Cartera de cheques (20260930f): el medio cheque de Ventas que ya está en
--    la cartera (vino de Logística) se VINCULA en vez de ignorarse, y al
--    anular el cobro sólo se borran los que nacieron en Ventas (los demás se
--    desvinculan). Lleva el CUIT del librador.
-- Anular: los gastos quedan como historia (igual que las retenciones); el
-- cobro anulado no cuenta en la cuenta corriente ni en Contabilidad.
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

-- ── 1) Catálogo ─────────────────────────────────────────────────────────
create table public.ventas_cobro_gasto_conceptos (
  id          bigserial primary key,
  nombre      text not null check (length(btrim(nombre)) between 2 and 80),
  alias       text[] not null default '{}',
  activo      boolean not null default true,
  orden       smallint not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
create unique index vcgc_nombre_uidx on public.ventas_cobro_gasto_conceptos (public.norm_txt(nombre));

comment on table public.ventas_cobro_gasto_conceptos is
  'Conceptos de gastos que el cliente descuenta al pagar (Ventas › Configuración). alias en norm_txt: con ellos se reconocen los renglones de una liquidación. Se escribe sólo por ventas_guardar_cobro_gasto_concepto(). Sin DELETE: se desactivan. 20260930k.';

insert into public.ventas_cobro_gasto_conceptos (nombre, alias, orden) values
  ('Recupero Ley 25413 (impuesto al cheque)', array['recupero ley 25413', 'ley 25413', 'impuesto al cheque'], 10),
  ('Seguro de carga',                          array['pago seguro de carga', 'seguro de carga'], 20),
  ('Pago de playa',                            array['pago de playa'], 30),
  ('Faltante de mercadería',                   array['faltante', 'falt kg'], 40);

create trigger trg_vcgc_touch before update on public.ventas_cobro_gasto_conceptos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_cobro_gasto_conceptos
  for each row execute function public.audit_cambios('facturacion', 'concepto de gasto de cobro', 'id');

alter table public.ventas_cobro_gasto_conceptos enable row level security;
create policy ventas_cobro_gasto_conceptos_all on public.ventas_cobro_gasto_conceptos for all using (true) with check (true);
revoke all on table public.ventas_cobro_gasto_conceptos from public, anon, authenticated;
grant all on table public.ventas_cobro_gasto_conceptos to service_role;
revoke all on sequence public.ventas_cobro_gasto_conceptos_id_seq from public, anon, authenticated;

-- ── 2) Renglones de gasto del cobro ─────────────────────────────────────
create table public.ventas_cobro_gastos (
  id          bigserial primary key,
  cobro_id    bigint not null references public.ventas_cobros(id),
  orden       smallint not null,
  concepto_id bigint not null references public.ventas_cobro_gasto_conceptos(id),
  importe     numeric(14,2) not null check (importe > 0),
  obs         text not null default '' check (length(obs) <= 300),
  created_at  timestamptz not null default now()
);
create unique index ventas_cobro_gastos_orden_uidx on public.ventas_cobro_gastos (cobro_id, orden);
create index ventas_cobro_gastos_concepto_idx on public.ventas_cobro_gastos (concepto_id);

comment on table public.ventas_cobro_gastos is
  'Gastos que el cliente descontó al pagar (Recupero Ley 25413, seguro de carga…): cuentan en el total del cobro (medios + retenciones + gastos). Sólo por ventas_registrar_cobro. 20260930k.';

create trigger trg_ventas_cobro_gastos_guard before insert or delete or update on public.ventas_cobro_gastos
  for each row execute function public.fn_ventas_cobros_guard();

alter table public.ventas_cobro_gastos enable row level security;
create policy ventas_cobro_gastos_all on public.ventas_cobro_gastos for all using (true) with check (true);
revoke all on table public.ventas_cobro_gastos from public, anon, authenticated;
grant all on table public.ventas_cobro_gastos to service_role;
revoke all on sequence public.ventas_cobro_gastos_id_seq from public, anon, authenticated;

-- ── 3) Cobro: total de gastos y número de liquidación ───────────────────
alter table public.ventas_cobros
  add column total_gastos numeric(14,2) not null default 0 check (total_gastos >= 0),
  add column liquidacion_numero text check (liquidacion_numero is null or liquidacion_numero ~ '^[0-9A-Za-z][0-9A-Za-z./ -]{0,29}$');
alter table public.ventas_cobros drop constraint ventas_cobros_total_chk;
alter table public.ventas_cobros add constraint ventas_cobros_total_chk
  check (total = total_medios + total_retenciones + total_gastos);
create unique index ventas_cobros_liquidacion_uidx on public.ventas_cobros (ambiente, cliente_id, upper(liquidacion_numero))
  where liquidacion_numero is not null and estado = 'vigente';
comment on column public.ventas_cobros.liquidacion_numero is
  'Número de la liquidación del cliente con que se cargó el cobro (Cargar liquidación). Único por cliente entre los vigentes. 20260930k.';

-- ── 4) Medios: CUIT del librador; adjunto «liquidación» ─────────────────
alter table public.ventas_cobro_medios
  add column cheque_librador_cuit text check (cheque_librador_cuit is null or cheque_librador_cuit ~ '^[0-9]{11}$');

alter table public.ventas_cobro_adjuntos drop constraint ventas_cobro_adjuntos_tipo_check;
alter table public.ventas_cobro_adjuntos add constraint ventas_cobro_adjuntos_tipo_check
  check (tipo = any (array['comprobante_pago', 'orden_pago', 'liquidacion', 'otro']::text[]));

-- ── 5) Parches por ancla ────────────────────────────────────────────────
do $p$
declare v text;
begin
  v := pg_get_functiondef('public.ventas_registrar_cobro(jsonb,jsonb,jsonb,jsonb,uuid)'::regprocedure);

  v := pg_temp._una(v,
$a$v_campo text; v_tipo text;$a$,
$n$v_campo text; v_tipo text;
  v_gas numeric(14,2) := 0;
  v_gastos jsonb := case when jsonb_typeof(p_cobro -> 'gastos') = 'null' then null else p_cobro -> 'gastos' end;
  v_liq text := nullif(btrim(p_cobro ->> 'liquidacion_numero'), '');$n$);

  -- CUIT del librador (opcional).
  v := pg_temp._una(v,
$a$                      when nullif(v_e ->> 'cheque_fecha_cobro', '') is null then 'cheque_fecha_cobro' end;$a$,
$n$                      when nullif(v_e ->> 'cheque_fecha_cobro', '') is null then 'cheque_fecha_cobro'
                      when nullif(v_e ->> 'cheque_librador_cuit', '') is not null
                           and regexp_replace(v_e ->> 'cheque_librador_cuit', '[^0-9]', '', 'g') !~ '^[0-9]{11}$' then 'cheque_librador_cuit' end;$n$);

  -- Gastos descontados + número de liquidación.
  v := pg_temp._una(v,
$a$  v_total := v_medios + v_ret;$a$,
$n$  if v_gastos is not null and jsonb_typeof(v_gastos) <> 'array' then
    raise exception 'GASTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', null, 'campo', 'gastos')::text;
  end if;
  for v_e, v_i in select e, n from jsonb_array_elements(coalesce(v_gastos, '[]'::jsonb)) with ordinality as t(e, n) loop
    v_campo := case
      when coalesce(v_e ->> 'concepto_id', '') !~ '^[0-9]{1,18}$'
        or not exists (select 1 from public.ventas_cobro_gasto_conceptos k where k.id = (v_e ->> 'concepto_id')::bigint and k.activo)
        then 'concepto_id'
      when coalesce(round(nullif(v_e ->> 'importe', '')::numeric, 2), 0) <= 0 then 'importe'
      when length(btrim(coalesce(v_e ->> 'obs', ''))) > 300 then 'obs'
    end;
    if v_campo is not null then
      raise exception 'GASTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('indice', v_i, 'campo', v_campo)::text;
    end if;
    v_gas := v_gas + round((v_e ->> 'importe')::numeric, 2);
  end loop;
  if v_liq is not null and v_liq !~ '^[0-9A-Za-z][0-9A-Za-z./ -]{0,29}$' then
    raise exception 'LIQUIDACION_INVALIDA' using errcode = 'P0001', detail = json_build_object('liquidacion_numero', v_liq)::text;
  end if;
  v_total := v_medios + v_ret + v_gas;$n$);

  v := pg_temp._una(v,
$a$  select coalesce(max(numero), 0) + 1 into v_num from public.ventas_cobros where ambiente = v_amb;$a$,
$n$  if v_liq is not null then
    select c.id into v_otro from public.ventas_cobros c
     where c.ambiente = v_amb and c.cliente_id = v_cli_id and c.estado = 'vigente' and upper(c.liquidacion_numero) = upper(v_liq)
     limit 1;
    if v_otro is not null then
      raise exception 'LIQUIDACION_DUPLICADA' using errcode = 'P0001',
        detail = json_build_object('liquidacion_numero', v_liq, 'cobro_id', v_otro,
                                   'numero_fmt', (select public._ventas_recibo_fmt(numero) from public.ventas_cobros where id = v_otro))::text;
    end if;
  end if;
  select coalesce(max(numero), 0) + 1 into v_num from public.ventas_cobros where ambiente = v_amb;$n$);

  v := pg_temp._una(v,
$a$aplicado, a_cuenta, obs, created_by, updated_by)$a$,
$n$aplicado, a_cuenta, obs, created_by, updated_by, total_gastos, liquidacion_numero)$n$);
  v := pg_temp._una(v,
$a$          coalesce(btrim(p_cobro ->> 'obs'), ''), p_user_id, p_user_id)$a$,
$n$          coalesce(btrim(p_cobro ->> 'obs'), ''), p_user_id, p_user_id, v_gas, v_liq)$n$);

  v := pg_temp._una(v,
$a$cheque_librador, cheque_fecha_cobro, obs)$a$,
$n$cheque_librador, cheque_fecha_cobro, cheque_librador_cuit, obs)$n$);
  v := pg_temp._una(v,
$a$nullif(e ->> 'cheque_fecha_cobro', '')::date,
         coalesce(btrim(e ->> 'obs'), '')$a$,
$n$nullif(e ->> 'cheque_fecha_cobro', '')::date,
         nullif(regexp_replace(coalesce(e ->> 'cheque_librador_cuit', ''), '[^0-9]', '', 'g'), ''),
         coalesce(btrim(e ->> 'obs'), '')$n$);

  v := pg_temp._una(v,
$a$  if p_imputaciones is not null and jsonb_array_length(p_imputaciones) > 0 then$a$,
$n$  insert into public.ventas_cobro_gastos (cobro_id, orden, concepto_id, importe, obs)
  select v_id, n::smallint, (e ->> 'concepto_id')::bigint, round((e ->> 'importe')::numeric, 2), coalesce(btrim(e ->> 'obs'), '')
    from jsonb_array_elements(coalesce(v_gastos, '[]'::jsonb)) with ordinality as t(e, n);
  if p_imputaciones is not null and jsonb_array_length(p_imputaciones) > 0 then$n$);
  execute v;

  -- Detalle del cobro: los gastos.
  v := pg_get_functiondef('public._ventas_cobro_json(bigint)'::regprocedure);
  v := pg_temp._una(v,
$a$    'imputaciones', coalesce(($a$,
$n$    'gastos', coalesce((
      select jsonb_agg(to_jsonb(g) || jsonb_build_object('concepto_nombre', k.nombre) order by g.orden)
        from public.ventas_cobro_gastos g join public.ventas_cobro_gasto_conceptos k on k.id = g.concepto_id
       where g.cobro_id = p_id), '[]'::jsonb),
    'imputaciones', coalesce(($n$);
  execute v;

  -- Estado de cuenta: cada gasto es un haber del cobro.
  v := pg_get_functiondef('public.ventas_estado_cuenta(bigint,date,date,text)'::regprocedure);
  v := pg_temp._una(v,
$a$
),
ant as ($a$,
$n$
  union all
  select c.fecha, 'gasto', public._ventas_recibo_fmt(c.numero),
         'Gasto descontado: ' || k.nombre || coalesce(' — ' || nullif(g.obs, ''), ''),
         null, 0, g.importe, null, null, c.id, null, 4, g.id
    from public.ventas_cobros c
    join public.ventas_cobro_gastos g on g.cobro_id = c.id
    join public.ventas_cobro_gasto_conceptos k on k.id = g.concepto_id, amb
   where c.cliente_id = p_cliente_id and c.estado = 'vigente' and c.ambiente = amb.a
),
ant as ($n$);
  execute v;

  -- Cartera: el medio de Ventas lleva el CUIT y se vincula al cheque que ya estaba.
  v := pg_get_functiondef('public.fn_cheques_recibidos_desde_ventas()'::regprocedure);
  v := pg_temp._una(v,
$a$    delete from public.cheques_recibidos where ventas_cobro_medio_id = new.id and estado = 'en_cartera';$a$,
$n$    delete from public.cheques_recibidos where ventas_cobro_medio_id = new.id and estado = 'en_cartera' and origen = 'ventas_cobro';
    update public.cheques_recibidos set ventas_cobro_medio_id = null, updated_at = now(), updated_by = public.usuario_actual()
     where ventas_cobro_medio_id = new.id and origen <> 'ventas_cobro';$n$);
  v := pg_temp._una(v,
$a$insert into public.cheques_recibidos (numero, banco, librador, fecha_cobro,$a$,
$n$insert into public.cheques_recibidos (numero, banco, librador, librador_cuit, fecha_cobro,$n$);
  v := pg_temp._una(v,
$a$nullif(btrim(new.cheque_librador), ''),
            new.cheque_fecha_cobro,$a$,
$n$nullif(btrim(new.cheque_librador), ''),
            new.cheque_librador_cuit, new.cheque_fecha_cobro,$n$);
  v := pg_temp._una(v,
$a$librador = excluded.librador,$a$,
$n$librador = excluded.librador, librador_cuit = excluded.librador_cuit,$n$);
  v := pg_temp._una(v,
$a$  exception when unique_violation then
    null;$a$,
$n$  exception when unique_violation then
    -- El mismo cheque ya está en la cartera (p. ej. vino de Logística): no se
    -- duplica, se vincula a este medio y se completa lo que le faltaba (20260930k).
    update public.cheques_recibidos r
       set ventas_cobro_medio_id = new.id,
           librador      = coalesce(r.librador, nullif(btrim(new.cheque_librador), '')),
           librador_cuit = coalesce(r.librador_cuit, new.cheque_librador_cuit),
           banco         = coalesce(r.banco, nullif(btrim(new.cheque_banco), '')),
           fecha_cobro   = coalesce(r.fecha_cobro, new.cheque_fecha_cobro),
           es_echeq      = coalesce(r.es_echeq, new.forma = 'echeq'),
           updated_at = now(), updated_by = public.usuario_actual()
     where r.numero_norm = coalesce(nullif(ltrim(regexp_replace(new.cheque_numero, '\D', '', 'g'), '0'), ''), '0')
       and r.importe = round(new.importe, 2)
       and r.ventas_cobro_medio_id is null;$n$);
  execute v;

  v := pg_get_functiondef('public.fn_cheques_recibidos_cobro_anulado()'::regprocedure);
  v := pg_temp._una(v,
$a$     where m.cobro_id = new.id and r.ventas_cobro_medio_id = m.id and r.estado = 'en_cartera';$a$,
$n$     where m.cobro_id = new.id and r.ventas_cobro_medio_id = m.id and r.estado = 'en_cartera' and r.origen = 'ventas_cobro';
    -- Los que vinieron de otro lado (Logística) siguen en la cartera: sólo se desvinculan.
    update public.cheques_recibidos r
       set ventas_cobro_medio_id = null, updated_at = now(), updated_by = public.usuario_actual()
      from public.ventas_cobro_medios m
     where m.cobro_id = new.id and r.ventas_cobro_medio_id = m.id and r.origen <> 'ventas_cobro';$n$);
  execute v;
end $p$;

-- trigger de la cartera: también cuando cambia el CUIT del librador.
drop trigger trg_cheques_recibidos_desde_ventas on public.ventas_cobro_medios;
create trigger trg_cheques_recibidos_desde_ventas
  after insert or update of forma, cheque_numero, cheque_banco, cheque_librador, cheque_librador_cuit, cheque_fecha_cobro, importe
  on public.ventas_cobro_medios for each row execute function public.fn_cheques_recibidos_desde_ventas();

-- ── Vista de cobros: columnas nuevas al final ───────────────────────────
do $v$
declare v text := rtrim(btrim(pg_get_viewdef('public.v_ventas_cobros'::regclass)), ';');
begin
  v := pg_temp._una(v,
$a$COALESCE(rt.busq, ''::text))) AS busq$a$,
$n$COALESCE(rt.busq, ''::text)) || ' '::text || COALESCE(c.liquidacion_numero, ''::text) || ' '::text || COALESCE(ga.busq, ''::text)) AS busq,
    c.total_gastos,
    c.liquidacion_numero,
    COALESCE(ga.n, 0) AS cantidad_gastos$n$);
  v := v || $n$
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS n,
            string_agg(k.nombre, ' '::text) AS busq
           FROM (ventas_cobro_gastos g
             JOIN ventas_cobro_gasto_conceptos k ON ((k.id = g.concepto_id)))
          WHERE (g.cobro_id = c.id)) ga ON (true)$n$;
  execute 'create or replace view public.v_ventas_cobros with (security_invoker = true) as ' || v;
end $v$;

-- ── 6) RPCs del catálogo ────────────────────────────────────────────────
create or replace function public._ventas_cobro_gasto_concepto_json(p_id bigint)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(k)
    || jsonb_build_object(
         'gastos', (select count(*) from public.ventas_cobro_gastos g where g.concepto_id = k.id),
         'mapeado', exists (select 1 from public.cont_mapeos m where m.clave = 'cobros.gasto' and m.subclave = k.id::text))
    from public.ventas_cobro_gasto_conceptos k
   where k.id = p_id
$$;

create or replace function public.ventas_cobro_gasto_conceptos_json(p_incluir_inactivos boolean default false)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(public._ventas_cobro_gasto_concepto_json(k.id) order by k.orden, k.nombre, k.id), '[]'::jsonb)
    from public.ventas_cobro_gasto_conceptos k
   where k.activo or coalesce(p_incluir_inactivos, false)
$$;

-- p_id null = alta; con p_id = edición. Campos: nombre, alias (array de texto), activo, orden.
create or replace function public.ventas_guardar_cobro_gasto_concepto(p jsonb, p_user_id uuid, p_id bigint default null)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row   public.ventas_cobro_gasto_conceptos%rowtype;
  v_nuevo boolean := p_id is null;
  v_k     text;
  v_v     jsonb;
  v_txt   text;
  v_alias text[];
  v_otro  bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', null)::text;
  end if;

  perform 1 from public.ventas_cobro_gasto_conceptos for update;

  if not v_nuevo then
    select * into v_row from public.ventas_cobro_gasto_conceptos where id = p_id;
    if not found then
      raise exception 'GASTO_CONCEPTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
    end if;
  else
    if not (p ? 'nombre') then
      raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre')::text;
    end if;
    v_row.alias := '{}';
    v_row.activo := true;
    v_row.orden := 100;
  end if;

  for v_k, v_v in select key, value from jsonb_each(p) loop
    if v_k = 'nombre' then
      v_txt := btrim(regexp_replace(coalesce(v_v #>> '{}', ''), '\s+', ' ', 'g'));
      if jsonb_typeof(v_v) <> 'string' or length(v_txt) not between 2 and 80 then
        raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.nombre := v_txt;
    elsif v_k = 'alias' then
      if jsonb_typeof(v_v) <> 'array' or exists (select 1 from jsonb_array_elements(v_v) e where jsonb_typeof(e) <> 'string') then
        raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      select coalesce(array_agg(distinct a order by a), '{}') into v_alias
        from (select public.norm_txt(e #>> '{}') a from jsonb_array_elements(v_v) e) q where a <> '';
      if cardinality(v_alias) > 30 or exists (select 1 from unnest(v_alias) a where length(a) not between 3 and 60) then
        raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.alias := v_alias;
    elsif v_k = 'activo' then
      if jsonb_typeof(v_v) <> 'boolean' then
        raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.activo := (v_v #>> '{}')::boolean;
    elsif v_k = 'orden' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,4}$' then
        raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.orden := (v_v #>> '{}')::smallint;
    else
      raise exception 'GASTO_CONCEPTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;

  select k.id into v_otro from public.ventas_cobro_gasto_conceptos k
   where public.norm_txt(k.nombre) = public.norm_txt(v_row.nombre) and k.id is distinct from v_row.id;
  if v_otro is not null then
    raise exception 'GASTO_CONCEPTO_DUPLICADO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre', 'existente', v_otro)::text;
  end if;
  -- Un sinónimo no puede ser de dos conceptos activos: el lector no sabría cuál elegir.
  if v_row.activo then
    select k.id into v_otro from public.ventas_cobro_gasto_conceptos k
     where k.activo and k.id is distinct from v_row.id and k.alias && v_row.alias
     limit 1;
    if v_otro is not null then
      raise exception 'GASTO_CONCEPTO_DUPLICADO' using errcode = 'P0001',
        detail = json_build_object('campo', 'alias', 'existente', v_otro,
                                   'alias', (select array_agg(a) from unnest(v_row.alias) a
                                              where a = any ((select alias from public.ventas_cobro_gasto_conceptos where id = v_otro)::text[])))::text;
    end if;
  end if;

  if v_nuevo then
    insert into public.ventas_cobro_gasto_conceptos (nombre, alias, activo, orden, created_by, updated_by)
    values (v_row.nombre, v_row.alias, v_row.activo, v_row.orden, p_user_id, p_user_id)
    returning id into v_row.id;
  else
    update public.ventas_cobro_gasto_conceptos
       set nombre = v_row.nombre, alias = v_row.alias, activo = v_row.activo, orden = v_row.orden, updated_by = p_user_id
     where id = v_row.id;
  end if;

  return public._ventas_cobro_gasto_concepto_json(v_row.id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_ventas_cobro_gasto_concepto_json(bigint)',
    'ventas_cobro_gasto_conceptos_json(boolean)',
    'ventas_guardar_cobro_gasto_concepto(jsonb, uuid, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
