-- Permisos v2 — Fase 1.
--
-- Se agregan dos columnas a profiles para desacoplar los conceptos:
--   - rol_base       : enum cerrado de presets (administrativo / compras /
--                      deposito / jefe_obra / capataz). Reemplaza el "tipo_usuario"
--                      legacy con un set más chico de roles base. Los add-ons
--                      (jefe_obra_supervisor, capataz_supervisor) se modelan
--                      como rol_base + flags en permisos, no como tipo nuevo.
--   - obras_scope    : explicit 'todas' | 'asignadas'. Antes se derivaba de
--                      tipo_usuario lo que mezclaba dos conceptos
--                      (qué hace + qué obras ve). Ahora se separan.
--
-- Backfill conservador: leemos tipo_usuario para no romper a usuarios viejos.
-- El backend lee ambos (dual-read) para zero downtime: si rol_base está
-- seteado lo respeta, si no cae al tipo_usuario legacy.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rol_base    text,
  ADD COLUMN IF NOT EXISTS obras_scope text NOT NULL DEFAULT 'todas';

-- Constraint: rol_base solo puede tomar uno de los 5 presets (o NULL).
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_rol_base_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_rol_base_check
  CHECK (rol_base IS NULL OR rol_base IN (
    'administrativo', 'compras', 'deposito', 'jefe_obra', 'capataz'
  ));

-- Constraint: obras_scope solo puede tomar uno de dos valores.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_obras_scope_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_obras_scope_check
  CHECK (obras_scope IN ('todas', 'asignadas'));

-- Backfill rol_base desde tipo_usuario.
-- Mapeo:
--   administrativo                   → administrativo
--   compras                          → compras
--   encargado_deposito               → deposito
--   jefe_obra, jefe_obra_supervisor  → jefe_obra
--   capataz, capataz_supervisor      → capataz
--   personalizado / null             → null (queda sin rol_base, fallback al
--                                       sistema legacy hasta que se reasigne)
UPDATE profiles SET rol_base = 'administrativo'
  WHERE rol_base IS NULL AND tipo_usuario = 'administrativo';
UPDATE profiles SET rol_base = 'compras'
  WHERE rol_base IS NULL AND tipo_usuario = 'compras';
UPDATE profiles SET rol_base = 'deposito'
  WHERE rol_base IS NULL AND tipo_usuario = 'encargado_deposito';
UPDATE profiles SET rol_base = 'jefe_obra'
  WHERE rol_base IS NULL AND tipo_usuario IN ('jefe_obra', 'jefe_obra_supervisor');
UPDATE profiles SET rol_base = 'capataz'
  WHERE rol_base IS NULL AND tipo_usuario IN ('capataz', 'capataz_supervisor');

-- Backfill obras_scope desde tipo_usuario:
--   capataz / capataz_supervisor / jefe_obra / jefe_obra_supervisor → asignadas
--   resto                                                          → todas (default)
UPDATE profiles SET obras_scope = 'asignadas'
  WHERE tipo_usuario IN (
    'capataz', 'capataz_supervisor',
    'jefe_obra', 'jefe_obra_supervisor'
  );
