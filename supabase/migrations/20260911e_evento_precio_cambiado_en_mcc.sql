-- 20260911e — Rastro de cada cambio de precio en la cuenta del cliente.
--
-- AFTER UPDATE OF precio_unit, precio_total en materiales_a_cuenta_cliente ->
-- una fila en solicitud_item_eventos (accion 'precio_cambiado') con antes,
-- despues, fuente y quien. Cubre el PATCH del backend, las RPC, un lote futuro y
-- un UPDATE a mano desde el SQL Editor con UN solo mecanismo: es la condicion
-- para que el 26/06 no pueda repetirse en silencio en esta tabla.
--
-- La fuente viaja por config local 'cadinc.mcc_fuente' (default 'sql', que es
-- la verdad cuando nadie la seteo) y el lote, si hay, por 'cadinc.mcc_lote'.
-- El freeze de cobrado (MCC_COBRADO como trigger) NO va aca: se agrega despues
-- de auditar los cinco escritores de MCC (retirar_de_proveedor hace UPSERT).

create or replace function public.fn_mcc_precio_cambiado()
returns trigger language plpgsql as $$
declare
  v_fuente text := coalesce(nullif(current_setting('cadinc.mcc_fuente', true), ''), 'sql');
  v_lote   text := nullif(current_setting('cadinc.mcc_lote', true), '');
  v_user   uuid := coalesce(nullif(current_setting('cadinc.precio_user', true), '')::uuid,
                            new.updated_by, public.usuario_actual());
  v_estado text;
begin
  if new.precio_unit  is not distinct from old.precio_unit
     and new.precio_total is not distinct from old.precio_total then
    return new;
  end if;
  -- estado_anterior/estado_nuevo son NOT NULL en eventos: un cambio de precio no
  -- mueve el estado del renglon, asi que van los dos con el estado actual.
  select i.estado into v_estado from public.solicitud_compra_item i where i.id = new.item_id;
  v_estado := coalesce(v_estado, 'enviado');
  insert into public.solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, meta, user_id)
  values
    (new.item_id, new.solicitud_id, 'precio_cambiado', v_estado, v_estado, new.cantidad,
     jsonb_strip_nulls(jsonb_build_object(
       'mcc_id',          new.id,
       'precio_anterior', old.precio_unit,  'precio_nuevo', new.precio_unit,
       'total_anterior',  old.precio_total, 'total_nuevo',  new.precio_total,
       'fuente',          v_fuente,
       'lote_id',         v_lote)),
     v_user);
  return new;
end $$;

drop trigger if exists trg_mcc_precio_cambiado on public.materiales_a_cuenta_cliente;
create trigger trg_mcc_precio_cambiado
  after update of precio_unit, precio_total on public.materiales_a_cuenta_cliente
  for each row execute function public.fn_mcc_precio_cambiado();
