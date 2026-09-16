-- NOTA DE NUMERACION
-- El ledger de Supabase la registra partida en cuatro, en este orden:
--   20260916c1_stock_solo_materiales
--   20260916c2_limpiar_negativos_de_herramienta
--   20260916c3_stock_congelado_sin_deposito
--   20260916c4_resolver_item_despacho_sin_stock_de_herramienta
-- El contenido es exactamente el de este archivo, y el orden es el que importa:
-- la limpieza de los negativos (c2) va ANTES del trigger que congela la
-- columna (c3), porque después ya no se puede tocar sin el escape.
--
-- Una herramienta no mueve stock: el pañol es la única verdad
--
-- EL PROBLEMA
-- El depósito venía llevando DOS contabilidades de la misma herramienta:
--   · `herr_entregas` (el pañol): 729 salidas y 393 devoluciones.
--     NINGUNA con `movimiento_id` — el pañol nunca escribió en stock.
--   · `stock_movimientos`: 131 salidas (191 unidades), 6 entradas (28) y
--     15 ajustes (67), escritas por el despacho de depósito.
-- O sea: la herramienta SALE por las dos puertas y VUELVE por una sola. El
-- resultado al 16/09 eran 47 de 142 fichas de herramienta en negativo, −118
-- unidades en total. El caso del día: ficha 1131 "Cuerpo de andamio tubular",
-- un solo despacho de 3 a CC-028 y la ficha en −3.
--
-- No es un error de carga que se arregle contando: la herramienta va y vuelve,
-- y el módulo que sabe cuál volvió es el pañol. La segunda contabilidad no
-- aporta nada y siempre va a estar mal.
--
-- LA DECISIÓN DEL USER (16/09)
--   "Que una herramienta no genere movimiento de stock, igual que hicimos con
--    los servicios. Es una línea y deja el pañol como única verdad."
--
-- CÓMO
-- Mismo patrón que los servicios (20260915j / 20260915m): el candado va en la
-- base, no en los 4 caminos que escriben stock (RPC `resolver_item_despacho`,
-- `despacharItemLegacy`, el recibo de remito con destino depósito y la pantalla
-- de Stock). Son dos triggers y un retoque a la RPC:
--
--   1. `stock_movimientos` BEFORE INSERT — la herramienta no deja movimiento.
--      Devuelve NULL: la fila no se inserta y el flujo que la pedía sigue como
--      si nada. NO levanta excepción, y eso es deliberado: el despacho de
--      herramientas es justamente la puerta por la que el pañol se entera
--      (engancha en `cantidad_enviada`), y `eliminar_solicitud` repone stock de
--      todos los renglones `de_deposito`/`enviado`. Una excepción acá rompería
--      las dos cosas.
--      De paso arregla un bug que quedó abierto el 15/09: el trigger de
--      servicios (20260915j) SÍ levantaba excepción, así que borrar un pedido
--      que tuviera un renglón de servicio fallaba entero — los servicios
--      terminan en estado `enviado`, que es uno de los que `eliminar_solicitud`
--      recorre. Ahora el servicio también se saltea en silencio.
--      El mensaje para el que lo carga a mano desde la pantalla de Stock va en
--      el backend (`stock.service.ts`), que es donde se puede escribir en
--      castellano y mostrarlo en un toast; la base queda como red de seguridad.
--
--   2. `stock_materiales` BEFORE UPDATE — `stock_actual` se congela para
--      herramientas y servicios.
--      Hace falta aparte: `stock_actual` NO lo escribe un trigger sobre
--      `stock_movimientos` (CLAUDE.md §5.15), lo escribe el backend con un
--      UPDATE suelto en cada uno de esos caminos. Tapar el movimiento sin tapar
--      esto dejaba la ficha bajando igual.
--      CONGELA, no pone en cero: las 8 fichas de herramienta con stock positivo
--      (22 unidades) quedan como están. Lo que se limpia acá abajo son los 47
--      negativos, que es lo que el user pidió.
--      Escape: `set local cadinc.stock_herramienta = 'on'` — mismo mecanismo
--      que `cadinc.descongelar` de MCC. Sin eso no hay forma de volver a tocar
--      el número, ni siquiera desde una migración.
--
--   3. `resolver_item_despacho` — saltea el bloque de stock para herramientas.
--      La RPC lee `stock_actual` ANTES de escribir y levanta STOCK_INSUFICIENTE
--      si no alcanza. Con el stock congelado en 0 o en negativo, cada despacho
--      de herramienta moriría ahí. Hoy la RPC está apagada en prod
--      (USE_RPC_RESOLVER no está seteado → camino legacy), así que esto es para
--      que prenderla mañana no rompa nada.
--
-- LO QUE NO CAMBIA
-- Los movimientos históricos NO se borran: son lo que efectivamente se anotó y
-- sirven para reconstruir de dónde salió cada negativo. Lo que se limpia es el
-- saldo, que es el número que la pantalla muestra y que estaba mintiendo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Limpiar los 47 saldos negativos. VA PRIMERO: después del paso 3 el
--    trigger congela la columna y este UPDATE no haría nada.
update public.stock_materiales
   set stock_actual = 0,
       updated_at   = now()
 where clase = 'herramienta'
   and stock_actual < 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El movimiento de stock. Reemplaza a `fn_stock_sin_servicios`
