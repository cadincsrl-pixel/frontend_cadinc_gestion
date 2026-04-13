-- Reemplaza el modelo flat de tramos por el modelo cargado/vacio
DROP TABLE IF EXISTS liquidacion_tramos CASCADE;
DROP TABLE IF EXISTS tramos CASCADE;

CREATE TABLE tramos (
  id          SERIAL PRIMARY KEY,
  chofer_id   INT  NOT NULL REFERENCES choferes(id),
  camion_id   INT  NOT NULL REFERENCES camiones(id),
  tipo        TEXT NOT NULL DEFAULT 'cargado' CHECK (tipo IN ('cargado', 'vacio')),
  cantera_id  INT  REFERENCES canteras(id),   -- origen en cargado, destino en vacio
  deposito_id INT  REFERENCES depositos(id),  -- destino en cargado, origen en vacio

  -- Datos de carga (tipo='cargado', al salir de cantera)
  fecha_carga        DATE,
  toneladas_carga    NUMERIC,
  remito_carga       TEXT NOT NULL DEFAULT '',

  -- Datos de descarga (tipo='cargado', al llegar a deposito)
  fecha_descarga     DATE,
  toneladas_descarga NUMERIC,
  remito_descarga    TEXT NOT NULL DEFAULT '',

  -- Datos tramo vacío (tipo='vacio')
  fecha_vacio        DATE,

  estado      TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'completado')),
  obs         TEXT NOT NULL DEFAULT '',
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Vinculación liquidacion → tramos
CREATE TABLE liquidacion_tramos (
  liquidacion_id INT NOT NULL REFERENCES liquidaciones(id) ON DELETE CASCADE,
  tramo_id       INT NOT NULL REFERENCES tramos(id)        ON DELETE CASCADE,
  PRIMARY KEY (liquidacion_id, tramo_id)
);
