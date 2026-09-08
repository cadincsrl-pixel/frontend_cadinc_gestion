-- Obras por administración: el cliente paga costo + porcentaje
--
-- Hay obras que se facturan "por administración": CADINC pone operarios,
-- contratistas y materiales, y al cliente se le cobra el costo de cada pata
-- más un porcentaje pactado (que puede ser distinto para cada una).
--
-- Las tres patas YA están cargadas en el sistema — horas de tarja (fórmula
-- canónica §5.11), certificaciones semanales de contratistas, y materiales en
-- la cuenta corriente. Lo único nuevo es la marca y los porcentajes.
--
-- Los porcentajes van VERSIONADOS con fecha desde, patrón `tarifas` /
-- `categoria_tarifas`: si a mitad de obra se renegocia un %, vale desde ese
-- viernes y no re-factura lo anterior. La lección del aumento global del
-- 2026-06-26 (un UPDATE in-place recalculó retroactivamente semanas ya
-- pagadas) acá costaría plata del cliente: se paga una vez y no de nuevo.

alter table public.obras
  add column if not exists por_administracion boolean not null default false;

comment on column public.obras.por_administracion is
  'La obra se factura por administración: costo + % por pata (operarios, '
  'contratistas, materiales). Los porcentajes viven versionados en '
  'obras_admin_tarifas; este flag prende la vista de administración en la '
  'cuenta corriente.';

create table if not exists public.obras_admin_tarifas (
  id               serial primary key,
  obra_cod         text not null references public.obras(cod),
  -- Siempre un viernes (inicio de semana CADINC): los costos de operarios y
  -- contratistas son semanales, así que el % cambia en frontera de semana.
  desde            date not null,
  pct_operarios    numeric(6,2) not null check (pct_operarios    >= 0 and pct_operarios    <= 500),
  pct_contratistas numeric(6,2) not null check (pct_contratistas >= 0 and pct_contratistas <= 500),
  pct_materiales   numeric(6,2) not null check (pct_materiales   >= 0 and pct_materiales   <= 500),
  created_at       timestamptz not null default now(),
  created_by       uuid,
  unique (obra_cod, desde)
);

comment on table public.obras_admin_tarifas is
  'Porcentajes de una obra por administración, versionados por fecha (siempre '
  'viernes). El vigente para una semana/fecha es la fila con el mayor desde <= '
  'esa fecha. Se agregan filas, no se pisan: el historial es lo que justifica '
  'cada factura ya emitida.';

-- Mismo modelo de acceso que el resto: RLS permisiva, escribe solo el backend.
alter table public.obras_admin_tarifas enable row level security;
create policy obras_admin_tarifas_all on public.obras_admin_tarifas
  for all using (true) with check (true);
grant select on public.obras_admin_tarifas to anon, authenticated;
