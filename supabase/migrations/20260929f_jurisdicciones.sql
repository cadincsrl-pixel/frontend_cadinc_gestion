-- =====================================================================
-- 20260929f — Catálogo de jurisdicciones compartido (2026-09-25)
--
-- Tanda 6, ítem 6 (spec «configuración del ERP desde la pantalla» §3.6).
-- La spec lo reservaba como 20260929e; esa letra la tomaron los montos de ARCA.
--
-- 1) `jurisdicciones`: nacional / provincial / municipal (el municipio
--    cuelga de su provincia). Semilla = las 24 provincias con su código de
--    jurisdicción COMARB (901 CABA … 924 Tucumán, verificado contra un
--    CM05 de SIFERE) y su código de provincia de ARCA (0 CABA … 24 Tierra
--    del Fuego, sin 15; verificado contra la tabla «Provincias» de las
--    tablas de factura electrónica de ARCA), más el municipio San Miguel de
--    Tucumán (la TEM y la percepción municipal que ya existen).
-- 2) `_jurisdiccion_resolver(texto)`: por nombre o alias (norm_txt) entre las
--    activas; un único match → id, si no null.
-- 3) `jurisdiccion_id` en `pagos_factura_tributos` y `ventas_cobro_retenciones`
--    + trigger `fn_jurisdiccion_normalizar`: con id, el texto pasa a ser la
--    FOTO del nombre; sin id, lo resuelve desde el texto. Si no resuelve,
--    queda el texto con id null: NO bloquea (backend viejo y lectura IA
--    siguen andando). Migración de datos: se dispara el trigger sobre las
--    filas existentes (6 tributos y 2 retenciones con texto al 25/09).
-- 4) Motor contable (por ancla, sobre la definición viva): la subclave por
--    jurisdicción pasa a `tipo|<id>`. La propuesta prueba id → texto →
--    tipo; el listado ofrece `tipo|id` (y deja de ofrecer el texto); la
--    validación acepta el id existente (y el texto legacy); en uso y
--    etiqueta entienden los dos. Mapeos por jurisdicción a migrar: 0.
-- 5) `_pagos_guardar_desglose` y `ventas_registrar_cobro` aceptan
--    `jurisdiccion_id` (el texto lo completa el trigger).
-- 6) RPCs `jurisdicciones_json`, `jurisdiccion_guardar` (flag `configurar`
--    en pagos O en facturacion) y `jurisdicciones_sin_normalizar`.
-- 7) `pagos_config` mínima (no existía): solo `tributo_jurisdiccion_default_id`
--    (= Tucumán), con `pagos_config_json()` y `pagos_guardar_config()`. El
--    ítem 8 (avisos, plazos de cheque) suma claves al CHECK y ramas a la RPC.
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

create or replace function pg_temp._n(p_txt text, p_ancla text, p_nuevo text, p_veces int) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception 'ANCLA_NO_UNICA (% veces, se esperaban %): %', v_n, p_veces, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

-- ── 1) Catálogo ─────────────────────────────────────────────────────────
create table public.jurisdicciones (
  id            bigserial primary key,
  nombre        text not null check (length(btrim(nombre)) between 2 and 80),
  tipo          text not null check (tipo in ('nacional', 'provincial', 'municipal')),
  provincia_id  bigint references public.jurisdicciones(id),
  codigo_comarb text unique check (codigo_comarb is null or codigo_comarb ~ '^[0-9]{3}$'),
  codigo_arca   smallint unique check (codigo_arca is null or codigo_arca between 0 and 99),
  alias         text[] not null default '{}',
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  constraint jur_muni_chk check ((tipo = 'municipal') = (provincia_id is not null))
);
create unique index jurisdicciones_nombre_uidx on public.jurisdicciones (public.norm_txt(nombre), coalesce(provincia_id, 0));

comment on table public.jurisdicciones is
  'Jurisdicciones fiscales (provincias con código COMARB y de ARCA, municipios). Compartido por Compras (tributos) y Ventas (retenciones). Se escribe solo por jurisdiccion_guardar(). Sin DELETE: se desactivan.';

