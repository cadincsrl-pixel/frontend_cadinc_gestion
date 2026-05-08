-- =====================================================================
-- Asignación de obras a usuarios.
-- Permite restringir qué obras puede ver/operar un usuario no-admin.
-- Pensado especialmente para el rol "jefe de obra" que solo gestiona
-- pedidos de materiales (solicitudes de compra) de SUS obras.
--
-- Reglas (aplicadas en el backend):
-- - rol = 'admin' → ignora esta tabla, ve todo.
-- - rol != 'admin' con filas en esta tabla → solo ve esas obras.
-- - rol != 'admin' SIN filas en esta tabla → ve cero (regla estricta).
-- =====================================================================

create table if not exists public.usuario_obras (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  obra_cod   text not null references public.obras(cod)   on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, obra_cod)
);

create index if not exists usuario_obras_obra_idx
  on public.usuario_obras (obra_cod);

alter table public.usuario_obras enable row level security;
drop policy if exists usuario_obras_all on public.usuario_obras;
create policy usuario_obras_all on public.usuario_obras
  for all using (true) with check (true);
