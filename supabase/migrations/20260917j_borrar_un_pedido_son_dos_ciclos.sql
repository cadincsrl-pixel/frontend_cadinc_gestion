-- =====================================================================
-- Borrar un pedido son dos ciclos distintos (2026-09-17)
--
-- Lo que pasó: el user borró el pedido 548 (CASA OPERARIOS) y la RPC
-- devolvió al depósito +10 Prensacable PG, +6 Guante descarne corto y
-- +6 Guante de tela. Dos de esos tres nunca habían salido del depósito.
--
-- La RPC vieja devolvía stock por ESTADO del renglón: 'de_deposito' y
-- 'enviado'. Eso mezcla dos cosas que físicamente son opuestas:
--
--   · 'enviado'   → la mercadería está EN LA OBRA. Devolverla al depósito
--                   inventa stock. Para eso existe Devoluciones (§5.16),
--                   no borrar el pedido.
--   · 'comprado'  → la mercadería está en CADINC, comprada y sin enviar.
--                   La RPC vieja NO la devolvía: al borrar desaparecía del
--                   sistema junto con su costo. 11 renglones en 7 pedidos,
--                   $7,5M de compras, estaban expuestos a eso.
--
-- Decisión del user: "si devolvemos la compra no suma stock, y si
-- cancelamos pedido de cosas ya compradas deberían quedar en stock de
-- depósito". Al borrar un pedido con compras sin enviar hay que ELEGIR
-- (p_compras):
--
--   'a_deposito'          la compra queda en CADINC → entrada de stock
--                         motivo 'compra', con proveedor, precio y factura
--                         en la obs. El renglón se borra en cascada: esa
--                         obs es lo único que queda de la compra.
--   'devuelta_proveedor'  la compra vuelve al proveedor → no toca stock.
--   null                  con compras sin enviar → ELEGIR_DESTINO_COMPRAS,
--                         para que la pantalla pregunte.
--
-- Lo que no se elige, se aplica solo:
--   · 'de_deposito' vuelve al estante (motivo 'devolucion'), pero solo la
--     parte que no viajó: cantidad − cantidad_enviada. Antes devolvía la
--     cantidad pedida completa.
--   · 'enviado' bloquea con SOLICITUD_TIENE_ENVIOS, igual que ya bloqueaba
--     un remito. Hoy son 11 pedidos con renglones enviados sin remito
--     (camino legacy): para esos, primero "revertir envío" o Devoluciones.
--   · 'retirado' bloquea con SOLICITUD_TIENE_RETIROS (la FK RESTRICT ya lo
--     impedía, pero con un 23503 ilegible).
--   · herramientas y servicios no mueven stock (misma regla que
--     resolver_item_despacho desde 20260916c).
--   · una compra sin ficha no puede entrar al depósito: COMPRA_SIN_FICHA
--     con la lista, para vincularla antes o elegir devolverla.
--   · 'en_proveedor' (0 renglones hoy) no toca stock: está en el galpón
--     del proveedor, ni en CADINC ni en la obra.
--
-- La firma cambia (tercer parámetro), así que se DROPea la vieja: con las
-- dos vivas, PostgREST no sabría cuál llamar con los mismos nombres.
-- =====================================================================

drop function if exists public.eliminar_solicitud(integer, uuid);