insert into public.jurisdicciones (nombre, tipo, codigo_comarb, codigo_arca, alias) values
  ('Ciudad Autónoma de Buenos Aires', 'provincial', '901',  0, '{caba,capital federal,ciudad autonoma de buenos aires}'),
  ('Buenos Aires',                    'provincial', '902',  1, '{}'),
  ('Catamarca',                       'provincial', '903',  2, '{}'),
  ('Córdoba',                         'provincial', '904',  3, '{}'),
  ('Corrientes',                      'provincial', '905',  4, '{}'),
  ('Chaco',                           'provincial', '906', 16, '{}'),
  ('Chubut',                          'provincial', '907', 17, '{}'),
  ('Entre Ríos',                      'provincial', '908',  5, '{}'),
  ('Formosa',                         'provincial', '909', 18, '{}'),
  ('Jujuy',                           'provincial', '910',  6, '{}'),
  ('La Pampa',                        'provincial', '911', 21, '{}'),
  ('La Rioja',                        'provincial', '912',  8, '{}'),
  ('Mendoza',                         'provincial', '913',  7, '{}'),
  ('Misiones',                        'provincial', '914', 19, '{}'),
  ('Neuquén',                         'provincial', '915', 20, '{}'),
  ('Río Negro',                       'provincial', '916', 22, '{}'),
  ('Salta',                           'provincial', '917',  9, '{}'),
  ('San Juan',                        'provincial', '918', 10, '{}'),
  ('San Luis',                        'provincial', '919', 11, '{}'),
  ('Santa Cruz',                      'provincial', '920', 23, '{}'),
  ('Santa Fe',                        'provincial', '921', 12, '{}'),
  ('Santiago del Estero',             'provincial', '922', 13, '{}'),
  ('Tierra del Fuego',                'provincial', '923', 24, '{}'),
  ('Tucumán',                         'provincial', '924', 14, '{tucuman}');

insert into public.jurisdicciones (nombre, tipo, provincia_id, alias)
select 'San Miguel de Tucumán', 'municipal', id, '{smt,san miguel}'
  from public.jurisdicciones where codigo_comarb = '924';

create trigger trg_jurisdicciones_touch before update on public.jurisdicciones
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.jurisdicciones
  for each row execute function public.audit_cambios('catalogos', 'jurisdicción', 'id');

alter table public.jurisdicciones enable row level security;
create policy jurisdicciones_all on public.jurisdicciones for all using (true) with check (true);
revoke all on table public.jurisdicciones from public, anon, authenticated;
grant all on table public.jurisdicciones to service_role;
revoke all on sequence public.jurisdicciones_id_seq from public, anon, authenticated;
grant all on sequence public.jurisdicciones_id_seq to service_role;

-- ── 2) Resolver y etiqueta ──────────────────────────────────────────────
create or replace function public._jurisdiccion_resolver(p_txt text)
returns bigint
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with v as (select public.norm_txt(p_txt) as t)
  select case when count(*) = 1 then min(j.id) end
    from public.jurisdicciones j, v
   where v.t <> '' and j.activo
     and (public.norm_txt(j.nombre) = v.t
          or exists (select 1 from unnest(j.alias) a where public.norm_txt(a) = v.t))
$$;

-- «Tucumán» para '24'; el texto tal cual para una subclave legacy.
create or replace function public._jurisdiccion_etiqueta(p_sub text)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select case when p_sub ~ '^[0-9]{1,18}$'
              then coalesce((select j.nombre || case when j.activo then '' else ' (baja)' end
                               from public.jurisdicciones j where j.id = p_sub::bigint), 'Jurisdicción ' || p_sub)
              else p_sub end
$$;

-- ── 3) Columnas + trigger que completa id / foto ────────────────────────
alter table public.pagos_factura_tributos
  add column jurisdiccion_id bigint references public.jurisdicciones(id);
alter table public.ventas_cobro_retenciones
  add column jurisdiccion_id bigint references public.jurisdicciones(id);
create index pagos_factura_tributos_jur_idx on public.pagos_factura_tributos (jurisdiccion_id) where jurisdiccion_id is not null;
create index ventas_cobro_retenciones_jur_idx on public.ventas_cobro_retenciones (jurisdiccion_id) where jurisdiccion_id is not null;

