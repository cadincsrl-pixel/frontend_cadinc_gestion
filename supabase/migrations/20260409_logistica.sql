-- ═══════════════════════════════════════════════════════════
--  MÓDULO LOGÍSTICA — tablas completas
--  Gestión de transporte de camiones (canteras → Añelo)
-- ═══════════════════════════════════════════════════════════

-- EMPRESAS (clientes que pagan por tonelada)
CREATE TABLE empresas (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  cuit text, contacto text, telefono text, email text, obs text
);

-- LUGARES (canteras, descargas, relevos)
CREATE TABLE lugares (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('cantera','descarga','relevo')),
  localidad text, provincia text,
  empresa_id integer REFERENCES empresas(id),  -- solo canteras
  obs text
);
-- Historial de tarifa $/ton por cantera
CREATE TABLE lugares_tarifa_hist (
  id serial PRIMARY KEY,
  lugar_id integer REFERENCES lugares(id) ON DELETE CASCADE,
  valor_ton numeric NOT NULL,
  desde date NOT NULL
);

-- CHOFERES
CREATE TABLE choferes (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  dni text, telefono text,
  estado text DEFAULT 'activo' CHECK (estado IN ('activo','descanso','inactivo')),
  camion_id integer,  -- FK a camiones (sin constraint para evitar circular)
  obs text
);
-- Historial básico diario
CREATE TABLE choferes_basico_hist (
  id serial PRIMARY KEY,
  chofer_id integer REFERENCES choferes(id) ON DELETE CASCADE,
  valor_dia numeric NOT NULL,
  desde date NOT NULL
);
-- Historial precio por km
CREATE TABLE choferes_km_hist (
  id serial PRIMARY KEY,
  chofer_id integer REFERENCES choferes(id) ON DELETE CASCADE,
  valor_km numeric NOT NULL,
  desde date NOT NULL
);

-- CAMIONES
CREATE TABLE camiones (
  id serial PRIMARY KEY,
  patente text NOT NULL,
  marca text, modelo text, anio integer,
  estado text DEFAULT 'activo' CHECK (estado IN ('activo','taller','baja')),
  obs text
);
-- Gastos de mantenimiento
CREATE TABLE camiones_gastos (
  id serial PRIMARY KEY,
  camion_id integer REFERENCES camiones(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('gomeria','balanceo','mecanico','lubricacion','otro')),
  descripcion text,
  monto numeric NOT NULL,
  proveedor text
);

-- RUTAS (distancias entre puntos — autofill en viajes)
CREATE TABLE rutas (
  id serial PRIMARY KEY,
  origen_id integer REFERENCES lugares(id),
  destino_id integer REFERENCES lugares(id),
  km numeric NOT NULL,
  UNIQUE(origen_id, destino_id)
);

-- VIAJES (cada tramo es un viaje separado)
CREATE TABLE viajes (
  id serial PRIMARY KEY,
  chofer_id integer REFERENCES choferes(id),
  camion_id integer REFERENCES camiones(id),
  fecha_salida date NOT NULL,
  fecha_llegada date,
  tipo text NOT NULL DEFAULT 'cargado' CHECK (tipo IN ('cargado','vacío')),
  origen_id integer REFERENCES lugares(id),
  destino_id integer REFERENCES lugares(id),
  km numeric,
  estado text DEFAULT 'en_curso' CHECK (estado IN ('en_curso','completado','cancelado')),
  es_ultimo_antes_descanso boolean DEFAULT false,
  facturacion_estado text DEFAULT 'pendiente' CHECK (facturacion_estado IN ('pendiente','facturado','cobrado')),
  obs text
);

-- Remitos de carga (solo viajes tipo "cargado")
CREATE TABLE remitos_carga (
  id serial PRIMARY KEY,
  viaje_id integer REFERENCES viajes(id) ON DELETE CASCADE,
  numero text, fecha date, toneladas numeric, remito_url text
);

-- Remitos de descarga (marcan el viaje como completado)
CREATE TABLE remitos_descarga (
  id serial PRIMARY KEY,
  viaje_id integer REFERENCES viajes(id) ON DELETE CASCADE,
  numero text, fecha date, toneladas numeric, remito_url text
);

-- RELEVOS (cambio de chofer en punto de relevo)
CREATE TABLE relevos (
  id serial PRIMARY KEY,
  viaje_id integer REFERENCES viajes(id),
  chofer_sale_id integer REFERENCES choferes(id),
  chofer_entra_id integer REFERENCES choferes(id),
  fecha_hora timestamptz NOT NULL,
  lugar text, obs text
);

-- LIQUIDACIONES
CREATE TABLE liquidaciones (
  id serial PRIMARY KEY,
  chofer_id integer REFERENCES choferes(id),
  fecha_desde date,
  fecha_hasta date,
  dias_trabajados integer,
  km_totales numeric,
  subtotal_basico numeric,
  subtotal_km numeric,
  total_adelantos numeric DEFAULT 0,
  total_neto numeric,
  estado text DEFAULT 'borrador' CHECK (estado IN ('borrador','cerrada')),
  obs text,
  created_at timestamptz DEFAULT now()
);

-- Viajes incluidos en cada liquidación
CREATE TABLE liquidacion_viajes (
  id serial PRIMARY KEY,
  liquidacion_id integer REFERENCES liquidaciones(id) ON DELETE CASCADE,
  viaje_id integer REFERENCES viajes(id),
  km numeric,
  dias integer
);

-- ADELANTOS
CREATE TABLE adelantos (
  id serial PRIMARY KEY,
  chofer_id integer REFERENCES choferes(id),
  fecha date NOT NULL,
  monto numeric NOT NULL,
  descripcion text,
  liquidacion_id integer REFERENCES liquidaciones(id)  -- null = pendiente
);

-- ═══════════════════════════════════════════════════════════
--  Storage bucket: remitos-logistica  (crear manualmente en
--  Supabase Dashboard → Storage → New bucket → public: true)
-- ═══════════════════════════════════════════════════════════
