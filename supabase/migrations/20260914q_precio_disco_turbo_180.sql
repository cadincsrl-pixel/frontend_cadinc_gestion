-- Turbo de 7" (ficha 861) a $9.552, del aviso del fabricante que mandó el user: "Disco de
-- Corte Diamantado Patroll PYT-7 180mm", $9.552 final ($7.894 sin impuestos nacionales).
--
-- Venía de $9.418, que salió de un backfill de compra real. La diferencia es del 1,4 %, o
-- sea que este número nunca estuvo mal: sólo se pone al día.
--
-- OJO CON LA FUENTE: $9.552 es precio de AVISO minorista, no lo que paga CADINC. Las
-- compras reales de esta ficha fueron de $5.400 a $18.700. Se toma igual porque el user lo
-- mandó como referencia y porque cae justo donde estaba el valor de compra, pero si más
-- adelante aparece una factura, ésa manda.
--
-- Con esto la familia queda así, y se ve que el precio sigue al DIÁMETRO y a la LÍNEA:
--     Aliafor verde  4½"   $26.000   (441)  línea verde, turbo fino porcelanato
--     Patroll turbo  7"    $9.552    (861)  línea amarilla
--     Patroll turbo  4½"   $3.600    (2648) línea amarilla
-- Siguen con precio estimado del 08/09, sin confirmar: continuo 4½ $13.925,
-- segmentado 4½ $7.500 y segmentado 7" $15.000.

select public.fijar_precio_ref(861, 9552.00, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

do $$
declare v numeric;
begin
  select precio_ref into v from public.stock_materiales where id = 861;
  if v <> 9552 then raise exception 'El turbo 180 quedó en % y tenía que quedar en 9552', v; end if;
end $$;
