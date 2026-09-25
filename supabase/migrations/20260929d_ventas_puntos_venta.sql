-- =====================================================================
-- 20260929d — Puntos de venta de Ventas, editables (2026-09-25)
--
-- Tanda 6, ítem 3 (spec «configuración del ERP desde la pantalla» §3.3).
--
-- 1) `ventas_puntos_venta`: los PV habilitados por ambiente (homo/prod),
--    uno por defecto por ambiente (índice único parcial), activo, nombre,
--    productos que lo sugieren y la foto de lo que dijo ARCA
--    (FEParamGetPtosVenta) la última vez que se verificó.
--    Semilla = los PV que YA usan las facturas autorizadas (consultado el
--    25/09, no del env): homo PV 3 (13 autorizadas), prod PV 4 (5
--    autorizadas). Ojo: el default de ARCA_PTO_VTA en el código es 3, pero
--    producción emite con 4: el env de Render dice 4.
-- 2) `ventas_guardar_borrador`: regla BLANDA después de PTO_VTA_INVALIDO:
--    si el ambiente tiene PV cargados y el pedido no es uno ACTIVO →
--    PTO_VTA_NO_HABILITADO. Con la tabla vacía no bloquea; el backend viejo
--    manda el PV del env (= la semilla) y sigue igual.
-- 3) RPCs `ventas_puntos_venta_json(p_ambiente)` y
--    `ventas_guardar_punto_venta(p, p_user_id)` (flag facturacion.configurar).
--    La verificación contra ARCA la hace el backend y llega en `p->'arca'`.
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

-- ── 1) Tabla ────────────────────────────────────────────────────────────
create table public.ventas_puntos_venta (
  id                 bigserial primary key,
  ambiente           text    not null check (ambiente in ('homo', 'prod')),
  numero             int     not null check (numero between 1 and 99998),
  nombre             text    not null default '' check (length(nombre) <= 60),
  activo             boolean not null default true,
  por_defecto        boolean not null default false,
  producto_ids       bigint[] not null default '{}',
  -- Foto de FEParamGetPtosVenta (null = nunca se pudo verificar).
  arca_emision_tipo  text,
  arca_bloqueado     boolean,
  arca_fch_baja      date,
  verificado_arca_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,
  constraint ventas_pv_ambiente_numero_key unique (ambiente, numero),
  constraint vpv_default_activo_chk check (not por_defecto or activo)
);
create unique index ventas_pv_default_uidx on public.ventas_puntos_venta (ambiente) where por_defecto;

comment on table public.ventas_puntos_venta is
  'Puntos de venta habilitados para emitir (Ventas › Configuración). Uno por defecto por ambiente. Se escriben solo por ventas_guardar_punto_venta(). Sin DELETE: se desactivan. Si un ambiente no tiene filas, el backend usa ARCA_PTO_VTA.';

insert into public.ventas_puntos_venta (ambiente, numero, nombre, por_defecto) values
  ('homo', 3, 'Homologación', true),
  ('prod', 4, 'ERP',          true);

create trigger trg_ventas_pv_touch before update on public.ventas_puntos_venta
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_puntos_venta
  for each row execute function public.audit_cambios('facturacion', 'punto de venta', 'id');

alter table public.ventas_puntos_venta enable row level security;
create policy ventas_puntos_venta_all on public.ventas_puntos_venta for all using (true) with check (true);
revoke all on table public.ventas_puntos_venta from public, anon, authenticated;
grant all on table public.ventas_puntos_venta to service_role;
revoke all on sequence public.ventas_puntos_venta_id_seq from public, anon, authenticated;
grant all on sequence public.ventas_puntos_venta_id_seq to service_role;

