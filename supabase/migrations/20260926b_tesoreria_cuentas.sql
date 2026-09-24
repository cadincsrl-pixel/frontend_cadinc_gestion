-- =====================================================================
-- Tesorería: cuentas propias de CADINC (bancos, caja, valores) (2026-09-26)
--
-- Por qué una tabla NUEVA y no ventas_cuentas_bancarias:
--   · aquella exige cbu NOT NULL con CBU válido, y una caja o una cartera de
--     valores no tienen CBU;
--   · sus lectores (default de la FCE, ventas_cobro_medios, CuentasFce)
--     mostrarían "Caja" como cuenta de la FCE o del cobro por transferencia;
--   · si Pagos apuntara a una tabla de Ventas se rompería §5.18.
-- Ventas sigue usando la suya sin cambios; `ventas_cuenta_id` (único) deja el
-- vínculo para conciliar en la fase 4. Los CBU/alias se COPIAN al sembrar y
-- pueden divergir: la fuente del CBU de la FCE sigue siendo Ventas.
--
-- `cuenta_id` (la cuenta contable) queda null en el seed: se vincula desde
-- Contabilidad › Plan cuando exista el plan de cuentas.
-- =====================================================================

create table public.tesoreria_cuentas (
  id                bigserial primary key,
  tipo              text not null check (tipo in ('banco', 'caja', 'valores')),
  nombre            text not null check (length(btrim(nombre)) >= 2),
  banco             text not null default '',
  cbu               text check (cbu is null or public.cbu_valido(cbu)),
  alias             text check (alias is null or alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  moneda            text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  cuenta_id         bigint references public.cont_cuentas(id),
  ventas_cuenta_id  bigint unique references public.ventas_cuentas_bancarias(id),
  activo            boolean not null default true,
  obs               text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  updated_by        uuid references auth.users(id),
  constraint tesoreria_cuentas_cbu_solo_banco check (tipo = 'banco' or (cbu is null and alias is null))
);
create unique index tesoreria_cuentas_nombre_uidx on public.tesoreria_cuentas (lower(nombre)) where activo;
create unique index tesoreria_cuentas_cbu_uidx    on public.tesoreria_cuentas (cbu) where activo and cbu is not null;

comment on table public.tesoreria_cuentas is
  'Cuentas propias de CADINC (bancos, caja, valores). Fuente de la cuenta de origen de la OP y del auxiliar de tesorería. Ventas sigue usando ventas_cuentas_bancarias para la FCE';

-- La cuenta contable vinculada tiene que ser una hoja activa del activo.
create or replace function public.fn_tesoreria_cuenta_valida()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.cuenta_id is not null and not exists (
       select 1 from public.cont_cuentas c
        where c.id = new.cuenta_id and c.imputable and c.activo and c.rubro = 'activo') then
    raise exception 'CUENTA_TESORERIA_INVALIDA' using errcode = 'P0001',
      detail = json_build_object('cuenta_id', new.cuenta_id)::text;
  end if;
  return new;
end $$;

create trigger trg_tesoreria_cuenta_valida before insert or update of cuenta_id on public.tesoreria_cuentas
  for each row execute function public.fn_tesoreria_cuenta_valida();

alter table public.cont_asiento_lineas
  add constraint cont_lineas_aux_tesoreria_fk foreign key (aux_tesoreria_id) references public.tesoreria_cuentas(id);
create index cont_asiento_lineas_aux_tes_idx on public.cont_asiento_lineas (aux_tesoreria_id) where aux_tesoreria_id is not null;

create trigger trg_tesoreria_cuentas_touch before update on public.tesoreria_cuentas
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.tesoreria_cuentas
  for each row execute function public.audit_cambios('contabilidad', 'cuenta de tesorería', 'id');
create trigger trg_audit_borrado after delete on public.tesoreria_cuentas
  for each row execute function public.audit_borrado('contabilidad', 'cuenta de tesorería', 'id');

alter table public.tesoreria_cuentas enable row level security;
create policy tesoreria_cuentas_all on public.tesoreria_cuentas for all using (true) with check (true);
revoke all on table public.tesoreria_cuentas from public, anon, authenticated;
grant all on table public.tesoreria_cuentas to service_role;
revoke all on sequence public.tesoreria_cuentas_id_seq from public, anon, authenticated;
grant usage, select on sequence public.tesoreria_cuentas_id_seq to service_role;
revoke all on function public.fn_tesoreria_cuenta_valida() from public, anon, authenticated;
grant execute on function public.fn_tesoreria_cuenta_valida() to service_role;

-- ── Seed: los bancos activos de Ventas + la caja ───────────────────────
insert into public.tesoreria_cuentas (tipo, nombre, banco, cbu, alias, ventas_cuenta_id, obs)
select 'banco', v.banco, v.banco, v.cbu, nullif(btrim(v.alias), ''), v.id, 'Copiada de Ventas (20260926b)'
  from public.ventas_cuentas_bancarias v
 where v.activo
 order by v.id;

insert into public.tesoreria_cuentas (tipo, nombre) values ('caja', 'Caja en pesos');
