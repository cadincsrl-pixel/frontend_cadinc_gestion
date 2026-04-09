-- ── Tabla remitos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remitos (
  id         BIGSERIAL    PRIMARY KEY,
  numero     TEXT         NOT NULL UNIQUE,
  fecha      DATE         NOT NULL,
  origen     TEXT         NOT NULL,
  destino    TEXT         NOT NULL,
  estado     TEXT         NOT NULL DEFAULT 'borrador'
               CHECK (estado IN ('borrador', 'emitido')),
  obs        TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- ── Tabla remito_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remito_items (
  id          BIGSERIAL PRIMARY KEY,
  remito_id   BIGINT    NOT NULL REFERENCES remitos(id) ON DELETE CASCADE,
  descripcion TEXT      NOT NULL,
  cantidad    NUMERIC   NOT NULL,
  unidad      TEXT      NOT NULL DEFAULT 'unidad',
  obs         TEXT
);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE remitos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE remito_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_remitos" ON remitos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_remito_items" ON remito_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Trigger updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER remitos_updated_at
  BEFORE UPDATE ON remitos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
