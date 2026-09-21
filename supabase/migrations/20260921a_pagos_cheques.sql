-- Pagos: un cheque por fila, no un cheque por orden de pago.
--
-- Hasta acá una OP tenía UN `fecha_cobro` y UNA `referencia`, o sea que asumía
-- un solo instrumento. Pagar una factura con 3 cheques a 30/60/90 obligaba a
-- emitir 3 órdenes: el proveedor lo veía como 3 pagos parciales y se perdía
-- que fue una sola operación.
--
-- Las preguntas que hay que poder contestar son por cheque, no por orden:
-- qué cheques caen esta semana, cuánto hay comprometido en cartera, y cuál
-- fue el que rebotó. Ninguna se contesta con un contador de cheques.
--
-- `pagos_ordenes.fecha_cobro` se conserva y pasa a ser DERIVADA: la primera de
-- las fechas de los cheques. Así `v_pagos_ordenes.en_cartera` y todo lo que ya
-- la lee siguen andando, y el detalle vive en la tabla nueva.

create table if not exists public.pagos_cheques (
  id           bigserial primary key,
  orden_id     bigint not null references public.pagos_ordenes(id) on delete cascade,
  numero       text   not null,
  banco        text   not null default '',
  fecha_cobro  date   not null,
  monto        numeric(14,2) not null,
  -- Propio = de la chequera de CADINC. De tercero = endosado, y ahí importa
  -- quién lo libró: si rebota, el problema es de ese tercero.
  es_propio    boolean not null default true,
  librador     text   not null default '',
  obs          text   not null default '',
  created_at   timestamptz not null default now(),
  constraint pagos_cheques_numero_chk   check (btrim(numero) <> ''),
  constraint pagos_cheques_monto_chk    check (monto > 0),
  constraint pagos_cheques_librador_chk check (es_propio or btrim(librador) <> '')
);

create index if not exists pagos_cheques_orden_idx on public.pagos_cheques (orden_id);
create index if not exists pagos_cheques_fecha_idx on public.pagos_cheques (fecha_cobro);

comment on table  public.pagos_cheques is 'Un cheque o echeq por fila, colgado de su orden de pago. La suma de los montos es el monto_pagado de la OP.';
comment on column public.pagos_cheques.es_propio is 'true = chequera de CADINC. false = endosado de un tercero, y entonces `librador` es obligatorio.';

alter table public.pagos_cheques enable row level security;
drop policy if exists pagos_cheques_all on public.pagos_cheques;
create policy pagos_cheques_all on public.pagos_cheques for all using (true) with check (true);

-- El módulo es 100% backend: mismos grants que pagos_orden_lineas.
revoke all on public.pagos_cheques from anon, authenticated;
grant all on public.pagos_cheques to service_role;
revoke all on sequence public.pagos_cheques_id_seq from anon, authenticated;
grant usage, select on sequence public.pagos_cheques_id_seq to service_role;

-- ── Un mismo cheque no se puede entregar dos veces ──
-- No es un índice único porque la unicidad depende del ESTADO de la orden:
-- si una OP se anula, sus cheques vuelven a estar disponibles para rehacerla.
create or replace function public.fn_pagos_cheque_unico()
returns trigger language plpgsql set search_path to 'public','pg_temp' as $function$
declare v_otra int;
begin
  select o.numero into v_otra
    from public.pagos_cheques c
    join public.pagos_ordenes o on o.id = c.orden_id
   where o.estado = 'emitida'
     and c.id is distinct from new.id
     and public.norm_txt(c.numero)   = public.norm_txt(new.numero)
     and public.norm_txt(c.banco)    = public.norm_txt(new.banco)
     and public.norm_txt(c.librador) = public.norm_txt(new.librador)
   limit 1;
  if found then
    raise exception 'CHEQUE_DUPLICADO' using errcode = 'P0001',
      detail = json_build_object('numero', new.numero, 'banco', new.banco, 'orden_numero', v_otra)::text;
  end if;
  return new;
end $function$;

drop trigger if exists trg_pagos_cheque_unico on public.pagos_cheques;
create trigger trg_pagos_cheque_unico
  before insert or update of numero, banco, librador on public.pagos_cheques
  for each row execute function public.fn_pagos_cheque_unico();
