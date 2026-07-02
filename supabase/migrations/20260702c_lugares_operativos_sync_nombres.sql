-- ═══════════════════════════════════════════════════════════════════
--  Sincronizar nombres cantera/depósito de cada lugar operativo
-- ───────────────────────────────────────────────────────────────────
--  Un lugar operativo (ej. Chivilcoy) se modela como un PAR cantera+depósito
--  (ver 20260624c_lugares_operativos.sql). El backend mantiene los nombres de
--  ambos en sync con el nombre del lugar al crear/actualizar (lugares.service:
--  crearLugarOperativo/actualizarLugarOperativo), así que un lugar nuevo tiene
--  cantera y depósito con el mismo nombre (ej. Yerba Buena / Yerba Buena).
--
--  CHIVILCOY es la excepción: se migró de registros pre-existentes con nombres
--  distintos — cantera "CHIVILCOY CANT" + depósito "CHIVILCOY" — y la migración
--  los vinculó pero NO renombró la cantera. Resultado: el mismo punto físico
--  aparecía con dos nombres según fuera origen (depósito) o destino (cantera)
--  en el modal de tramos, confundiendo al usuario.
--
--  Esta migración pone el nombre de la cantera y el depósito = nombre del lugar
--  operativo. Idempotente (solo toca los que difieren) y cubre cualquier drift
--  futuro. Fija: cantera "CHIVILCOY CANT" → "CHIVILCOY".
-- ═══════════════════════════════════════════════════════════════════

update public.canteras c
set nombre = lo.nombre
from public.lugares_operativos lo
where lo.cantera_id = c.id
  and c.nombre is distinct from lo.nombre;

update public.depositos d
set nombre = lo.nombre
from public.lugares_operativos lo
where lo.deposito_id = d.id
  and d.nombre is distinct from lo.nombre;