--    (20260915j), que sólo cubría los servicios.
create or replace function public.fn_stock_solo_materiales()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_clase text;
begin
  select clase into v_clase
    from public.stock_materiales
   where id = new.material_id;

  -- Ni la herramienta ni el servicio llevan saldo de depósito:
  --   · la herramienta la cuenta el pañol (`herr_entregas`), que es el único
  --     que ve la vuelta;
  --   · el servicio se entrega cuando se compra, no hay nada que guardar.
  -- Devolver NULL cancela SÓLO esta fila; el flujo que la pidió sigue.
  if v_clase in ('herramienta', 'servicio') then
    return null;
  end if;

  return new;
end
$function$;

drop trigger if exists trg_stock_sin_servicios on public.stock_movimientos;
drop trigger if exists trg_stock_solo_materiales on public.stock_movimientos;
create trigger trg_stock_solo_materiales
  before insert on public.stock_movimientos
  for each row execute function fn_stock_solo_materiales();

drop function if exists public.fn_stock_sin_servicios();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. El saldo. `stock_actual` de una herramienta (o de un servicio) no se
--    mueve más, venga de donde venga el UPDATE.
create or replace function public.fn_stock_congelado_sin_deposito()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.clase in ('herramienta', 'servicio')
     and new.stock_actual is distinct from old.stock_actual
     and coalesce(current_setting('cadinc.stock_herramienta', true), '') <> 'on'
  then
    new.stock_actual := old.stock_actual;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_herramienta_stock_congelado on public.stock_materiales;
drop trigger if exists trg_stock_congelado_sin_deposito on public.stock_materiales;
create trigger trg_stock_congelado_sin_deposito
  before update on public.stock_materiales
  for each row execute function fn_stock_congelado_sin_deposito();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La RPC: para herramientas, ni valida saldo ni lo descuenta ni intenta
