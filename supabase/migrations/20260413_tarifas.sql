-- Tarifas empresa: lo que nos pagan por tonelada por cantera
CREATE TABLE IF NOT EXISTS tarifas_cantera (
  id         SERIAL PRIMARY KEY,
  cantera_id INT NOT NULL UNIQUE REFERENCES canteras(id) ON DELETE CASCADE,
  valor_ton  NUMERIC NOT NULL DEFAULT 0,
  obs        TEXT,
  created_by UUID,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Precio por km al chofer (adicional al básico por día)
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS precio_km numeric NOT NULL DEFAULT 0;
