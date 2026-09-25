-- =====================================================================
-- 20260929g — Tipos de retención sufrida: catálogo editable (2026-09-25)
--
-- Tanda 6, ítem 5 (spec «configuración del ERP desde la pantalla» §3.5).
-- Va después de jurisdicciones (20260929f). La spec lo reservaba como f.
--
-- 1) `ventas_retencion_tipos`: clave (la que guarda cada retención), nombre,
--    corto, impuesto (iva/ganancias/iibb/suss/municipal/otro), si pide
--    jurisdicción y cuál por defecto. Semilla = los 6 de hoy (sistema=true),
--    con los mismos textos que `RETENCION_TIPOS` del frontend. El impuesto
--    `iva` es RESERVADO y único: lo leen lid-compras.service (.eq('tipo','iva'))
--    y el asiento mensual de IVA (20260928o).
-- 2) `ventas_cobro_retenciones.tipo`: el CHECK cerrado pasa a FK al catálogo.
-- 3) `ventas_config` (no existía; el ítem 9 le suma claves): por ahora solo
--    `retencion_tipo_default` = 'iibb', con `ventas_config_json()` y
--    `ventas_guardar_config()` (flag facturacion.configurar).
-- 4) Parches por ancla: `ventas_registrar_cobro` valida el tipo contra el
--    catálogo (activo); el motor contable valida la subclave de
--    `cobros.retencion` contra el catálogo, la lista y le pone etiqueta;
--    `jurisdiccion_guardar` no deja dar de baja una jurisdicción que es la
--    de por defecto de un tipo activo; `fn_jurisdiccion_normalizar` deja el
--    nombre canónico también cuando resuelve desde el texto.
-- 5) RPCs `ventas_retencion_tipos_json` y `ventas_guardar_retencion_tipo`.
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
create table public.ventas_retencion_tipos (
  clave                   text primary key check (clave ~ '^[a-z][a-z0-9_]{1,29}$'),
  nombre                  text not null check (length(btrim(nombre)) between 2 and 80),
  corto                   text not null check (length(btrim(corto)) between 1 and 20),
  impuesto                text not null check (impuesto in ('iva', 'ganancias', 'iibb', 'suss', 'municipal', 'otro')),
  pide_jurisdiccion       boolean not null default false,
  jurisdiccion_default_id bigint references public.jurisdicciones(id),
  sistema                 boolean not null default false,
  activo                  boolean not null default true,
  orden                   smallint not null default 100,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  updated_by              uuid
);
create unique index vrt_iva_unico on public.ventas_retencion_tipos (impuesto) where impuesto = 'iva';
create unique index vrt_corto_uidx on public.ventas_retencion_tipos (public.norm_txt(corto));

comment on table public.ventas_retencion_tipos is
  'Tipos de retención sufrida en cobros (Ventas › Configuración). El impuesto iva es reservado y único (Libro IVA, asiento mensual). Se escribe solo por ventas_guardar_retencion_tipo(). Sin DELETE: se desactivan.';

insert into public.ventas_retencion_tipos (clave, nombre, corto, impuesto, pide_jurisdiccion, jurisdiccion_default_id, sistema, orden) values
  ('iibb',      'Ingresos Brutos',                   'IIBB',      'iibb',      true,  (select id from public.jurisdicciones where codigo_comarb = '924'), true, 10),
  ('tem',       'TEM (Tributo Económico Municipal)', 'TEM',       'municipal', true,
     (select m.id from public.jurisdicciones m join public.jurisdicciones p on p.id = m.provincia_id
       where p.codigo_comarb = '924' and public.norm_txt(m.nombre) = 'san miguel de tucuman'), true, 20),
  ('suss',      'SUSS',                              'SUSS',      'suss',      false, null, true, 30),
  ('ganancias', 'Ganancias',                         'Ganancias', 'ganancias', false, null, true, 40),
  ('iva',       'IVA',                               'IVA',       'iva',       false, null, true, 50),
  ('otra',      'Otra',                              'Otra',      'otro',      false, null, true, 60);

do $s$
begin
  if exists (select 1 from public.ventas_retencion_tipos where pide_jurisdiccion and jurisdiccion_default_id is null) then
    raise exception 'SEMILLA_SIN_JURISDICCION';
  end if;
end $s$;

create trigger trg_ventas_retencion_tipos_touch before update on public.ventas_retencion_tipos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_retencion_tipos
  for each row execute function public.audit_cambios('facturacion', 'tipo de retención', 'clave');

