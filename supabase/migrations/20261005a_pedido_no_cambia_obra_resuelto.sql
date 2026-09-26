-- =====================================================================
-- 20261005a — Un pedido con renglones resueltos no cambia de obra
-- (2026-09-26, revisión del circuito Pedidos y Stock, hallazgo A4)
--
-- Editar el pedido deja cambiar la obra de la cabecera, pero la cuenta del
-- cliente, los movimientos de stock, los remitos y el pañol quedan en la
-- obra vieja: la plata se parte en dos obras. Pasó dos veces y se arregló
-- por SQL (20260917b pedido 840, 20260917f pedido 838).
--
-- Regla: si algún renglón ya no está `pendiente` ni `rechazado`, la obra no
-- se cambia (OBRA_CON_RENGLONES_RESUELTOS). Para moverlo, revertir esos
-- renglones primero o levantar el pedido de nuevo en la obra correcta.
-- Vive en la base para que valga también por SQL; el backend traduce y la
-- pantalla deshabilita el selector.
-- =====================================================================

create or replace function public.fn_solicitud_no_cambia_obra()
 returns trigger
 language plpgsql
as $$
declare
  v_n int;
begin
  select count(*) into v_n
    from public.solicitud_compra_item
   where solicitud_id = new.id
     and estado not in ('pendiente', 'rechazado');
  if v_n > 0 then
    raise exception 'OBRA_CON_RENGLONES_RESUELTOS' using errcode = 'P0001',
      detail = json_build_object('solicitud_id', new.id, 'renglones', v_n)::text;
  end if;
  return new;
end $$;

drop trigger if exists trg_solicitud_no_cambia_obra on public.solicitud_compra;
create trigger trg_solicitud_no_cambia_obra
  before update of obra_cod on public.solicitud_compra
  for each row
  when (old.obra_cod is distinct from new.obra_cod)
  execute function public.fn_solicitud_no_cambia_obra();
