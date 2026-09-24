-- =====================================================================
-- Contabilidad fase 1: plan de cuentas y cierre de períodos (2026-09-26)
--
-- Por qué:
--   · el plan de cuentas se edita solo por RPC (flag editar_plan) para que
--     los errores del trigger de consistencia (20260926a) salgan con código;
--   · la importación del plan es TODO O NADA con vista previa (molde de
--     ventas_importar_externos, 20260924n): `confirmar=false` devuelve el
--     diagnóstico fila por fila sin escribir;
--   · cerrar un período NUMERA el libro diario (correlativo por ejercicio,
--     orden fecha,id, solo confirmados) y lo congela; los períodos se cierran
--     en orden y solo se reabre el último cerrado, que se desnumera: al
--     volver a cerrarlo se renumera sin huecos.
--
-- Las vistas v_cont_cuentas y v_cont_periodos viven ACÁ (la spec las ponía en
-- 20260926f) porque cont_guardar_cuenta, cont_baja_cuenta, cont_cerrar_periodo
-- y cont_reabrir_periodo devuelven sus filas.
-- =====================================================================

-- ── 1) Vistas ──────────────────────────────────────────────────────────

create or replace view public.v_cont_cuentas with (security_invoker = true) as
select c.*,
       p.codigo                           as padre_codigo,
       public._cont_naturaleza(c.rubro)   as naturaleza,
       (select count(*) from public.cont_cuentas h where h.padre_id = c.id)::int as cant_hijas,
       exists (select 1 from public.cont_asiento_lineas l where l.cuenta_id = c.id) as tiene_movimientos,
       (select array_agg(t.id order by t.id) from public.tesoreria_cuentas t where t.cuenta_id = c.id) as tesoreria_ids
  from public.cont_cuentas c
  left join public.cont_cuentas p on p.id = c.padre_id;

create or replace view public.v_cont_periodos with (security_invoker = true) as
select p.id, p.ejercicio_id, e.nombre as ejercicio_nombre, p.numero, p.desde, p.hasta, p.estado,
       p.cerrado_por, pc.nombre as cerrado_por_nombre, p.cerrado_at,
       p.reabierto_por, p.reabierto_at, p.motivo_reapertura,
       coalesce(s.cant_borradores, 0)::int  as cant_borradores,
       coalesce(s.cant_confirmados, 0)::int as cant_confirmados,
       coalesce(s.cant_anulados, 0)::int    as cant_anulados,
       s.numero_desde, s.numero_hasta,
       coalesce(s.total_debe, 0)::numeric(14,2) as total_debe
  from public.cont_periodos p
  join public.cont_ejercicios e on e.id = p.ejercicio_id
  left join public.profiles pc on pc.id = p.cerrado_por
  left join lateral (
    select count(*) filter (where a.estado = 'borrador')   as cant_borradores,
           count(*) filter (where a.estado = 'confirmado') as cant_confirmados,
           count(*) filter (where a.estado = 'anulado')    as cant_anulados,
           min(a.numero) as numero_desde, max(a.numero) as numero_hasta,
           sum(a.total) filter (where a.estado = 'confirmado') as total_debe
      from public.cont_asientos a
     where a.periodo_id = p.id) s on true;

revoke all on table public.v_cont_cuentas  from public, anon, authenticated;
revoke all on table public.v_cont_periodos from public, anon, authenticated;
grant select on table public.v_cont_cuentas  to service_role;
grant select on table public.v_cont_periodos to service_role;

