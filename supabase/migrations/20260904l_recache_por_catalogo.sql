-- Cierra el ultimo vector de staleness del detector, y aplica la curaduria del
-- catalogo que decidio el user el 2026-09-04.
--
-- EL AGUJERO
-- El brazo 'catalogo' marca como herramienta todo item cuyo material tenga
-- stock_materiales.clase='herramienta'. Pero:
--   1) marcar/desmarcar un material NO recacheaba `herr_origen` (el recache solo
--      existia para herr_patrones), y
--   2) aunque se recacheara, el trigger del ledger no escuchaba `herr_origen`,
--      asi que la reclasificacion no llegaba nunca a herr_entregas.
-- Resultado: marcar una fila del catalogo como herramienta no tenia NINGUN efecto
-- sobre lo ya cargado. Misma familia que el gotcha del matcher de materiales.
--
-- Con esto, marcar un material arrastra: recache -> trigger del ledger -> las
-- salidas historicas de ese material entran a la bandeja solas.
-- Verificado: marcar las 7 filas de abajo trajo 52 entregas historicas (257 -> 309).

create or replace function public.fn_material_clase_recache()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.clase is distinct from old.clase then
    update public.solicitud_compra_item i
       set herr_origen = public.es_herramienta_item(i.clase, i.material_id, i.descripcion)
     where i.material_id = new.id
       and i.herr_origen is distinct from
           public.es_herramienta_item(i.clase, i.material_id, i.descripcion);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_material_clase_recache on public.stock_materiales;
create trigger trg_material_clase_recache
  after update of clase on public.stock_materiales
  for each row execute function public.fn_material_clase_recache();

-- El ledger tambien escucha `herr_origen`: sin esto un recache actualizaba la
-- cache pero la herramienta nunca entraba a la bandeja.
drop trigger if exists trg_herr_entregas_sync on public.solicitud_compra_item;
create trigger trg_herr_entregas_sync
  after insert or update of cantidad_enviada, estado, clase, material_id, descripcion, herr_origen
  on public.solicitud_compra_item
  for each row execute function public.fn_herr_entregas_sync();

-- ── Curaduria del catalogo (decision del user, 2026-09-04) ────
-- 7 filas que son herramienta de mano y estaban como material. La RULETA queda
-- AFUERA a proposito. El FRATACHO sale: se definio como consumible.
update public.stock_materiales set clase = 'herramienta'
 where nombre in ('Pala ancha','Pala de punta','Pistola p/ cartucho de silicona','Pico',
                  'Cepillo de acero c/ cabo','Nivel de burbuja 1m','Cortafierro (cincel) de mano')
   and clase is distinct from 'herramienta';

update public.stock_materiales set clase = 'material'
 where nombre = 'Fratacho espuma' and clase = 'herramienta';

-- Las entregas del fratacho que ya estaban en el ledger no se borran (son
-- historia): se archivan con el motivo para que no ensucien la bandeja.
update public.herr_entregas e
   set estado = 'ignorada',
       nota   = coalesce(nota || ' | ', '')
                || 'el fratacho se definio como consumible, no es herramienta del panol (2026-09-04)'
  from public.solicitud_compra_item i
 where i.id = e.item_id
   and i.material_id = (select id from public.stock_materiales where nombre = 'Fratacho espuma')
   and e.estado in ('pendiente','confirmada','revisar');
