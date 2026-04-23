-- =====================================================================
-- profiles.permisos.certificaciones.forzar_despacho → inicializar en false
-- =====================================================================
--
-- ¿Qué hace?
--   Inserta la clave `forzar_despacho: false` dentro del objeto
--   `permisos.certificaciones` de cada perfil que ya tiene el módulo
--   certificaciones configurado y aún no tiene el flag.
--
-- ¿Por qué?
--   El endpoint `POST /api/solicitudes/items/:itemId/despachar` ahora
--   acepta `body.forzar_sin_stock=true` para permitir despachos con
--   saldo negativo. El backend valida que
--   `profiles.permisos.certificaciones.forzar_despacho === true`
--   (el rol `admin` hace bypass). Como el flag recién se introduce,
--   ningún perfil lo tiene: esta migración lo materializa en `false`
--   para que el shape del JSON sea uniforme y la UI pueda leerlo sin
--   asumir ausencia = denegado implícito.
--
-- ¿Cómo es idempotente?
--   - El WHERE filtra solo perfiles con `certificaciones` como objeto Y
--     que aún no tienen la clave `forzar_despacho`. Re-ejecuciones no
--     matchean ninguna fila → 0 cambios.
--   - Perfiles con `permisos = null`, `{}`, sin `certificaciones`, o con
--     `certificaciones` que NO sea objeto (string/array rotos) quedan
--     intactos: esos merecen revisión manual, no un fix masivo.
--   - Cualquier `forzar_despacho=true` puesto a mano por un admin después
--     del primer run se preserva (el NOT-contains del WHERE lo excluye).
--
-- Nota sobre `jsonb_set`: usamos `create_missing=true` (default). El flag
-- refiere a la CLAVE FINAL del path (`forzar_despacho`), que es la que
-- queremos crear. La protección contra perfiles sin `certificaciones`
-- la da el WHERE, no el parámetro `create_missing`.
--
-- Scope: sólo tabla `profiles`. No toca RLS ni otras tablas.
-- ---------------------------------------------------------------------

-- ── Backfill del flag forzar_despacho en certificaciones ─────────────
update profiles
set permisos = jsonb_set(
  permisos,
  '{certificaciones,forzar_despacho}',
  'false'::jsonb,
  true  -- create_missing = true: crear la clave forzar_despacho (default)
)
where jsonb_typeof(permisos->'certificaciones') = 'object'
  and not (permisos->'certificaciones' ? 'forzar_despacho');
