-- Agregar vigente_desde a tarifas_empresa_cantera
ALTER TABLE tarifas_empresa_cantera
  ADD COLUMN IF NOT EXISTS vigente_desde DATE NOT NULL DEFAULT CURRENT_DATE;

-- Eliminar el UNIQUE para permitir múltiples registros por empresa×cantera
ALTER TABLE tarifas_empresa_cantera
  DROP CONSTRAINT IF EXISTS tarifas_empresa_cantera_empresa_id_cantera_id_key;
