-- Áridos v1.3.1 — unidad en la lista de precios de cantera.
-- Centeno vende los áridos por viaje de 5 m³ → los precios de material
-- se cargan por m³ (viaje ÷ 5) para poder costear retiros por cantidad.
-- Servicios como "Retiro de escombros" (por viaje) y "Hora de máquina"
-- (por hora) mantienen su unidad propia.
ALTER TABLE aridos_costos_cantera
  ADD COLUMN IF NOT EXISTS unidad TEXT NOT NULL DEFAULT 'm3'
  CHECK (unidad IN ('m3', 'viaje', 'hora'));
