-- Fix correctivo de la migración `20260527_revoke_secdef_from_anon.sql`.
-- Aquella migración hizo `REVOKE EXECUTE FROM anon, authenticated`, pero
-- las funciones SECURITY DEFINER también tienen `GRANT EXECUTE TO PUBLIC`
-- heredado del default de Postgres. `PUBLIC` es un pseudo-rol que incluye
-- a anon + authenticated + service_role + postgres, así que el grant a
-- PUBLIC le seguía dando permiso a anon/authenticated aunque tuviéramos
-- los revokes explícitos.
--
-- Verificado con `has_function_privilege('anon', ...)` después del primer
-- fix: devolvía `true` igual.
--
-- Patrón Supabase correcto para SECURITY DEFINER:
--   1) REVOKE ALL ... FROM PUBLIC      → quita el grant default
--   2) REVOKE ALL ... FROM anon, authenticated  (defensa en profundidad)
--   3) GRANT EXECUTE ... TO service_role  → asegura que el backend Hono
--      sigue pudiendo llamar las funciones con el service_role key.
--
-- El backend usa SUPABASE_SERVICE_ROLE_KEY (cadincsrl/src/lib/supabase.ts:4),
-- así que cero impacto funcional.

DO $$
DECLARE
  f record;
  ident text;
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
    ident := format('%I.%I(%s)', f.schema_name, f.func_name, f.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', ident);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', ident);
  END LOOP;
END $$;
