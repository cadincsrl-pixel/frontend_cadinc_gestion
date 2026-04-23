-- Verificación de schema previa al diseño de RPCs resolver_item_compra / resolver_item_despacho.
-- Correr en el SQL editor del dashboard Supabase (ref xclobkgmaxioifpkukul) o vía MCP.
-- Solo lecturas. Ninguna mutación.

-- 1) Columnas y tipos de las 7 tablas afectadas.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN (
    'solicitud_compra_item','solicitud_compra','materiales_a_cuenta_cliente',
    'stock_movimientos','stock_materiales','obras','proveedores','facturas_compra'
  )
ORDER BY table_name, ordinal_position;

-- 2) Triggers no-internos sobre esas tablas.
SELECT tgname, tgrelid::regclass AS tabla, tgfoid::regproc AS fn, tgtype
FROM pg_trigger
WHERE tgrelid::regclass::text IN (
  'solicitud_compra_item','solicitud_compra','materiales_a_cuenta_cliente',
  'stock_movimientos','stock_materiales','obras','proveedores','facturas_compra'
)
AND NOT tgisinternal
ORDER BY tabla, tgname;

-- 3) Constraints (check, unique, FK, primary key).
SELECT conrelid::regclass AS tabla, conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN (
  'solicitud_compra_item','solicitud_compra','materiales_a_cuenta_cliente',
  'stock_movimientos','stock_materiales','obras','proveedores','facturas_compra'
)
AND contype IN ('c','u','f','p')
ORDER BY tabla, contype, conname;

-- 4) Índices sobre las tablas más tocadas por las RPCs (lock FOR UPDATE, unique MCC).
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN (
    'solicitud_compra_item','materiales_a_cuenta_cliente',
    'stock_movimientos','stock_materiales'
  )
ORDER BY tablename, indexname;

-- 5) Funciones que referencian updated_at (indicio de trigger global).
SELECT proname, pronamespace::regnamespace AS schema
FROM pg_proc
WHERE prosrc ILIKE '%updated_at%'
  AND pronamespace::regnamespace::text = 'public';
