-- Permisos v2 — Fase 3.
--
-- Unificamos polaridad de flags en permisos.tarja:
--   - solo_carga_horas (legacy, RESTRICCIÓN: true=limita) →
--     vista_completa  (CAPACIDAD: true=ve todo).
--   - ver_pii  agregado como CAPACIDAD explícita (true=ve DNI, dirección,
--     teléfono, fecha de nacimiento). Antes era implícito al tipo_usuario.
--
-- Reglas de backfill:
--   - solo_carga_horas=true   → vista_completa=false, ver_pii=false (capataz puro)
--   - solo_carga_horas=false  → vista_completa=true,  ver_pii=true
--   - solo_carga_horas no set → vista_completa=true,  ver_pii=true (default seguro)
--   - tipo capataz_supervisor → ver_pii=true (tiene tab personal)
--
-- Notar que NO borramos solo_carga_horas — el frontend y backend siguen
-- leyendo ambos durante la transición. Cuando todos los consumers usen los
-- flags v2, una migration posterior limpia el legacy.

-- Caso 1: capataz puro (solo_carga_horas=true, sin tab personal).
UPDATE profiles
SET permisos = jsonb_set(
  jsonb_set(permisos, '{tarja,vista_completa}', 'false'::jsonb, true),
  '{tarja,ver_pii}', 'false'::jsonb, true
)
WHERE permisos->'tarja'->>'solo_carga_horas' = 'true'
  AND NOT (permisos->'tarja'->'tabs' ? 'personal');

-- Caso 2: capataz con tab personal (capataz_supervisor): puede ver PII.
UPDATE profiles
SET permisos = jsonb_set(
  jsonb_set(permisos, '{tarja,vista_completa}', 'false'::jsonb, true),
  '{tarja,ver_pii}', 'true'::jsonb, true
)
WHERE permisos->'tarja'->>'solo_carga_horas' = 'true'
  AND permisos->'tarja'->'tabs' ? 'personal';

-- Caso 3: tarja sin solo_carga_horas (administrativo, jefe_obra, etc.):
-- vista completa, ve PII.
UPDATE profiles
SET permisos = jsonb_set(
  jsonb_set(permisos, '{tarja,vista_completa}', 'true'::jsonb, true),
  '{tarja,ver_pii}', 'true'::jsonb, true
)
WHERE permisos ? 'tarja'
  AND (permisos->'tarja'->>'solo_carga_horas' IS NULL
       OR permisos->'tarja'->>'solo_carga_horas' = 'false')
  AND permisos->'tarja'->>'vista_completa' IS NULL;