create or replace function public._cont_cuenta_json(p_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select to_jsonb(v) from public.v_cont_cuentas v where v.id = p_id
$$;

create or replace function public._cont_periodo_json(p_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select to_jsonb(v) from public.v_cont_periodos v where v.id = p_id
$$;

-- ── 2) Alta / edición de cuenta ────────────────────────────────────────
-- p_cuenta = {id?, codigo, nombre, rubro?, imputable, auxiliar, obs?}.
-- En la edición, las claves AUSENTES conservan el valor actual (PATCH parcial).
create or replace function public.cont_guardar_cuenta(p_cuenta jsonb, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id    bigint;
  v_old   public.cont_cuentas%rowtype;
  v_cod   text;
  v_nom   text;
  v_rub   text;
  v_imp   boolean;
  v_aux   text;
  v_obs   text;
  v_pcod  text;
  v_cons  text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'editar_plan') then
    raise exception 'SIN_PERMISO_PLAN' using errcode = 'P0001';
  end if;
  if p_cuenta is null or jsonb_typeof(p_cuenta) <> 'object' then
    raise exception 'DATOS_INVALIDOS' using errcode = 'P0001', detail = json_build_object('campo', 'cuenta')::text;
  end if;
  begin
    v_id := nullif(p_cuenta ->> 'id', '')::bigint;
  exception when others then
    raise exception 'ID_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'id')::text;
  end;
  if v_id is not null then
    select * into v_old from public.cont_cuentas where id = v_id for update;
    if not found then
      raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', v_id)::text;
    end if;
  end if;

  v_cod := case when p_cuenta ? 'codigo' then btrim(coalesce(p_cuenta ->> 'codigo', '')) else v_old.codigo end;
  v_nom := case when p_cuenta ? 'nombre' then btrim(coalesce(p_cuenta ->> 'nombre', '')) else v_old.nombre end;
  v_rub := case when nullif(btrim(coalesce(p_cuenta ->> 'rubro', '')), '') is not null
                then lower(btrim(p_cuenta ->> 'rubro')) else v_old.rubro end;
  v_imp := case when jsonb_typeof(p_cuenta -> 'imputable') = 'boolean' then (p_cuenta ->> 'imputable')::boolean
                else coalesce(v_old.imputable, false) end;
  v_aux := coalesce(nullif(lower(btrim(coalesce(p_cuenta ->> 'auxiliar', ''))), ''), v_old.auxiliar, 'none');
  v_obs := case when p_cuenta ? 'obs' then left(coalesce(p_cuenta ->> 'obs', ''), 500) else coalesce(v_old.obs, '') end;

  if v_cod is null or v_cod !~ '^[1-9](\.[0-9]{1,3}){0,5}$' then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'codigo', 'codigo', v_cod)::text;
  end if;
  if v_nom is null or length(v_nom) < 2 or length(v_nom) > 120 then
    raise exception 'NOMBRE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre')::text;
  end if;
  if v_rub is not null and v_rub not in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso') then
    raise exception 'RUBRO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'rubro', 'rubro', v_rub)::text;
  end if;
  if v_aux not in ('none', 'cliente', 'proveedor', 'tesoreria') then
    raise exception 'AUXILIAR_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'auxiliar', 'auxiliar', v_aux)::text;
  end if;
  if v_rub is null then
    if position('.' in v_cod) = 0 then
      raise exception 'RUBRO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'rubro')::text;
    end if;
    v_pcod := regexp_replace(v_cod, '\.[0-9]+$', '');
    select rubro into v_rub from public.cont_cuentas where codigo = v_pcod;
    if v_rub is null then
      raise exception 'PADRE_NO_EXISTE' using errcode = 'P0001',
        detail = json_build_object('campo', 'codigo', 'codigo', v_cod, 'padre_codigo', v_pcod)::text;
    end if;
  end if;

  begin
    if v_id is null then
      insert into public.cont_cuentas (codigo, nombre, rubro, imputable, auxiliar, obs, created_by, updated_by)
      values (v_cod, v_nom, v_rub, v_imp, v_aux, v_obs, p_user_id, p_user_id)
      returning id into v_id;
    else
      update public.cont_cuentas
         set codigo = v_cod, nombre = v_nom, rubro = v_rub, imputable = v_imp, auxiliar = v_aux, obs = v_obs,
             updated_by = p_user_id
       where id = v_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_cons = constraint_name;
    if v_cons = 'cont_cuentas_codigo_key' then
      raise exception 'CODIGO_DUPLICADO' using errcode = 'P0001', detail = json_build_object('campo', 'codigo', 'codigo', v_cod)::text;
    end if;
    raise;
  end;

  return public._cont_cuenta_json(v_id);