-- ── 2) ventas_guardar_borrador: el PV tiene que estar habilitado ────────
do $p$
declare
  v_def text := pg_get_functiondef('public.ventas_guardar_borrador(jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v_def := pg_temp._una(v_def,
$a$    raise exception 'PTO_VTA_INVALIDO' using errcode = 'P0001', detail = json_build_object('pto_vta', v_pv)::text;
  end if;$a$,
$n$    raise exception 'PTO_VTA_INVALIDO' using errcode = 'P0001', detail = json_build_object('pto_vta', v_pv)::text;
  end if;
  -- 20260929d: si el ambiente tiene PV cargados, tiene que ser uno activo.
  -- Con la tabla vacía no bloquea (el backend cae a ARCA_PTO_VTA).
  if exists (select 1 from public.ventas_puntos_venta where ambiente = v_amb)
     and not exists (select 1 from public.ventas_puntos_venta where ambiente = v_amb and numero = v_pv and activo) then
    raise exception 'PTO_VTA_NO_HABILITADO' using errcode = 'P0001',
      detail = json_build_object('campo', 'pto_vta', 'pto_vta', v_pv, 'ambiente', v_amb)::text;
  end if;$n$);
  execute v_def;
end $p$;

-- ── 3) RPCs ─────────────────────────────────────────────────────────────
create or replace function public._ventas_punto_venta_json(p_id bigint)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(pv)
    || jsonb_build_object(
         'facturas', (select count(*) from public.ventas_facturas f
                       where f.ambiente = pv.ambiente and f.pto_vta = pv.numero and f.estado <> 'descartada'))
    from public.ventas_puntos_venta pv
   where pv.id = p_id
$$;

create or replace function public.ventas_puntos_venta_json(p_ambiente text default null)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(public._ventas_punto_venta_json(pv.id)
                            order by pv.ambiente, pv.por_defecto desc, pv.activo desc, pv.numero), '[]'::jsonb)
    from public.ventas_puntos_venta pv
   where p_ambiente is null or pv.ambiente = p_ambiente
$$;

