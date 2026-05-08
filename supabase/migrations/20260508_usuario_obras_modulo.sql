-- Permisos v2 — scope de obras POR MÓDULO.
--
-- Hasta ahora, `usuario_obras` era un set único de obras por usuario que
-- aplicaba a TODOS los módulos. Esto rompe casos como:
--   - Encargado de depósito (Cristian): debe ver TODAS las obras en
--     certificaciones (resuelve compras de toda la empresa) pero
--     cargar horas SOLO en la obra "depósito" en tarja.
--
-- Solución: agregar columna `modulo` opcional a usuario_obras. Cada row
-- puede ser:
--   - modulo IS NULL  → aplica a todos los módulos donde el perfil tiene
--                       scope='asignadas' (compat con perfiles viejos).
--   - modulo = 'tarja' (etc.) → la obra solo aplica a ese módulo.
--
-- Combinado con `permisos.<modulo>.obras_scope` (override por módulo en
-- el JSONB de permisos), un mismo usuario puede tener distintos scopes
-- en distintos módulos. Si un módulo no tiene override, usa el global
-- `profiles.obras_scope`.
--
-- Cambios concretos:
--   1) Drop PK (user_id, obra_cod) → no nos sirve porque ahora una obra
--      puede repetirse para distintos módulos.
--   2) Agregar `id` BIGSERIAL como PK sustituta.
--   3) Agregar `modulo text` nullable + CHECK.
--   4) UNIQUE NULLS NOT DISTINCT (user_id, obra_cod, modulo) — evita
--      duplicados aunque modulo sea NULL.
--   5) Índice (user_id, modulo) para el query típico.

-- 1) Drop PK actual
ALTER TABLE usuario_obras
  DROP CONSTRAINT IF EXISTS usuario_obras_pkey;

-- 2) Agregar id como nueva PK
ALTER TABLE usuario_obras
  ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;

-- 3) Agregar modulo nullable + CHECK
ALTER TABLE usuario_obras
  ADD COLUMN IF NOT EXISTS modulo text;

ALTER TABLE usuario_obras
  DROP CONSTRAINT IF EXISTS usuario_obras_modulo_chk;
ALTER TABLE usuario_obras
  ADD CONSTRAINT usuario_obras_modulo_chk
  CHECK (modulo IS NULL OR modulo = ANY(ARRAY[
    'tarja', 'logistica', 'certificaciones', 'herramientas',
    'caja', 'ropa', 'prestamos', 'admin', 'configuracion'
  ]));

-- 4) UNIQUE con NULLS NOT DISTINCT (PG 15+, Supabase usa 17.6).
--    Esto asegura que (user_id, obra_cod, NULL) no se duplique.
ALTER TABLE usuario_obras
  DROP CONSTRAINT IF EXISTS usuario_obras_user_id_obra_cod_modulo_uniq;
ALTER TABLE usuario_obras
  ADD CONSTRAINT usuario_obras_user_id_obra_cod_modulo_uniq
  UNIQUE NULLS NOT DISTINCT (user_id, obra_cod, modulo);

-- 5) Índice para queries por (user, modulo).
--    El planner ya tiene el unique, pero un índice explícito ayuda al
--    "WHERE user_id=? AND (modulo=? OR modulo IS NULL)".
CREATE INDEX IF NOT EXISTS usuario_obras_user_modulo_idx
  ON usuario_obras (user_id, modulo);
