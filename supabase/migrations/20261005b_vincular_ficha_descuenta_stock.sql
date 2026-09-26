-- =====================================================================
-- 20261005b — Ponerle ficha a un renglón ya despachado descuenta el stock
-- (2026-09-26, revisión del circuito Pedidos y Stock, hallazgo B5)
--
-- El despacho de depósito descuenta stock solo si el renglón YA tiene ficha
-- (legacy `despacharItemLegacy`: `if (data.material_id)`). Un renglón de
-- texto libre que se despacha y DESPUÉS se vincula a una ficha (las tandas de
-- limpieza del catálogo, p. ej. 20260916b sobre el 4072 y la del 23/09 sobre
-- el 4305 y el 4342) queda sin movimiento: la ficha nunca baja. En
-- septiembre fueron 53 casos.
--
-- Regla: cuando un renglón pasa de SIN ficha a CON ficha, si salió del
-- depósito y todavía no tiene ningún movimiento de stock, se registra la
-- salida que faltó (motivo despacho_obra, misma cantidad que habría
-- descontado el despacho) y se actualiza el cache `stock_actual` con
-- `sumar_stock`. No aplica a herramientas ni servicios (no mueven stock,
-- 20260916c) ni a compras (no salen del depósito).
--
-- Cantidad: la que figura en la cuenta del cliente con origen depósito
-- (descuenta devoluciones); en obras depósito, que no tienen cuenta, la del
-- renglón. Si no queda nada (se devolvió todo), no se mueve nada.
--
-- NO hay backfill: los casos viejos pueden tener recuentos físicos en el
-- medio (CLAUDE.md §5.15) y descontarlos ahora falsearía el stock contado.
-- =====================================================================

create or replace function public.fn_item_vinculado_descuenta_stock()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $$
declare
  v_clase_ficha text;
  v_obra        text;
  v_es_deposito boolean;
  v_mcc_cant    numeric;
  v_mcc_origen  text;
  v_cant        numeric;
begin
  if new.estado not in ('de_deposito', 'enviado') then
    return null;
  end if;
  if coalesce(new.clase, 'material') in ('herramienta', 'servicio') then
    return null;
  end if;
  select clase into v_clase_ficha from stock_materiales where id = new.material_id;
  if coalesce(v_clase_ficha, 'material') in ('herramienta', 'servicio') then
    return null;
  end if;
  if exists (select 1 from stock_movimientos where solicitud_item_id = new.id) then
    return null;
  end if;

  select s.obra_cod, coalesce(o.es_deposito, false)
    into v_obra, v_es_deposito
    from solicitud_compra s left join obras o on o.cod = s.obra_cod
   where s.id = new.solicitud_id;

  select cantidad, origen into v_mcc_cant, v_mcc_origen
    from materiales_a_cuenta_cliente where item_id = new.id;

  if v_mcc_origen = 'deposito' then
    v_cant := v_mcc_cant;
  elsif v_mcc_origen is null and v_es_deposito
        and exists (select 1 from solicitud_item_eventos where item_id = new.id and accion = 'despachado') then
    v_cant := new.cantidad;
  else
    return null;  -- compra, o no salió del depósito
  end if;

  if coalesce(v_cant, 0) <= 0 then
    return null;
  end if;

  insert into stock_movimientos
    (material_id, tipo, cantidad, motivo, obra_cod, solicitud_item_id, fecha, obs, created_by)
  values
    (new.material_id, 'salida', v_cant, 'despacho_obra', v_obra, new.id,
     coalesce(new.fecha_resolucion, current_date),
     'Salida del despacho registrada al vincular la ficha (20261005b)',
     coalesce(new.updated_by, usuario_actual()));
  perform sumar_stock(new.material_id, -v_cant, coalesce(new.updated_by, usuario_actual()));
  return null;
end $$;

drop trigger if exists trg_item_vinculado_descuenta_stock on public.solicitud_compra_item;
create trigger trg_item_vinculado_descuenta_stock
  after update of material_id on public.solicitud_compra_item
  for each row
  when (old.material_id is null and new.material_id is not null)
  execute function public.fn_item_vinculado_descuenta_stock();
