-- 20260907c — Las vistas también sin escritura directa.
--
-- 20260906q recorrió pg_tables y 18 vistas quedaron con INSERT/UPDATE/DELETE/
-- TRUNCATE para anon/authenticated. Una vista simple es actualizable y corre
-- con los privilegios de su dueño (postgres): escribirla equivale a escribir
-- la tabla de abajo. Los default privileges de 20260906q ya cubren las vistas
-- futuras (para Postgres son "tables").
do $$
declare r record;
begin
  for r in select viewname from pg_views where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate on table public.%I from anon, authenticated', r.viewname);
  end loop;
  for r in select matviewname from pg_matviews where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate on table public.%I from anon, authenticated', r.matviewname);
  end loop;
end $$;
