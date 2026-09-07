-- 20260908g — Los renglones PENDIENTES toman el nombre nuevo de su ficha
-- (user 2026-09-07: "no le mejoraste el nombre a chapa galvanizada lisa")
--
-- El nombre SI habia cambiado en el catalogo (20260908e). Lo que el user estaba
-- mirando era el pedido, y ahi cada renglon muestra su propia `descripcion`,
-- congelada cuando se cargo. El renglon 3457 -- 26 m para CC-025, del 07/09 --
-- seguia diciendo "Chapa galvanizada lisa C25".
--
-- LA REGLA que se venia aplicando mal: un renglon `enviado` es un documento
-- emitido y no se toca, pero uno `pendiente` todavia no se le mostro a nadie y
-- SI tiene que reflejar el nombre corregido. Con el acido muriatico (20260907w)
-- se hizo asi; con la chapa me lo saltee. Esto empareja.
--
-- Se revisaron las nueve fichas que se renombraron o fusionaron hoy (778, 920,
-- 1567, 697, 877, 808, 1546, 1547, 80) y este es el UNICO renglon pendiente que
-- habia quedado desalineado.
update public.solicitud_compra_item i
set descripcion = m.nombre
from public.stock_materiales m
where m.id = i.material_id
  and i.estado = 'pendiente'
  and i.material_id in (778, 920, 1567, 697, 877, 808, 1546, 1547, 80)
  and i.descripcion is distinct from m.nombre;
