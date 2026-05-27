-- Setea `security_invoker = on` en las 4 vistas de `public` que el Supabase
-- Security Advisor marcó como `security_definer_view`.
--
-- Default de Postgres: una vista se evalúa con los permisos del owner
-- (postgres en este caso), no del usuario que la consulta. Eso puede
-- bypassar RLS de las tablas subyacentes. En Supabase la convención es
-- `security_invoker = on` para que la vista respete el RLS del usuario.
--
-- En CADINC el riesgo real es bajo (todas las policies son `using(true)`
-- — ver CLAUDE.md §5.4), pero la regla del advisor aplica igual y queda
-- alineado con el patrón estándar.

ALTER VIEW public.v_camion_service_estado            SET (security_invoker = on);
ALTER VIEW public.v_chofer_documentos_vencimientos   SET (security_invoker = on);
ALTER VIEW public.v_stock_proveedor                  SET (security_invoker = on);
ALTER VIEW public.v_vehiculo_documentos_vencimientos SET (security_invoker = on);
