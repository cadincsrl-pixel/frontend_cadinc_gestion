-- =====================================================================
-- Hardening de schema de `liquidaciones`.
--
-- Problema: columnas críticas (chofer_id, estado, todos los totales) eran
-- nullable sin razón semántica. El RPC create_liquidacion_con_reintegros
-- siempre llena valores via coalesce(...), pero un UPDATE manual o un bug
-- futuro podría dejar una liquidación con chofer_id=NULL o estado=NULL,
-- lo cual no tiene sentido de negocio.
--
-- Fix:
-- - Convertir a NOT NULL las columnas de totales (ya tenían DEFAULT 0) y
--   las identitarias (chofer_id, estado).
-- - Agregar CHECK sobre estado (solo 'borrador' / 'cerrada', los valores
--   que generan create/cerrar/reabrir).
--
-- Pre-verificado: tabla tiene 0 filas actualmente, sin riesgo de fallo
-- por datos históricos inválidos. Defaults existentes cubren inserts
-- legacy por si aparecieran paths no-RPC.
-- =====================================================================

alter table liquidaciones
  alter column chofer_id       set not null,
  alter column estado          set not null,
  alter column dias_trabajados set not null,
  alter column km_totales      set not null,
  alter column precio_km       set not null,
  alter column basico_dia      set not null,
  alter column subtotal_km     set not null,
  alter column subtotal_basico set not null,
  alter column total_adelantos set not null,
  alter column total_neto      set not null;

-- CHECK sobre estado. Los dos únicos valores que el backend genera.
alter table liquidaciones
  add constraint liquidaciones_estado_check
  check (estado in ('borrador', 'cerrada'));
