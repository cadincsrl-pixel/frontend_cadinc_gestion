-- 20260911f — Corrige 20260911e: solicitud_item_eventos.estado_anterior y
-- estado_nuevo son NOT NULL y el trigger no los llenaba, asi que TODO update de
-- precio en la cuenta del cliente fallaba con 23502. Lo atrapo la prueba con
-- rollback de la propia fase 0, antes de que lo tocara nadie. Un cambio de
-- precio no mueve el estado del renglon: van los dos con el estado actual.

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
