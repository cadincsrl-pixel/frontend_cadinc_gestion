-- =====================================================================
-- Simulador de rentabilidad — sub-tab de Logística.
--
-- Reemplaza al Excel YTL_Simulador_Rentabilidad.xlsx que el usuario venía
-- usando. Calcula el margen anual en USD por viaje considerando combustible,
-- chofer, neumáticos, amortizaciones de tractor/batea, seguros, patente,
-- gomería, lavadero y overhead.
--
-- Diseño:
-- - rentabilidad_parametros: parámetros compartidos por toda la empresa.
--   Versionada: cuando se editan, se cierra la fila vigente con
--   `vigente_hasta = today` y se inserta una nueva. Hay como mucho UNA fila
--   con vigente_hasta IS NULL (constraint UNIQUE parcial).
-- - rentabilidad_viajes: lista de viajes simulados, ilimitada. CRUD simple.
--   No tiene FK al modelo operativo (tramos/empresas) — es un simulador
--   independiente.
--
-- Modalidad de pago al chofer: dos opciones
--   'km_jornal'  → (km_ida + km_vuelta) * chofer_por_km + dias * chofer_por_dia
--   'pct_jornal' → tarifa * toneladas * pct_sobre_tarifa + dias * chofer_por_dia
-- =====================================================================

CREATE TABLE IF NOT EXISTS rentabilidad_parametros (
  id                          serial PRIMARY KEY,
  vigente_desde               date NOT NULL DEFAULT current_date,
  vigente_hasta               date NULL,
  -- Generales
  alicuota_iva                numeric NOT NULL DEFAULT 0.21,
  tipo_cambio_usd_ars         numeric NOT NULL,
  -- Equipo
  valor_tractor_usd           numeric NOT NULL,
  valor_residual_tractor_usd  numeric NOT NULL,
  vida_util_tractor_km        numeric NOT NULL,
  valor_semirremolque_usd     numeric NOT NULL,
  vida_util_batea_anios       numeric NOT NULL,
  -- Mantenimiento + neumáticos
  costo_service               numeric NOT NULL,
  frecuencia_service_km       numeric NOT NULL,
  costo_cubierta              numeric NOT NULL,
  cubiertas_por_equipo        integer NOT NULL,
  vida_util_neumaticos_km     numeric NOT NULL,
  -- Personal
  cargas_sociales_mensual     numeric NOT NULL,
  -- Gastos fijos de empresa
  seguros_mensual             numeric NOT NULL,
  patente_anual               numeric NOT NULL,
  gomeria_mensual             numeric NOT NULL,
  lavadero_mensual            numeric NOT NULL,
  -- Estructura
  overhead_pct                numeric NOT NULL DEFAULT 0.01,
  -- Auditoría
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid,
  updated_by                  uuid
);

-- Como mucho UNA fila vigente (vigente_hasta IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS rentabilidad_parametros_unica_vigente
  ON rentabilidad_parametros (vigente_hasta)
  WHERE vigente_hasta IS NULL;

ALTER TABLE rentabilidad_parametros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rentabilidad_parametros_all ON rentabilidad_parametros;
CREATE POLICY rentabilidad_parametros_all ON rentabilidad_parametros
  FOR ALL USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS rentabilidad_viajes (
  id                   serial PRIMARY KEY,
  nombre               text NOT NULL,
  km_ida               numeric NOT NULL DEFAULT 0,
  km_vuelta            numeric NOT NULL DEFAULT 0,
  toneladas            numeric NOT NULL DEFAULT 35,
  dias_calendario      numeric NOT NULL DEFAULT 0,
  viajes_por_mes       numeric NOT NULL DEFAULT 0,
  tarifa_neta_por_ton  numeric NOT NULL DEFAULT 0,
  precio_gasoil        numeric NOT NULL,
  consumo_camion       numeric NOT NULL,
  peajes_total         numeric NOT NULL DEFAULT 0,
  chofer_por_km        numeric NOT NULL,
  chofer_por_dia       numeric NOT NULL,
  modalidad_pago       text    NOT NULL CHECK (modalidad_pago IN ('km_jornal','pct_jornal')),
  pct_sobre_tarifa     numeric NOT NULL DEFAULT 0,
  obs                  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid,
  updated_by           uuid
);

ALTER TABLE rentabilidad_viajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rentabilidad_viajes_all ON rentabilidad_viajes;
CREATE POLICY rentabilidad_viajes_all ON rentabilidad_viajes
  FOR ALL USING (true) WITH CHECK (true);


-- =====================================================================
-- SEED: 1 set de parámetros vigentes + 7 viajes del Excel actual.
-- Idempotente: solo inserta si no hay datos.
-- =====================================================================
INSERT INTO rentabilidad_parametros (
  alicuota_iva, tipo_cambio_usd_ars,
  valor_tractor_usd, valor_residual_tractor_usd, vida_util_tractor_km,
  valor_semirremolque_usd, vida_util_batea_anios,
  costo_service, frecuencia_service_km,
  costo_cubierta, cubiertas_por_equipo, vida_util_neumaticos_km,
  cargas_sociales_mensual,
  seguros_mensual, patente_anual, gomeria_mensual, lavadero_mensual,
  overhead_pct
)
SELECT
  0.21, 1390,
  99000, 40000, 800000,
  45000, 20,
  1310000, 30000,
  300000, 22, 130000,
  400000,
  400000, 1000000, 100000, 100000,
  0.01
WHERE NOT EXISTS (SELECT 1 FROM rentabilidad_parametros);

INSERT INTO rentabilidad_viajes (
  nombre, km_ida, km_vuelta, toneladas, dias_calendario, viajes_por_mes,
  tarifa_neta_por_ton, precio_gasoil, consumo_camion, peajes_total,
  chofer_por_km, chofer_por_dia, modalidad_pago, pct_sobre_tarifa
)
SELECT * FROM (VALUES
  ('cristamine 35t',        1200, 1200, 35, 3, 8,  81260, 2060, 3, 30000, 130, 28000, 'km_jornal',  0),
  ('cereal',                  60,   60, 31, 1, 20, 18000, 2200, 3,     0, 130, 28000, 'pct_jornal', 0.15),
  ('lajitas',                380,  380, 31, 1, 12, 53000, 2200, 3,     0, 130, 28000, 'pct_jornal', 0.15),
  ('diamante',              1362, 1362, 31, 3, 8,  92200, 2060, 3, 30000, 130, 28000, 'km_jornal',  0),
  ('cristamine 31t',        1200, 1200, 31, 3, 8,  81260, 2060, 3, 30000, 130, 28000, 'km_jornal',  0),
  ('diamante 35t',          1362, 1362, 35, 3, 8,  92200, 2060, 3, 30000, 130, 28000, 'km_jornal',  0),
  ('vuelta yeso diamante',  1500, 1500, 31, 3, 7, 139467, 2060, 3, 30000, 130, 28000, 'km_jornal',  0)
) AS s(nombre, km_ida, km_vuelta, toneladas, dias_calendario, viajes_por_mes, tarifa_neta_por_ton, precio_gasoil, consumo_camion, peajes_total, chofer_por_km, chofer_por_dia, modalidad_pago, pct_sobre_tarifa)
WHERE NOT EXISTS (SELECT 1 FROM rentabilidad_viajes);
