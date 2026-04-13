-- Empresas transportistas (clientes que nos contratan)
CREATE TABLE IF NOT EXISTS empresas_transportistas (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR NOT NULL,
  cuit       VARCHAR,
  tel        VARCHAR,
  email      VARCHAR,
  obs        TEXT,
  estado     VARCHAR NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Tarifas por empresa × cantera (lo que cada empresa nos paga por tonelada)
CREATE TABLE IF NOT EXISTS tarifas_empresa_cantera (
  id         SERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES empresas_transportistas(id) ON DELETE CASCADE,
  cantera_id INT NOT NULL REFERENCES canteras(id) ON DELETE CASCADE,
  valor_ton  NUMERIC NOT NULL DEFAULT 0,
  obs        TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID,
  UNIQUE(empresa_id, cantera_id)
);

-- empresa_id en tramos (para qué empresa fue cada viaje)
ALTER TABLE tramos ADD COLUMN IF NOT EXISTS empresa_id INT REFERENCES empresas_transportistas(id);

-- Cobros (ingresos formalizados por empresa)
CREATE TABLE IF NOT EXISTS cobros (
  id                SERIAL PRIMARY KEY,
  empresa_id        INT NOT NULL REFERENCES empresas_transportistas(id),
  fecha_desde       DATE,
  fecha_hasta       DATE,
  toneladas_totales NUMERIC NOT NULL DEFAULT 0,
  total             NUMERIC NOT NULL DEFAULT 0,
  estado            VARCHAR NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'cobrado')),
  obs               TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  created_by        UUID,
  updated_by        UUID
);

-- cobro_id en tramos (para saber qué tramos ya están cobrados)
ALTER TABLE tramos ADD COLUMN IF NOT EXISTS cobro_id INT REFERENCES cobros(id);