create or replace function public.fn_jurisdiccion_normalizar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare v_nombre text;
begin
  -- Cambió el texto y no el id: manda el texto (se vuelve a resolver).
  if tg_op = 'UPDATE' and new.jurisdiccion_id is not distinct from old.jurisdiccion_id
     and new.jurisdiccion is distinct from old.jurisdiccion
     and public.norm_txt(new.jurisdiccion) is distinct from public.norm_txt(old.jurisdiccion) then
    new.jurisdiccion_id := null;
  end if;
  if new.jurisdiccion_id is not null then
    select nombre into v_nombre from public.jurisdicciones where id = new.jurisdiccion_id;
    if v_nombre is null then
      raise exception 'JURISDICCION_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('campo', 'jurisdiccion_id', 'jurisdiccion_id', new.jurisdiccion_id)::text;
    end if;
    new.jurisdiccion := v_nombre;
  elsif nullif(btrim(coalesce(new.jurisdiccion, '')), '') is not null then
    new.jurisdiccion_id := public._jurisdiccion_resolver(new.jurisdiccion);
  end if;
  return new;
end $$;

create trigger trg_jurisdiccion_normalizar before insert or update on public.pagos_factura_tributos
  for each row execute function public.fn_jurisdiccion_normalizar();
create trigger trg_jurisdiccion_normalizar before insert or update on public.ventas_cobro_retenciones
  for each row execute function public.fn_jurisdiccion_normalizar();

-- Vuelve a resolver las filas con texto y sin id (tras sumar un alias o una
-- jurisdicción). Pasa por los guardas de cada tabla con su llave de RPC: no
-- cambia importes, solo completa el id y la foto del nombre.
create or replace function public._jurisdicciones_renormalizar()
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare v_t int; v_r int;
begin
  perform set_config('cadinc.pagos_desglose', 'on', true);
  update public.pagos_factura_tributos set jurisdiccion = jurisdiccion
   where jurisdiccion_id is null and nullif(btrim(coalesce(jurisdiccion, '')), '') is not null
     and public._jurisdiccion_resolver(jurisdiccion) is not null;
  get diagnostics v_t = row_count;
  perform set_config('cadinc.pagos_desglose', 'off', true);

  perform set_config('cadinc.ventas_rpc', 'on', true);
  update public.ventas_cobro_retenciones set jurisdiccion = jurisdiccion
   where jurisdiccion_id is null and btrim(jurisdiccion) <> ''
     and public._jurisdiccion_resolver(jurisdiccion) is not null;
  get diagnostics v_r = row_count;
  perform set_config('cadinc.ventas_rpc', 'off', true);
  return jsonb_build_object('tributos', v_t, 'retenciones', v_r);
end $$;

-- Migración de datos.
select public._jurisdicciones_renormalizar();

do $c$
declare v_sin int;
begin
  select (select count(*) from public.pagos_factura_tributos
           where jurisdiccion_id is null and nullif(btrim(coalesce(jurisdiccion, '')), '') is not null)
       + (select count(*) from public.ventas_cobro_retenciones
           where jurisdiccion_id is null and btrim(jurisdiccion) <> '')
    into v_sin;
  if v_sin > 0 then
    raise exception 'JURISDICCIONES_SIN_RESOLVER: %', v_sin;
  end if;
end $c$;

-- ── 4) Motor contable: subclave tipo|id ─────────────────────────────────
do $m$
declare v_def text;
begin
  -- Propuesta de compra: id → texto (legacy) → tipo.
  v_def := pg_get_functiondef('public._cont_prop_compra(bigint)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$select tipo, jurisdiccion, importe from public.pagos_factura_tributos$a$,
    $n$select tipo, jurisdiccion, jurisdiccion_id, importe from public.pagos_factura_tributos$n$);
  v_def := pg_temp._una(v_def,
    $a$case when v_j <> '' then array[t.tipo || '|' || v_j, t.tipo] else array[t.tipo] end$a$,
    $n$array_remove(array[t.tipo || '|' || t.jurisdiccion_id::text,
                        case when v_j <> '' then t.tipo || '|' || v_j end, t.tipo], null)$n$);
  execute v_def;

  -- Propuesta de cobro: ídem.
  v_def := pg_get_functiondef('public._cont_prop_cobro(bigint)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$case when v_j <> '' then array[r.tipo || '|' || v_j, r.tipo] else array[r.tipo] end$a$,
    $n$array_remove(array[r.tipo || '|' || r.jurisdiccion_id::text,
                        case when v_j <> '' then r.tipo || '|' || v_j end, r.tipo], null)$n$);
  execute v_def;

  -- Listado: tipo|id en lugar del texto normalizado.
  v_def := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$      union select t.tipo || '|' || public.norm_txt(t.jurisdiccion) from public.pagos_factura_tributos t
             where r ->> 'clave' = 'compras.tributo' and public.norm_txt(t.jurisdiccion) <> ''
      union select t.tipo || '|' || public.norm_txt(t.jurisdiccion) from public.ventas_cobro_retenciones t
             where r ->> 'clave' = 'cobros.retencion' and public.norm_txt(t.jurisdiccion) <> ''$a$,
