-- Básico diario en el chofer (para precarga en liquidaciones)
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS basico_dia numeric NOT NULL DEFAULT 0;

-- Referencia directa al tramo desde la liquidación (facilita consultas)
ALTER TABLE tramos ADD COLUMN IF NOT EXISTS liquidacion_id integer REFERENCES liquidaciones(id);

-- Columnas opcionales por si la tabla fue creada sin precio_km (modelo anterior)
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS precio_km      numeric;
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS km_totales     numeric;
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS subtotal_km    numeric;
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS basico_dia     numeric;
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS created_by     uuid;
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS updated_by     uuid;
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS updated_at     timestamptz;
