-- 20260905v — Se archivan 5 obras sin movimiento (OK del user 2026-09-05: "las que me decís sin dudar archivalas de una")
--
-- Criterio: sin horas cargadas hace más de dos meses (o casi ninguna), sin
-- gente asignada, sin herramientas en obra ni materiales pendientes.
--   CC FARM SALTA  Farmacia Salta   última hora 02/04/2026
--   CC-003         CAPS             última hora 14/05/2026
--   CC CASA WM     Manzur           última hora 04/06/2026
--   CC clinica YB  Clínica YB       última hora 18/06/2026
--   CC-020         Áridos           7 horas en total (obra creada por error: los áridos tienen su módulo)
-- Mismos campos que `obrasService.archivar`. Se desarchivan desde la UI.

update public.obras
   set archivada = true, fecha_archivo = current_date,
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where cod in ('CC FARM SALTA', 'CC-003', 'CC CASA WM', 'CC clinica YB', 'CC-020')
   and coalesce(archivada, false) = false;
