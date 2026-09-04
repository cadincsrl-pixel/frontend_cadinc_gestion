-- Ledger de herramientas que salen a obra: `herr_entregas`.
--
-- POR QUE EXISTE
-- Un renglon de solicitud marcado clase='herramienta' se resuelve igual que un
-- material y sale a la obra con remito, pero el modulo Herramientas NO se entera:
-- no hay ninguna columna que ligue `herramientas` con las solicitudes. La
-- herramienta viaja y la trazabilidad queda muda.
--
-- Pedido textual del user (2026-09-03): "todavia no tenemos todas las herramientas
-- cargadas pero por lo menos que queden cargadas como un texto o algo para tener
-- referencia de lo que se lleva".
--
-- ESTA FASE NO ESCRIBE EN EL PADRON. Ni una fila en `herramientas`, ni una en
-- `herr_movimientos`. Es un log de texto, que es literalmente lo que se pidio.
-- Motivo medido, no teorico: en produccion hay 12 textos distintos para la misma
-- amoladora ("amoladora 4 1 2" x15, "amoladora de 4 1 2" x4, "amoladora chica",
-- "amoladora de 7", "amoladora skil 4 1 2", ...) y 35 para "escalera". Un alta
-- automatica dejaria ~159 fichas para ~40 objetos fisicos reales — el desastre
-- del catalogo de materiales otra vez, pero peor, porque aca cada ficha pretende
-- ser un objeto unico. Vincular/dar de alta es decision de un humano (fase 2).
--
-- POR QUE UN PREDICADO Y NO EL TILDE MANUAL
-- `clase='herramienta'` se uso 4 veces en 2.898 items entregados. El predicado
-- de abajo detecta 256 (4 por tilde + 41 por catalogo + 211 por texto), sobre
-- 159 descripciones y 31 obras, 111 en los ultimos 30 dias. 64x el tilde manual.

begin;

