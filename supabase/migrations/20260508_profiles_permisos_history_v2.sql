-- Permisos v2 — extiende profiles_permisos_history con rol_base/obras_scope.
--
-- Antes: el snapshot de history solo tenía rol/modulos/permisos/tipo_usuario.
-- Ahora capturamos también rol_base y obras_scope, que son los campos v2
-- que controlan visibilidad. Sin esto, un cambio de scope (alcance del
-- usuario) no quedaba auditado y no se podía reconstruir.

ALTER TABLE profiles_permisos_history
  ADD COLUMN IF NOT EXISTS rol_base_old    text,
  ADD COLUMN IF NOT EXISTS rol_base_new    text,
  ADD COLUMN IF NOT EXISTS obras_scope_old text,
  ADD COLUMN IF NOT EXISTS obras_scope_new text;
