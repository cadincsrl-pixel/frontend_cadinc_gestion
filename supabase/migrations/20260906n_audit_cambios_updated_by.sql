-- 20260906n — audit_cambios: no atribuir al último editor un UPDATE hecho por SQL.
--
-- La primera versión (20260906l) tomaba `updated_by` como fallback cuando no
-- había JWT. Pero updated_by es el ÚLTIMO que editó por la app: un UPDATE de
-- una migración sobre esa fila quedaba a nombre de esa persona (probado con
-- la obra de prueba: el cambio por SQL salió como "Franco Leiro"). Ahora el
-- fallback solo vale si el mismo UPDATE tocó updated_at (= lo hizo un handler
-- del backend con service_role, que setea las dos columnas); si no, queda
-- vacío y la pantalla lo muestra como "sistema".

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

  begin
    v_uid := auth.uid();
    if v_uid is null and (v_new ->> 'updated_at') is distinct from (v_old ->> 'updated_at') then
      v_uid := (v_new ->> 'updated_by')::uuid;
    end if;
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
