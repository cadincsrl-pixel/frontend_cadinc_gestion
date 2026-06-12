-- Áridos — hora del movimiento (opcional). El user quiere registrar a
-- qué hora se hizo la entrega/venta, además de la fecha.
ALTER TABLE aridos_movimientos
  ADD COLUMN IF NOT EXISTS hora TIME;
