-- ═══════════════════════════════════════════════════════════════════
--  ALQUILER — Fase B cuenta corriente: importe devengado por parte
-- ───────────────────────────────────────────────────────────────────
--  Cada parte guarda el precio/hora vigente (snapshot) y el importe =
--  horas × precio_hora. El devengado del cliente = Σ importes de sus obras.
--
--  El importe se calcula en el backend al guardar el parte, y se RECALCULA
--  para los partes de una (obra,máquina) cuando cambia su precio_hora (así
--  podés cargar partes antes de fijar la tarifa y queda bien).
--
--  Backfill: importe = horas × precio_hora de la asignación (obra,máquina).
--  (Hoy hay 0 partes; el backfill es no-op pero queda para reaplicar.)
-- ═══════════════════════════════════════════════════════════════════

alter table public.alquiler_partes
  add column if not exists precio_hora numeric,
  add column if not exists importe     numeric;

update public.alquiler_partes p
set precio_hora = om.precio_hora,
    importe     = coalesce(p.horas, 0) * om.precio_hora
from public.alquiler_obra_maquinas om
where om.obra_id = p.obra_id
  and om.maquina_id = p.maquina_id
  and om.precio_hora is not null
  and p.importe is null;
