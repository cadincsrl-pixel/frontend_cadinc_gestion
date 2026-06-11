-- Tarifas por empresa × cantera × depósito de descarga (opcional).
-- deposito_id NULL = tarifa general de la cantera (comportamiento histórico).
-- deposito_id set  = tarifa específica para descargas en ese depósito;
--                    al resolver, la específica gana sobre la general.
ALTER TABLE tarifas_empresa_cantera
  ADD COLUMN IF NOT EXISTS deposito_id INT REFERENCES depositos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tarifas_emp_cantera_deposito
  ON tarifas_empresa_cantera (empresa_id, cantera_id, deposito_id, vigente_desde DESC);
