-- 20260911a — Historial de precio_ref: la ficha del catalogo deja de tener un
-- solo precio "ahora" y pasa a tener una linea de tiempo.
--
-- Hasta hoy stock_materiales.precio_ref se pisaba in-place y lo unico que
-- quedaba era precio_actualizado_en (20260904v). Es el mismo modelo que tenia
-- tarja antes del 26/06, cuando un aumento global recalculo semanas ya pagadas;
-- alla la salida fue categoria_tarifas (cat_id, vh, desde). Aca es lo mismo:
-- una fila por cambio, append-only, escrita por TRIGGER para que hasta un
-- UPDATE desde el SQL Editor deje rastro.
--
-- La fuente, el renglon y el usuario que originan el cambio viajan por config
-- local de la transaccion ('cadinc.precio_fuente', 'cadinc.precio_item',
-- 'cadinc.precio_user'), que es lo que setea fijar_precio_ref() (20260911c).
-- Sin config: fuente 'sql', que es la verdad.
--
-- El historial ARRANCA HOY: el backfill pone una fila por ficha con precio > 0
-- fechada en precio_actualizado_en, y eso es todo lo que se sabe del pasado.
-- No reconstruye a cuanto estaba el catalogo el 15 de julio.
-- Plan: Obsidian › Proyectos › "Precios de compras y stock - plan 2026-09-08".

create table if not exists public.stock_materiales_precios (
  id           bigserial primary key,
  material_id  integer not null references public.stock_materiales(id) on delete cascade,
  precio       numeric not null check (precio >= 0),
  unidad       text,
  desde        timestamptz not null default now(),
  fuente       text not null default 'sql'
               check (fuente in ('manual','compra','ultima_compra','migracion','sql','backfill')),
  item_id      integer references public.solicitud_compra_item(id) on delete set null,
  user_id      uuid,
  obs          text,
  created_at   timestamptz not null default now()
);
create index if not exists stock_materiales_precios_material_desde_idx
  on public.stock_materiales_precios (material_id, desde desc);

comment on table public.stock_materiales_precios is
  'Linea de tiempo de precio_ref. Append-only, la escribe el trigger de stock_materiales (20260911a).';

-- Misma politica permisiva que el resto (§5.4): la seguridad vive en el backend.
-- Lectura directa permitida; escritura solo service_role (20260906q).
alter table public.stock_materiales_precios enable row level security;
drop policy if exists stock_materiales_precios_all on public.stock_materiales_precios;
create policy stock_materiales_precios_all on public.stock_materiales_precios
  for all using (true) with check (true);
revoke insert, update, delete, truncate on public.stock_materiales_precios from anon, authenticated;
grant select on public.stock_materiales_precios to anon, authenticated;

create or replace function public.fn_stock_materiales_precio_historial()
returns trigger language plpgsql as $$
declare
  v_fuente text := coalesce(nullif(current_setting('cadinc.precio_fuente', true), ''), 'sql');
  v_item   integer := nullif(current_setting('cadinc.precio_item', true), '')::integer;
  v_user   uuid := coalesce(nullif(current_setting('cadinc.precio_user', true), '')::uuid,
                            public.usuario_actual());
begin
  if tg_op = 'INSERT' then
    if coalesce(new.precio_ref, 0) <= 0 then return new; end if;
  elsif new.precio_ref is not distinct from old.precio_ref then
    return new;
  end if;
  -- precio_actualizado_en ya lo sello el BEFORE trigger (20260904v): es "desde".
  insert into public.stock_materiales_precios
    (material_id, precio, unidad, desde, fuente, item_id, user_id)
  values
    (new.id, coalesce(new.precio_ref, 0), new.unidad,
     coalesce(new.precio_actualizado_en, now()), v_fuente, v_item, v_user);
  return new;
end $$;

drop trigger if exists trg_stock_materiales_precio_historial on public.stock_materiales;
create trigger trg_stock_materiales_precio_historial
  after insert or update of precio_ref on public.stock_materiales
  for each row execute function public.fn_stock_materiales_precio_historial();

-- Backfill: una fila por ficha con precio, fechada en lo unico que se sabe.
insert into public.stock_materiales_precios (material_id, precio, unidad, desde, fuente, obs)
select m.id, m.precio_ref, m.unidad,
       coalesce(m.precio_actualizado_en, m.updated_at, m.created_at, now()),
       'backfill',
       'Primera fila del historial (20260911a): el precio que tenia la ficha ese dia. Antes no habia historial.'
  from public.stock_materiales m
 where coalesce(m.precio_ref, 0) > 0
   and not exists (select 1 from public.stock_materiales_precios h where h.material_id = m.id);
