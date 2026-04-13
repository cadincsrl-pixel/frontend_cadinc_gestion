-- Tabla flat de tramos (reemplaza viajes + cargas + descargas)
CREATE TABLE IF NOT EXISTS tramos (
  id          SERIAL PRIMARY KEY,
  chofer_id   INT  NOT NULL REFERENCES choferes(id),
  camion_id   INT  NOT NULL REFERENCES camiones(id),
  fecha       DATE NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('carga', 'descarga')),
  cantera_id  INT  REFERENCES canteras(id),
  deposito_id INT  REFERENCES depositos(id),
  toneladas   NUMERIC,
  remito_num  TEXT NOT NULL DEFAULT '',
  obs         TEXT NOT NULL DEFAULT '',
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabla de vinculación liquidacion → tramos
CREATE TABLE IF NOT EXISTS liquidacion_tramos (
  liquidacion_id INT NOT NULL REFERENCES liquidaciones(id) ON DELETE CASCADE,
  tramo_id       INT NOT NULL REFERENCES tramos(id)        ON DELETE CASCADE,
  PRIMARY KEY (liquidacion_id, tramo_id)
);
