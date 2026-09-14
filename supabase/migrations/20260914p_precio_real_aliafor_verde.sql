-- Precio real del Aliafor verde (ficha 441) que pasó el user el 14/09: $26.000, final con
-- IVA. Estaba en $24.000, o sea que este número no estaba mal, sólo desactualizado.
--
-- Con esto quedan fijados los dos extremos de la familia de 4½:
--     Aliafor verde  (441)  $26.000   turbo fino, para porcelanato
--     Patroll turbo  (2648) $3.600    el de uso diario
-- Son SIETE VECES de diferencia, la brecha más grande del rubro, y los dos se piden
-- escribiendo "disco diamantado 115". De ahí que valga tanto distinguirlos bien.
--
-- Nota sobre los renglones históricos mal vinculados: la plata que se le cobró a cada obra
-- NO está mal. `materiales_a_cuenta_cliente` guarda el `precio_unit` que se pagó de verdad
-- ($3.207 a $4.200), no el precio de referencia de la ficha. Lo que está mal es la
-- ATRIBUCIÓN: figuran como Aliafor verde compras que eran Patroll turbo. Eso ensucia el
-- historial de precios y las sugerencias de compra futuras, no las cuentas ya cerradas.

select public.fijar_precio_ref(441, 26000.00, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

do $$
declare v numeric;
begin
  select precio_ref into v from public.stock_materiales where id = 441;
  if v <> 26000 then raise exception 'El Aliafor verde quedó en % y tenía que quedar en 26000', v; end if;
end $$;