--    escribir el movimiento. Lo único que cambia respecto de la versión
--    anterior es el `select clase`, la variable `v_mueve_stock` y los dos `if`
--    que la miran. El resto es idéntico, a propósito: es una RPC que toca la
--    cuenta del cliente y no se toca más de lo necesario.
create or replace function public.resolver_item_despacho(
  p_item_id integer,
  p_precio_unit numeric,
  p_user_id uuid default null::uuid,
  p_forzar_sin_stock boolean default false
)
returns table(
  item_id integer, solicitud_id integer, obra_cod text, estado text,
  material_id integer, cantidad numeric, precio_unit numeric,
  fecha_resolucion date, registrado_cuenta_cliente boolean,
  material_cuenta_cliente_id integer, stock_movimiento_id integer,
  stock_actual_post numeric, stock_forzado boolean
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item           solicitud_compra_item%rowtype;
  v_obra_cod       text;
  v_es_deposito    boolean;
  v_clase          text;
  v_mueve_stock    boolean := false;
  v_stock_pre      numeric;
  v_stock_post     numeric := null;
  v_mov_id         integer := null;
  v_mcc_id         integer := null;
  v_registrado_mcc boolean := false;
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;
  if v_item.estado <> 'pendiente' then
    raise exception 'ITEM_NO_DISPONIBLE';
  end if;

  select s.obra_cod, o.es_deposito
    into v_obra_cod, v_es_deposito
    from solicitud_compra s
    join obras            o on o.cod = s.obra_cod
   where s.id = v_item.solicitud_id;

  -- El deposito no se despacha a si mismo: el despacho descuenta stock y el
  -- recibo nunca lo repone (solo acredita items 'comprado'). Pedido #436.
  if v_es_deposito then
    raise exception 'DESPACHO_A_DEPOSITO';
  end if;

  -- La herramienta no mueve stock (20260916c): el pañol es la única verdad.
  -- El servicio tampoco: ya está en la obra cuando se carga.
  if v_item.material_id is not null then
    select clase into v_clase from stock_materiales where id = v_item.material_id;
    v_mueve_stock := (coalesce(v_clase, 'material') not in ('herramienta', 'servicio'));
  end if;

  if v_mueve_stock then
    select stock_actual into v_stock_pre
      from stock_materiales
     where id = v_item.material_id
     for update;

    if v_stock_pre < v_item.cantidad and not p_forzar_sin_stock then
      raise exception 'STOCK_INSUFICIENTE'
        using detail = json_build_object(
          'material_id',         v_item.material_id,
          'stock_actual',        v_stock_pre,
          'cantidad_solicitada', v_item.cantidad
        )::text;
    end if;
  end if;

  update solicitud_compra_item
     set estado           = 'de_deposito',
         precio_unit      = p_precio_unit,
         fecha_resolucion = current_date,
         updated_by       = p_user_id
   where id = p_item_id;

  if v_mueve_stock then
    update stock_materiales
       set stock_actual = v_stock_pre - v_item.cantidad,
           updated_by   = p_user_id,
           updated_at   = now()
     where id = v_item.material_id;

    insert into stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod,
       solicitud_item_id, fecha, created_by, forzado_sin_stock)
    values
      (v_item.material_id, 'salida', v_item.cantidad, 'despacho_obra',
       v_obra_cod, p_item_id, current_date, p_user_id, p_forzar_sin_stock)
    returning id into v_mov_id;

    v_stock_post := v_stock_pre - v_item.cantidad;
  end if;

  if not v_es_deposito then
    begin
      insert into materiales_a_cuenta_cliente
        (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
         precio_unit, precio_total, origen, proveedor_id, factura_id,
         fecha_resolucion, created_by, updated_by)
      values
        (v_obra_cod, v_item.solicitud_id, p_item_id, desc_con_color(v_item.descripcion, v_item.color),
         v_item.cantidad, v_item.unidad, p_precio_unit,
         v_item.cantidad * p_precio_unit, 'deposito', null, null,
         current_date, p_user_id, p_user_id)
      returning id into v_mcc_id;
    exception
      when unique_violation then
        raise exception 'ITEM_YA_REGISTRADO';
    end;
    v_registrado_mcc := true;
  else
    v_registrado_mcc := false;
    v_mcc_id         := null;
  end if;

  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'despachado', 'pendiente', 'de_deposito', v_item.cantidad,
     jsonb_build_object('precio_unit', p_precio_unit, 'forzar_sin_stock', p_forzar_sin_stock),
     p_user_id);

  return query select
    p_item_id, v_item.solicitud_id, v_obra_cod, 'de_deposito'::text, v_item.material_id,
    v_item.cantidad, p_precio_unit, current_date, v_registrado_mcc, v_mcc_id,
    v_mov_id, v_stock_post, p_forzar_sin_stock;
end;
$function$;