$n$      union select t.tipo || '|' || t.jurisdiccion_id from public.pagos_factura_tributos t
             where r ->> 'clave' = 'compras.tributo' and t.jurisdiccion_id is not null
      union select t.tipo || '|' || t.jurisdiccion_id from public.ventas_cobro_retenciones t
             where r ->> 'clave' = 'cobros.retencion' and t.jurisdiccion_id is not null$n$);
  execute v_def;

  -- Validación: la parte de la jurisdicción puede ser un id existente.
  v_def := pg_get_functiondef('public._cont_subclave_valida(text,text)'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$      v_jur := split_part(p_sub, '|', 2);
      return v_jur <> '' and v_jur = public.norm_txt(v_jur);$a$,
$n$      v_jur := split_part(p_sub, '|', 2);
      if v_jur ~ '^[0-9]{1,18}$' then
        return exists (select 1 from public.jurisdicciones j where j.id = v_jur::bigint);
      end if;
      return v_jur <> '' and v_jur = public.norm_txt(v_jur);$n$);
  execute v_def;

  -- En uso: por id o por texto legacy.
  v_def := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$and (v_jur is null or public.norm_txt(t.jurisdiccion) = v_jur);$a$,
    $n$and (v_jur is null or case when v_jur ~ '^[0-9]{1,18}$' then t.jurisdiccion_id::text = v_jur
                                     else public.norm_txt(t.jurisdiccion) = v_jur end);$n$);
  v_def := pg_temp._una(v_def,
    $a$and (v_jur is null or public.norm_txt(r.jurisdiccion) = v_jur);$a$,
    $n$and (v_jur is null or case when v_jur ~ '^[0-9]{1,18}$' then r.jurisdiccion_id::text = v_jur
                                     else public.norm_txt(r.jurisdiccion) = v_jur end);$n$);
  execute v_def;

  -- Etiqueta: «Percepción IIBB · Tucumán».
  v_def := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v_def := pg_temp._n(v_def,
    $a$|| case when position('|' in p_sub) > 0 then ' · ' || split_part(p_sub, '|', 2) else '' end$a$,
    $n$|| case when position('|' in p_sub) > 0 then ' · ' || public._jurisdiccion_etiqueta(split_part(p_sub, '|', 2)) else '' end$n$,
    2);
  execute v_def;
end $m$;