end $$;

-- ── 3) Baja / alta ─────────────────────────────────────────────────────
create or replace function public.cont_baja_cuenta(p_id bigint, p_activo boolean, p_motivo text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'editar_plan') then
    raise exception 'SIN_PERMISO_PLAN' using errcode = 'P0001';
  end if;
  perform 1 from public.cont_cuentas where id = p_id for update;
  if not found then
    raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if not coalesce(p_activo, false) and length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;
  update public.cont_cuentas
     set activo = coalesce(p_activo, false),
         baja_motivo = case when coalesce(p_activo, false) then null else v_motivo end,
         updated_by = p_user_id
   where id = p_id;
  return public._cont_cuenta_json(p_id);
end $$;

-- ── 4) Borrado físico (solo sin movimientos, sin hijas y sin tesorería) ─
create or replace function public.cont_borrar_cuenta(p_id bigint, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'editar_plan') then
    raise exception 'SIN_PERMISO_PLAN' using errcode = 'P0001';
  end if;
  perform 1 from public.cont_cuentas where id = p_id for update;
  if not found then
    raise exception 'CUENTA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('id', p_id)::text;
  end if;
  if exists (select 1 from public.cont_asiento_lineas where cuenta_id = p_id) then
    raise exception 'CUENTA_CON_MOVIMIENTOS' using errcode = 'P0001', detail = json_build_object('cuenta_id', p_id)::text;
  end if;
  if exists (select 1 from public.cont_cuentas where padre_id = p_id) then
    raise exception 'CUENTA_CON_HIJAS' using errcode = 'P0001', detail = json_build_object('cuenta_id', p_id)::text;
  end if;
  if exists (select 1 from public.tesoreria_cuentas where cuenta_id = p_id) then
    raise exception 'CUENTA_EN_USO' using errcode = 'P0001',
      detail = json_build_object('cuenta_id', p_id, 'tesoreria_ids',
                                 (select json_agg(id order by id) from public.tesoreria_cuentas where cuenta_id = p_id))::text;
  end if;
  delete from public.cont_cuentas where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- ── 5) Importar plan (todo o nada, con vista previa) ───────────────────
