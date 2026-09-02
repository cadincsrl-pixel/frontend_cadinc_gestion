-- Arregla el desglose del tirante pino en 9 DE JULIO 882 (CC-013), item 2336.
--
-- Estaba cargado como 1 unid x 943.800. La misma obra compró el mismo tirante a
-- 6.292 el 2026-08-07 (4 días antes) y a 6.534 el 24 y el 27 de agosto.
--
-- 943.800 / 6.292 = 150 EXACTO. O sea: compraron 150 tirantes y cargaron el total
-- de la compra como si fuera el precio unitario, con cantidad 1.
--
-- OJO, esto NO es una sobrefacturación: la plata que se le factura al cliente
-- (943.800) está bien. Lo que está mal es el desglose, y eso rompe cualquier
-- informe de consumo de material de esa obra (dice 1 tirante donde hubo 150).
-- Por eso el total no se mueve: solo se reparte entre cantidad y precio unitario.
--
-- Detectado por el barrido de precios anómalos del 2026-09-02 (ratio 144x contra
-- la mediana del material). Sin cobro_id ni factura_id asociados.

do $guard$
declare v_precio numeric; v_cant numeric; v_total numeric;
begin
  select i.precio_unit, m.cantidad, m.precio_total
    into v_precio, v_cant, v_total
  from solicitud_compra_item i
  join materiales_a_cuenta_cliente m on m.item_id = i.id
  where i.id = 2336;

  if v_precio is distinct from 943800 or v_cant is distinct from 1 or v_total is distinct from 943800 then
    raise exception 'Abortado: item 2336 no esta en el estado esperado (precio=%, cant=%, total=%)',
      v_precio, v_cant, v_total;
  end if;
end
$guard$;

update solicitud_compra_item
   set cantidad = 150, precio_unit = 6292
 where id = 2336;

update materiales_a_cuenta_cliente
   set cantidad     = 150,
       precio_unit  = 6292,
       precio_total = 943800,   -- 150 * 6292, identico al anterior
       updated_at   = now()
 where item_id = 2336;
