-- =====================================================================
-- 20260929h — Título de los rubros de bienes de uso configurable (2026-09-25)
--
-- Tanda 6, ítem 7 (spec «configuración del ERP desde la pantalla» §3.7).
--
-- Hasta hoy el título de bienes de uso estaba escrito como '1.2.2.%' en
-- `cont_mapeos_listar` (subclaves de `bienes.gasto`), en
-- `_cont_bu_resolver_cuenta` (resolver el rubro por nombre) y en el texto de
-- `_cont_mapeo_reglas`; en el frontend, `PREFIJO_BIENES = '1.2.2.'`.
--
-- 1) `cont_config.bu_titulo_rubros` = id de la cuenta título (sembrado con
--    1.2.2 «BIENES DE USO»).
-- 2) `_cont_bu_prefijo()` (STABLE): código de esa cuenta + '.'; sin config o
--    con la cuenta inexistente → '1.2.2.' (compatibilidad).
-- 3) Parches por ancla sobre la definición viva:
--    - `cont_mapeos_listar`: los rubros ofrecidos son los títulos hijos
--      directos del prefijo (nivel = nivel del título + 1; hoy 4, igual que
--      antes).
--    - `_cont_bu_resolver_cuenta`: el mismo prefijo.
--    - `_cont_subclave_valida`, rama `rubro_bu`: el rubro tiene que colgar del
--      prefijo (los 0 mapeos `bienes.gasto` al 25/09 no se ven afectados).
--    - `_cont_mapeo_reglas`: el texto deja de nombrar 1.2.2.
-- 4) `cont_guardar_config`: rama `bu_titulo_rubros`. Cuenta activa, NO
--    imputable y del activo (si no → CONFIG_INVALIDA motivo `no_es_titulo`);
--    si quedan bienes cuya cuenta de origen no cuelga del nuevo título →
--    CONFIG_INVALIDA motivo `bienes_fuera` con `n`.
-- 5) `cont_config_json()` devuelve `bu_titulo_rubros: {cuenta_id, codigo, nombre}`.
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

-- ── 1) Clave nueva ──────────────────────────────────────────────────────
alter table public.cont_config drop constraint cont_config_clave_check;
alter table public.cont_config add constraint cont_config_clave_check check (clave = any (array[
  'automaticos_desde', 'cvlp_modo', 'compras_fecha_contable', 'paga_cliente_modo', 'iva_ddjj_arrastre',
  'bu_frecuencia', 'bu_criterio_alta', 'bu_corte_inicial', 'bu_titulo_rubros']));

insert into public.cont_config (clave, valor)
select 'bu_titulo_rubros', coalesce(to_jsonb((select id from public.cont_cuentas where codigo = '1.2.2')), 'null'::jsonb)
on conflict (clave) do nothing;

-- ── 2) Prefijo ──────────────────────────────────────────────────────────
create or replace function public._cont_bu_prefijo()
  returns text
  language sql
  stable
  set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select c.codigo || '.'
       from public.cont_cuentas c
      where c.id = (case when jsonb_typeof(public._cont_cfg('bu_titulo_rubros')) = 'number'
                         then (public._cont_cfg('bu_titulo_rubros') #>> '{}')::bigint end)),
    '1.2.2.')
$function$;

comment on function public._cont_bu_prefijo() is
  'Prefijo de los rubros de bienes de uso: código de la cuenta título cont_config.bu_titulo_rubros + ''.''; sin config → ''1.2.2.''.';

revoke all on function public._cont_bu_prefijo() from public, anon, authenticated;
grant execute on function public._cont_bu_prefijo() to service_role;

-- ── 3) Parches por ancla ────────────────────────────────────────────────
do $p$
declare v text;
begin
  -- cont_mapeos_listar
  v := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v := pg_temp._una(v,
    $a$c.codigo like '1.2.2.%' and c.nivel = 4 and not c.imputable and c.activo$a$,
    $a$c.codigo like public._cont_bu_prefijo() || '%'
                   and c.nivel = length(public._cont_bu_prefijo()) - length(replace(public._cont_bu_prefijo(), '.', '')) + 1
                   and not c.imputable and c.activo$a$);
  execute v;

  -- _cont_bu_resolver_cuenta
  v := pg_get_functiondef('public._cont_bu_resolver_cuenta(text,text)'::regprocedure);
  v := pg_temp._una(v,
    $a$(p_modo = 'origen' and codigo like '1.2.2.%')$a$,
    $a$(p_modo = 'origen' and codigo like public._cont_bu_prefijo() || '%')$a$);
  execute v;

  -- _cont_subclave_valida, rama rubro_bu
  v := pg_get_functiondef('public._cont_subclave_valida(text,text)'::regprocedure);
  v := pg_temp._una(v,
    $a$where c.codigo = p_sub and c.activo and not c.imputable and c.rubro = 'activo');$a$,
    $a$where c.codigo = p_sub and c.activo and not c.imputable and c.rubro = 'activo'
                                      and c.codigo like public._cont_bu_prefijo() || '%');$a$);
  execute v;

  -- _cont_mapeo_reglas (texto)
  v := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v := pg_temp._una(v,
    $a$(título 1.2.2.XX)$a$,
    $a$(los títulos que cuelgan de la cuenta de bienes de uso de Mapeos › Configuración)$a$);
  execute v;

  -- cont_guardar_config: rama nueva
  v := pg_get_functiondef('public.cont_guardar_config(jsonb,uuid)'::regprocedure);
  v := pg_temp._una(v,
    $a$  v_d   date;
begin$a$,
    $a$  v_d   date;
  v_id  bigint;
  v_cta public.cont_cuentas%rowtype;
  v_n   int;
begin$a$);
  v := pg_temp._una(v,
    $a$      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k)::text;$a$,
    $a$      when 'bu_titulo_rubros' then
        v_id := case when coalesce(v_v #>> '{}', '') ~ '^[0-9]{1,18}$' then (v_v #>> '{}')::bigint end;
        select * into v_cta from public.cont_cuentas where id = v_id;
        if v_id is null or not found or not v_cta.activo or v_cta.imputable or v_cta.rubro <> 'activo' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'valor', v_v, 'motivo', 'no_es_titulo')::text;
        end if;
        select count(*) into v_n
          from public.cont_bienes_uso b
          left join public.cont_cuentas o on o.id = b.cuenta_origen_id
         where o.codigo is null or o.codigo not like v_cta.codigo || '.%';
        if v_n > 0 then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'valor', v_v, 'motivo', 'bienes_fuera', 'n', v_n)::text;
        end if;
        v_v := to_jsonb(v_id);
      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k)::text;$a$);
  execute v;

  -- cont_config_json
  v := pg_get_functiondef('public.cont_config_json()'::regprocedure);
  v := pg_temp._una(v,
    $a$'bu_corte_inicial',       coalesce(public._cont_cfg('bu_corte_inicial') #>> '{}', '2026-06-30'))$a$,
    $a$'bu_corte_inicial',       coalesce(public._cont_cfg('bu_corte_inicial') #>> '{}', '2026-06-30'),
    'bu_titulo_rubros',       (select jsonb_build_object('cuenta_id', c.id, 'codigo', c.codigo, 'nombre', c.nombre)
                                 from public.cont_cuentas c
                                where c.codigo || '.' = public._cont_bu_prefijo()))$a$);
  execute v;
end $p$;
