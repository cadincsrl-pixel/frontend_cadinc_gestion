-- Agregar vencimiento configurable por categoría de ropa
ALTER TABLE ropa_categorias
  ADD COLUMN IF NOT EXISTS meses_vencimiento integer NOT NULL DEFAULT 6;
