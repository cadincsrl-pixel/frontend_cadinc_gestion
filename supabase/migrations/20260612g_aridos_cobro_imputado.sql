-- Áridos — imputación opcional del cobro a ventas (híbrido).
-- Al registrar un cobro se pueden tildar las ventas/remitos que cancela:
-- quedan marcadas con cobro_id (trazabilidad pago/adeudado por remito).
-- Sin selección = pago a cuenta clásico. El saldo global no cambia de
-- fórmula (Σ ventas − Σ cobros). Si se borra el cobro, las ventas
-- vuelven a adeudadas (ON DELETE SET NULL).
ALTER TABLE aridos_movimientos
  ADD COLUMN IF NOT EXISTS cobro_id INT REFERENCES aridos_cobros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_aridos_mov_cobro ON aridos_movimientos (cobro_id) WHERE cobro_id IS NOT NULL;
