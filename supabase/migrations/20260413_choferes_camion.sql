-- Agregar camion_id a choferes si no existe (puede no estar si la tabla
-- fue creada antes de agregar este campo al esquema)
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS camion_id integer;

-- Agregar columnas de auditoría si faltan
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
