-- Correccion de sobrefacturacion: alambre de atar N°18 en GARITA (CC-025), item 3015.
--
-- Estaba cargado como 10 kg x 45.000/kg = 450.000 facturados al cliente.
-- Las referencias de otras obras dan 6.295,18/kg (CC-016) y 3.740/kg (CC-013, compra de 50 kg).
-- El dueño confirmo que los 45.000 eran el TOTAL de los 10 kg, no el precio por kilo.
-- O sea 4.500/kg, que cae justo entre las dos referencias.
--
-- Detectado por el barrido de precios anomalos del 2026-09-02 (mediana por material x unidad,
-- marcando lo que se despega 7x o mas). Sin cobro_id ni factura_id asociados.

do $guard$
declare v_precio numeric; v_cant numeric; v_total numeric;
begin
  select i.precio_unit, m.cantidad, m.precio_total
    into v_precio, v_cant, v_total
  from solicitud_compra_item i
  join materiales_a_cuenta_cliente m on m.item_id = i.id
  where i.id = 3015;

  if v_precio is distinct from 45000 or v_cant is distinct from 10 or v_total is distinct from 450000 then
    raise exception 'Abortado: item 3015 no esta en el estado esperado (precio=%, cant=%, total=%)',
      v_precio, v_cant, v_total;
  end if;
end
$guard$;

update solicitud_compra_item set precio_unit = 4500 where id = 3015;

update materiales_a_cuenta_cliente
   set precio_unit  = 4500,
       precio_total = round(cantidad * 4500, 2),
       updated_at   = now()
 where item_id = 3015;
