-- Devolver TODO lo que nunca salió es cancelar, no devolver.
--
-- Caso real del 11/09, primer uso de la feature: Nicolás devolvió renglones del
-- pedido 720 (GARITA) que estaban despachados pero **nunca habían salido por
-- remito** (`cantidad_enviada = 0`). Quedaron con `cantidad = 0` y en estado
-- `de_deposito`, o sea renglones fantasma: sin nada en la cuenta del cliente
-- (bien) pero visibles en el pedido diciendo "0".
--
-- El user: *"no salió en remito ni llegó a obra… ¿no sería mejor que se borre,
-- ya que el remito todavía no se imprimió?"*.
--
-- BORRAR NO. Esos renglones tienen movimientos de stock colgados (la salida del
-- despacho y la entrada de la devolución): borrar el renglón los dejaría
-- huérfanos y el historial del depósito dejaría de explicarse solo.
--
-- Lo que sí corresponde es que el renglón quede RECHAZADO, que es el estado que
-- ya existe para "esto no se le va a dar a la obra": la pantalla lo sabe
-- mostrar, ofrece "Reactivar" por si se arrepienten, y `calcProgreso` lo
-- excluye para que no trabe el progreso del pedido.
--
-- Y SIN PONER LA CANTIDAD EN CERO. Acá está la mejora sobre lo que pedía el
-- user: un renglón rechazado que dice "0 bolsas" no cuenta nada, mientras que
-- uno que dice "15 bolsas, rechazado" cuenta la historia entera — se pidieron
-- 15, se despacharon, volvieron, no se entregaron. El cero era ruido, no dato.
--
-- La condición es estricta: total Y nunca enviado. Si algo salió por remito, el
-- material fue y volvió de verdad, el remito existe y el renglón conserva su
-- historia con lo que reste.

