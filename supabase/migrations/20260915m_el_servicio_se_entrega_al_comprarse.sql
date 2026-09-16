-- Un servicio, al comprarse, ya está en obra
--
-- Lo levantó el user apenas vio el circuito funcionando, y tiene razón:
--
--   "está mal, si es un servicio cómo hago para mandarlo de depósito, sí o sí
--    lo tengo que comprar; es más, si lo cargo es porque directamente ya está en
--    obra, ya que el servicio lo pago una vez realizado"
--
-- EL PROBLEMA CONCRETO, verificado. `calcProgreso` marca un pedido como
-- "enviada" sólo cuando TODOS sus renglones están en estado 'enviado'. Un
-- servicio comprado se queda en 'comprado', así que el pedido se quedaba en "en
-- gestión" PARA SIEMPRE, esperando que alguien le hiciera un remito a un flete.
--
-- Y el modelo era falso en los dos extremos: un servicio no se despacha del
-- depósito (no hay nada que sacar) ni se envía a la obra (se ejecuta ahí). Lo
-- único real es la compra, y cuando se carga ya está hecho.
--
-- POR QUÉ SE ARREGLA CAMBIANDO EL ESTADO Y NO EL CÁLCULO. Se contaron los
-- lugares que dependen de estado='enviado': 20 en el frontend y 31 en el
-- backend. Meter un "salvo que sea servicio" en 51 lugares es la receta para
-- que uno quede afuera. Cambiando el estado, TODO lo de aguas abajo lo trata
-- como terminado sin ningún caso especial — y además es semánticamente cierto:
-- 'enviado' significa "está en la obra", y un servicio lo está desde que se
-- ejecutó.
--
-- POR QUÉ UN TRIGGER Y NO TOCAR LAS RPC. La compra tiene DOS caminos vivos
-- según el flag USE_RPC_RESOLVER (la RPC transaccional y el legacy del backend,
-- §5.2). Un trigger BEFORE cubre los dos y cualquiera que venga, sin reescribir
-- código que toca plata. Es el mismo criterio que la guarda de stock de
-- 20260915j.
--
-- Probado con la RPC REAL en arnés de rollback:
--   servicio  -> estado=enviado, fecha_envio=hoy, enviada=1 de 1,
--                cuenta de la obra a_cargo_de=cadinc $42.000 (CC-017 es llave en
--                mano), y el pedido cierra: todos enviados = true
--   CONTROL, un material normal -> queda en 'comprado', sin tocar

create or replace function public.fn_servicio_se_entrega_al_comprarse()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_clase text;
begin
  if new.estado is distinct from 'comprado' then return new; end if;
  select clase into v_clase from public.stock_materiales where id = new.material_id;
  if v_clase is distinct from 'servicio' then return new; end if;

  -- El servicio se ejecutó en la obra: comprarlo ES entregarlo.
  new.estado           := 'enviado';
  new.fecha_envio      := coalesce(new.fecha_envio, new.fecha_resolucion, current_date);
  new.cantidad_enviada := new.cantidad;
  return new;
end $function$;

comment on function public.fn_servicio_se_entrega_al_comprarse() is
  'Un servicio no se despacha ni se envia: se ejecuta en la obra y se paga despues. Al comprarlo pasa directo a enviado, para que el pedido cierre y nadie tenga que hacerle un remito a un flete. BEFORE, asi cubre los dos caminos de resolucion (RPC y legacy) sin tocarlos.';

drop trigger if exists trg_servicio_entregado on public.solicitud_compra_item;
create trigger trg_servicio_entregado
  before insert or update on public.solicitud_compra_item
  for each row execute function fn_servicio_se_entrega_al_comprarse();
