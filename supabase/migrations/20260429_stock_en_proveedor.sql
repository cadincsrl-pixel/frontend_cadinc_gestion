-- =====================================================================
-- Stock en proveedor — gestión de materiales comprados que quedan en el
-- depósito del proveedor hasta que se retiren.
--
-- Flujo (estados nuevos en solicitud_compra_item.estado):
--   pendiente → en_proveedor   (comprado pero queda en el galpón del prov.)
--   en_proveedor → retirado    (cuando se retira y entrega al cliente)
--
-- Reglas:
-- - Un item resuelto como `en_proveedor` insertará movimiento de ENTRADA.
-- - Cada retiro inserta movimiento de SALIDA (parciales soportados).
-- - `materiales_a_cuenta_cliente` se inserta/actualiza al RETIRAR (no al
--   comprar). Decisión: solo facturamos lo que efectivamente sale del
--   proveedor (decisión B del diseño).
-- =====================================================================

-- Movimientos de stock en proveedores
CREATE TABLE IF NOT EXISTS stock_proveedor_movimientos (
  id              serial PRIMARY KEY,
  proveedor_id    integer NOT NULL REFERENCES proveedores(id),
  solicitud_item_id integer NOT NULL REFERENCES solicitud_compra_item(id) ON DELETE CASCADE,
  tipo            text    NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  motivo          text    NOT NULL CHECK (motivo IN ('compra', 'retiro', 'ajuste')),
  cantidad        numeric NOT NULL CHECK (cantidad > 0),
  remito_retiro_id integer NULL,  -- FK agregada después de crear la tabla
  fecha           date    NOT NULL DEFAULT current_date,
  obs             text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid
);

CREATE INDEX IF NOT EXISTS spm_proveedor_idx     ON stock_proveedor_movimientos(proveedor_id);
CREATE INDEX IF NOT EXISTS spm_item_idx          ON stock_proveedor_movimientos(solicitud_item_id);
CREATE INDEX IF NOT EXISTS spm_remito_idx        ON stock_proveedor_movimientos(remito_retiro_id);

ALTER TABLE stock_proveedor_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spm_all ON stock_proveedor_movimientos;
CREATE POLICY spm_all ON stock_proveedor_movimientos FOR ALL USING (true) WITH CHECK (true);


