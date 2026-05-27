-- Setea `search_path = public, pg_temp` en todas las funciones de `public`
-- que aún no tienen un search_path explícito en `proconfig`. El Supabase
-- Security Advisor reportó 23 funciones con `function_search_path_mutable`.
--
-- Riesgo del search_path mutable: si un atacante consigue crear un schema
-- con nombre que matchee tablas/funciones internas, la función podría
-- referenciarlas de ese schema impostor en lugar del schema real. En
-- CADINC el riesgo es bajo (single-tenant, sin schemas custom), pero el
-- fix es estándar y silencia el advisor.
--
-- `search_path = public, pg_temp` es la opción menos invasiva: las
-- referencias no calificadas siguen resolviendo en `public` como hasta
-- ahora; `pg_temp` queda incluido por si alguna función usa tablas
-- temporarias. La alternativa más estricta (`search_path = ''` con todos
-- los identificadores calificados con `public.`) requiere reescribir
-- el cuerpo de cada función — fuera de scope de este fix.
--
-- DO block para cubrir todas las funciones del schema (las 23 del advisor
-- + cualquier otra interna que también esté sin search_path). Las
-- funciones que ya tienen search_path seteado quedan intactas.

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
       AND p.prokind  = 'f'           -- solo funciones (no procedures ni agg)
       AND (
         p.proconfig IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%'
         )
       )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      f.schema_name, f.func_name, f.args
    );
  END LOOP;
END $$;