alter table public.ventas_retencion_tipos enable row level security;
create policy ventas_retencion_tipos_all on public.ventas_retencion_tipos for all using (true) with check (true);
revoke all on table public.ventas_retencion_tipos from public, anon, authenticated;
grant all on table public.ventas_retencion_tipos to service_role;

-- ── 2) Las retenciones apuntan al catálogo ──────────────────────────────
alter table public.ventas_cobro_retenciones drop constraint ventas_cobro_retenciones_tipo_check;
alter table public.ventas_cobro_retenciones
  add constraint ventas_cobro_retenciones_tipo_fkey foreign key (tipo) references public.ventas_retencion_tipos(clave);

-- ── 3) ventas_config (mínima) ───────────────────────────────────────────
create table public.ventas_config (
  clave      text primary key check (clave in ('retencion_tipo_default')),
  valor      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.ventas_config is
  'Configuración de Ventas (clave/valor tipado, calcado de cont_config). Se escribe solo por ventas_guardar_config().';

insert into public.ventas_config (clave, valor) values ('retencion_tipo_default', '"iibb"');

create trigger trg_ventas_config_touch before update on public.ventas_config
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_config
  for each row execute function public.audit_cambios('facturacion', 'configuración', 'clave');

alter table public.ventas_config enable row level security;
create policy ventas_config_all on public.ventas_config for all using (true) with check (true);
revoke all on table public.ventas_config from public, anon, authenticated;
grant all on table public.ventas_config to service_role;

create or replace function public.ventas_config_json()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'retencion_tipo_default',
      coalesce((select valor #>> '{}' from public.ventas_config where clave = 'retencion_tipo_default'), 'iibb'))
$$;

create or replace function public.ventas_guardar_config(p_cambios jsonb, p_user_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_k text;
  v_v jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', null)::text;
  end if;
  for v_k, v_v in select key, value from jsonb_each(p_cambios) loop
    case v_k
      when 'retencion_tipo_default' then
        if jsonb_typeof(v_v) <> 'string'
           or not exists (select 1 from public.ventas_retencion_tipos x where x.clave = v_v #>> '{}' and x.activo) then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'tipo_inexistente_o_inactivo')::text;
        end if;
      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'motivo', 'clave_desconocida')::text;
    end case;
    insert into public.ventas_config (clave, valor, updated_by) values (v_k, v_v, p_user_id)
    on conflict (clave) do update set valor = excluded.valor, updated_by = excluded.updated_by;
  end loop;
  return public.ventas_config_json();
end $$;

-- ── 4) Parches por ancla ────────────────────────────────────────────────
do $p$
declare v_def text;
begin
  -- Registrar cobro: el tipo sale del catálogo (activo).
  v_def := pg_get_functiondef('public.ventas_registrar_cobro(jsonb,jsonb,jsonb,jsonb,uuid)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$when v_tipo not in ('iibb', 'tem', 'suss', 'ganancias', 'iva', 'otra') then 'tipo'$a$,
    $n$when not exists (select 1 from public.ventas_retencion_tipos x where x.clave = v_tipo and x.activo) then 'tipo'$n$);
  execute v_def;

  -- Motor: la subclave de cobros.retencion se valida contra el catálogo.
  v_def := pg_get_functiondef('public._cont_subclave_valida(text,text)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$if not ((r -> 'subclaves') ? v_tipo) then return false; end if;$a$,
    $n$if not (case when r ->> 'subclave_tipo' = 'retencion'
                   then exists (select 1 from public.ventas_retencion_tipos x where x.clave = v_tipo)
                   else (r -> 'subclaves') ? v_tipo end) then return false; end if;$n$);
  execute v_def;

  -- Listado: todos los tipos del catálogo.
  v_def := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$      union select p.id::text from public.ventas_productos p where r ->> 'clave' = 'ventas.producto'$a$,
$n$      union select p.id::text from public.ventas_productos p where r ->> 'clave' = 'ventas.producto'
      union select x.clave from public.ventas_retencion_tipos x where r ->> 'clave' = 'cobros.retencion'$n$);
  execute v_def;

  -- Etiqueta: los de siempre igual; uno nuevo, «Retención <corto>».
  v_def := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$        when 'ganancias' then 'Retención Ganancias' when 'iva' then 'Retención IVA' when 'otra' then 'Otra retención'
        else split_part(p_sub, '|', 1) end$a$,
$n$        when 'ganancias' then 'Retención Ganancias' when 'iva' then 'Retención IVA' when 'otra' then 'Otra retención'
        else coalesce((select 'Retención ' || x.corto || case when x.activo then '' else ' (baja)' end
                         from public.ventas_retencion_tipos x where x.clave = split_part(p_sub, '|', 1)),
                      split_part(p_sub, '|', 1)) end$n$);
  execute v_def;

  -- Normalizador (20260929f): si el texto resolvió, también queda la foto
  -- del nombre canónico («tucuman» → «Tucumán»).
  v_def := pg_get_functiondef('public.fn_jurisdiccion_normalizar()'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$    new.jurisdiccion_id := public._jurisdiccion_resolver(new.jurisdiccion);$a$,
    $n$    new.jurisdiccion_id := public._jurisdiccion_resolver(new.jurisdiccion);
    if new.jurisdiccion_id is not null then
      select nombre into new.jurisdiccion from public.jurisdicciones where id = new.jurisdiccion_id;
    end if;$n$);
  execute v_def;

  -- Jurisdicciones: no se da de baja la de por defecto de un tipo activo.
  v_def := pg_get_functiondef('public.jurisdiccion_guardar(jsonb,uuid)'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$  if v_id is null then
    insert into public.jurisdicciones$a$,
$n$  if not v_row.activo and v_id is not null
     and exists (select 1 from public.ventas_retencion_tipos x where x.activo and x.jurisdiccion_default_id = v_id) then
    raise exception 'JURISDICCION_POR_DEFECTO' using errcode = 'P0001',
      detail = json_build_object('jurisdiccion_id', v_id, 'donde', 'ventas_retencion_tipos')::text;
  end if;

  if v_id is null then
    insert into public.jurisdicciones$n$);
  execute v_def;
end $p$;

-- ── 5) RPCs del catálogo ────────────────────────────────────────────────
create or replace function public._ventas_retencion_tipo_json(p_clave text)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(x)
    || jsonb_build_object(
         'jurisdiccion_default_nombre', j.nombre,
         'retenciones', (select count(*) from public.ventas_cobro_retenciones r where r.tipo = x.clave),
         'mapeado', exists (select 1 from public.cont_mapeos m where m.clave = 'cobros.retencion'
                              and (m.subclave = x.clave or m.subclave like x.clave || '|%')))
    from public.ventas_retencion_tipos x
    left join public.jurisdicciones j on j.id = x.jurisdiccion_default_id
   where x.clave = p_clave