-- ── Normalizador ──────────────────────────────────────────────
-- `unaccent` NO esta instalado y ademas no es IMMUTABLE (no se puede indexar).
-- `translate` si lo es. Misma decision que en el catalogo de materiales.
create or replace function public.norm_txt(t text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')), 'áéíóúüñàèìòùç', 'aeiouunaeiouc'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- ── Patrones del detector ─────────────────────────────────────
-- Editable sin migracion (fase 3 le pone una pantalla en HerrParametros).
create table if not exists public.herr_patrones (
  id      serial primary key,
  patron  text    not null,
  tipo    text    not null check (tipo in ('incluir', 'excluir')),
  activo  boolean not null default true,
  nota    text,
  unique (patron, tipo)
);

comment on table public.herr_patrones is
  'Detector de herramientas por descripcion. incluir = substring sobre el texto normalizado; excluir = PALABRA CABEZA (primer token), que es lo que distingue la herramienta de su accesorio.';

-- Incluir: la herramienta en si.
insert into public.herr_patrones (patron, tipo, nota) values
  ('amoladora','incluir',null), ('taladro','incluir',null),
  ('rotomartillo','incluir',null), ('roto martillo','incluir',null),
  ('rotor martillo','incluir',null), ('martillo demoledor','incluir',null),
  ('martillo perforador','incluir',null), ('percutor','incluir',null),
  ('hidrolavadora','incluir',null),
  ('soldador','incluir','substring: cubre tambien "soldadora"'),
  ('compresor','incluir',null), ('generador','incluir',null),
  ('minitorno','incluir',null), ('sierra','incluir',null),
  ('circular','incluir',null), ('caladora','incluir',null),
  ('ingletadora','incluir',null), ('escalera','incluir',null),
  ('andamio','incluir',null), ('caballete','incluir',null),
  ('carretilla','incluir',null), ('mezcladora','incluir',null),
  ('hormigonera','incluir',null), ('cortadora','incluir',null),
  ('atornillador','incluir','substring: cubre tambien "atornilladora"'),
  ('aspiradora','incluir',null), ('laser','incluir',null),
  ('pistola de calor','incluir',null), ('pulidora','incluir',null),
  ('vibrador','incluir',null), ('pison','incluir',null),
  ('malacate','incluir',null), ('bomba de agua','incluir',null),
  ('motobomba','incluir',null), ('bomba de vacio','incluir',null),
  ('caja de herramienta','incluir',null), ('cajon de herramienta','incluir',null)
on conflict (patron, tipo) do nothing;

-- Excluir por PALABRA CABEZA: "mecha copa para amoladora" es una mecha, no una
-- amoladora. La comparacion singulariza la cabeza, asi que no hace falta listar
-- los plurales (fue el error que dejo pasar "hojas para cierra circular").
insert into public.herr_patrones (patron, tipo, nota) values
  ('punta','excluir',null), ('boquilla','excluir',null), ('rueda','excluir',null),
  ('repuesto','excluir',null), ('disco','excluir',null), ('mecha','excluir',null),
  ('alargue','excluir',null), ('plataforma','excluir',null), ('tablon','excluir',null),
  ('llave','excluir',null), ('listel','excluir',null), ('cambio','excluir',null),
  ('cable','excluir',null), ('carbon','excluir',null), ('escobilla','excluir',null),
  ('correa','excluir',null), ('filtro','excluir',null), ('bolsa','excluir',null),
  ('funda','excluir',null), ('hoja','excluir',null), ('cargador','excluir',null),
  ('bateria','excluir',null), ('adaptador','excluir',null), ('soporte','excluir',null),
  ('traba','excluir',null), ('cuerpo','excluir',null), ('aceite','excluir',null),
  ('service','excluir',null), ('reparacion','excluir',null), ('arreglo','excluir',null),
  ('dispositivo','excluir',null)
on conflict (patron, tipo) do nothing;

-- ── El predicado ──────────────────────────────────────────────
-- UNO SOLO, compartido por el trigger, la vista de reconciliacion y el backfill.
-- La leccion de los 5 escritores de MCC aplicada tambien a la LECTURA: si cada
-- consumidor define "es herramienta" por su cuenta, divergen.
--
-- Tres brazos, en orden de confianza:
--   'clase'    → alguien lo tildo a mano en el pedido. Manda sobre todo.
--   'catalogo' → el material vinculado esta marcado como herramienta en el
--                catalogo. Se lee UNA VEZ, al escribir, y queda de snapshot en
--                herr_entregas: editar stock_materiales despues NO reescribe la
--                historia (la leccion de categorias.vh, §5.11).
--   'patron'   → deteccion por texto. Es el brazo que cubre el 82% del volumen.
create or replace function public.es_herramienta_item(
  p_clase       text,
  p_material_id integer,
  p_desc        text
)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when coalesce(p_clase, 'material') = 'herramienta' then 'clase'
    when p_material_id is not null and exists (
      select 1 from stock_materiales m
       where m.id = p_material_id and m.clase = 'herramienta') then 'catalogo'
    when exists (
      select 1 from herr_patrones p
       where p.activo and p.tipo = 'incluir'
         and public.norm_txt(p_desc) like '%' || p.patron || '%')
     and not exists (
      select 1 from herr_patrones p
       where p.activo and p.tipo = 'excluir'
         and p.patron in (
           split_part(public.norm_txt(p_desc), ' ', 1),
           regexp_replace(split_part(public.norm_txt(p_desc), ' ', 1), 'e?s$', '')))
    then 'patron'
    else null
  end
$$;

-- ── El ledger ─────────────────────────────────────────────────
create table if not exists public.herr_entregas (
  id               bigserial primary key,

  -- ON DELETE SET NULL y NUNCA cascade: si se borra la solicitud, la referencia
  -- de que esa herramienta salio tiene que sobrevivir. Para eso el snapshot.
  item_id          integer references public.solicitud_compra_item(id) on delete set null,
  solicitud_id     integer,

  obra_cod         text    references public.obras(cod),
  descripcion      text    not null,
  descripcion_norm text    not null,
  cantidad         numeric not null check (cantidad > 0),
  unidad           text,
  material_id      integer references public.stock_materiales(id) on delete set null,
  fecha            date    not null,

  sentido          text    not null default 'salida'
                     check (sentido in ('salida', 'devolucion')),
  origen           text    not null
                     check (origen in ('clase', 'catalogo', 'patron', 'manual')),
  es_backfill      boolean not null default false,

  -- pendiente  → salio y nadie la toco todavia (el estado con el que nace)
  -- vinculada  → se la ligo a una herramienta del padron (fase 2)
  -- catalogada → se dio de alta en el padron a partir de esta entrega (fase 2)
  -- ignorada   → Sosa dijo "esto no es herramienta"
  -- anulada    → se deshizo el envio; la fila queda como rastro, no cuenta
  -- revisar    → el renglon cambio despues de salir y hay que mirarlo
  estado           text    not null default 'pendiente'
                     check (estado in ('pendiente','vinculada','catalogada','ignorada','anulada','revisar')),

  herramienta_id   integer  references public.herramientas(id)   on delete set null,
  movimiento_id    integer  references public.herr_movimientos(id) on delete set null,
  remito_envio_id  integer  references public.remitos_envio(id)  on delete set null,
  remito_numero    text,

  nota             text,
  resuelto_por     uuid,
  resuelto_el      timestamptz,

  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.herr_entregas is
  'Log de herramientas que salieron a obra desde un pedido. Lo escribe un trigger sobre el delta de solicitud_compra_item.cantidad_enviada. Fase 1 NO toca el padron de herramientas.';

create index if not exists herr_entregas_pendientes_idx
  on public.herr_entregas (fecha desc) where estado = 'pendiente';
create index if not exists herr_entregas_item_idx        on public.herr_entregas (item_id);
create index if not exists herr_entregas_obra_fecha_idx  on public.herr_entregas (obra_cod, fecha desc);
create index if not exists herr_entregas_herramienta_idx on public.herr_entregas (herramienta_id);
create index if not exists herr_entregas_norm_trgm_idx
  on public.herr_entregas using gin (descripcion_norm gin_trgm_ops);

-- ── updated_at ────────────────────────────────────────────────
-- Trigger PROPIO. NO usar set_audit_fields(): esa funcion hace
-- `NEW.created_by := OLD.created_by` y revienta en runtime en cualquier tabla
-- cuyo shape no coincida. Dos lineas propias y no depende de nadie.
create or replace function public.fn_herr_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_herr_entregas_touch on public.herr_entregas;
create trigger trg_herr_entregas_touch
  before update on public.herr_entregas
  for each row execute function public.fn_herr_touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
-- Permisiva por diseño (§5.4): la seguridad real esta en el backend Hono.
alter table public.herr_patrones enable row level security;
alter table public.herr_entregas enable row level security;

drop policy if exists herr_patrones_all on public.herr_patrones;
create policy herr_patrones_all on public.herr_patrones using (true) with check (true);
drop policy if exists herr_entregas_all on public.herr_entregas;
create policy herr_entregas_all on public.herr_entregas using (true) with check (true);

commit;
