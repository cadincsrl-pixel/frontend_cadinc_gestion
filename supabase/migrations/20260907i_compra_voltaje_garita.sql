-- 20260907i — Pedido 679 (Garita): la compra a VOLTAJE queda registrada (user 2026-09-07)
--
-- Presupuesto de VOLTAJE (proveedor 9) N° 0000-00213692 del 07/09/2026. Los
-- precios ya se cargaron en el catálogo con `20260907g`; acá se registra la
-- compra de los dos renglones que quedaban pendientes:
--
--   item 3398   Caño corrugado 3/4"                 25 m   × $270,65 = $6.766,25
--   item 3399   Conector p/ caño corrugado 3/4"     30 u   × $320,17 = $9.605,10
--                                                            total     $16.371,35
--
-- El total del presupuesto es $16.371,29: los 6 centavos de diferencia salen de
-- redondear el precio unitario a dos decimales (el neto real es 223,68 y 264,60).
--
-- Decisión del user: **comprado, NO enviado**. El envío a la obra con su remito
-- lo hace Nicolás desde la pantalla. Sin factura: ninguna de las 6 compras
-- anteriores de estos materiales a VOLTAJE tiene factura enganchada.
--
-- `pagado_por = 'cadinc'` (default de la RPC). Garita es llave en mano
-- (`obras.materiales_a_cargo_de = 'cadinc'`), así que la fila que la RPC inserta
-- en `materiales_a_cuenta_cliente` nace `a_cargo_de = 'cadinc'`: es costo de
-- CADINC imputado a la obra, no algo que se le factura al cliente.
--
-- Se usa la RPC `resolver_item_compra` (el mismo camino que la pantalla) para
-- que el estado, la fila de la cuenta y el evento queden consistentes.

do $$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro
  r record;
  v_out record;
begin
  for r in
    select * from (values (3398, 270.65::numeric), (3399, 320.17::numeric)) as t(item_id, precio)
  loop
    perform 1 from public.solicitud_compra_item
     where id = r.item_id and solicitud_id = 679 and estado = 'pendiente';
    if not found then
      raise notice 'item % ya no esta pendiente en el pedido 679, se saltea', r.item_id;
      continue;
    end if;

    select * into v_out from public.resolver_item_compra(
      p_item_id       => r.item_id,
      p_proveedor_id  => 9,          -- VOLTAJE
      p_precio_unit   => r.precio,
      p_factura_id    => null,
      p_user_id       => v_user,
      p_pagado_por    => 'cadinc'
    );
    raise notice 'item % -> % (cuenta: %)', v_out.item_id, v_out.estado, v_out.material_cuenta_cliente_id;
  end loop;
end $$;

update public.solicitud_compra
   set obs = obs || ' Comprado a VOLTAJE el 07/09 (presupuesto 0000-00213692): 25 m de corrugado 3/4 '
             'a $270,65 y 30 conectores a $320,17. Falta el envío a la obra, lo hace Nicolás.',
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where id = 679;
