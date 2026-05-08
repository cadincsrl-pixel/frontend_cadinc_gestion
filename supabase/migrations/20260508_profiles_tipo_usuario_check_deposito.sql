-- Permisos v2 — extiende el CHECK de profiles.tipo_usuario para aceptar
-- el alias canónico 'deposito' (el preset clave en el sistema v2).
--
-- Mantenemos 'encargado_deposito' por back-compat con perfiles viejos
-- que pudieran tenerlo. Cuando se reescriban con el wizard v2 se van a
-- guardar como 'deposito' en adelante.

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_tipo_usuario_chk;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_tipo_usuario_chk
  CHECK (
    tipo_usuario IS NULL OR tipo_usuario = ANY(ARRAY[
      'administrativo',
      'compras',
      'deposito',                -- canónico v2
      'encargado_deposito',      -- legacy alias (back-compat)
      'jefe_obra',
      'jefe_obra_supervisor',
      'capataz',
      'capataz_supervisor',
      'personalizado'
    ])
  );
