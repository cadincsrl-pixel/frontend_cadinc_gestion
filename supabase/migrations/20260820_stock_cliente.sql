-- =====================================================================
-- Stock de cliente — material que el CLIENTE compró y pagó, entregado a
-- CADINC para administrarlo en el depósito e ir entregándolo a su obra.
--
-- Espejo conceptual de "stock en proveedor" (20260429): aquél es material
-- de CADINC en galpón ajeno; éste es material ajeno en el galpón de CADINC.
--
-- Reglas:
-- - Cada entrega del cliente inserta movimiento de ENTRADA.
-- - Cada consumo (ítem de solicitud resuelto "del stock del cliente" o
--   salida manual) inserta movimiento de SALIDA.
-- - El consumo NO registra en materiales_a_cuenta_cliente: el material ya
--   es del cliente — facturarlo sería cobrarlo dos veces. La constancia de
--   entregas/consumos vive en este ledger.
-- - El material queda scopeado a la obra: no se despacha a otra obra.
-- =====================================================================

-- Catálogo de materiales del cliente por obra
CREATE TABLE IF NOT EXISTS stock_cliente_items (
  id          serial PRIMARY KEY,
  obra_cod    text    NOT NULL REFERENCES obras(cod),
  descripcion text    NOT NULL,
  unidad      text    NOT NULL DEFAULT 'unid',
  obs         text    DEFAULT '',
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid
);

-- Un material por obra (case/espacios-insensitive), solo entre activos.
CREATE UNIQUE INDEX IF NOT EXISTS sci_obra_descripcion_uq
  ON stock_cliente_items (obra_cod, lower(btrim(descripcion)))
  WHERE activo;

ALTER TABLE stock_cliente_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sci_all ON stock_cliente_items;
CREATE POLICY sci_all ON stock_cliente_items FOR ALL USING (true) WITH CHECK (true);


-- Ledger de entradas (cliente entrega) y salidas (consumo de la obra)
CREATE TABLE IF NOT EXISTS stock_cliente_movimientos (
  id                serial PRIMARY KEY,
  item_id           integer NOT NULL REFERENCES stock_cliente_items(id) ON DELETE CASCADE,
  tipo              text    NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  motivo            text    NOT NULL CHECK (motivo IN
                      ('entrega_cliente', 'consumo_obra', 'ajuste', 'devolucion')),
  cantidad          numeric NOT NULL CHECK (cantidad > 0),
  -- Consumos resueltos desde una solicitud de compra apuntan al ítem.
  solicitud_item_id integer NULL REFERENCES solicitud_compra_item(id) ON DELETE SET NULL,
  fecha             date    NOT NULL DEFAULT current_date,
  obs               text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid
);

CREATE INDEX IF NOT EXISTS scm_item_idx ON stock_cliente_movimientos(item_id);
CREATE INDEX IF NOT EXISTS scm_solicitud_item_idx
  ON stock_cliente_movimientos(solicitud_item_id) WHERE solicitud_item_id IS NOT NULL;

ALTER TABLE stock_cliente_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_all ON stock_cliente_movimientos;
CREATE POLICY scm_all ON stock_cliente_movimientos FOR ALL USING (true) WITH CHECK (true);


-- Saldo por material: entregado − consumido. security_invoker como
-- v_stock_proveedor (la seguridad real está en el backend Hono).
CREATE OR REPLACE VIEW v_stock_cliente
WITH (security_invoker = true) AS
SELECT
  i.id            AS item_id,
  i.obra_cod,
  i.descripcion,
  i.unidad,
  i.obs,
  i.activo,
  COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'entrada'), 0) AS cantidad_entregada,
  COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'salida'),  0) AS cantidad_consumida,
  COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'entrada'), 0)
    - COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'salida'), 0) AS saldo,
  MAX(m.fecha) FILTER (WHERE m.tipo = 'entrada') AS ultima_entrega,
  MAX(m.fecha) FILTER (WHERE m.tipo = 'salida')  AS ultimo_consumo
FROM stock_cliente_items i
LEFT JOIN stock_cliente_movimientos m ON m.item_id = i.id
GROUP BY i.id;
