-- 20260911h — Certificado al cliente, version chica: la "presentacion" de la
-- cuenta corriente con nombre propio.
--
-- CADINC cobra por avance de certificado + los materiales gastados hasta la
-- fecha del certificado (user, 08/09/2026). Hasta hoy el sistema solo conocia
-- los materiales, el PDF se generaba a demanda y no habia forma de saber que
-- numero tenia el cliente en la mano: "no cobrado" era la unica guarda, y es
-- insuficiente (el 26/06 de tarja, en la cuenta del cliente).
--
-- Un certificado: obra, numero correlativo por obra, FECHA DE CORTE, un monto
-- de mano de obra tipeado y los renglones de materiales de esa obra hasta el
-- corte, que al emitir se CONGELAN (certificado_id en la fila). El precio de
-- deposito se lleva al catalogo AL EMITIR y ahi queda (decision del user).
-- Los cobros se imputan contra el certificado, repartidos en mano de obra y
-- materiales.
-- Plan: Obsidian › Proyectos › "Precios de compras y stock - plan 2026-09-08".

create table if not exists public.certificados_cliente (
  id               serial primary key,
  obra_cod         text not null references public.obras(cod),
  numero           integer not null check (numero > 0),
  fecha_corte      date not null,
  fecha_emision    date not null default current_date,
  estado           text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  mano_de_obra     numeric not null default 0 check (mano_de_obra >= 0),
  total_materiales numeric not null default 0 check (total_materiales >= 0),
  total            numeric not null default 0 check (total >= 0),
  renglones        integer not null default 0,
  obs              text,
  emitido_por      uuid,
  anulado_por      uuid,
  anulado_el       timestamptz,
  anulado_motivo   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (obra_cod, numero)
);
create index if not exists certificados_cliente_obra_idx on public.certificados_cliente (obra_cod, numero desc);
comment on table public.certificados_cliente is
  'Certificado al cliente: corte por fecha, mano de obra por avance y materiales congelados (20260911h).';

alter table public.materiales_a_cuenta_cliente
  add column if not exists certificado_id integer references public.certificados_cliente(id) on delete set null;
create index if not exists mcc_certificado_idx on public.materiales_a_cuenta_cliente (certificado_id) where certificado_id is not null;

alter table public.cuenta_cliente_cobros
  add column if not exists certificado_id      integer references public.certificados_cliente(id) on delete set null,
  add column if not exists monto_mano_de_obra  numeric not null default 0 check (monto_mano_de_obra >= 0),
  add column if not exists monto_materiales    numeric not null default 0 check (monto_materiales >= 0);

-- Misma politica permisiva que el resto (§5.4); lectura directa, escritura solo service_role.
alter table public.certificados_cliente enable row level security;
drop policy if exists certificados_cliente_all on public.certificados_cliente;
create policy certificados_cliente_all on public.certificados_cliente for all using (true) with check (true);
revoke insert, update, delete, truncate on public.certificados_cliente from anon, authenticated;
grant select on public.certificados_cliente to anon, authenticated;
