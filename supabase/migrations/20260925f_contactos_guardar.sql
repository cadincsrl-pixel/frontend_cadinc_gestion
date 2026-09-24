-- Guardar la lista de contactos de un cliente / proveedor de una vez (24/09).
--
-- La pantalla edita la lista entera y la manda. Estas funciones la aplican en
-- UNA transacción: actualizan los que traen `id`, insertan los nuevos y borran
-- los que ya no vienen (así la auditoría registra cada cambio real, en vez de
-- borrar todo y volver a insertar). `orden` = la posición en la lista.
--
-- p_contactos = [{ id?, nombre?, rol, email?, telefono?, recibe_avisos, obs? }]
-- Errores: CONTACTO_DE_OTRO (un id que no es de este cliente/proveedor),
-- CONTACTO_EMAIL_DUPLICADO { email }, y los CHECK de la tabla (rol, email,
-- contacto vacío) que el backend traduce.

create or replace function public._contacto_txt(p jsonb, k text)
returns text language sql immutable set search_path to 'public', 'pg_temp' as $f$ select nullif(btrim(coalesce(p ->> k, '')), '') $f$;

create or replace function public.ventas_guardar_contactos(p_cliente_id bigint, p_contactos jsonb, p_user_id uuid)
returns setof public.ventas_cliente_contactos
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  e jsonb; i int := 0; v_email text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  perform 1 from public.ventas_clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'CLIENTE_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('cliente_id', p_cliente_id)::text;
  end if;
  if jsonb_typeof(coalesce(p_contactos, '[]'::jsonb)) <> 'array' then
    raise exception 'DATOS_INVALIDOS' using errcode = 'P0001', detail = json_build_object('campo', 'contactos')::text;
  end if;
  -- Emails repetidos dentro de la misma lista.
  select lower(public._contacto_txt(x, 'email')) into v_email
    from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
   where public._contacto_txt(x, 'email') is not null
   group by 1 having count(*) > 1 limit 1;
  if v_email is not null then
    raise exception 'CONTACTO_EMAIL_DUPLICADO' using errcode = 'P0001', detail = json_build_object('email', v_email)::text;
  end if;
  -- Ids ajenos.
  if exists (select 1 from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
              where (x ->> 'id') is not null
                and not exists (select 1 from public.ventas_cliente_contactos k
                                 where k.id = (x ->> 'id')::bigint and k.cliente_id = p_cliente_id)) then
    raise exception 'CONTACTO_DE_OTRO' using errcode = 'P0001';
  end if;
  -- Primero se borran los que no vienen (libera emails para el índice único).
  delete from public.ventas_cliente_contactos k
   where k.cliente_id = p_cliente_id
     and k.id not in (select (x ->> 'id')::bigint from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
                       where (x ->> 'id') is not null);
  for e in select * from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) loop
    i := i + 1;
    if (e ->> 'id') is not null then
      update public.ventas_cliente_contactos set
        nombre = public._contacto_txt(e, 'nombre'), rol = coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
        email = lower(public._contacto_txt(e, 'email')), telefono = public._contacto_txt(e, 'telefono'),
        recibe_avisos = coalesce((e ->> 'recibe_avisos')::boolean, true), obs = public._contacto_txt(e, 'obs'),
        orden = i, updated_by = p_user_id
       where id = (e ->> 'id')::bigint;
    else
      insert into public.ventas_cliente_contactos (cliente_id, nombre, rol, email, telefono, recibe_avisos, obs, orden, created_by, updated_by)
      values (p_cliente_id, public._contacto_txt(e, 'nombre'), coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
              lower(public._contacto_txt(e, 'email')), public._contacto_txt(e, 'telefono'),
              coalesce((e ->> 'recibe_avisos')::boolean, true), public._contacto_txt(e, 'obs'), i, p_user_id, p_user_id);
    end if;
  end loop;
  return query select * from public.ventas_cliente_contactos where cliente_id = p_cliente_id order by orden, id;
end $f$;

create or replace function public.pagos_guardar_contactos(p_proveedor_id bigint, p_contactos jsonb, p_user_id uuid)
returns setof public.pagos_proveedor_contactos
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  e jsonb; i int := 0; v_email text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  perform 1 from public.pagos_proveedores where id = p_proveedor_id for update;
  if not found then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_proveedor_id)::text;
  end if;
  if jsonb_typeof(coalesce(p_contactos, '[]'::jsonb)) <> 'array' then
    raise exception 'DATOS_INVALIDOS' using errcode = 'P0001', detail = json_build_object('campo', 'contactos')::text;
  end if;
  select lower(public._contacto_txt(x, 'email')) into v_email
    from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
   where public._contacto_txt(x, 'email') is not null
   group by 1 having count(*) > 1 limit 1;
  if v_email is not null then
    raise exception 'CONTACTO_EMAIL_DUPLICADO' using errcode = 'P0001', detail = json_build_object('email', v_email)::text;
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
              where (x ->> 'id') is not null
                and not exists (select 1 from public.pagos_proveedor_contactos k
                                 where k.id = (x ->> 'id')::bigint and k.proveedor_id = p_proveedor_id)) then
    raise exception 'CONTACTO_DE_OTRO' using errcode = 'P0001';
  end if;
  delete from public.pagos_proveedor_contactos k
   where k.proveedor_id = p_proveedor_id
     and k.id not in (select (x ->> 'id')::bigint from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
                       where (x ->> 'id') is not null);
  for e in select * from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) loop
    i := i + 1;
    if (e ->> 'id') is not null then
      update public.pagos_proveedor_contactos set
        nombre = public._contacto_txt(e, 'nombre'), rol = coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
        email = lower(public._contacto_txt(e, 'email')), telefono = public._contacto_txt(e, 'telefono'),
        recibe_avisos = coalesce((e ->> 'recibe_avisos')::boolean, true), obs = public._contacto_txt(e, 'obs'),
        orden = i, updated_by = p_user_id
       where id = (e ->> 'id')::bigint;
    else
      insert into public.pagos_proveedor_contactos (proveedor_id, nombre, rol, email, telefono, recibe_avisos, obs, orden, created_by, updated_by)
      values (p_proveedor_id, public._contacto_txt(e, 'nombre'), coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
              lower(public._contacto_txt(e, 'email')), public._contacto_txt(e, 'telefono'),
              coalesce((e ->> 'recibe_avisos')::boolean, true), public._contacto_txt(e, 'obs'), i, p_user_id, p_user_id);
    end if;
  end loop;
  return query select * from public.pagos_proveedor_contactos where proveedor_id = p_proveedor_id order by orden, id;
end $f$;

revoke all on function public._contacto_txt(jsonb, text) from public, anon, authenticated;
revoke all on function public.ventas_guardar_contactos(bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.pagos_guardar_contactos(bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function public._contacto_txt(jsonb, text) to service_role;
grant execute on function public.ventas_guardar_contactos(bigint, jsonb, uuid) to service_role;
grant execute on function public.pagos_guardar_contactos(bigint, jsonb, uuid) to service_role;