-- Filas: {codigo, nombre, rubro?, imputable?, auxiliar?} (el backend ya
-- normalizó rubro e imputable). `indice` es 1-based, como en Ventas.
create or replace function public.cont_importar_plan(p_filas jsonb, p_user_id uuid, p_confirmar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_e       jsonb;
  v_i       int;
  v_rows    jsonb := '[]'::jsonb;   -- parseadas, en orden del archivo
  v_proc    jsonb := '[]'::jsonb;   -- resultado, en orden de proceso (nivel, código)
  v_r       jsonb;
  v_cod     text;
  v_nom     text;
  v_rub     text;
  v_aux     text;
  v_imp     boolean;
  v_txt     text;
  v_err     text;
  v_det     jsonb;
  v_vistos  jsonb := '{}'::jsonb;   -- codigo → indice de su primera aparición
  v_padres  text[] := '{}';
  v_ok      jsonb := '{}'::jsonb;   -- codigo → {rubro, imputable} aceptadas del archivo
  v_malas   text[] := '{}';         -- códigos del archivo con error
  v_pcod    text;
  v_db      public.cont_cuentas%rowtype;
  v_prub    text;
  v_pimp    boolean;
  v_pfound  boolean;
  v_estado  text;
  v_cid     bigint;
  v_nuevas  int := 0;
  v_dups    int := 0;
  v_errs    int := 0;
  v_res     jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'editar_plan') then
    raise exception 'SIN_PERMISO_PLAN' using errcode = 'P0001';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'SIN_FILAS' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 2000)::text;
  end if;
  if p_confirmar then
    perform pg_advisory_xact_lock(hashtext('cont_importar_plan'));
  end if;

  -- 1) Parseo y validación de forma, en orden del archivo.
  for v_e, v_i in select e, n::int from jsonb_array_elements(p_filas) with ordinality as t(e, n) loop
    v_err := null; v_det := null;
    v_cod := btrim(coalesce(v_e ->> 'codigo', ''));
    v_nom := btrim(coalesce(v_e ->> 'nombre', ''));
    v_rub := nullif(lower(btrim(coalesce(v_e ->> 'rubro', ''))), '');
    v_aux := nullif(lower(btrim(coalesce(v_e ->> 'auxiliar', ''))), '');
    v_imp := null;
    case jsonb_typeof(v_e -> 'imputable')
      when 'boolean' then v_imp := (v_e ->> 'imputable')::boolean;
      when 'number'  then v_imp := (v_e ->> 'imputable')::numeric <> 0;
      when 'string'  then
        v_txt := lower(btrim(v_e ->> 'imputable'));
        v_imp := case when v_txt in ('s', 'si', 'sí', 'true', '1', 'x') then true
                      when v_txt in ('n', 'no', 'false', '0') then false end;
      else null;
    end case;

    if v_cod !~ '^[1-9](\.[0-9]{1,3}){0,5}$' then
      v_err := 'CODIGO_INVALIDO'; v_det := jsonb_build_object('codigo', v_e -> 'codigo');
    elsif length(v_nom) < 2 or length(v_nom) > 120 then
      v_err := 'NOMBRE_INVALIDO'; v_det := jsonb_build_object('nombre', v_e -> 'nombre');
    elsif v_rub is not null and v_rub not in ('activo', 'pasivo', 'pn', 'ingreso', 'egreso') then
      v_err := 'RUBRO_INVALIDO'; v_det := jsonb_build_object('rubro', v_e -> 'rubro');
    elsif v_aux is not null and v_aux not in ('none', 'cliente', 'proveedor', 'tesoreria') then
      v_err := 'AUXILIAR_INVALIDO'; v_det := jsonb_build_object('auxiliar', v_e -> 'auxiliar');
    elsif v_vistos ? v_cod then
      v_err := 'DUPLICADA';
      v_det := jsonb_build_object('motivo', 'repetida_en_el_archivo', 'indice_original', v_vistos -> v_cod);
    end if;

    if v_cod ~ '^[1-9](\.[0-9]{1,3}){0,5}$' then
      if not (v_vistos ? v_cod) then v_vistos := v_vistos || jsonb_build_object(v_cod, v_i); end if;
      if position('.' in v_cod) > 0 then
        v_padres := v_padres || regexp_replace(v_cod, '\.[0-9]+$', '');
      end if;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'indice', v_i, 'codigo', nullif(v_cod, ''), 'nombre', nullif(v_nom, ''), 'rubro', v_rub, 'imputable', v_imp,
      'auxiliar', v_aux, 'error', v_err, 'detalle', v_det,
      'valido', v_cod ~ '^[1-9](\.[0-9]{1,3}){0,5}$');
  end loop;

  -- 2) Proceso en orden de nivel y código: los padres antes que las hijas.
  for v_r in
    select r from jsonb_array_elements(v_rows) r
     order by case when (r ->> 'valido')::boolean
                   then array_length(string_to_array(r ->> 'codigo', '.'), 1) else 99 end,
              case when (r ->> 'valido')::boolean
                   then string_to_array(r ->> 'codigo', '.')::int[] end,
              (r ->> 'indice')::int
  loop
    v_err := v_r ->> 'error'; v_det := v_r -> 'detalle';
    v_cod := v_r ->> 'codigo'; v_rub := v_r ->> 'rubro'; v_aux := v_r ->> 'auxiliar';
    v_imp := (v_r ->> 'imputable')::boolean;
    v_pcod := case when (v_r ->> 'valido')::boolean and position('.' in v_cod) > 0
                   then regexp_replace(v_cod, '\.[0-9]+$', '') end;
    v_estado := null; v_cid := null;

    if v_err is null then
      select * into v_db from public.cont_cuentas where codigo = v_cod;
      if found then
        -- Ya existe en la base: se saltea (no es error) y sirve de padre.
        v_estado := 'duplicada'; v_cid := v_db.id;
        v_det := jsonb_build_object('motivo', 'ya_existe', 'cuenta_id', v_db.id);
        v_rub := v_db.rubro; v_imp := v_db.imputable; v_aux := v_db.auxiliar;
      end if;
    end if;

    if v_err is null and v_estado is null then
      -- Padre: en la base o aceptado antes en el archivo.
      v_pfound := false; v_prub := null; v_pimp := null;
      if v_pcod is not null then
        select * into v_db from public.cont_cuentas where codigo = v_pcod;
        if found then
          v_pfound := true; v_prub := v_db.rubro; v_pimp := v_db.imputable;
          if not v_db.activo then
            v_err := 'PADRE_INACTIVO'; v_det := jsonb_build_object('padre_codigo', v_pcod);
          end if;
        elsif v_ok ? v_pcod then
          v_pfound := true; v_prub := v_ok -> v_pcod ->> 'rubro'; v_pimp := (v_ok -> v_pcod ->> 'imputable')::boolean;
        else
          v_err := 'PADRE_NO_EXISTE';
          v_det := jsonb_build_object('padre_codigo', v_pcod)
                   || case when v_pcod = any(v_malas) then jsonb_build_object('motivo', 'padre_con_error') else '{}'::jsonb end;
        end if;
        if v_err is null and v_pimp then
          v_err := 'PADRE_IMPUTABLE'; v_det := jsonb_build_object('padre_codigo', v_pcod);
        end if;
      end if;

      if v_err is null then
        if v_rub is null then
          if v_pcod is null then
            v_err := 'RUBRO_REQUERIDO'; v_det := null;
          else
            v_rub := v_prub;
          end if;
        elsif v_pcod is not null and v_rub <> v_prub then
          v_err := 'RUBRO_DISTINTO_AL_PADRE'; v_det := jsonb_build_object('rubro', v_rub, 'padre_codigo', v_pcod, 'rubro_padre', v_prub);
        end if;
      end if;

      if v_err is null then
        if v_imp is null then
          v_imp := not (v_cod = any(v_padres));
        elsif v_imp and v_cod = any(v_padres) then
          v_err := 'IMPUTABLE_CON_HIJAS'; v_det := jsonb_build_object('codigo', v_cod);
        end if;
      end if;

      if v_err is null then
        v_aux := coalesce(v_aux, 'none');
        if v_aux <> 'none' and not v_imp then
          v_err := 'AUXILIAR_SOLO_IMPUTABLE'; v_det := jsonb_build_object('auxiliar', v_aux);
        end if;
      end if;

      if v_err is null then
        v_estado := 'nueva';
        v_ok := v_ok || jsonb_build_object(v_cod, jsonb_build_object('rubro', v_rub, 'imputable', v_imp));
      end if;
    end if;

    if v_err is not null then
      v_estado := 'error';
      if v_cod is not null then v_malas := v_malas || v_cod; end if;
      v_errs := v_errs + 1;
    elsif v_estado = 'duplicada' then
      v_dups := v_dups + 1;
    else
      v_nuevas := v_nuevas + 1;
    end if;

    v_proc := v_proc || jsonb_build_object(
      'indice', (v_r ->> 'indice')::int, 'estado', v_estado, 'error', v_err, 'detalle', v_det,
      'codigo', v_cod, 'nombre', v_r ->> 'nombre', 'rubro', v_rub, 'imputable', v_imp, 'auxiliar', v_aux,
      'nivel', case when (v_r ->> 'valido')::boolean then array_length(string_to_array(v_cod, '.'), 1) end,
      'padre_codigo', v_pcod, 'cuenta_id', v_cid);
  end loop;

  if p_confirmar then
    if v_errs > 0 then
      raise exception 'IMPORTACION_CON_ERRORES' using errcode = 'P0001',
        detail = jsonb_build_object('errores', (select jsonb_agg(x order by (x ->> 'indice')::int)
                                                  from jsonb_array_elements(v_proc) x where x ->> 'estado' = 'error'))::text;
    end if;
    -- Inserta en orden de proceso (padres primero); el trigger vuelve a validar.
    v_res := '[]'::jsonb;
    for v_r in select x from jsonb_array_elements(v_proc) x loop
      if v_r ->> 'estado' = 'nueva' then
        insert into public.cont_cuentas (codigo, nombre, rubro, imputable, auxiliar, created_by, updated_by)
        values (v_r ->> 'codigo', v_r ->> 'nombre', v_r ->> 'rubro', (v_r ->> 'imputable')::boolean, v_r ->> 'auxiliar',
                p_user_id, p_user_id)
        returning id into v_cid;
        v_r := jsonb_set(v_r, '{cuenta_id}', to_jsonb(v_cid));
      end if;
      v_res := v_res || v_r;
    end loop;
    v_proc := v_res;
  end if;

  return jsonb_build_object(
    'confirmado', p_confirmar, 'total_filas', jsonb_array_length(p_filas),
    'nuevas', v_nuevas, 'duplicadas', v_dups, 'errores', v_errs,
    'filas', coalesce((select jsonb_agg(x order by (x ->> 'indice')::int) from jsonb_array_elements(v_proc) x), '[]'::jsonb));
