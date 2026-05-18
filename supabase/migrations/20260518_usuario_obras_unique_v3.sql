-- Permisos v3: la columna usuario_obras.modulo se eliminó (migración
-- 20260518_permisos_v3_cleanup), así que el UNIQUE viejo
-- (user_id, obra_cod, modulo) ya no existe. El backend hace
-- `upsert(... onConflict: 'user_id,obra_cod')`, así que necesita esta
-- constraint para idempotencia al asignar capataz/jefe de obra.

alter table public.usuario_obras
  add constraint usuario_obras_user_obra_unique unique (user_id, obra_cod);
