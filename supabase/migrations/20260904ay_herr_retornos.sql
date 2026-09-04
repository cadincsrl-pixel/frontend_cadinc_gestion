-- 20260904ay — Retorno de obra: las herramientas vuelven al pañol
--
-- User (2026-09-04): "mejoremos las salidas a obra, y pongamos otro que sea
-- retorno de obra cuando esa herramienta vuelva, aumentemos filtros,
-- selección y aprobación múltiple".
--
-- Modelo: un retorno es una fila más del ledger (sentido 'devolucion',
-- origen 'manual') colgada de la salida que devuelve (`salida_id`). Se
-- permiten retornos parciales: la salida lleva `devuelto` (Σ de sus
-- devoluciones vivas, lo mantiene un trigger) y `en_obra` = cantidad −
-- devuelto (columna generada, para poder filtrar "lo que sigue en obra"
-- desde PostgREST). El registro va por RPC SECURITY DEFINER con lock de la
-- salida: no se puede devolver más de lo que salió.
-- Las devoluciones que ya escribía el trigger de pedidos (ítems con
-- `devuelve`) siguen igual, sin salida_id.

-- 1) columnas ────────────────────────────────────────────────────────────────
alter table public.herr_entregas
  add column if not exists salida_id bigint references public.herr_entregas(id) on delete set null,
  add column if not exists devuelto  numeric not null default 0 check (devuelto >= 0);

alter table public.herr_entregas
  add column if not exists en_obra numeric generated always as (cantidad - devuelto) stored;

create index if not exists herr_entregas_salida_idx on public.herr_entregas (salida_id) where salida_id is not null;
create index if not exists herr_entregas_en_obra_idx on public.herr_entregas (obra_cod, en_obra) where sentido = 'salida' and en_obra > 0;

comment on column public.herr_entregas.salida_id is 'Para una devolución manual: la salida que devuelve (retorno parcial permitido).';
comment on column public.herr_entregas.devuelto  is 'En una salida: Σ cantidad de sus devoluciones no anuladas. Lo mantiene trg_herr_entregas_devuelto.';
comment on column public.herr_entregas.en_obra   is 'En una salida: cantidad − devuelto. Generada; sirve para filtrar lo que sigue en obra.';

-- 2) trigger: devuelto de la salida ──────────────────────────────────────────
create or replace function public.fn_herr_entregas_devuelto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ids bigint[];
begin
  v_ids := array_remove(array[
    case when tg_op in ('INSERT','UPDATE') then new.salida_id end,
    case when tg_op in ('UPDATE','DELETE') then old.salida_id end
  ], null);
  if cardinality(v_ids) = 0 then return null; end if;

  update public.herr_entregas s
     set devuelto = coalesce((
           select sum(d.cantidad) from public.herr_entregas d
            where d.salida_id = s.id and d.sentido = 'devolucion' and d.estado <> 'anulada'), 0)
   where s.id = any(v_ids);
  return null;
end;
$$;

drop trigger if exists trg_herr_entregas_devuelto on public.herr_entregas;
create trigger trg_herr_entregas_devuelto
  after insert or update of cantidad, estado, salida_id or delete
  on public.herr_entregas
  for each row execute function public.fn_herr_entregas_devuelto();

-- 3) RPC: registrar retorno ──────────────────────────────────────────────────
create or replace function public.registrar_retorno_herramientas(
  p_items   jsonb,      -- [{"salida_id": 123, "cantidad": 1}, ...]
  p_fecha   date,
  p_nota    text,
  p_user_id uuid
)
returns setof public.herr_entregas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it       record;
  s        public.herr_entregas;
  v_cant   numeric;
  v_nueva  public.herr_entregas;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_ITEMS' using errcode = 'P0001';
  end if;

  for it in select (x->>'salida_id')::bigint as salida_id, (x->>'cantidad')::numeric as cantidad
              from jsonb_array_elements(p_items) x
  loop
    select * into s from public.herr_entregas where id = it.salida_id for update;
    if not found then
      raise exception 'SALIDA_NO_EXISTE' using errcode = 'P0001', detail = it.salida_id::text;
    end if;
    if s.sentido <> 'salida' or s.estado not in ('pendiente', 'confirmada', 'revisar') then
      raise exception 'SALIDA_NO_DEVOLVIBLE' using errcode = 'P0001', detail = it.salida_id::text;
    end if;
    v_cant := coalesce(it.cantidad, s.cantidad - s.devuelto);
    if v_cant <= 0 or v_cant > s.cantidad - s.devuelto then
      raise exception 'CANTIDAD_INVALIDA'
        using errcode = 'P0001',
              detail = format('salida=%s pedido=%s en_obra=%s', it.salida_id, v_cant, s.cantidad - s.devuelto);
    end if;

    insert into public.herr_entregas (
      item_id, solicitud_id, obra_cod, descripcion, descripcion_norm, cantidad, unidad, material_id,
      fecha, sentido, origen, estado, salida_id, herramienta_id, nota,
      resuelto_por, resuelto_el, created_by, updated_by
    ) values (
      null, s.solicitud_id, s.obra_cod, s.descripcion, s.descripcion_norm, v_cant, s.unidad, s.material_id,
      p_fecha, 'devolucion', 'manual', 'confirmada', s.id, s.herramienta_id, nullif(p_nota, ''),
      p_user_id, now(), p_user_id, p_user_id
    ) returning * into v_nueva;

    return next v_nueva;
  end loop;
  return;
end;
$$;

revoke execute on function public.registrar_retorno_herramientas(jsonb, date, text, uuid) from public, anon, authenticated;
grant  execute on function public.registrar_retorno_herramientas(jsonb, date, text, uuid) to service_role;

-- 4) la vista de obras suma lo que sigue en obra ─────────────────────────────
drop view if exists public.v_herr_entregas_obras;
create view public.v_herr_entregas_obras
with (security_invoker = true) as
select e.obra_cod                                                     as cod,
       count(*)                                                       as n,
       count(*) filter (where e.estado = 'pendiente')                 as n_pendientes,
       count(*) filter (where e.sentido = 'salida' and e.estado in ('pendiente','confirmada','revisar') and e.en_obra > 0) as n_en_obra,
       coalesce(sum(e.en_obra) filter (where e.sentido = 'salida' and e.estado in ('pendiente','confirmada','revisar')), 0) as cant_en_obra,
       count(*) filter (where e.sentido = 'devolucion' and e.estado <> 'anulada') as n_devoluciones,
       max(e.fecha)                                                   as ultima
  from public.herr_entregas e
 where e.obra_cod is not null
   and e.estado <> 'anulada'
 group by e.obra_cod;

comment on view public.v_herr_entregas_obras is
  'Obras con movimientos del pañol, agregadas en el server: salidas, pendientes, lo que sigue en obra y devoluciones. Existe para que el selector no traiga una fila por entrega (techo de 1000 de PostgREST).';