-- Cabecera del remito de retiro (foto/PDF + número RR-NNNN)
CREATE TABLE IF NOT EXISTS remitos_retiro_proveedor (
  id              serial PRIMARY KEY,
  numero          text    UNIQUE,        -- 'RR-0001' auto-generado en service
  proveedor_id    integer NOT NULL REFERENCES proveedores(id),
  obra_cod        text    NOT NULL REFERENCES obras(cod),
  fecha           date    NOT NULL DEFAULT current_date,
  comprobante_url  text,                 -- path en bucket cert-adjuntos (signed)
  comprobante_hash text,                 -- sha256 dedup
  obs             text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS rrp_comprobante_hash_uq
  ON remitos_retiro_proveedor (comprobante_hash)
  WHERE comprobante_hash IS NOT NULL;

ALTER TABLE remitos_retiro_proveedor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rrp_all ON remitos_retiro_proveedor;
CREATE POLICY rrp_all ON remitos_retiro_proveedor FOR ALL USING (true) WITH CHECK (true);


-- Líneas del remito de retiro
CREATE TABLE IF NOT EXISTS remitos_retiro_proveedor_item (
  id                serial PRIMARY KEY,
  remito_id         integer NOT NULL REFERENCES remitos_retiro_proveedor(id) ON DELETE CASCADE,
  solicitud_item_id integer NOT NULL REFERENCES solicitud_compra_item(id) ON DELETE RESTRICT,
  cantidad          numeric NOT NULL CHECK (cantidad > 0),
  obs               text
);

CREATE INDEX IF NOT EXISTS rrpi_remito_idx ON remitos_retiro_proveedor_item(remito_id);
CREATE INDEX IF NOT EXISTS rrpi_item_idx   ON remitos_retiro_proveedor_item(solicitud_item_id);

ALTER TABLE remitos_retiro_proveedor_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rrpi_all ON remitos_retiro_proveedor_item;
CREATE POLICY rrpi_all ON remitos_retiro_proveedor_item FOR ALL USING (true) WITH CHECK (true);


-- FK circular: el movimiento puede apuntar a un remito (si tipo=salida)
ALTER TABLE stock_proveedor_movimientos
  ADD CONSTRAINT spm_remito_fk
  FOREIGN KEY (remito_retiro_id)
  REFERENCES remitos_retiro_proveedor(id)
  ON DELETE SET NULL;


-- Vista de stock pendiente por item: cuántas unidades quedan en el
-- proveedor por cada item. cantidad_pendiente = entradas - salidas.
-- Solo aparecen items cuyo estado todavía es 'en_proveedor' (con
-- cantidad pendiente > 0) o 'retirado' (informativo, ya en 0).
CREATE OR REPLACE VIEW v_stock_proveedor AS
SELECT
  sci.id              AS item_id,
  sci.solicitud_id,
  sc.obra_cod,
  sci.proveedor_id,
  p.nombre            AS proveedor_nombre,
  sci.descripcion,
  sci.unidad,
  sci.cantidad        AS cantidad_total,
  COALESCE(SUM(CASE WHEN spm.tipo='entrada' THEN spm.cantidad ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN spm.tipo='salida'  THEN spm.cantidad ELSE 0 END), 0)
                      AS cantidad_pendiente,
  COALESCE(SUM(CASE WHEN spm.tipo='salida' THEN spm.cantidad ELSE 0 END), 0)
                      AS cantidad_retirada,
  sci.precio_unit,
  sci.fecha_resolucion AS fecha_compra,
  sci.estado,
  sci.factura_id
FROM solicitud_compra_item sci
LEFT JOIN solicitud_compra sc ON sc.id = sci.solicitud_id
LEFT JOIN proveedores p       ON p.id  = sci.proveedor_id
LEFT JOIN stock_proveedor_movimientos spm ON spm.solicitud_item_id = sci.id
WHERE sci.estado IN ('en_proveedor', 'retirado')
GROUP BY sci.id, sci.solicitud_id, sc.obra_cod, sci.proveedor_id, p.nombre,
         sci.descripcion, sci.unidad, sci.cantidad, sci.precio_unit,
         sci.fecha_resolucion, sci.estado, sci.factura_id;


-- =====================================================================
-- RPC: resolver_item_en_proveedor
-- Marca un item como comprado-pero-en-proveedor. Es similar a
-- resolver_item_compra pero sin tocar stock interno ni MCC todavía.
-- =====================================================================
CREATE OR REPLACE FUNCTION resolver_item_en_proveedor(
  p_item_id     integer,
  p_proveedor_id integer,
  p_precio_unit numeric,
  p_factura_id  integer DEFAULT NULL,
  p_user_id     uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Validar item con lock
  SELECT id, estado, cantidad
  INTO v_item
  FROM solicitud_compra_item
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'ITEM_NO_EXISTE' USING ERRCODE='P0001';
  END IF;
  IF v_item.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'ITEM_YA_RESUELTO' USING ERRCODE='P0001', DETAIL=v_item.estado;
  END IF;

  -- Actualizar item
  UPDATE solicitud_compra_item
  SET estado = 'en_proveedor',
      proveedor_id = p_proveedor_id,
      precio_unit  = p_precio_unit,
      factura_id   = p_factura_id,
      fecha_resolucion = current_date,
      updated_by   = p_user_id
  WHERE id = p_item_id;

  -- Movimiento de entrada (lo que el proveedor "nos guarda")
  INSERT INTO stock_proveedor_movimientos
    (proveedor_id, solicitud_item_id, tipo, motivo, cantidad, fecha, created_by)
  VALUES
    (p_proveedor_id, p_item_id, 'entrada', 'compra', v_item.cantidad, current_date, p_user_id);
END $$;


-- =====================================================================
-- RPC: retirar_de_proveedor
-- Crea remito + N salidas (parciales soportados) + actualiza items y MCC.
-- Si un item queda con cantidad_pendiente = 0, su estado pasa a 'retirado'.
-- Inserta/actualiza materiales_a_cuenta_cliente con la cantidad acumulada
-- retirada (decisión B: facturable al retirar).
--
-- p_items: array JSON con [{item_id, cantidad}].
-- =====================================================================
CREATE OR REPLACE FUNCTION retirar_de_proveedor(
  p_proveedor_id     integer,
  p_obra_cod         text,
  p_fecha            date,
  p_comprobante_url  text,
  p_comprobante_hash text,
  p_obs              text,
  p_items            jsonb,   -- [{"item_id":1,"cantidad":50}, ...]
  p_user_id          uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remito_id integer;
  v_numero    text;
  v_seq       integer;
  v_item      RECORD;
  v_pendiente numeric;
  v_acum_retirada numeric;
  v_obra_es_dep boolean;
  v_input     jsonb;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'SIN_ITEMS' USING ERRCODE='P0001';
  END IF;

  -- Verificar si la obra es depósito interno (NO insertar en MCC en ese caso)
  SELECT es_deposito INTO v_obra_es_dep FROM obras WHERE cod = p_obra_cod;

  -- Generar número de remito (RR-NNNN) — toma el max existente + 1
  SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '[^0-9]', '', 'g'), '')::integer), 0) + 1
  INTO v_seq
  FROM remitos_retiro_proveedor
  WHERE numero LIKE 'RR-%';
  v_numero := 'RR-' || lpad(v_seq::text, 4, '0');

  -- Crear cabecera
  INSERT INTO remitos_retiro_proveedor
    (numero, proveedor_id, obra_cod, fecha, comprobante_url, comprobante_hash, obs, created_by, updated_by)
  VALUES
    (v_numero, p_proveedor_id, p_obra_cod, p_fecha, p_comprobante_url, p_comprobante_hash, p_obs, p_user_id, p_user_id)
  RETURNING id INTO v_remito_id;

  -- Procesar cada item
  FOR v_input IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Lock del item
    SELECT id, solicitud_id, estado, proveedor_id, descripcion, unidad,
           cantidad, precio_unit, factura_id
    INTO v_item
    FROM solicitud_compra_item
    WHERE id = (v_input->>'item_id')::integer
    FOR UPDATE;

    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'ITEM_NO_EXISTE' USING ERRCODE='P0001', DETAIL=(v_input->>'item_id');
    END IF;
    IF v_item.estado <> 'en_proveedor' THEN
      RAISE EXCEPTION 'ITEM_NO_EN_PROVEEDOR' USING ERRCODE='P0001', DETAIL=v_item.estado;
    END IF;
    IF v_item.proveedor_id <> p_proveedor_id THEN
      RAISE EXCEPTION 'ITEM_PROVEEDOR_DISTINTO' USING ERRCODE='P0001';
    END IF;

    -- Calcular pendiente actual = entradas - salidas
    SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN cantidad ELSE -cantidad END), 0)
    INTO v_pendiente
    FROM stock_proveedor_movimientos
    WHERE solicitud_item_id = v_item.id;

    IF (v_input->>'cantidad')::numeric > v_pendiente THEN
      RAISE EXCEPTION 'CANTIDAD_EXCEDE_PENDIENTE'
        USING ERRCODE='P0001',
              DETAIL=format('item %s pendiente=%s solicitado=%s', v_item.id, v_pendiente, v_input->>'cantidad');
    END IF;

    -- Insertar línea del remito
    INSERT INTO remitos_retiro_proveedor_item
      (remito_id, solicitud_item_id, cantidad)
    VALUES
      (v_remito_id, v_item.id, (v_input->>'cantidad')::numeric);

    -- Movimiento de salida
    INSERT INTO stock_proveedor_movimientos
      (proveedor_id, solicitud_item_id, tipo, motivo, cantidad, remito_retiro_id, fecha, created_by)
    VALUES
      (p_proveedor_id, v_item.id, 'salida', 'retiro', (v_input->>'cantidad')::numeric, v_remito_id, p_fecha, p_user_id);

    -- Si la salida cubre todo lo pendiente → cerrar el item como 'retirado'
    IF (v_input->>'cantidad')::numeric >= v_pendiente THEN
      UPDATE solicitud_compra_item
      SET estado = 'retirado', updated_by = p_user_id
      WHERE id = v_item.id;
    END IF;

    -- Insertar / actualizar materiales_a_cuenta_cliente (acumulando)
    -- (excepto si la obra es depósito interno: no facturable)
    IF NOT COALESCE(v_obra_es_dep, false) THEN
      -- cantidad acumulada retirada para este item
      SELECT COALESCE(SUM(CASE WHEN tipo='salida' THEN cantidad ELSE 0 END), 0)
      INTO v_acum_retirada
      FROM stock_proveedor_movimientos
      WHERE solicitud_item_id = v_item.id;

      INSERT INTO materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id, fecha_resolucion,
         created_by, updated_by)
      VALUES
        (p_obra_cod, v_item.solicitud_id, v_item.id, v_item.descripcion, v_acum_retirada,
         v_item.unidad, v_item.precio_unit, v_acum_retirada * COALESCE(v_item.precio_unit, 0),
         'proveedor', p_proveedor_id, v_item.factura_id, p_fecha, p_user_id, p_user_id)
      ON CONFLICT (item_id) DO UPDATE
      SET cantidad         = EXCLUDED.cantidad,
          precio_total     = EXCLUDED.precio_total,
          fecha_resolucion = EXCLUDED.fecha_resolucion,
          updated_by       = p_user_id,
          updated_at       = now();
    END IF;
  END LOOP;

  RETURN v_remito_id;
END $$;


-- Permisos: las RPCs corren como SECURITY DEFINER, el access se valida en backend.
GRANT EXECUTE ON FUNCTION resolver_item_en_proveedor(integer, integer, numeric, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION retirar_de_proveedor(integer, text, date, text, text, text, jsonb, uuid) TO authenticated;