-- ── 5) Escritores: aceptan jurisdiccion_id ──────────────────────────────
do $w$
declare v_def text;
begin
  v_def := pg_get_functiondef('public._pagos_guardar_desglose(bigint,jsonb,jsonb)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$insert into public.pagos_factura_tributos (factura_id, tipo, jurisdiccion, descripcion, alicuota, base_imp, importe)$a$,
    $n$insert into public.pagos_factura_tributos (factura_id, tipo, jurisdiccion, jurisdiccion_id, descripcion, alicuota, base_imp, importe)$n$);
  v_def := pg_temp._una(v_def,
    $a$select p_factura_id, e ->> 'tipo', nullif(btrim(coalesce(e ->> 'jurisdiccion', '')), ''),$a$,
    $n$select p_factura_id, e ->> 'tipo', nullif(btrim(coalesce(e ->> 'jurisdiccion', '')), ''),
           case when (e ->> 'jurisdiccion_id') ~ '^[0-9]{1,18}$' then (e ->> 'jurisdiccion_id')::bigint end,$n$);
  execute v_def;

  v_def := pg_get_functiondef('public.ventas_registrar_cobro(jsonb,jsonb,jsonb,jsonb,uuid)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$      when coalesce(round(nullif(v_e ->> 'importe', '')::numeric, 2), 0) <= 0 then 'importe'$a$,
    $n$      when coalesce(round(nullif(v_e ->> 'importe', '')::numeric, 2), 0) <= 0 then 'importe'
      when case when (v_e ->> 'jurisdiccion_id') ~ '^[0-9]{1,18}$'
                then not exists (select 1 from public.jurisdicciones j where j.id = (v_e ->> 'jurisdiccion_id')::bigint)
                else nullif(v_e ->> 'jurisdiccion_id', '') is not null end then 'jurisdiccion_id'$n$);
  v_def := pg_temp._una(v_def,
    $a$insert into public.ventas_cobro_retenciones (cobro_id, orden, tipo, jurisdiccion, certificado_numero, fecha, importe,$a$,
    $n$insert into public.ventas_cobro_retenciones (cobro_id, orden, tipo, jurisdiccion, jurisdiccion_id, certificado_numero, fecha, importe,$n$);
  v_def := pg_temp._una(v_def,
    $a$select v_id, n::smallint, lower(btrim(e ->> 'tipo')), coalesce(btrim(e ->> 'jurisdiccion'), ''),$a$,
    $n$select v_id, n::smallint, lower(btrim(e ->> 'tipo')), coalesce(btrim(e ->> 'jurisdiccion'), ''),
         nullif(e ->> 'jurisdiccion_id', '')::bigint,$n$);
  execute v_def;
end $w$;

-- ── 6) RPCs del catálogo ────────────────────────────────────────────────
create or replace function public._jurisdiccion_json(p_id bigint)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(j)
    || jsonb_build_object(
         'provincia_nombre', p.nombre,
         'usos', jsonb_build_object(
           'tributos',    (select count(*) from public.pagos_factura_tributos t where t.jurisdiccion_id = j.id),
           'retenciones', (select count(*) from public.ventas_cobro_retenciones r where r.jurisdiccion_id = j.id)))
    from public.jurisdicciones j
    left join public.jurisdicciones p on p.id = j.provincia_id
   where j.id = p_id
$$;

create or replace function public.jurisdicciones_json(p_incluir_inactivas boolean default false)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(public._jurisdiccion_json(j.id)
                            order by case j.tipo when 'nacional' then 0 when 'provincial' then 1 else 2 end,
                                     public.norm_txt(j.nombre), j.id), '[]'::jsonb)
    from public.jurisdicciones j
   where j.activo or coalesce(p_incluir_inactivas, false)
$$;

create or replace function public.jurisdicciones_sin_normalizar()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('texto', x.texto, 'tabla', x.tabla, 'filas', x.filas)
                            order by x.filas desc, x.texto), '[]'::jsonb)
    from (
      select btrim(jurisdiccion) as texto, 'pagos_factura_tributos' as tabla, count(*) as filas
        from public.pagos_factura_tributos
       where jurisdiccion_id is null and nullif(btrim(coalesce(jurisdiccion, '')), '') is not null
       group by 1
      union all
      select btrim(jurisdiccion), 'ventas_cobro_retenciones', count(*)
        from public.ventas_cobro_retenciones
       where jurisdiccion_id is null and btrim(jurisdiccion) <> ''
       group by 1
    ) x
$$;

