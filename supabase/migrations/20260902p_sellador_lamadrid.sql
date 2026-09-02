-- Sellador poliuretano x 300ml en LAMADRID (CC-016), item 1908.
--
-- Era una de las 2 filas que quedaron sin tasar en `20260902o` por dispersion:
-- el historico del material 179 va de 4.503,30 a 24.800 (5,5x), asi que la mediana
-- (17.000) no era confiable. El dueño confirmo que el precio es 15.000.
--
-- NO se tocan las otras filas del mismo material que estan en 0 o null, porque son
-- de OTRAS obras y cada una es una decision de facturacion aparte. Quedan listadas
-- en el diario para aplicar si el dueño lo confirma:
--   id 1402 (CC FARM 25), 182 (CC BELLA VISTA), 2175 y 2154 (CC-019), 2649 (CC-018),
--   2930 (CC-024), 2557 (CC-016 sin fila de MCC), y del negro (mat 876):
--   1158 (CC CADINC 1), 328 (CC HERREROS).
--
-- Tampoco se tocan las compras historicas ya cargadas con precio: son lo que
-- realmente se pago en su momento, aunque hoy el precio sea otro.

do $guard$
declare v_precio numeric; v_cant numeric; v_cobro int;
begin
  select i.precio_unit, m.cantidad, m.cobro_id
    into v_precio, v_cant, v_cobro
  from solicitud_compra_item i
  join materiales_a_cuenta_cliente m on m.item_id = i.id
  where i.id = 1908;

  if coalesce(v_precio, -1) <> 0 or v_cant is distinct from 2 or v_cobro is not null then
    raise exception 'Abortado: item 1908 no esta en el estado esperado (precio=%, cant=%, cobro=%)',
      v_precio, v_cant, v_cobro;
  end if;
end
$guard$;

update solicitud_compra_item set precio_unit = 15000 where id = 1908;

update materiales_a_cuenta_cliente
   set precio_unit  = 15000,
       precio_total = round(cantidad * 15000, 2),
       updated_at   = now()
 where item_id = 1908;
