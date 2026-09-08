-- Semanas cobradas de una obra por administración: el monto queda congelado
--
-- Viene de la pregunta de Belén ("¿si los precios varían se le actualizan
-- aunque ya pagó?"). Los materiales se congelan imputándolos a un pago
-- (cobro_id en MCC). Pero jornales y contratistas NO tienen renglones: la
-- semana se calcula en vivo desde horas × tarifas, así que un cambio
-- retroactivo la movería aunque el cliente ya la haya pagado.
--
-- Esta tabla es el "cobro_id de las semanas": cuando se imputa lo pagado, cada
-- semana cubierta guarda acá el facturable de ESE momento (costo canónico × %
-- vigente). De ahí en más la cuenta usa este número y no el cálculo vivo.
--
-- El espejo con los materiales es completo: cobro_id con ON DELETE CASCADE —
-- si se elimina el pago, sus semanas se descongelan solas y vuelven al cálculo
-- vivo, igual que los renglones vuelven a "a cobrar".

create table if not exists public.cuenta_admin_imputaciones (
  id         serial primary key,
  obra_cod   text not null references public.obras(cod),
  sem_key    date not null,
  pata       text not null check (pata in ('operarios', 'contratistas')),
  -- El facturable congelado: costo de la semana × % vigente, al momento de imputar.
  monto      numeric(14,2) not null check (monto > 0),
  cobro_id   int not null references public.cuenta_cliente_cobros(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (obra_cod, sem_key, pata)
);

comment on table public.cuenta_admin_imputaciones is
  'Semanas de jornales/contratistas ya cubiertas por pagos del cliente en '
  'obras por administración. El monto es el facturable congelado al imputar: '
  'la cuenta lo usa en lugar del cálculo vivo, así un cambio retroactivo de '
  'tarifas no mueve lo que el cliente ya pagó. Borrar el cobro descongela.';

alter table public.cuenta_admin_imputaciones enable row level security;
create policy cuenta_admin_imputaciones_all on public.cuenta_admin_imputaciones
  for all using (true) with check (true);
grant select on public.cuenta_admin_imputaciones to anon, authenticated;
