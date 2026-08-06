-- RPC comprar_faltante_item (2026-08-06).
--
-- Caso Villaguay #440: un ítem se resolvió DE DEPÓSITO, se envió una parte, y
-- el faltante NO está en depósito — hay que comprarlo. El modelo line-item no
-- permite que un ítem sea mitad depósito / mitad compra, así que la salida es
-- PARTIR EL RENGLÓN, transaccionalmente:
--
--   1. El ítem original se cierra por lo efectivamente enviado
--      (cantidad = enviada, estado = 'enviado').
--   2. Si tiene material vinculado, el faltante VUELVE al stock (el despacho
--      lo había descontado entero) y la salida original se ajusta a lo que
--      realmente salió.
--   3. El MCC (facturable al cliente) se ajusta a lo entregado.
--   4. Nace un ítem NUEVO pendiente por el faltante, listo para Comprar.
--   5. Eventos de trazabilidad en ambos ítems.
--
-- Bloqueos: ITEM_COBRADO (MCC ya cobrado al cliente — primero liberar el
-- cobro), SIN_ENVIOS (sin envíos parciales: para eso está el ↩ deshacer de
-- siempre), ITEM_COMPLETO (no falta nada).
--
-- SECURITY DEFINER → solo service_role (política 20260527). El backend valida
-- permisos antes de llamar y pasa p_user_id explícito.

create or replace function public.comprar_faltante_item(
  p_item_id integer,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item      solicitud_compra_item%rowtype;
  v_efectiva  numeric;
  v_enviada   numeric;
  v_faltante  numeric;
  v_mcc_cobro integer;
  v_nuevo_id  integer;
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;
  if v_item.estado <> 'de_deposito' then
    raise exception 'ITEM_NO_DE_DEPOSITO';
  end if;

  v_efectiva := coalesce(v_item.cantidad_comprada, v_item.cantidad);
  v_enviada  := coalesce(v_item.cantidad_enviada, 0);
  v_faltante := v_efectiva - v_enviada;

  if v_enviada <= 0 then
    -- Sin envíos no hay nada que partir: el camino es ↩ deshacer y resolver
    -- de nuevo como compra.
    raise exception 'SIN_ENVIOS';
  end if;
  if v_faltante <= 0 then
    raise exception 'ITEM_COMPLETO';
  end if;

  -- MCC ya cobrado al cliente: ajustar la cantidad dejaría el cobro imputado
  -- a otra cosa. Primero liberar el cobro desde Cuenta del cliente.
  select cobro_id into v_mcc_cobro
    from materiales_a_cuenta_cliente
   where item_id = p_item_id and cobro_id is not null;
  if found then
    raise exception 'ITEM_COBRADO' using detail = v_mcc_cobro::text;
  end if;

  -- Stock: el despacho descontó la cantidad ENTERA; lo no enviado vuelve.
  -- La salida original se ajusta a lo que realmente salió del galpón.
  if v_item.material_id is not null then
    update stock_materiales
       set stock_actual = stock_actual + v_faltante,
           updated_by   = p_user_id,
           updated_at   = now()
     where id = v_item.material_id;

    update stock_movimientos
       set cantidad = greatest(cantidad - v_faltante, 0)
     where solicitud_item_id = p_item_id
       and tipo = 'salida'
       and motivo = 'despacho_obra';
  end if;

  -- Cierre del original por lo entregado.
  update solicitud_compra_item
     set cantidad          = v_enviada,
         cantidad_comprada = null,
         estado            = 'enviado',
         fecha_envio       = current_date,
         updated_by        = p_user_id
   where id = p_item_id;

  -- Facturable al cliente = lo entregado (si la obra es depósito no hay MCC
  -- y este update no matchea ninguna fila — no-op inocuo).
  update materiales_a_cuenta_cliente
     set cantidad     = v_enviada,
         precio_total = case when precio_unit is not null then v_enviada * precio_unit end,
         updated_by   = p_user_id
   where item_id = p_item_id and cobro_id is null;

  -- Renglón nuevo por el faltante, pendiente → se resuelve con Comprar.
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, material_id, estado, obs)
  values
    (v_item.solicitud_id, v_item.descripcion, v_faltante, v_item.unidad,
     v_item.material_id, 'pendiente',
     format('Faltante de depósito del renglón #%s — a comprar', p_item_id))
  returning id into v_nuevo_id;

  -- Trazabilidad en ambos ítems.
  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'enviado', 'de_deposito', 'enviado', v_enviada,
     format('Partido: %s enviadas de depósito, %s pasan a compra (ítem #%s)', v_enviada, v_faltante, v_nuevo_id),
     jsonb_build_object('split_nuevo_item_id', v_nuevo_id, 'faltante', v_faltante), p_user_id),
    (v_nuevo_id, v_item.solicitud_id, 'creado', null, 'pendiente', v_faltante,
     format('Creado por faltante de depósito del ítem #%s', p_item_id),
     jsonb_build_object('split_item_origen_id', p_item_id), p_user_id);

  return jsonb_build_object(
    'item_original_id', p_item_id,
    'enviada',          v_enviada,
    'nuevo_item_id',    v_nuevo_id,
    'faltante',         v_faltante
  );
end;
$$;

revoke execute on function public.comprar_faltante_item(integer, uuid) from public, anon, authenticated;
