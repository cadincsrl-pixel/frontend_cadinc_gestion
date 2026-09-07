-- 20260906q — La base deja de aceptar escrituras directas de usuarios logueados.
--
-- Hasta hoy 117 de 124 tablas tenían policy `using(true) with check(true)` y
-- grants completos para anon/authenticated: cualquier usuario logueado, con la
-- anon key del bundle y su JWT, podía escribir cualquier tabla por PostgREST
-- sin pasar por el backend (permisos, alcance de obras, auditoría). El
-- frontend nunca escribe directo (0 insert/update/delete en supabase-js), así
-- que el único escritor legítimo es el backend Hono.
--
-- El backend, hasta este cambio, escribía con el JWT del usuario (rol
-- efectivo `authenticated`). Desde cadincsrl `src/lib/supabase.ts` (commit
-- 5ff41ad, 2026-09-07) todas sus llamadas van como service_role y el usuario viaja en el
-- header `x-cadinc-user`. ⚠ Aplicar DESPUÉS de que ese backend esté en prod:
-- con el backend viejo, esta migración rompe todas las escrituras.
--
-- Qué hace:
--   1. `usuario_actual()`: el usuario del request, venga por JWT (navegador,
--      SQL con token) o por el header del backend (service_role).
--   2. Los objetos de la base que usaban auth.uid() pasan a usuario_actual().
--   3. Revoca INSERT/UPDATE/DELETE/TRUNCATE en todas las tablas y USAGE/UPDATE
--      en todas las secuencias de `public` para anon y authenticated, y saca
--      esos privilegios de los defaults para tablas futuras.
--   Las lecturas quedan como estaban (el frontend lee ~130 tablas directo);
--   se cierran tabla por tabla en la fase 3.

-- 1) Usuario actual ---------------------------------------------------------
create or replace function public.usuario_actual() returns uuid
language plpgsql stable as $$
declare
  v_header text;
begin
  if auth.uid() is not null then
    return auth.uid();
  end if;
  begin
    v_header := nullif(current_setting('request.headers', true)::json ->> 'x-cadinc-user', '');
    return v_header::uuid;
  exception when others then
    return null;
  end;
end $$;

comment on function public.usuario_actual() is
  'Usuario del request: auth.uid() si vino un JWT, o el header x-cadinc-user que manda el backend cuando opera como service_role.';

grant execute on function public.usuario_actual() to authenticated, service_role;

-- 2) Objetos que dependían de auth.uid() ------------------------------------

-- audit_cambios (20260906l/n/o): el usuario ahora llega por el header.
create or replace function public.audit_cambios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_modulo  text := tg_argv[0];
  v_entidad text := tg_argv[1];
  v_pk      text := tg_argv[2];
  v_ignorar text[] := array['created_at', 'updated_at', 'created_by', 'updated_by',
                            'precio_actualizado_en', 'stock_actual'];
  v_old     jsonb := to_jsonb(old);
  v_new     jsonb := to_jsonb(new);
  v_k       text;
  v_partes  text[] := '{}';
  v_uid     uuid;
  v_nombre  text;
begin
  for v_k in select jsonb_object_keys(v_new) loop
    if v_k = any(v_ignorar) then continue; end if;
    if v_old -> v_k is distinct from v_new -> v_k then
      v_partes := v_partes || format('%s: %s → %s', v_k,
        public.audit_fmt_valor(v_old -> v_k), public.audit_fmt_valor(v_new -> v_k));
    end if;
  end loop;
  if coalesce(array_length(v_partes, 1), 0) = 0 then
    return new;
  end if;

  -- JWT del request o header x-cadinc-user del backend. Si no hay ninguno
  -- (migración por SQL), queda vacío y la pantalla lo muestra como "sistema".
  begin
    v_uid := public.usuario_actual();
  exception when others then
    v_uid := null;
  end;
  if v_uid is not null then
    select nombre into v_nombre from public.profiles where id = v_uid;
  end if;

  insert into public.audit_log (user_id, user_nombre, modulo, accion, entidad, entidad_id, detalle, ip)
  values (v_uid, v_nombre, v_modulo, 'cambio', v_entidad, v_new ->> v_pk,
          array_to_string(v_partes, ' · '), null);
  return new;
end $$;

-- Gate viejo de RPCs (sin llamadores hoy; se mantiene coherente por si se reusa).
create or replace function public._require_permiso_or_admin(p_modulo text, p_accion text) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_uid      uuid := public.usuario_actual();
  v_rol      text;
  v_permisos jsonb;
begin
  if v_uid is null then
    raise exception 'NO_AUTH';
  end if;
  select rol, permisos into v_rol, v_permisos from profiles where id = v_uid;
  if not found then
    raise exception 'SIN_PERFIL';
  end if;
  if v_rol = 'admin' then
    return;
  end if;
  if coalesce((v_permisos -> p_modulo ->> p_accion)::boolean, false) then
    return;
  end if;
  raise exception 'SIN_PERMISO'
    using detail = json_build_object('modulo', p_modulo, 'accion', p_accion)::text;
end $$;

-- 3) Sin escritura directa para los roles de la API ---------------------------
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate on table public.%I from anon, authenticated', r.tablename);
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('revoke usage, update on sequence public.%I from anon, authenticated', r.sequencename);
  end loop;
end $$;

-- Tablas y secuencias futuras creadas por `postgres` (migraciones) nacen sin
-- escritura para anon/authenticated.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, update on sequences from anon, authenticated;
