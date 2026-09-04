-- El remito impreso marca los renglones que son herramienta.
--
-- Pedido del user (2026-09-03): que el papel que firma el capataz diga que esa
-- herramienta debe volver al pañol. Es un cambio de impacto operativo con
-- terceros: lo que hoy se entrega como si fuera consumible pasa a estar por
-- escrito como prestamo.
--
-- SE RESUELVE CON EL MISMO PREDICADO, no con uno nuevo. `es_herramienta_item()`
-- ya es la unica definicion (trigger del ledger, vista de reconciliacion,
-- backfill); si el remito definiera la suya por su cuenta, en dos meses dirian
-- cosas distintas. Es la leccion de los 5 escritores de MCC, esta vez del lado
-- de la LECTURA.
--
-- Va por trigger y no desde el backend para que el valor se calcule en el mismo
-- lugar que todo lo demas: el service de remitos no tiene que saber nada de esto.

alter table public.remitos_envio_item
  add column if not exists es_herramienta boolean not null default false;

comment on column public.remitos_envio_item.es_herramienta is
  'Lo setea el trigger trg_remito_item_marca_herramienta con public.es_herramienta_item(). Se usa para el 🔧 y la leyenda "debe volver al pañol" en el remito impreso.';

create or replace function public.fn_remito_item_marca_herramienta()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_clase       text;
  v_material_id integer;
begin
  select i.clase, i.material_id into v_clase, v_material_id
    from public.solicitud_compra_item i
   where i.id = new.item_id;

  -- Si el renglon del remito no apunta a un item (no deberia pasar), se cae al
  -- texto del propio renglon, que es lo unico que hay.
  new.es_herramienta := public.es_herramienta_item(
    v_clase, v_material_id, coalesce(new.descripcion, '')
  ) is not null;

  return new;
exception when others then
  -- Igual que el ledger: esto no puede voltear la creacion de un remito.
  raise warning '[remito_item_herramienta] item %: %', new.item_id, sqlerrm;
  new.es_herramienta := false;
  return new;
end;
$$;

drop trigger if exists trg_remito_item_marca_herramienta on public.remitos_envio_item;
create trigger trg_remito_item_marca_herramienta
  before insert on public.remitos_envio_item
  for each row execute function public.fn_remito_item_marca_herramienta();

-- Backfill de los remitos ya emitidos, para que reimprimir uno viejo salga igual.
update public.remitos_envio_item r
   set es_herramienta = true
  from public.solicitud_compra_item i
 where i.id = r.item_id
   and public.es_herramienta_item(i.clase, i.material_id, i.descripcion) is not null
   and r.es_herramienta is distinct from true;
