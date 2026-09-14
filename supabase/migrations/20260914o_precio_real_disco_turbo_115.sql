-- El user pasó el precio real del disco turbo de 4½ de Patroll: $3.600, final con IVA.
-- Estaba en $9.500, o sea 2,6 veces de más.
--
-- DE DÓNDE SALÍA EL NÚMERO VIEJO. El historial lo muestra: las tres fichas Patroll de 115
-- y 180 que nacieron el 08/09 (2647, 2648, 2649) tienen un único precio de fuente `sql`,
-- cargado el día que se crearon. Son ESTIMACIONES de aviso, no compras. Peor todavía, en
-- la 859 se ve la secuencia completa:
--     3850  (backfill, 08/09)  <- el precio real de una compra
--     13925 (sql,      08/09)  <- la estimación, que lo pisó el mismo día
--
-- O sea que la tanda de altas del 08/09 pisó un precio real con uno estimado.
--
-- Y ESTO EXPLICA EL RANGO QUE NO CERRABA. Los renglones genéricos de "Disco diamantado
-- 115mm" se pagaron entre $3.207 y $4.200, que no se parecía ni a los $24.000 del Aliafor
-- verde ni a los $9.500 de esta ficha. Con el precio real de $3.600 encajan: esos renglones
-- eran este disco. NO se los mueve acá — están enviados y con su plata ya en la cuenta del
-- cliente — pero queda escrito que la evidencia ahora apunta a que están mal vinculados.
--
-- Las otras tres siguen con precio estimado y probablemente inflado: 859 continuo $13.925,
-- 2647 segmentado 115 $7.500, 2649 segmentado 180 $15.000. Falta el número real.
-- La 861 (turbo 180, $9.418) SÍ es confiable: viene de backfill de compra y coincide con
-- los $9.552 del aviso del fabricante.

select public.fijar_precio_ref(2648, 3600.00, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

do $$
declare v numeric;
begin
  select precio_ref into v from public.stock_materiales where id = 2648;
  if v <> 3600 then raise exception 'El turbo 115 quedó en % y tenía que quedar en 3600', v; end if;
end $$;
