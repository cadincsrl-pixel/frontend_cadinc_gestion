-- Historial de transiciones de estado por ÍTEM de solicitud de compra.
--
-- Por qué una tabla dedicada y no el audit_log genérico: el audit_log que
-- llena auditMiddleware infiere la acción de la ruta HTTP y NO captura el
-- estado_anterior -> estado_nuevo semántico, ni la cantidad afectada, ni un
-- comentario del usuario. Esta tabla es la fuente de verdad de la traza del
-- ciclo de vida del ítem (pedido -> comprado/de_deposito/en_proveedor ->
-- retirado -> enviado -> ... -> revertido).
--
-- Append-only: la app solo INSERTA. No se updatea ni se borra desde el código
-- (salvo el CASCADE al borrar la solicitud/ítem).
--
-- `accion` es TEXTO LIBRE a propósito (sin CHECK): el 2026-05-29 un CHECK de
-- estados bloqueó una feature a nivel DB. No repetir ese candado acá.

create table if not exists solicitud_item_eventos (
  id              bigserial primary key,
  item_id         int  not null references solicitud_compra_item(id) on delete cascade,
  solicitud_id    int  references solicitud_compra(id) on delete cascade,  -- denormalizado para listar el timeline de una solicitud sin join
  accion          text not null,   -- 'creado','comprado','despachado','en_proveedor','retirado','enviado','rechazado','revertido','envio_revertido','editado'
  estado_anterior text,            -- null en la creación del ítem
  estado_nuevo    text not null,
  cantidad        numeric,         -- cantidad afectada (comprada/despachada/retirada), si aplica
  comentario      text,            -- comentario opcional del usuario en la transición
  meta            jsonb,           -- bag flexible: proveedor_id, precio_unit, factura_id, remito_id, etc.
  user_id         uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_sie_item  on solicitud_item_eventos(item_id);
create index if not exists idx_sie_sol   on solicitud_item_eventos(solicitud_id);
create index if not exists idx_sie_fecha on solicitud_item_eventos(created_at desc);

-- RLS permisiva por diseño (la seguridad real está en el backend Hono).
alter table solicitud_item_eventos enable row level security;

create policy "solicitud_item_eventos_all" on solicitud_item_eventos
  for all using (true) with check (true);
