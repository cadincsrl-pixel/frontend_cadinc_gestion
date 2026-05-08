-- Permisos v2 — vincular obra ↔ user del sistema (capataz / jefe de obra).
--
-- Antes: obras.resp era un texto libre ("Capataz: Juan Pérez"). No había
-- forma de cruzar al user del sistema con login.
--
-- Ahora: dos FK opcionales a profiles(id). Cuando se setean, el backend
-- auto-inserta una row en usuario_obras con modulo=NULL (aplica a todos
-- los módulos donde el user tenga scope='asignadas'). Caso típico:
--   - Capataz Rodolfo es responsable de la obra X → la ve en tarja.
--   - Jefe Candela es responsable de la obra X → la ve en tarja Y en
--     certificaciones (puede pedir materiales).
--
-- ON DELETE SET NULL: si se elimina el user, la obra queda sin
-- responsable pero NO se borra. La FK falla silencioso para el handler
-- que mantenía la asignación.

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS capataz_user_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jefe_obra_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Índices para los lookups inversos (¿qué obras tiene asignadas X user?).
CREATE INDEX IF NOT EXISTS obras_capataz_user_idx   ON obras (capataz_user_id)   WHERE capataz_user_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS obras_jefe_obra_user_idx ON obras (jefe_obra_user_id) WHERE jefe_obra_user_id IS NOT NULL;
