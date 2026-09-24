-- Facturación fase 7 (2026-09-23): datos del cliente desde el padrón de ARCA
-- (ws_sr_constancia_inscripcion, getPersona_v2).
--
-- padron_json          lo que devolvió ARCA la última vez (ya resumido por el
--                      backend: razón social, domicilio fiscal, impuestos,
--                      condición IVA sugerida). Sirve para ver de dónde salió
--                      un dato y para comparar sin volver a preguntar.
-- padron_consultado_at cuándo se consultó.
--
-- Solo lo escribe el backend (service_role). Consultar el padrón NO guarda
-- nada; lo guarda "Actualizar desde ARCA" y el script de domicilios.

alter table public.ventas_clientes
  add column if not exists padron_json jsonb,
  add column if not exists padron_consultado_at timestamptz;

comment on column public.ventas_clientes.padron_json is
  'Último resultado del padrón de ARCA (getPersona_v2), resumido por el backend. Fase 7.';
comment on column public.ventas_clientes.padron_consultado_at is
  'Cuándo se consultó el padrón de ARCA para este cliente.';