$$;

create or replace function public.ventas_retencion_tipos_json(p_incluir_inactivos boolean default false)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(public._ventas_retencion_tipo_json(x.clave) order by x.orden, x.nombre, x.clave), '[]'::jsonb)
    from public.ventas_retencion_tipos x
   where x.activo or coalesce(p_incluir_inactivos, false)
$$;

-- p_clave null = alta (la clave va en p, o sale del corto); con p_clave = edición.
create or replace function public.ventas_guardar_retencion_tipo(p jsonb, p_user_id uuid, p_clave text default null)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row   public.ventas_retencion_tipos%rowtype;
  v_nuevo boolean := p_clave is null;
  v_k     text;
  v_v     jsonb;
  v_txt   text;
  v_otro  text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', null)::text;
  end if;

  perform 1 from public.ventas_retencion_tipos for update;

  if not v_nuevo then
    select * into v_row from public.ventas_retencion_tipos where clave = p_clave;
    if not found then
      raise exception 'RETENCION_TIPO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('clave', p_clave)::text;
    end if;
  else
    foreach v_k in array array['nombre', 'corto', 'impuesto'] loop
      if not (p ? v_k) then
        raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
    end loop;
    v_row.pide_jurisdiccion := false;
    v_row.sistema := false;
    v_row.activo := true;
    v_row.orden := 100;
  end if;

  for v_k, v_v in select key, value from jsonb_each(p) loop
    if v_k = 'clave' then
      v_txt := coalesce(v_v #>> '{}', '');
      if not v_nuevo then
        if v_txt is distinct from v_row.clave then
          if v_row.sistema then
            raise exception 'RETENCION_TIPO_SISTEMA' using errcode = 'P0001', detail = json_build_object('campo', v_k, 'clave', v_row.clave)::text;
          end if;
          raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
        end if;
      elsif jsonb_typeof(v_v) <> 'string' or v_txt !~ '^[a-z][a-z0-9_]{1,29}$' then
        raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      else
        v_row.clave := v_txt;
      end if;
    elsif v_k in ('nombre', 'corto') then
      v_txt := btrim(regexp_replace(coalesce(v_v #>> '{}', ''), '\s+', ' ', 'g'));
      if jsonb_typeof(v_v) <> 'string'
         or (v_k = 'nombre' and length(v_txt) not between 2 and 80)
         or (v_k = 'corto' and length(v_txt) not between 1 and 20) then
        raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      if v_k = 'nombre' then v_row.nombre := v_txt; else v_row.corto := v_txt; end if;
    elsif v_k = 'impuesto' then
      v_txt := coalesce(v_v #>> '{}', '');
      if v_txt not in ('iva', 'ganancias', 'iibb', 'suss', 'municipal', 'otro') then
        raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      if not v_nuevo and v_row.sistema and v_txt is distinct from v_row.impuesto then
        raise exception 'RETENCION_TIPO_SISTEMA' using errcode = 'P0001', detail = json_build_object('campo', v_k, 'clave', v_row.clave)::text;
      end if;
      if v_txt = 'iva' and v_row.impuesto is distinct from 'iva' then
        raise exception 'IMPUESTO_IVA_RESERVADO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.impuesto := v_txt;
    elsif v_k in ('pide_jurisdiccion', 'activo') then
      if jsonb_typeof(v_v) <> 'boolean' then
        raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      if v_k = 'activo' then v_row.activo := (v_v #>> '{}')::boolean;
      else v_row.pide_jurisdiccion := (v_v #>> '{}')::boolean; end if;
    elsif v_k = 'jurisdiccion_default_id' then
      if jsonb_typeof(v_v) = 'null' then
        v_row.jurisdiccion_default_id := null;
      elsif jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,18}$'
            or not exists (select 1 from public.jurisdicciones j where j.id = (v_v #>> '{}')::bigint and j.activo) then
        raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      else
        v_row.jurisdiccion_default_id := (v_v #>> '{}')::bigint;
      end if;
    elsif v_k = 'orden' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,4}$' then
        raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.orden := (v_v #>> '{}')::smallint;
    else
      raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;

  -- Clave del alta: la que vino o un slug del corto.
  if v_nuevo and v_row.clave is null then
    v_row.clave := left(regexp_replace(regexp_replace(public.norm_txt(v_row.corto), '[^a-z0-9]+', '_', 'g'), '^[^a-z]+', ''), 30);
    if v_row.clave !~ '^[a-z][a-z0-9_]{1,29}$' then
      raise exception 'RETENCION_TIPO_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'clave')::text;
    end if;
  end if;
  if not v_row.pide_jurisdiccion then
    v_row.jurisdiccion_default_id := null;
  end if;

  if v_nuevo and exists (select 1 from public.ventas_retencion_tipos x where x.clave = v_row.clave) then
    raise exception 'RETENCION_TIPO_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('campo', 'clave', 'existente', v_row.clave)::text;
  end if;
  select x.clave into v_otro from public.ventas_retencion_tipos x
   where public.norm_txt(x.corto) = public.norm_txt(v_row.corto) and x.clave <> v_row.clave;
  if v_otro is not null then
    raise exception 'RETENCION_TIPO_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('campo', 'corto', 'existente', v_otro)::text;
  end if;

  if not v_row.activo
     and exists (select 1 from public.ventas_config c where c.clave = 'retencion_tipo_default' and c.valor #>> '{}' = v_row.clave) then
    raise exception 'RETENCION_TIPO_POR_DEFECTO' using errcode = 'P0001', detail = json_build_object('clave', v_row.clave)::text;
  end if;

  if v_nuevo then
    insert into public.ventas_retencion_tipos (clave, nombre, corto, impuesto, pide_jurisdiccion, jurisdiccion_default_id,
                                               sistema, activo, orden, created_by, updated_by)
    values (v_row.clave, v_row.nombre, v_row.corto, v_row.impuesto, v_row.pide_jurisdiccion, v_row.jurisdiccion_default_id,
            false, v_row.activo, v_row.orden, p_user_id, p_user_id);
  else
    update public.ventas_retencion_tipos
       set nombre = v_row.nombre, corto = v_row.corto, impuesto = v_row.impuesto,
           pide_jurisdiccion = v_row.pide_jurisdiccion, jurisdiccion_default_id = v_row.jurisdiccion_default_id,
           activo = v_row.activo, orden = v_row.orden, updated_by = p_user_id
     where clave = v_row.clave;
  end if;

  return public._ventas_retencion_tipo_json(v_row.clave);
end $$;

-- ── 6) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'ventas_config_json()',
    'ventas_guardar_config(jsonb, uuid)',
    '_ventas_retencion_tipo_json(text)',
    'ventas_retencion_tipos_json(boolean)',
    'ventas_guardar_retencion_tipo(jsonb, uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
