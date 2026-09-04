-- El trigger que llena `herr_entregas`, y la vista que lo audita.
--
-- POR QUE EL PUNTO DE ENGANCHE ES `cantidad_enviada` Y NO `estado`
-- Un item puede salir a la obra por varios caminos. Medido en el repo, no
-- supuesto: `cantidad_enviada` tiene EXACTAMENTE 3 escritores, los tres en
-- TypeScript, y CERO en SQL:
--   remitos-envio.service.ts:135  → remito, completo o PARCIAL
--   solicitudes.service.ts:748    → enviarItem (endpoint vivo, sin UI hoy)
--   solicitudes.service.ts:994    → revertirEnvio (lo pone en 0)
-- Ninguna funcion de Postgres la asigna. Consecuencias, todas por construccion
-- y no por un `if` repetido:
--   · Los envios PARCIALES entran. Un trigger sobre `estado` los perdia enteros,
--     porque un parcial no cambia el estado.
--   · `_promoverSiYaEnviado` y `comprar_faltante_item` no duplican: no mueven
--     el acumulado, asi que reconcilian a cero.
--   · Prender USE_RPC_RESOLVER es indiferente.
-- Es la leccion de los 5 escritores de `materiales_a_cuenta_cliente` resuelta
-- en UN lugar, en vez de repitiendo la regla en cada camino.
--
-- RECONCILIA, NO APLICA DELTAS
-- Cada disparo compara el estado ABSOLUTO (`cantidad_enviada`) contra lo ya
-- registrado y corrige en la direccion que haga falta. Un delta perdido (por un
-- error tragado, un backfill a mano, una migracion futura) se arregla solo en el
-- disparo siguiente. Un delta aplicado a ciegas se desincroniza para siempre.
--
-- NO PUEDE VOLTEAR UN REMITO
-- `exception when others` deliberado: la bandeja del pañol jamas puede hacer
-- fallar la operacion core. El precio de esa red es que un bug se tapa, y por eso
-- existe `v_herr_entregas_faltantes`, que compara CANTIDADES (no existencia) y
-- se expone como chip rojo en la pantalla. Si esa vista tiene filas, hay un bug.

begin;

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

  v_origen := public.es_herramienta_item(new.clase, new.material_id, new.descripcion);
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
  after insert or update of cantidad_enviada, estado
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
   and public.es_herramienta_item(i.clase, i.material_id, i.descripcion) is not null
   and coalesce(q.reg, 0) < i.cantidad_enviada;

comment on view public.v_herr_entregas_faltantes is
  'Herramientas que salieron y NO quedaron registradas en herr_entregas. Tiene que estar siempre vacia: si devuelve filas, el `exception when others` del trigger se trago un error.';

commit;