create or replace function public.jurisdiccion_guardar(p jsonb, p_user_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id    bigint;
  v_row   public.jurisdicciones%rowtype;
  v_k     text;
  v_v     jsonb;
  v_txt   text;
  v_otro  bigint;
  v_alias text[];
  v_a     text;
  v_ren   jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not (public._perm_flag(p_user_id, 'pagos', 'configurar', false)
          or public._perm_flag(p_user_id, 'facturacion', 'configurar', false)) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', null)::text;
  end if;
  if p ? 'id' and coalesce(p ->> 'id', '') !~ '^[0-9]{1,18}$' then
    raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'id')::text;
  end if;
  v_id := (p ->> 'id')::bigint;

  -- Serializa altas y cambios (los duplicados miran todo el catálogo).
  perform 1 from public.jurisdicciones for update;

  if v_id is not null then
    select * into v_row from public.jurisdicciones where id = v_id;
    if not found then
      raise exception 'JURISDICCION_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('jurisdiccion_id', v_id)::text;
    end if;
  else
    if not (p ? 'nombre') then
      raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'nombre')::text;
    end if;
    if not (p ? 'tipo') then
      raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'tipo')::text;
    end if;
    v_row.alias := '{}';
    v_row.activo := true;
  end if;

  for v_k, v_v in select key, value from jsonb_each(p) loop
    continue when v_k = 'id';
    if v_k = 'nombre' then
      v_txt := btrim(regexp_replace(coalesce(v_v #>> '{}', ''), '\s+', ' ', 'g'));
      if jsonb_typeof(v_v) <> 'string' or length(v_txt) not between 2 and 80 then
        raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.nombre := v_txt;
    elsif v_k = 'tipo' then
      if coalesce(v_v #>> '{}', '') not in ('nacional', 'provincial', 'municipal') then
        raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.tipo := v_v #>> '{}';
    elsif v_k = 'provincia_id' then
      if jsonb_typeof(v_v) = 'null' then
        v_row.provincia_id := null;
      elsif jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,18}$'
            or not exists (select 1 from public.jurisdicciones x where x.id = (v_v #>> '{}')::bigint and x.tipo = 'provincial') then
        raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      else
        v_row.provincia_id := (v_v #>> '{}')::bigint;
      end if;
    elsif v_k = 'codigo_comarb' then
      v_txt := nullif(btrim(coalesce(v_v #>> '{}', '')), '');
      if jsonb_typeof(v_v) not in ('string', 'number', 'null') or (v_txt is not null and v_txt !~ '^[0-9]{3}$') then
        raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.codigo_comarb := v_txt;
    elsif v_k = 'codigo_arca' then
      if jsonb_typeof(v_v) = 'null' then
        v_row.codigo_arca := null;
      elsif jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,2}$' then
        raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      else
        v_row.codigo_arca := (v_v #>> '{}')::smallint;
      end if;
    elsif v_k = 'alias' then
      if jsonb_typeof(v_v) <> 'array' or jsonb_array_length(v_v) > 20 then
        raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_alias := '{}';
      for v_a in select value #>> '{}' from jsonb_array_elements(v_v) loop
        v_txt := public.norm_txt(v_a);
        if v_txt = '' or length(v_txt) > 60 then
          raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k, 'alias', v_a)::text;
        end if;
        if not v_txt = any(v_alias) then v_alias := v_alias || v_txt; end if;
      end loop;
      v_row.alias := v_alias;
    elsif v_k = 'activo' then
      if jsonb_typeof(v_v) <> 'boolean' then
        raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.activo := (v_v #>> '{}')::boolean;
    else
      raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;

  -- Coherencia del tipo.
  if v_row.tipo = 'municipal' then
    if v_row.provincia_id is null or v_row.provincia_id = v_id then
      raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001', detail = json_build_object('campo', 'provincia_id')::text;
    end if;
  else
    v_row.provincia_id := null;
  end if;
  if v_id is not null and v_row.tipo <> 'provincial'
     and exists (select 1 from public.jurisdicciones x where x.provincia_id = v_id) then
    raise exception 'JURISDICCION_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('campo', 'tipo', 'motivo', 'tiene_municipios')::text;
  end if;

  -- Duplicados: mismo nombre en la misma provincia; alias que choca con el
  -- nombre o un alias de otra activa (el resolver dejaría de encontrarla);
  -- códigos COMARB / ARCA únicos.
  select x.id into v_otro from public.jurisdicciones x
   where public.norm_txt(x.nombre) = public.norm_txt(v_row.nombre)
     and coalesce(x.provincia_id, 0) = coalesce(v_row.provincia_id, 0) and x.id is distinct from v_id
   limit 1;
  if v_otro is not null then
    raise exception 'JURISDICCION_DUPLICADA' using errcode = 'P0001',
      detail = json_build_object('campo', 'nombre', 'existente_id', v_otro)::text;
  end if;
  if v_row.activo then
    select x.id into v_otro from public.jurisdicciones x
     where x.activo and x.id is distinct from v_id
       and (exists (select 1 from unnest(v_row.alias) a
                     where a = public.norm_txt(x.nombre) or a = any (x.alias))
            or public.norm_txt(v_row.nombre) = any (x.alias))
     limit 1;
    if v_otro is not null then
      raise exception 'JURISDICCION_DUPLICADA' using errcode = 'P0001',
        detail = json_build_object('campo', 'alias', 'existente_id', v_otro)::text;
    end if;
  end if;
  if v_row.codigo_comarb is not null then
    select x.id into v_otro from public.jurisdicciones x where x.codigo_comarb = v_row.codigo_comarb and x.id is distinct from v_id;
    if v_otro is not null then
      raise exception 'JURISDICCION_DUPLICADA' using errcode = 'P0001',
        detail = json_build_object('campo', 'codigo_comarb', 'existente_id', v_otro)::text;
    end if;
  end if;
  if v_row.codigo_arca is not null then
    select x.id into v_otro from public.jurisdicciones x where x.codigo_arca = v_row.codigo_arca and x.id is distinct from v_id;
    if v_otro is not null then
      raise exception 'JURISDICCION_DUPLICADA' using errcode = 'P0001',
        detail = json_build_object('campo', 'codigo_arca', 'existente_id', v_otro)::text;
    end if;
  end if;

  -- No se da de baja la jurisdicción por defecto de los tributos de compra.
  if not v_row.activo and v_id is not null
     and exists (select 1 from public.pagos_config c
                  where c.clave = 'tributo_jurisdiccion_default_id' and c.valor = to_jsonb(v_id)) then
    raise exception 'JURISDICCION_POR_DEFECTO' using errcode = 'P0001',
      detail = json_build_object('jurisdiccion_id', v_id, 'donde', 'pagos_config')::text;
  end if;

  if v_id is null then
    insert into public.jurisdicciones (nombre, tipo, provincia_id, codigo_comarb, codigo_arca, alias, activo, created_by, updated_by)
    values (v_row.nombre, v_row.tipo, v_row.provincia_id, v_row.codigo_comarb, v_row.codigo_arca, v_row.alias, v_row.activo,
            p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.jurisdicciones
       set nombre = v_row.nombre, tipo = v_row.tipo, provincia_id = v_row.provincia_id,
           codigo_comarb = v_row.codigo_comarb, codigo_arca = v_row.codigo_arca, alias = v_row.alias,
           activo = v_row.activo, updated_by = p_user_id
     where id = v_id;
  end if;

  -- Un nombre o alias nuevo puede resolver textos que estaban sueltos.
  v_ren := public._jurisdicciones_renormalizar();
  return public._jurisdiccion_json(v_id) || jsonb_build_object('normalizadas', v_ren);
end $$;

-- ── 7) pagos_config (mínima) ────────────────────────────────────────────
create table public.pagos_config (
  clave      text primary key check (clave in ('tributo_jurisdiccion_default_id')),
  valor      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.pagos_config is
  'Configuración de Compras (clave/valor tipado, calcado de cont_config). Se escribe solo por pagos_guardar_config().';

insert into public.pagos_config (clave, valor)
select 'tributo_jurisdiccion_default_id', to_jsonb(id) from public.jurisdicciones where codigo_comarb = '924';

create trigger trg_pagos_config_touch before update on public.pagos_config
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_config
  for each row execute function public.audit_cambios('pagos', 'configuración', 'clave');

alter table public.pagos_config enable row level security;
create policy pagos_config_all on public.pagos_config for all using (true) with check (true);
revoke all on table public.pagos_config from public, anon, authenticated;
grant all on table public.pagos_config to service_role;

create or replace function public.pagos_config_json()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'tributo_jurisdiccion_default_id',
      (select case when jsonb_typeof(valor) = 'number' then (valor #>> '{}')::bigint end
         from public.pagos_config where clave = 'tributo_jurisdiccion_default_id'))
$$;

create or replace function public.pagos_guardar_config(p_cambios jsonb, p_user_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_k text;
  v_v jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._pagos_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', null)::text;
  end if;
  for v_k, v_v in select key, value from jsonb_each(p_cambios) loop
    case v_k
      when 'tributo_jurisdiccion_default_id' then
        if jsonb_typeof(v_v) <> 'null' and (
             jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,18}$'
             or not exists (select 1 from public.jurisdicciones j where j.id = (v_v #>> '{}')::bigint and j.activo)) then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'jurisdiccion_inexistente_o_inactiva')::text;
        end if;
      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'motivo', 'clave_desconocida')::text;
    end case;
    insert into public.pagos_config (clave, valor, updated_by) values (v_k, v_v, p_user_id)
    on conflict (clave) do update set valor = excluded.valor, updated_by = excluded.updated_by;
  end loop;
  return public.pagos_config_json();
end $$;

-- ── 8) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_jurisdiccion_resolver(text)',
    '_jurisdiccion_etiqueta(text)',
    'fn_jurisdiccion_normalizar()',
    '_jurisdicciones_renormalizar()',
    '_jurisdiccion_json(bigint)',
    'jurisdicciones_json(boolean)',
    'jurisdicciones_sin_normalizar()',
    'jurisdiccion_guardar(jsonb, uuid)',
    'pagos_config_json()',
    'pagos_guardar_config(jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
