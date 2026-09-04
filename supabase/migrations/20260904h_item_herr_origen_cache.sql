-- Cache de es_herramienta_item() en una columna de solicitud_compra_item.
--
-- POR QUE
-- La migracion g bajo la funcion de 1.152 ms a 157 ms, pero midio sobre los
-- 2.579 items de los ultimos 60 dias. La query REAL (getAll de solicitudes,
-- solicitudes.service.ts:114) pide `items:solicitud_compra_item(*, es_herramienta, ...)`
-- SIN filtro de fecha ni paginacion: el predicado corre sobre los 3.234 items
-- historicos en CADA carga de Compras y Stock. Medido en la DB viva:
--   count(*) = 0,87 ms   vs   count(es_herramienta(i.*)) = 233 ms
-- Son 232 ms de CPU contra el nano de Render, y React Query refetchea con
-- staleTime 60 s. Con la cache: 14,5 ms.
--
-- La firma de es_herramienta(solicitud_compra_item) NO cambia: no se toca ni una
-- linea de los dos repos.
--
-- QUE **NO** REESCRIBE ESTE CACHE (leccion de categorias.vh, §5.11):
--   · remitos_envio_item.es_herramienta -> snapshot del papel ya impreso
--   · herr_entregas.origen              -> snapshot del ledger
-- Los dos quedan congelados a proposito: son historia, no estado actual.

alter table public.solicitud_compra_item
  add column if not exists herr_origen text;

comment on column public.solicitud_compra_item.herr_origen is
  'Cache de es_herramienta_item(clase, material_id, descripcion): clase|catalogo|patron|null. Lo mantiene trg_item_cache_herr_origen.';

create or replace function public.fn_item_cache_herr_origen()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  new.herr_origen := public.es_herramienta_item(new.clase, new.material_id, new.descripcion);
  return new;
exception when others then
  raise warning '[item_cache_herr_origen] item %: %', coalesce(new.id, -1), sqlerrm;
  new.herr_origen := null;
  return new;
end;
$$;

drop trigger if exists trg_item_cache_herr_origen on public.solicitud_compra_item;
create trigger trg_item_cache_herr_origen
  before insert or update of clase, material_id, descripcion
  on public.solicitud_compra_item
  for each row execute function public.fn_item_cache_herr_origen();

-- Recache al editar patrones. OBLIGATORIO: `herr_patrones` esta pensada para
-- editarse en caliente, y sin esto un patron nuevo no alcanzaria a ningun
-- renglon ya cargado — que es exactamente el gotcha del matcher de materiales.
-- Los ~220 ms se pagan una vez por edicion, en un write raro.
create or replace function public.fn_herr_patrones_recache()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  update public.solicitud_compra_item i
     set herr_origen = public.es_herramienta_item(i.clase, i.material_id, i.descripcion)
   where i.herr_origen is distinct from
         public.es_herramienta_item(i.clase, i.material_id, i.descripcion);
  return null;
end;
$$;

drop trigger if exists trg_herr_patrones_recache on public.herr_patrones;
create trigger trg_herr_patrones_recache
  after insert or update or delete on public.herr_patrones
  for each statement execute function public.fn_herr_patrones_recache();

update public.solicitud_compra_item i
   set herr_origen = public.es_herramienta_item(i.clase, i.material_id, i.descripcion);

create or replace function public.es_herramienta(i public.solicitud_compra_item)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $$
  select i.herr_origen is not null
$$;
