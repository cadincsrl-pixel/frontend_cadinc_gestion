-- Contactos: dos arreglos a `*_guardar_contactos` (revisión del 24/09).
--
-- 1) `obs` se conserva si la pantalla no la manda (la pantalla todavía no la
--    edita: antes cada guardado la ponía en null).
-- 2) ESPEJO en las columnas viejas del padrón. `pagos_proveedores.email /
--    contacto / telefono` y `ventas_clientes.email` los siguen leyendo el
--    Excel del Galicia, el export de proveedores, el estado de cuenta y el
--    aviso de pago como último recurso. En vez de tocar a cada lector, la
--    función deja ahí el contacto principal: el primero que recibe avisos y
--    tiene email; si no hay, el primero de la lista. Sin contactos, vacíos.
--    La fuente de verdad sigue siendo la tabla de contactos.

create or replace function public.ventas_guardar_contactos(p_cliente_id bigint, p_contactos jsonb, p_user_id uuid)
returns setof public.ventas_cliente_contactos
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  e jsonb; i int := 0; v_email text; v_principal text;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  perform 1 from public.ventas_clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'CLIENTE_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('cliente_id', p_cliente_id)::text;
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
                and not exists (select 1 from public.ventas_cliente_contactos k
                                 where k.id = (x ->> 'id')::bigint and k.cliente_id = p_cliente_id)) then
    raise exception 'CONTACTO_DE_OTRO' using errcode = 'P0001';
  end if;
  delete from public.ventas_cliente_contactos k
   where k.cliente_id = p_cliente_id
     and k.id not in (select (x ->> 'id')::bigint from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
                       where (x ->> 'id') is not null);
  -- Emails de los que se editan a null primero: así intercambiar el email
  -- entre dos contactos no choca con el índice único a mitad del loop.
  update public.ventas_cliente_contactos k set email = null
   where k.cliente_id = p_cliente_id and k.email is not null
     and k.id in (select (x ->> 'id')::bigint from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
                   where (x ->> 'id') is not null
                     and lower(coalesce(public._contacto_txt(x, 'email'), '')) is distinct from k.email);
  for e in select * from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) loop
    i := i + 1;
    if (e ->> 'id') is not null then
      update public.ventas_cliente_contactos set
        nombre = public._contacto_txt(e, 'nombre'), rol = coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
        email = lower(public._contacto_txt(e, 'email')), telefono = public._contacto_txt(e, 'telefono'),
        recibe_avisos = coalesce((e ->> 'recibe_avisos')::boolean, true),
        obs = case when e ? 'obs' then public._contacto_txt(e, 'obs') else obs end,
        orden = i, updated_by = p_user_id
       where id = (e ->> 'id')::bigint;
    else
      insert into public.ventas_cliente_contactos (cliente_id, nombre, rol, email, telefono, recibe_avisos, obs, orden, created_by, updated_by)
      values (p_cliente_id, public._contacto_txt(e, 'nombre'), coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
              lower(public._contacto_txt(e, 'email')), public._contacto_txt(e, 'telefono'),
              coalesce((e ->> 'recibe_avisos')::boolean, true), public._contacto_txt(e, 'obs'), i, p_user_id, p_user_id);
    end if;
  end loop;
  select k.email into v_principal from public.ventas_cliente_contactos k
   where k.cliente_id = p_cliente_id and k.email is not null
   order by k.recibe_avisos desc, k.orden, k.id limit 1;
  update public.ventas_clientes set email = v_principal, updated_by = p_user_id
   where id = p_cliente_id and email is distinct from v_principal;
  return query select * from public.ventas_cliente_contactos where cliente_id = p_cliente_id order by orden, id;
end $f$;

create or replace function public.pagos_guardar_contactos(p_proveedor_id bigint, p_contactos jsonb, p_user_id uuid)
returns setof public.pagos_proveedor_contactos
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare
  e jsonb; i int := 0; v_email text; p record;
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
  update public.pagos_proveedor_contactos k set email = null
   where k.proveedor_id = p_proveedor_id and k.email is not null
     and k.id in (select (x ->> 'id')::bigint from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) x
                   where (x ->> 'id') is not null
                     and lower(coalesce(public._contacto_txt(x, 'email'), '')) is distinct from k.email);
  for e in select * from jsonb_array_elements(coalesce(p_contactos, '[]'::jsonb)) loop
    i := i + 1;
    if (e ->> 'id') is not null then
      update public.pagos_proveedor_contactos set
        nombre = public._contacto_txt(e, 'nombre'), rol = coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
        email = lower(public._contacto_txt(e, 'email')), telefono = public._contacto_txt(e, 'telefono'),
        recibe_avisos = coalesce((e ->> 'recibe_avisos')::boolean, true),
        obs = case when e ? 'obs' then public._contacto_txt(e, 'obs') else obs end,
        orden = i, updated_by = p_user_id
       where id = (e ->> 'id')::bigint;
    else
      insert into public.pagos_proveedor_contactos (proveedor_id, nombre, rol, email, telefono, recibe_avisos, obs, orden, created_by, updated_by)
      values (p_proveedor_id, public._contacto_txt(e, 'nombre'), coalesce(public._contacto_txt(e, 'rol'), 'administracion'),
              lower(public._contacto_txt(e, 'email')), public._contacto_txt(e, 'telefono'),
              coalesce((e ->> 'recibe_avisos')::boolean, true), public._contacto_txt(e, 'obs'), i, p_user_id, p_user_id);
    end if;
  end loop;
  -- Espejo: el principal (recibe avisos y con email primero) a las columnas viejas.
  select k.nombre, k.email, k.telefono into p from public.pagos_proveedor_contactos k
   where k.proveedor_id = p_proveedor_id
   order by (k.recibe_avisos and k.email is not null) desc, (k.email is not null) desc, k.orden, k.id limit 1;
  update public.pagos_proveedores set
    email = coalesce(p.email, ''), contacto = coalesce(p.nombre, ''), telefono = coalesce(p.telefono, ''), updated_by = p_user_id
   where id = p_proveedor_id
     and (email, contacto, telefono) is distinct from (coalesce(p.email, ''), coalesce(p.nombre, ''), coalesce(p.telefono, ''));
  return query select * from public.pagos_proveedor_contactos where proveedor_id = p_proveedor_id order by orden, id;
end $f$;