create or replace function public.eliminar_solicitud(
  p_solicitud_id integer,
  p_user_id      uuid default null,
  p_compras      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item                record;
  v_obra_cod            text;
  v_deposito_cod        text;
  v_clase               text;
  v_cant                numeric;
  v_obs                 text;
  v_sin_ficha           text[] := '{}';
  v_compras_sin_enviar  integer := 0;
  v_vueltos_al_estante  integer := 0;
  v_compras_a_deposito  integer := 0;
  v_omitidos            integer := 0;
begin
  if p_compras is not null and p_compras not in ('a_deposito', 'devuelta_proveedor') then
    raise exception 'DESTINO_INVALIDO';
  end if;

  select obra_cod into v_obra_cod
    from solicitud_compra where id = p_solicitud_id for update;
  if not found then
    raise exception 'SOLICITUD_NO_EXISTE';
  end if;

  -- (1) Lo que ya viajó no se borra: está en la obra. Para eso existe
  --     Devoluciones (§5.16) o "revertir envío" en el renglón.
  perform 1 from remitos_envio where solicitud_id = p_solicitud_id limit 1;
  if found then
    raise exception 'SOLICITUD_TIENE_REMITOS';
  end if;
  perform 1 from solicitud_compra_item
    where solicitud_id = p_solicitud_id and estado = 'enviado' limit 1;
  if found then
    raise exception 'SOLICITUD_TIENE_ENVIOS';
  end if;
  perform 1 from solicitud_compra_item
    where solicitud_id = p_solicitud_id and estado = 'retirado' limit 1;
  if found then
    raise exception 'SOLICITUD_TIENE_RETIROS';
  end if;

  -- (2) Compras sin enviar: hay que decir a dónde van.
  select count(*),
         coalesce(array_agg(descripcion order by id) filter (where material_id is null), '{}')
    into v_compras_sin_enviar, v_sin_ficha
    from solicitud_compra_item
   where solicitud_id = p_solicitud_id
     and estado = 'comprado'
     and coalesce(cantidad_comprada, cantidad) - coalesce(cantidad_enviada, 0) > 0;

  if v_compras_sin_enviar > 0 and p_compras is null then
    raise exception 'ELEGIR_DESTINO_COMPRAS'
      using detail = json_build_object('compras_sin_enviar', v_compras_sin_enviar)::text;
  end if;
  if p_compras = 'a_deposito' and cardinality(v_sin_ficha) > 0 then
    raise exception 'COMPRA_SIN_FICHA'
      using detail = json_build_object('renglones', to_json(v_sin_ficha))::text;
  end if;

  select cod into v_deposito_cod from obras where es_deposito order by cod limit 1;

  -- (3) Renglón por renglón. Solo los que tienen ficha; herramientas y
  --     servicios no mueven stock (misma regla que resolver_item_despacho).
  for v_item in
    select i.id, i.estado, i.material_id, i.precio_unit,
           coalesce(i.cantidad_comprada, i.cantidad) - coalesce(i.cantidad_enviada, 0) as comprado_sin_enviar,
           i.cantidad - coalesce(i.cantidad_enviada, 0)                                  as en_estante,
           p.nombre as proveedor, f.numero as factura
      from solicitud_compra_item i
      left join proveedores      p on p.id = i.proveedor_id
      left join facturas_compra  f on f.id = i.factura_id
     where i.solicitud_id = p_solicitud_id
       and i.material_id is not null
       and i.estado in ('de_deposito', 'comprado')
     order by i.id
       for update of i
  loop
    select clase into v_clase from stock_materiales where id = v_item.material_id for update;
    if not found then
      continue;
    end if;
    if coalesce(v_clase, 'material') in ('herramienta', 'servicio') then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    if v_item.estado = 'de_deposito' then
      -- Salió del estante y no viajó: vuelve al estante. Solo la parte que
      -- no se envió (antes devolvía la cantidad pedida completa).
      v_cant := v_item.en_estante;
      if v_cant <= 0 then
        continue;
      end if;
      v_obs := 'Vuelve al estante: pedido #' || p_solicitud_id || ' (' || v_obra_cod
            || ') eliminado, despacho de depósito sin enviar';
      update stock_materiales
         set stock_actual = stock_actual + v_cant, updated_by = p_user_id, updated_at = now()
       where id = v_item.material_id;
      insert into stock_movimientos
        (material_id, tipo, cantidad, motivo, obra_cod, obs, fecha, created_by, forzado_sin_stock)
      values
        (v_item.material_id, 'entrada', v_cant, 'devolucion', v_deposito_cod, v_obs,
         current_date, p_user_id, false);
      v_vueltos_al_estante := v_vueltos_al_estante + 1;

    elsif v_item.estado = 'comprado' and p_compras = 'a_deposito' then
      -- Se compró para la obra, no viajó, y el pedido se cancela: la compra
      -- queda en CADINC. Es una entrada por compra al depósito. El renglón
      -- se borra en cascada, así que proveedor, precio y factura van acá:
      -- es lo único que queda de esa compra.
      v_cant := v_item.comprado_sin_enviar;
      if v_cant <= 0 then
        continue;
      end if;
      v_obs := 'Compra del pedido #' || p_solicitud_id || ' (' || v_obra_cod
            || ') cancelado, queda en depósito'
            || coalesce(' · ' || v_item.proveedor, '')
            || coalesce(' · $' || trim(to_char(v_item.precio_unit, 'FM999999999990.00')) || ' c/u', '')
            || coalesce(' · factura ' || nullif(v_item.factura, ''), '');
      update stock_materiales
         set stock_actual = stock_actual + v_cant, updated_by = p_user_id, updated_at = now()
       where id = v_item.material_id;
      insert into stock_movimientos
        (material_id, tipo, cantidad, motivo, obra_cod, obs, fecha, created_by, forzado_sin_stock)
      values
        (v_item.material_id, 'entrada', v_cant, 'compra', v_deposito_cod, v_obs,
         current_date, p_user_id, false);
      v_compras_a_deposito := v_compras_a_deposito + 1;
    end if;
    -- 'comprado' con p_compras = 'devuelta_proveedor': no toca stock. El
    -- CASCADE borra el renglón y su fila en la cuenta de la obra.
  end loop;

  delete from solicitud_compra where id = p_solicitud_id;

  return jsonb_build_object(
    'success',             true,
    'solicitud_id',        p_solicitud_id,
    'compras',             p_compras,
    'vueltos_al_estante',  v_vueltos_al_estante,
    'compras_a_deposito',  v_compras_a_deposito,
    'compras_devueltas',   case when p_compras = 'devuelta_proveedor' then v_compras_sin_enviar else 0 end,
    'omitidos_sin_stock',  v_omitidos,
    'items_revertidos',    v_vueltos_al_estante + v_compras_a_deposito
  );
end;
$$;

revoke all on function public.eliminar_solicitud(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.eliminar_solicitud(integer, uuid, text) to service_role;
