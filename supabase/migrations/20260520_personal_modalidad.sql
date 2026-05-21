-- personal.modalidad — distingue trabajadores por hora vs mensualizados.
--
-- Caso de uso operativo: los mensualizados cobran por mes, no por horas, así
-- que NUNCA cargan horas en tarja. La alerta naranja
-- `AlertaInactivosConCobertura` los marcaba como "inactivos con cobertura
-- activa" porque pasaban el filtro `sin horas en últimas 3 semanas`, lo que
-- era un falso positivo. Con esta columna, el banner los excluye.
--
-- Valores:
--   'hora' — liquidación por horas trabajadas (default, legacy).
--   'mes'  — mensualizado (oficinas, supervisores, técnicos administrativos).

alter table personal
  add column if not exists modalidad text not null default 'hora'
  check (modalidad in ('hora', 'mes'));

comment on column personal.modalidad is
  'Cómo se liquida el sueldo: hora (legacy/operativos) o mes (mensualizados).';
