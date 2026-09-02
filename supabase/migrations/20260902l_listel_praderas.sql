-- Corrige el precio placeholder del listel de terminación en PRADERAS, item 168.
--
-- Estaba en 25 unid x 25 = 625. El mismo material, en el MISMO pedido del
-- 2026-06-05 (item 169), está a 15.000. El dueño confirmó que 15.000 es el precio.
--
-- OJO: esta fila es `pagado_por = 'cliente'`. En Praderas el cliente le compra
-- directo al proveedor y CADINC solo lleva el registro: las filas 'cliente' quedan
-- FUERA del PDF de deuda (ver cuentaClientePdf.ts, filtro `pagado_por !== 'cliente'`)
-- y se muestran como "Pagó directo" en la cuenta corriente.
--
-- O sea: esto NO cobra un peso más. Lo que arregla es el registro de cuánto gastó
-- el cliente, que es lo que ve en su cuenta.
--
-- Queda pendiente el item 1442 ("listeles atrim varilla en L esmerilados", 25 unid
-- a precio 1). Es otra descripción (marca Atrim, terminación esmerilada) y puede ser
-- otro producto, así que no se toca sin confirmar.

do $guard$
declare v_precio numeric; v_cant numeric; v_pagado text;
begin
  select i.precio_unit, m.cantidad, m.pagado_por
    into v_precio, v_cant, v_pagado
  from solicitud_compra_item i
  join materiales_a_cuenta_cliente m on m.item_id = i.id
  where i.id = 168;

  if v_precio is distinct from 25 or v_cant is distinct from 25 or v_pagado is distinct from 'cliente' then
    raise exception 'Abortado: item 168 no esta en el estado esperado (precio=%, cant=%, pagado_por=%)',
      v_precio, v_cant, v_pagado;
  end if;
end
$guard$;

update solicitud_compra_item set precio_unit = 15000 where id = 168;

update materiales_a_cuenta_cliente
   set precio_unit  = 15000,
       precio_total = round(cantidad * 15000, 2),
       updated_at   = now()
 where item_id = 168;
