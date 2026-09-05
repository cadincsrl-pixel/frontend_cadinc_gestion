-- 20260905q — Pañol: se confirman en bloque las 490 salidas "sin revisar"
--
-- OK del user 2026-09-05 ("aprobá todas las salidas"). Eran las salidas que
-- el backfill del ledger (herr_entregas) detectó desde los pedidos ya enviados
-- y nadie había revisado: 261 de tipos del catálogo, 22 tildadas como
-- herramienta en el pedido y 207 detectadas por texto. Mismos campos que
-- PATCH /api/herramientas/entregas/bulk con estado 'confirmada'. Los retornos
-- no se tocan (no había ninguno pendiente).

update public.herr_entregas
   set estado = 'confirmada',
       resuelto_por = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8',
       resuelto_el = now(),
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8',
       updated_at = now(),
       nota = coalesce(nota || ' · ', '') || 'Confirmada en bloque el 05/09/2026 (OK del user).'
 where sentido = 'salida' and estado = 'pendiente';
