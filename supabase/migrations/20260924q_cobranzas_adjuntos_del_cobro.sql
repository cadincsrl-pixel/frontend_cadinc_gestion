-- =====================================================================
-- 20260924q — Ventas / Cobranzas: documentación del cliente en el cobro
--
-- Pedido del dueño: «si el cliente me manda comprobantes de pago, retenciones
-- y orden de pago, ¿a dónde se sube?». Los certificados de retención ya van
-- en cada retención (`ventas_cobro_retenciones.adjunto_*`). Esto suma un lugar
-- para lo demás, colgado del cobro (RC):
--   · comprobante_pago — la transferencia / el depósito;
--   · orden_pago       — la orden de pago del cliente (qué facturas paga y
--                        qué retiene);
--   · otro.
--
-- Reglas:
--   · Escribe el backend directo (service_role), sin RPC: los adjuntos no
--     mueven saldos. RLS permisiva y sin grants a anon/authenticated, igual
--     que el resto de `ventas_*`.
--   · El archivo vive en el bucket privado `ventas-docs`, bajo
--     `cobros/<cobro_id>/<uuid>.<ext>` (o `cobros/pendientes/…` mientras el
--     cobro no existe). Dedup por sha256 calculado en el backend: único
--     (cobro_id, file_hash).
--   · Se puede adjuntar a un cobro ANULADO (sirve como respaldo), pero no se
--     puede BORRAR un adjunto de un cobro anulado → COBRO_ANULADO.
--   · cobro_id y file_hash/size no cambian nunca (ADJUNTO_INMUTABLE); el
--     backend solo actualiza storage_path al mover el archivo, y obs/tipo.
-- =====================================================================

create table public.ventas_cobro_adjuntos (
  id              bigserial primary key,
  cobro_id        bigint not null references public.ventas_cobros(id),
  tipo            text not null check (tipo in ('comprobante_pago', 'orden_pago', 'otro')),
  storage_path    text not null,
  nombre_archivo  text not null check (length(btrim(nombre_archivo)) > 0),
  mime            text,
  size_bytes      bigint check (size_bytes is null or size_bytes > 0),
  file_hash       text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  obs             text not null default '',
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  constraint ventas_cobro_adjuntos_hash_uidx unique (cobro_id, file_hash),
  constraint ventas_cobro_adjuntos_path_uidx unique (storage_path)
);
create index ventas_cobro_adjuntos_cobro_idx on public.ventas_cobro_adjuntos (cobro_id, created_at);
comment on table public.ventas_cobro_adjuntos is
  'Documentación del cliente en un cobro (RC): comprobante de pago, orden de pago del cliente u otro. Bucket ventas-docs, cobros/<cobro_id>/. Único (cobro_id, file_hash). Se adjunta también a anulados; no se borra de un anulado. 20260924q.';

create or replace function public.fn_ventas_cobro_adjuntos_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_estado text;
begin
  if tg_op = 'DELETE' then
    select estado into v_estado from public.ventas_cobros where id = old.cobro_id;
    if v_estado = 'anulado' then
      raise exception 'COBRO_ANULADO' using errcode = 'P0001',
        detail = json_build_object('cobro_id', old.cobro_id, 'adjunto_id', old.id)::text;
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.cobro_id is distinct from old.cobro_id
                           or new.file_hash is distinct from old.file_hash
                           or new.size_bytes is distinct from old.size_bytes
                           or new.created_at is distinct from old.created_at
                           or new.created_by is distinct from old.created_by) then
    raise exception 'ADJUNTO_INMUTABLE' using errcode = 'P0001',
      detail = json_build_object('adjunto_id', old.id)::text;
  end if;
  return new;
end $$;

create trigger trg_ventas_cobro_adjuntos_guard before update or delete on public.ventas_cobro_adjuntos
  for each row execute function public.fn_ventas_cobro_adjuntos_guard();
create trigger trg_audit_cambios after update on public.ventas_cobro_adjuntos
  for each row execute function public.audit_cambios('facturacion', 'adjunto del cobro', 'id');
create trigger trg_audit_borrado after delete on public.ventas_cobro_adjuntos
  for each row execute function public.audit_borrado('facturacion', 'adjunto del cobro', 'id');

alter table public.ventas_cobro_adjuntos enable row level security;
create policy ventas_cobro_adjuntos_all on public.ventas_cobro_adjuntos for all using (true) with check (true);
revoke all on table public.ventas_cobro_adjuntos from public, anon, authenticated;
grant all on table public.ventas_cobro_adjuntos to service_role;
revoke all on sequence public.ventas_cobro_adjuntos_id_seq from public, anon, authenticated;
grant usage, select on sequence public.ventas_cobro_adjuntos_id_seq to service_role;
revoke all on function public.fn_ventas_cobro_adjuntos_guard() from public, anon, authenticated;
grant execute on function public.fn_ventas_cobro_adjuntos_guard() to service_role;
