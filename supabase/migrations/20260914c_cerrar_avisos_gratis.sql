-- Los tres avisos de seguridad que se cierran sin tocar nada de lo que la app usa.
-- Salen de la auditoría del 12/09 (ver el diario de ese día). Los tres consumidores
-- de estos objetos están en el backend, que entra como `service_role` desde `5ff41ad`
-- y por lo tanto saltea RLS: nada de esto le cambia el comportamiento.
--
-- Lo que NO está acá es el paso grande (cerrar las lecturas directas). Va aparte,
-- porque ese sí necesita prueba manual de la app.

-- 1) audit_cambios() es una función de TRIGGER con security definer. PostgREST la
--    expone igual en /rest/v1/rpc/audit_cambios, y aunque llamarla suelta termina en
--    error de Postgres ("trigger functions can only be called as triggers"), no hay
--    ninguna razón para que el endpoint exista. Los triggers que la usan no dependen
--    del EXECUTE del que llama: corren con el dueño de la tabla.
revoke execute on function public.audit_cambios() from public, anon, authenticated;

-- 2) tipos_servicio es la única tabla de `public` sin RLS. Se prende SIN policy:
--    eso la deja en el mismo estado que audit_log, roles y las de oficina, o sea
--    legible solo por el backend. El frontend no la toca (verificado: las únicas
--    tablas que lee directo son profiles, ropa_categorias y ropa_entregas).
alter table public.tipos_servicio enable row level security;

-- 3) Las cuatro vistas corren con los permisos de su creador. Hoy no saltean nada
--    porque no hay RLS restrictiva que saltear, pero con `security_invoker` quedan
--    del lado correcto para cuando se cierren las lecturas, y sale el aviso ERROR.
alter view public.v_material_compras           set (security_invoker = on);
alter view public.v_movimientos_precio         set (security_invoker = on);
alter view public.v_cuenta_cliente_pendientes  set (security_invoker = on);
alter view public.v_material_ultima_compra     set (security_invoker = on);