end $$;

-- ── 6) Cerrar período: numera y congela ────────────────────────────────
create or replace function public.cont_cerrar_periodo(p_periodo_id bigint, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p     public.cont_periodos%rowtype;
  v_eest  text;
  v_ant   public.cont_periodos%rowtype;
  v_nb    int;
  v_ids   jsonb;
  v_n     int;
  v_cant  int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'cerrar_periodos') then
    raise exception 'SIN_PERMISO_CERRAR' using errcode = 'P0001';
  end if;

  select * into v_p from public.cont_periodos where id = p_periodo_id for update;
  if not found then
    raise exception 'PERIODO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  if v_p.estado = 'cerrado' then
    raise exception 'PERIODO_YA_CERRADO' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  select estado into v_eest from public.cont_ejercicios where id = v_p.ejercicio_id;
  if v_eest = 'cerrado' then
    raise exception 'EJERCICIO_CERRADO' using errcode = 'P0001', detail = json_build_object('ejercicio_id', v_p.ejercicio_id)::text;
  end if;
  select * into v_ant from public.cont_periodos
   where ejercicio_id = v_p.ejercicio_id and numero < v_p.numero and estado = 'abierto'
   order by numero limit 1;
  if found then
    raise exception 'PERIODO_ANTERIOR_ABIERTO' using errcode = 'P0001',
      detail = json_build_object('periodo_id', v_ant.id, 'numero', v_ant.numero)::text;
  end if;
  select count(*), (select jsonb_agg(id) from (select id from public.cont_asientos
                                               where periodo_id = p_periodo_id and estado = 'borrador'
                                               order by fecha, id limit 20) x)
    into v_nb, v_ids
    from public.cont_asientos where periodo_id = p_periodo_id and estado = 'borrador';
  if v_nb > 0 then
    raise exception 'HAY_BORRADORES' using errcode = 'P0001',
      detail = json_build_object('cantidad', v_nb, 'ids', v_ids)::text;
  end if;

  perform set_config('cadinc.cont_rpc', 'on', true);
  perform set_config('cadinc.cont_cierre', 'on', true);

  select coalesce(max(numero), 0) into v_n from public.cont_asientos where ejercicio_id = v_p.ejercicio_id;
  update public.cont_asientos a
     set numero = v_n + x.rn, updated_by = p_user_id
    from (select id, row_number() over (order by fecha, id) as rn
            from public.cont_asientos
           where periodo_id = p_periodo_id and estado = 'confirmado') x
   where a.id = x.id;
  get diagnostics v_cant = row_count;

  update public.cont_periodos
     set estado = 'cerrado', cerrado_por = p_user_id, cerrado_at = now(), updated_by = p_user_id
   where id = p_periodo_id;

  perform set_config('cadinc.cont_cierre', 'off', true);

  return jsonb_build_object('periodo', public._cont_periodo_json(p_periodo_id),
                            'numerados', v_cant,
                            'desde_numero', case when v_cant > 0 then v_n + 1 end,
                            'hasta_numero', case when v_cant > 0 then v_n + v_cant end);
