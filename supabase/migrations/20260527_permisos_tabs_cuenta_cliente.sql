-- Agrega 'cuenta-cliente' al array `profiles.permisos.certificaciones.tabs`
-- para usuarios que ya tienen el tab `materiales` configurado y todavía no
-- tienen el nuevo tab.
--
-- Sin esto, los users no-admin con `tabs` configurado no ven el tab nuevo
-- aunque el código frontend lo registre. El hook `useTabsPermitidos` filtra
-- exactamente por este array.
--
-- Idempotente: el operator `?` chequea si la string está en el array; si
-- ya está, no se actualiza ese profile.
--
-- Usuarios sin `tabs` configurado (NULL) no se tocan — el hook los trata
-- como "ver todos los tabs del módulo", así que el tab nuevo aparece solo.
--
-- Admins (rol='admin') no se tocan — el hook los trata como "ver todos"
-- ignorando el array.

UPDATE profiles
SET permisos = jsonb_set(
  permisos,
  '{certificaciones,tabs}',
  (permisos -> 'certificaciones' -> 'tabs') || '"cuenta-cliente"'::jsonb
)
WHERE permisos -> 'certificaciones' -> 'tabs' IS NOT NULL
  AND permisos -> 'certificaciones' -> 'tabs' ? 'materiales'
  AND NOT (permisos -> 'certificaciones' -> 'tabs' ? 'cuenta-cliente');