create or replace function public.ventas_guardar_punto_venta(p jsonb, p_user_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id    bigint := nullif(p ->> 'id', '')::bigint;
  v_row   public.ventas_puntos_venta%rowtype;
  v_old   public.ventas_puntos_venta%rowtype;
  v_k     text;
  v_v     jsonb;
  v_e     jsonb;
  v_ids   bigint[];
  v_nuevo boolean := v_id is null;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', null)::text;
  end if;
  -- Serializa: la regla del «por defecto» mira todo el ambiente.
  perform 1 from public.ventas_puntos_venta for update;

  if not v_nuevo then
    select * into v_row from public.ventas_puntos_venta where id = v_id;
    if not found then
      raise exception 'PV_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', v_id)::text;
    end if;
    v_old := v_row;
  else
    if coalesce(p ->> 'ambiente', '') not in ('homo', 'prod') then
      raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'ambiente')::text;
    end if;
    if not (p ? 'numero') then
      raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'numero')::text;
    end if;
    v_row.ambiente := p ->> 'ambiente';
    v_row.nombre := '';
    v_row.activo := true;
    v_row.por_defecto := false;
    v_row.producto_ids := '{}';
  end if;

  for v_k, v_v in select key, value from jsonb_each(p) loop
    continue when v_k in ('id', 'ambiente');
    if v_k = 'numero' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,5}$'
         or (v_v #>> '{}')::int not between 1 and 99998 then
        raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      if not v_nuevo and (v_v #>> '{}')::int <> v_old.numero then
        raise exception 'PV_NUMERO_NO_EDITABLE' using errcode = 'P0001',
          detail = json_build_object('campo', v_k, 'numero', v_old.numero)::text;
      end if;
      v_row.numero := (v_v #>> '{}')::int;
    elsif v_k = 'nombre' then
      if jsonb_typeof(v_v) not in ('string', 'null') or length(btrim(coalesce(v_v #>> '{}', ''))) > 60 then
        raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.nombre := btrim(regexp_replace(coalesce(v_v #>> '{}', ''), '\s+', ' ', 'g'));
    elsif v_k in ('activo', 'por_defecto') then
      if jsonb_typeof(v_v) <> 'boolean' then
        raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      if v_k = 'activo' then v_row.activo := (v_v #>> '{}')::boolean;
      else v_row.por_defecto := (v_v #>> '{}')::boolean;
      end if;
    elsif v_k = 'producto_ids' then
      if jsonb_typeof(v_v) <> 'array' then
        raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_ids := '{}';
      for v_e in select value from jsonb_array_elements(v_v) loop
        if jsonb_typeof(v_e) <> 'number' or (v_e #>> '{}') !~ '^[0-9]{1,18}$'
           or not exists (select 1 from public.ventas_productos where id = (v_e #>> '{}')::bigint) then
          raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k, 'producto_id', v_e)::text;
        end if;
        if not ((v_e #>> '{}')::bigint = any(v_ids)) then v_ids := v_ids || (v_e #>> '{}')::bigint; end if;
      end loop;
      v_row.producto_ids := v_ids;
    elsif v_k = 'arca' then
      -- Lo arma el backend con lo que devolvió FEParamGetPtosVenta.
      if jsonb_typeof(v_v) <> 'object' then
        raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.arca_emision_tipo  := left(nullif(btrim(v_v ->> 'emision_tipo'), ''), 60);
      v_row.arca_bloqueado     := (v_v ->> 'bloqueado')::boolean;
      v_row.arca_fch_baja      := nullif(v_v ->> 'fch_baja', '')::date;
      v_row.verificado_arca_at := now();
    else
      raise exception 'PV_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;

  if v_nuevo and exists (select 1 from public.ventas_puntos_venta
                          where ambiente = v_row.ambiente and numero = v_row.numero) then
    raise exception 'PV_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('campo', 'numero', 'numero', v_row.numero, 'ambiente', v_row.ambiente)::text;
  end if;
  -- El primero del ambiente es el por defecto.
  if v_nuevo and not exists (select 1 from public.ventas_puntos_venta where ambiente = v_row.ambiente) then
    v_row.por_defecto := true;
  end if;
  -- El por defecto no se desmarca ni se desactiva: se marca otro.
  if not v_nuevo and v_old.por_defecto and (not v_row.por_defecto or not v_row.activo) then
    raise exception 'PV_POR_DEFECTO' using errcode = 'P0001',
      detail = json_build_object('campo', case when not v_row.activo then 'activo' else 'por_defecto' end, 'numero', v_old.numero)::text;
  end if;
  if v_row.por_defecto and not v_row.activo then
    raise exception 'PV_INACTIVO' using errcode = 'P0001', detail = json_build_object('campo', 'por_defecto', 'numero', v_row.numero)::text;
  end if;
  if v_row.por_defecto then
    update public.ventas_puntos_venta set por_defecto = false, updated_by = p_user_id
     where ambiente = v_row.ambiente and por_defecto and id is distinct from v_id;
  end if;

  if v_nuevo then
    insert into public.ventas_puntos_venta (ambiente, numero, nombre, activo, por_defecto, producto_ids,
      arca_emision_tipo, arca_bloqueado, arca_fch_baja, verificado_arca_at, created_by, updated_by)
    values (v_row.ambiente, v_row.numero, v_row.nombre, v_row.activo, v_row.por_defecto, v_row.producto_ids,
      v_row.arca_emision_tipo, v_row.arca_bloqueado, v_row.arca_fch_baja, v_row.verificado_arca_at, p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.ventas_puntos_venta
       set nombre = v_row.nombre, activo = v_row.activo, por_defecto = v_row.por_defecto,
           producto_ids = v_row.producto_ids,
           arca_emision_tipo = v_row.arca_emision_tipo, arca_bloqueado = v_row.arca_bloqueado,
           arca_fch_baja = v_row.arca_fch_baja, verificado_arca_at = v_row.verificado_arca_at,
           updated_by = p_user_id
     where id = v_id;
  end if;
  return public._ventas_punto_venta_json(v_id);
end $$;

-- ── 4) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_ventas_punto_venta_json(bigint)',
    'ventas_puntos_venta_json(text)',
    'ventas_guardar_punto_venta(jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
