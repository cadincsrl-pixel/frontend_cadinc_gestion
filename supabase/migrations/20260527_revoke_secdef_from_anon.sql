-- Revoca EXECUTE de los roles `anon` y `authenticated` para todas las funciones
-- SECURITY DEFINER del schema `public`. El Supabase Security Advisor reportó
-- 15 funciones expuestas via /rest/v1/rpc/... que cualquier portador de la
-- anon key (visible en el bundle del frontend) podía ejecutar saltándose el
-- backend Hono.
--
-- Estas funciones reciben `p_user_id uuid` como parámetro, pero ese parámetro
-- es untrusted cuando lo provee el caller — un atacante podría pasar el UUID
-- de un admin y ejecutar como admin sin tener su JWT.
--
-- El backend Hono usa `SUPABASE_SERVICE_ROLE_KEY` para llamar a estas RPCs
-- (cadincsrl/src/lib/supabase.ts:4). `service_role` tiene EXECUTE granted
-- por default y no se ve afectado por este REVOKE. Tampoco afecta a `postgres`
-- (el owner). Resultado neto: backend sigue funcionando, anon y authenticated
-- ya no pueden llamar las funciones directo via PostgREST.
--
-- DO block para no tener que listar las 15 firmas a mano (especialmente
-- `create_liquidacion_con_reintegros` que tiene 2 firmas distintas) y para
-- cubrir automáticamente cualquier SECURITY DEFINER que se agregue al
-- schema en el futuro.

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, authenticated',
      f.schema_name, f.func_name, f.args
    );
    RAISE NOTICE 'Revoked EXECUTE on %.%(%) from anon, authenticated',
      f.schema_name, f.func_name, f.args;
  END LOOP;
END $$;