create or replace function public.devolver_material(
  p_item_id  integer,
  p_cantidad numeric,
  p_motivo   text default null,
  p_user_id  uuid  default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item      record;
  v_mcc       record;
  v_tiene_mcc boolean := false;
  v_congelada boolean := false;
  v_clase     text;
  v_resto     numeric;
  v_monto     numeric;
  v_nota_id   integer;
  v_cancela   boolean := false;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;

  select i.*, s.obra_cod as obra
    into v_item
    from public.solicitud_compra_item i
    join public.solicitud_compra s on s.id = i.solicitud_id
   where i.id = p_item_id
     for update of i;
  if not found then
    raise exception 'ITEM_NO_EXISTE' using errcode = 'P0001';
  end if;

  if v_item.estado not in ('comprado', 'de_deposito', 'enviado', 'retirado') then
    raise exception 'ITEM_NO_RESUELTO' using errcode = 'P0001', detail = v_item.estado;
  end if;

  select clase into v_clase from public.stock_materiales where id = v_item.material_id;
  if coalesce(v_clase, '') = 'herramienta' then
    raise exception 'ES_HERRAMIENTA' using errcode = 'P0001';
  end if;

  if p_cantidad > v_item.cantidad then
    raise exception 'CANTIDAD_MAYOR_A_LA_DESPACHADA' using errcode = 'P0001',
      detail = format('se quiere devolver %s de %s', p_cantidad, v_item.cantidad);
  end if;
  v_resto := v_item.cantidad - p_cantidad;

  -- Vuelve TODO y nunca salió por remito: esto es una cancelación.
  v_cancela := (v_resto = 0 and coalesce(v_item.cantidad_enviada, 0) = 0);

  select * into v_mcc
    from public.materiales_a_cuenta_cliente
   where item_id = p_item_id
     for update;
  if found then
    v_tiene_mcc := true;
    v_congelada := (v_mcc.cobro_id is not null or v_mcc.certificado_id is not null);
  end if;

  if v_item.material_id is not null then
    insert into public.stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod, solicitud_item_id, obs, fecha, created_by, estado)
    values
      (v_item.material_id, 'entrada', p_cantidad, 'devolucion', v_item.obra, p_item_id,
       coalesce(nullif(btrim(p_motivo), ''),
                case when v_cancela then 'Cancelado antes de salir del depósito'
                     else 'Devolución de obra al depósito' end),
       current_date, p_user_id, 'aprobado');

    update public.stock_materiales
       set stock_actual = stock_actual + p_cantidad,
           updated_by   = coalesce(p_user_id, updated_by),
           updated_at   = now()
     where id = v_item.material_id;
  end if;

  if v_tiene_mcc and v_congelada then
    v_monto := round(p_cantidad * v_mcc.precio_unit, 2);
    insert into public.cuenta_cliente_notas_credito
      (obra_cod, item_id, fecha, cantidad, unidad, descripcion, precio_unit, monto, motivo, created_by, updated_by)
    values
      (v_item.obra, p_item_id, current_date, p_cantidad, coalesce(v_mcc.unidad, v_item.unidad),
       v_mcc.descripcion, v_mcc.precio_unit, v_monto,
       coalesce(nullif(btrim(p_motivo), ''), 'Material devuelto al depósito'),
       p_user_id, p_user_id)
    returning id into v_nota_id;

  elsif v_tiene_mcc then
    if v_resto = 0 then
      delete from public.materiales_a_cuenta_cliente where id = v_mcc.id;
    else
      update public.materiales_a_cuenta_cliente
         set cantidad     = v_resto,
             precio_total = round(v_resto * precio_unit, 2),
             updated_by   = p_user_id,
             updated_at   = now()
       where id = v_mcc.id;
    end if;
  end if;

  if v_cancela then
    -- Cancelación: el renglón se rechaza y CONSERVA su cantidad. "15 bolsas,
    -- rechazado" cuenta lo que pasó; "0 bolsas" no dice nada.
    update public.solicitud_compra_item
       set estado     = 'rechazado',
           updated_by = coalesce(p_user_id, updated_by)
     where id = p_item_id;
  elsif not v_congelada then
    update public.solicitud_compra_item
       set cantidad         = v_resto,
           cantidad_enviada = least(cantidad_enviada, v_resto),
           updated_by       = coalesce(p_user_id, updated_by)
     where id = p_item_id;
  end if;

  insert into public.solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, case when v_cancela then 'cancelado' else 'devuelto' end,
     v_item.estado, case when v_cancela then 'rechazado' else v_item.estado end, p_cantidad,
     nullif(btrim(p_motivo), ''),
     jsonb_build_object(
       'obra_cod',        v_item.obra,
       'congelada',       v_congelada,
       'cancelado',       v_cancela,
       'nota_credito_id', v_nota_id,
       'cantidad_antes',  v_item.cantidad,
       'cantidad_despues', case when v_cancela or v_congelada then v_item.cantidad else v_resto end),
     p_user_id);

  return jsonb_build_object(
    'item_id',         p_item_id,
    'devuelto',        p_cantidad,
    'cancelado',       v_cancela,
    'saldo_a_favor',   v_congelada,
    'nota_credito_id', v_nota_id,
    'monto_credito',   v_monto,
    'cantidad_restante', case when v_cancela or v_congelada then v_item.cantidad else v_resto end);
end $function$;

-- ── Los dos renglones que ya quedaron en cero el 11/09 ──────────────────
-- Ya están en `rechazado` (alguien los rechazó a mano después de devolver),
-- pero con la cantidad en 0. Se les devuelve la cantidad original, que sale de
-- `cantidad_antes` del primer evento de devolución de cada uno.
update solicitud_compra_item i
   set cantidad = (
     select (e.meta->>'cantidad_antes')::numeric
       from solicitud_item_eventos e
      where e.item_id = i.id and e.accion = 'devuelto'
      order by e.created_at
      limit 1)
 where i.id in (3633, 3665)
   and i.cantidad = 0
   and i.estado = 'rechazado';
