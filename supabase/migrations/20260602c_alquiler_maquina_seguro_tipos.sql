-- ═══════════════════════════════════════════════════════════════════
--  ALQUILER — máquinas: campo `seguro` + ampliación de tipos viales
-- ───────────────────────────────────────────────────────────────────
--  Pedido del user: poder cargar el seguro de la máquina (opcional, "en
--  caso que tenga") y ampliar el catálogo de tipos con máquinas viales
--  (cargadora frontal, retroexcavadora, miniexcavadora, motoniveladora,
--  topadora, etc.).
--
--  `seguro` = texto libre (compañía / nº de póliza). Si más adelante se
--  necesita vencimiento o adjunto PDF, se amplía (hoy alcanza con el dato).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Campo seguro (opcional).
alter table public.alquiler_maquinas
  add column if not exists seguro text;

-- 2. Ampliar el CHECK de `tipo`. Se conservan los 5 valores previos
--    (hidrogrua/retropala/minicargadora/trailer_canasta/otro) y se suman
--    los nuevos tipos viales.
alter table public.alquiler_maquinas
  drop constraint if exists alquiler_maquinas_tipo_check;

alter table public.alquiler_maquinas
  add constraint alquiler_maquinas_tipo_check
  check (tipo in (
    'cargadora_frontal',
    'retroexcavadora',
    'retropala',
    'excavadora',
    'miniexcavadora',
    'minicargadora',
    'motoniveladora',
    'topadora',
    'compactador',
    'pavimentadora',
    'manipulador_telescopico',
    'hidrogrua',
    'grua',
    'camion_volcador',
    'trailer_canasta',
    'otro'
  ));
