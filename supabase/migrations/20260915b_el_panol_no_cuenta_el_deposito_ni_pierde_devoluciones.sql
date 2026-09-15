-- Dos arreglos de la auditoría del 15/09 sobre la MISMA función
-- (`fn_herr_entregas_sync`), por eso van juntos: dos migraciones separadas se
-- pisarían el cuerpo entre sí.
--
-- ── B9: recibir una compra en el depósito se registraba como "salida a obra" ──
-- La función resuelve la obra con "el destino físico manda" y nunca miraba
-- `obras.es_deposito`. Cuando el destino ES la obra depósito, ese remito no es un
-- despacho: es la recepción de la compra en el pañol. El backend ya lo sabe
-- (`remitos-envio.service.ts` calcula `esDeposito` e ingresa el stock) pero no
-- usaba el dato para suprimir la salida. El botón se llama literalmente "Recibir
-- en depósito" y el modal "📦 RECIBIR EN DEPÓSITO": el mismo click se registraba
-- como recepción en Compras y como salida en Herramientas.
--
-- Consecuencia: en /herramientas/retornos aparecía una barra "DEPOSITO · 3 herr.
-- · 19 u." pidiendo que devuelvan al pañol lo que ya está en el pañol, y la única
-- salida que ofrecía la pantalla era un retorno falso o marcar "No es
-- herramienta", que también miente. Son 3 filas (ids 360, 455, 696 = 19 unidades)
-- y había un gatillo armado: el item 2130 "Pistola p/ cartucho de silicona",
-- solicitud 661, obra CC DEPOSITO, estado comprado y material clase herramienta.
--
-- ── B3: deshacer un envío ya devuelto dejaba la devolución huérfana ──
-- La rama 2 (reconciliación hacia abajo) anula salidas enteras sin mirar
-- `devuelto` y sin tocar las devoluciones que cuelgan de esa salida. Las
-- devoluciones que escribe `registrar_retorno_herramientas` tienen `item_id`
-- NULL, así que quedan fuera del conteo de la rama y sobreviven vivas, colgadas
-- de una salida anulada. Si el envío se rehace — que es el camino normal de
-- "cargué mal el remito, lo deshago y lo vuelvo a hacer" — nace una salida nueva
-- con `devuelto = 0`, y el pañol vuelve a reclamar lo que ya volvió.
--
-- El loop deshacer→rehacer ya corrió en producción: item 3812, entrega #1030
-- anulada 11:55:59 y #1031 creada 11:56:38, 39 segundos después. Hoy hay 338
-- salidas con `devuelto > 0` expuestas a esto.
--
-- La cascada va ANTES de anular la salida para que `trg_herr_entregas_devuelto`
-- recalcule con la salida todavía viva y no quede un `devuelto` colgado.

create or replace function public.fn_herr_entregas_sync()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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

  -- Rama 2: sobra registrado -> anular de la mas nueva a la mas vieja.
  -- Va ANTES del predicado y sin consultarlo.
  --
  -- 20260915b: al anular una salida se anulan TAMBIEN sus devoluciones, que
  -- cuelgan por salida_id y tienen item_id NULL (o sea que no entran en el
  -- conteo de arriba y sobrevivirian huerfanas). Ver esa migracion.
  while v_registrado > v_objetivo loop
    select id, cantidad into v_fila
      from public.herr_entregas
     where item_id = new.id and estado <> 'anulada'
     order by id desc limit 1;
    exit when not found;

    update public.herr_entregas
       set estado = 'anulada',
           nota   = coalesce(nota || ' | ', '')
                    || 'anulada con su salida #' || v_fila.id
     where salida_id = v_fila.id
       and estado <> 'anulada';

    update public.herr_entregas
       set estado = 'anulada',
           nota   = coalesce(nota || ' | ', '')
                    || 'anulada al bajar lo enviado a ' || v_objetivo
     where id = v_fila.id;

    v_registrado := v_registrado - v_fila.cantidad;
  end loop;

  v_falta := v_objetivo - v_registrado;
  if v_falta <= 0 then
    return null;
  end if;

  -- Lee la cache (la dejo lista trg_item_cache_herr_origen, que es BEFORE).
  v_origen := new.herr_origen;
  if v_origen is null then
    return null;
  end if;

  v_remito_id := new.remito_envio_id;
  if v_remito_id is not null then
    select r.numero, r.obra_cod into v_remito_nro, v_obra
      from public.remitos_envio r where r.id = v_remito_id;
  end if;

  if v_obra is null then
    select s.obra_cod into v_obra
      from public.solicitud_compra s where s.id = new.solicitud_id;
  end if;

  -- 20260915b: si el destino es la obra DEPOSITO, esto no es una salida a obra,
  -- es la recepcion de la compra en el panol. No se registra nada.
  if v_obra is not null
     and (select coalesce(o.es_deposito, false) from public.obras o where o.cod = v_obra) then
    return null;
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
  raise warning '[herr_entregas] item %: %', new.id, sqlerrm;
  return null;
end;
$function$;

-- Las 3 filas que ya estan: a 'ignorada', el mismo tratamiento que se le dio a
-- la 533 en su momento. No se borran: el historial del deposito tiene que
-- seguir explicandose solo.
update public.herr_entregas e
   set estado = 'ignorada',
       nota   = coalesce(e.nota || ' | ', '')
                || 'recepcion de compra en el deposito, no es una salida a obra (20260915b)'
  from public.obras o
 where o.cod = e.obra_cod
   and o.es_deposito
   and e.estado not in ('anulada', 'ignorada');
