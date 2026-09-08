-- LAMADRID 566: la bolsa de arena baja a $1.500
--
-- Ayer el user la había fijado en $2.500 (20260909u); hoy, viendo las 165
-- bolsas juntas, la bajó a $1.500 — el precio que también usaba la planilla
-- del capataz. Son los 11 despachos de la obra (21/07 a 08/09):
-- 165 bolsas x $1.500 = $247.500 (antes $412.500; efecto −$165.000).

update materiales_a_cuenta_cliente
   set precio_unit = 1500, precio_total = round(cantidad * 1500, 2), updated_at = now()
 where obra_cod = 'CC-016'
   and precio_unit = 2500
   and id in (select c.id from materiales_a_cuenta_cliente c
              where c.obra_cod = 'CC-016'
                and norm_txt(c.descripcion) like '%arena%');
