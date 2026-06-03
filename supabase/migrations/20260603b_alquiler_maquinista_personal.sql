-- ═══════════════════════════════════════════════════════════════════
--  ALQUILER — el maquinista puede ser un trabajador del personal
-- ───────────────────────────────────────────────────────────────────
--  Pedido del user: asignar como maquinista a alguien del LISTADO DE
--  PERSONAL de tarja (trabajadores SIN cuenta de sistema). Es una etiqueta
--  de quién operó la máquina; las horas/partes las carga el admin/jefe (el
--  trabajador no entra al sistema).
--
--  Se agrega `maquinista_leg` (FK a personal.leg). Se MANTIENE
--  `maquinista_user_id` (FK a profiles) por compatibilidad con el scoping
--  de Fase 3 — queda inerte mientras la UI use el listado de personal, pero
--  no se borra para no romper getScope().
-- ═══════════════════════════════════════════════════════════════════

alter table public.alquiler_obra_maquinas
  add column if not exists maquinista_leg text
    references public.personal(leg) on delete set null;

create index if not exists alquiler_obra_maquinas_maquinista_leg_idx
  on public.alquiler_obra_maquinas (maquinista_leg)
  where maquinista_leg is not null;
