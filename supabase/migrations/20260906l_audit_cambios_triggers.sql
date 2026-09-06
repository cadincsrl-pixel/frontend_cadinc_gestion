-- 20260906l — Auditoría de cambios ANTES/DESPUÉS en las tablas sensibles.
--
-- El middleware HTTP del backend guarda el body que mandó el usuario, pero no
-- qué valor había antes: un precio_ref pisado, una tarifa cambiada, una
-- categoría reasignada o un permiso tocado no se podían reconstruir. Este
-- trigger genérico compara OLD y NEW columna por columna y deja UNA fila en
-- audit_log con accion='cambio' y detalle "campo: antes → después · ...".
-- Corre también para UPDATEs hechos por SQL (migraciones, RPCs con
-- service_role): ahí el usuario queda vacío y la pantalla lo muestra como
-- "sistema", que es exactamente lo que pasó.
--
-- SECURITY DEFINER: el INSERT en audit_log lo hace el dueño de la función,
-- porque la migración 20260906m le saca a `authenticated` todo acceso a la
-- tabla (solo escribe/lee el backend).

create or replace function public.audit_fmt_valor(v jsonb) returns text
language sql immutable as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then '∅'
    when jsonb_typeof(v) = 'string' then
      case when length(v #>> '{}') > 60 then left(v #>> '{}', 57) || '…' else v #>> '{}' end
    when jsonb_typeof(v) in ('array', 'object') then
      case when length(v::text) > 60 then left(v::text, 57) || '…' else v::text end
    else v #>> '{}'
  end
$$;

create or replace function public.audit_cambios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_modulo  text := tg_argv[0];
  v_entidad text := tg_argv[1];
  v_pk      text := tg_argv[2];
  -- Columnas de bookkeeping: cambian solas y no le dicen nada al que lee el log.
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

  -- Usuario: el JWT del request (el backend usa un cliente per-request con el
  -- token del usuario) o, si el UPDATE vino por service_role/SQL, el
  -- updated_by que haya puesto el handler. Si no hay ninguno, queda vacío.
  begin
    v_uid := coalesce(auth.uid(), (v_new ->> 'updated_by')::uuid);
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

revoke all on function public.audit_cambios() from public;
grant execute on function public.audit_cambios() to authenticated, service_role;

-- Tablas auditadas: (módulo del log, nombre de la entidad, columna pk).
drop trigger if exists trg_audit_cambios on public.stock_materiales;
create trigger trg_audit_cambios after update on public.stock_materiales
  for each row execute function public.audit_cambios('stock', 'material', 'id');

drop trigger if exists trg_audit_cambios on public.tarifas;
create trigger trg_audit_cambios after update on public.tarifas
  for each row execute function public.audit_cambios('tarifas', 'tarifa de obra', 'id');

drop trigger if exists trg_audit_cambios on public.categoria_tarifas;
create trigger trg_audit_cambios after update on public.categoria_tarifas
  for each row execute function public.audit_cambios('categorias', 'tarifa global', 'id');

drop trigger if exists trg_audit_cambios on public.categorias;
create trigger trg_audit_cambios after update on public.categorias
  for each row execute function public.audit_cambios('categorias', 'categoría', 'id');

drop trigger if exists trg_audit_cambios on public.cat_obra;
create trigger trg_audit_cambios after update on public.cat_obra
  for each row execute function public.audit_cambios('cat-obra', 'categoría por obra', 'id');

drop trigger if exists trg_audit_cambios on public.personal;
create trigger trg_audit_cambios after update on public.personal
  for each row execute function public.audit_cambios('personal', 'trabajador', 'leg');

drop trigger if exists trg_audit_cambios on public.obras;
create trigger trg_audit_cambios after update on public.obras
  for each row execute function public.audit_cambios('obras', 'obra', 'cod');

drop trigger if exists trg_audit_cambios on public.choferes;
create trigger trg_audit_cambios after update on public.choferes
  for each row execute function public.audit_cambios('logistica', 'chofer', 'id');

drop trigger if exists trg_audit_cambios on public.profiles;
create trigger trg_audit_cambios after update on public.profiles
  for each row execute function public.audit_cambios('usuarios', 'usuario', 'id');