end $$;

-- ── 7) Reabrir el último período cerrado: desnumera ────────────────────
create or replace function public.cont_reabrir_periodo(p_periodo_id bigint, p_motivo text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_p      public.cont_periodos%rowtype;
  v_eest   text;
  v_cant   int;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'cerrar_periodos') then
    raise exception 'SIN_PERMISO_CERRAR' using errcode = 'P0001';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
  end if;

  select * into v_p from public.cont_periodos where id = p_periodo_id for update;
  if not found then
    raise exception 'PERIODO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  if v_p.estado <> 'cerrado' then
    raise exception 'PERIODO_NO_CERRADO' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  if exists (select 1 from public.cont_periodos
              where ejercicio_id = v_p.ejercicio_id and numero > v_p.numero and estado = 'cerrado') then
    raise exception 'PERIODO_POSTERIOR_CERRADO' using errcode = 'P0001', detail = json_build_object('periodo_id', p_periodo_id)::text;
  end if;
  select estado into v_eest from public.cont_ejercicios where id = v_p.ejercicio_id;
  if v_eest = 'cerrado' then
    raise exception 'EJERCICIO_CERRADO' using errcode = 'P0001', detail = json_build_object('ejercicio_id', v_p.ejercicio_id)::text;
  end if;

  perform set_config('cadinc.cont_rpc', 'on', true);
  perform set_config('cadinc.cont_cierre', 'on', true);

  update public.cont_asientos set numero = null, updated_by = p_user_id
   where periodo_id = p_periodo_id and numero is not null;
  get diagnostics v_cant = row_count;

  -- cerrado_por/cerrado_at se limpian (el historial queda en audit_log):
  -- un período abierto con "cerrado por X" confunde en la pantalla.
  update public.cont_periodos
     set estado = 'abierto', cerrado_por = null, cerrado_at = null,
         reabierto_por = p_user_id, reabierto_at = now(), motivo_reapertura = v_motivo, updated_by = p_user_id
   where id = p_periodo_id;

  perform set_config('cadinc.cont_cierre', 'off', true);

  return jsonb_build_object('periodo', public._cont_periodo_json(p_periodo_id), 'desnumerados', v_cant);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_cuenta_json(bigint)',
    '_cont_periodo_json(bigint)',
    'cont_guardar_cuenta(jsonb, uuid)',
    'cont_baja_cuenta(bigint, boolean, text, uuid)',
    'cont_borrar_cuenta(bigint, uuid)',
    'cont_importar_plan(jsonb, uuid, boolean)',
    'cont_cerrar_periodo(bigint, uuid)',
    'cont_reabrir_periodo(bigint, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
