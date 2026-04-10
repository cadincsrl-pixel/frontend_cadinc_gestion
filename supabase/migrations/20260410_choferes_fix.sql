-- Renombrar columna telefono → tel en choferes
ALTER TABLE choferes RENAME COLUMN telefono TO tel;

-- Agregar columna licencia que faltaba
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS licencia text;

-- Corregir CHECK constraint de camiones (taller/baja → mantenimiento/inactivo)
ALTER TABLE camiones DROP CONSTRAINT IF EXISTS camiones_estado_check;
ALTER TABLE camiones ADD CONSTRAINT camiones_estado_check
  CHECK (estado IN ('activo','mantenimiento','inactivo'));

-- Agregar columnas faltantes en camiones
ALTER TABLE camiones ADD COLUMN IF NOT EXISTS anio integer;
ALTER TABLE camiones ADD COLUMN IF NOT EXISTS marca text;
