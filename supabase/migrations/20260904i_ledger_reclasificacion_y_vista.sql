-- Dos agujeros con la misma raiz: el trigger del ledger miraba SOLO
-- cantidad_enviada/estado, pero la vista antidoto evaluaba el predicado EN VIVO.
--
-- 1) SI UN ITEM YA ENVIADO SE RECLASIFICA, EL LEDGER NO SE ENTERA.
--    Cambiar `descripcion` o `material_id` de un item que ya salio puede
--    convertirlo en herramienta, y nada volvia a disparar el trigger: la
--    herramienta quedaba fuera del ledger PARA SIEMPRE.
--    No es teorico: el 2026-09-03 corrieron 1.362 eventos `descripcion_unificada`
--    sobre items con cantidad_enviada > 0, que reescriben descripcion y asignan
--    material_id. La fase 2 del catalogo promete mas.
--    Fix: el trigger tambien escucha clase, material_id y descripcion.
--    Verificado con rollback: un item enviado que se reclasifica pasa de 0 a 1
--    filas en el ledger.
--
-- 2) EL CHIP ROJO MENTIA. v_herr_entregas_faltantes existe para gritar cuando el
--    `exception when others` se trago un error. Como evaluaba el predicado en
--    vivo, una reclasificacion le hacia mostrar filas que NO eran un error
--    tragado — y que el ledger no podia recuperar solo. Con (1) arreglado, la
--    vista vuelve a significar lo que dice.
--
-- De paso, los dos leen ahora la columna cacheada `herr_origen` (20260904h) en
-- vez de llamar a la funcion: la vista pasa de 175 ms a 3,8 ms, y se evalua en
-- cada carga de la pantalla de Salidas.

create or replace function public.fn_herr_entregas_sync()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_objetivo   numeric;
  v_registrado numeric;
  v_falta      numeric;
  v_origen     text;
  v_obra       text;
  v_remito_id  integer;
  v_remito_nro text;
  v_fila       record;
begin
  -- ── Rama 1: el renglon volvio para atras despues de haber salido ──
  -- No se anula (la herramienta fisicamente ya salio): se marca para que un
  -- humano mire. Anular seria mentir sobre donde esta.
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado
     and new.estado in ('pendiente', 'rechazado') then
    update public.herr_entregas
       set estado = 'revisar',
           nota   = coalesce(nota || ' | ', '')
                    || 'el renglon volvio a ' || new.estado || ' despues de haber salido'
     where item_id = new.id
       and estado not in ('anulada', 'ignorada', 'revisar');
  end if;

  v_objetivo := coalesce(new.cantidad_enviada, 0);

  select coalesce(sum(cantidad), 0) into v_registrado
    from public.herr_entregas
   where item_id = new.id and estado <> 'anulada';

  -- ── Rama 2: sobra registrado → anular de la mas nueva a la mas vieja ──
  -- Va ANTES del predicado y SIN consultarlo: si hay filas para este item, su
  -- existencia ya es la decision tomada. Si el predicado cambiara (se edita un
  -- patron), un item viejo tiene que poder seguir reconciliando hacia abajo.
  while v_registrado > v_objetivo loop
    select id, cantidad into v_fila
      from public.herr_entregas
     where item_id = new.id and estado <> 'anulada'
     order by id desc limit 1;
    exit when not found;

    update public.herr_entregas
       set estado = 'anulada',
           nota   = coalesce(nota || ' | ', '')
                    || 'anulada al bajar lo enviado a ' || v_objetivo
     where id = v_fila.id;

    v_registrado := v_registrado - v_fila.cantidad;
  end loop;

  -- ── Rama 3: falta registrar ──
  v_falta := v_objetivo - v_registrado;
  if v_falta <= 0 then
    return null;
  end if;

  -- Lee la cache que dejo lista trg_item_cache_herr_origen, que es BEFORE.
  v_origen := new.herr_origen;
  if v_origen is null then
    return null;
  end if;

  -- El remito se lee de NEW, que en el camino con remito se setea en el MISMO
  -- update que cantidad_enviada. En un parcial todavia no esta, y entonces la
  -- fila nace sin remito — que es honesto: colgarle el RM de un envio anterior
  -- seria peor que no tener ninguno.
  v_remito_id := new.remito_envio_id;
  if v_remito_id is not null then
    select r.numero, r.obra_cod into v_remito_nro, v_obra
      from public.remitos_envio r where r.id = v_remito_id;
  end if;

  -- El destino fisico manda; si no hay remito, la obra del pedido.
  if v_obra is null then
    select s.obra_cod into v_obra
      from public.solicitud_compra s where s.id = new.solicitud_id;
  end if;

  insert into public.herr_entregas (
    item_id, solicitud_id, obra_cod, descripcion, descripcion_norm,
    cantidad, unidad, material_id, fecha, sentido, origen,
    remito_envio_id, remito_numero, created_by, updated_by
  ) values (
    new.id, new.solicitud_id, v_obra, new.descripcion, public.norm_txt(new.descripcion),
    v_falta, new.unidad, new.material_id,
    coalesce(new.fecha_envio, current_date),
    case when coalesce(new.devuelve, false) then 'devolucion' else 'salida' end,
    v_origen, v_remito_id, v_remito_nro, new.updated_by, new.updated_by
  );

  return null;

exception when others then
  -- La bandeja del pañol NUNCA puede voltear un remito legitimo.
  -- El agujero que deja esta red lo tapa v_herr_entregas_faltantes.
  raise warning '[herr_entregas] item %: %', new.id, sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_herr_entregas_sync on public.solicitud_compra_item;
create trigger trg_herr_entregas_sync
  after insert or update of cantidad_enviada, estado, clase, material_id, descripcion
  on public.solicitud_compra_item
  for each row execute function public.fn_herr_entregas_sync();

-- ── El antidoto del `exception when others` ───────────────────
-- Compara CANTIDAD, no existencia: un item con 5 enviados y 2 registrados es
-- un bug tapado igual que uno con 0 registrados. Su count se pinta en rojo en
-- la pantalla de Salidas. Si devuelve filas, algo se trago un error.
create or replace view public.v_herr_entregas_faltantes
with (security_invoker = true) as
select i.id                       as item_id,
       i.solicitud_id,
       s.obra_cod,
       i.descripcion,
       i.cantidad_enviada         as enviado,
       coalesce(q.reg, 0)         as registrado,
       i.cantidad_enviada - coalesce(q.reg, 0) as faltante
  from public.solicitud_compra_item i
  join public.solicitud_compra s on s.id = i.solicitud_id
  left join lateral (
    select sum(e.cantidad) as reg
      from public.herr_entregas e
     where e.item_id = i.id and e.estado <> 'anulada'
  ) q on true
 where coalesce(i.cantidad_enviada, 0) > 0
   and i.herr_origen is not null
   and coalesce(q.reg, 0) < i.cantidad_enviada;

comment on view public.v_herr_entregas_faltantes is
  'Herramientas que salieron y NO quedaron registradas en herr_entregas. Tiene que estar siempre vacia: si devuelve filas, el `exception when others` del trigger se trago un error.';
