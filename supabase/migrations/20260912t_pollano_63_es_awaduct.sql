-- Presupuesto manuscrito de POLLANO (TECHO MENDOZA 418 / CC-011, pedidos 709 y 710):
-- los renglones que terminan en "AW" son Awaduct, o sea la línea de DESAGÜE,
-- no la línea pluvial. Al cargar la boleta enganché dos de ellos contra fichas
-- "PVC pluvial", que son otra cosa (caño más fino y más barato).
--
-- OJO — CORRECCIÓN (09/09, verificada en la web a pedido del user): más abajo
-- se dijo que "Awaduct es una marca de PVC". ES FALSO. Awaduct es de
-- POLIPROPILENO sanitario (Industrias Saladillo): junta deslizante con O'Ring
-- de doble labio, no se pega ni se suelda, y su resistencia a la rotura es muy
-- superior a la del PVC. NO es intercambiable con el PVC de desagüe, que se
-- pega con adhesivo y cuesta otra cosa.
--
-- El catálogo no tiene fichas que se llamen "Awaduct": la línea entró con
-- nombre genérico "PVC" y se reconoce por el código de lista de 4 dígitos en
-- el primer alias (1019-1026 los caños de 63, 20xx/22xx los accesorios).
-- Verificado contra proveedores que publican el código: 1024 = "TUBO CAÑO 63
-- X 2.00 DESAGUE AWADUCT", 1060 = "AWADUCT CAÑO 32 X 3MT". El destino de los
-- renglones de acá abajo es correcto; lo que está mal es el NOMBRE de la
-- ficha, y son ~258 fichas activas en la misma situación. Queda pendiente
-- decidir con el user si se renombran.
--
-- Los otros dos renglones AW (manguito 63 HH = ficha 2189 cód. 2015, caño 63x2m
-- = ficha 2375 cód. 1024) ya estaban bien. El codo de 110 dice "PVC" en el papel
-- y queda donde está.

begin;

-- 1) Codo 63: de "PVC pluvial 63mm 90°" (677) al codo de desagüe (928).
--    Su historial respalda el precio: $2.561,55 (30/07) y $2.239,40 (27/08)
--    contra los $2.410 que cobró Pollano.
update solicitud_compra_item
   set material_id = 928,
       descripcion = 'Codo PVC 63mm 87°30'' (desagüe)'
 where id = 3557;

update materiales_a_cuenta_cliente
   set descripcion = 'Codo PVC 63mm 87°30'' (desagüe)'
 where item_id = 3557;

-- 2) Caño 63 x 4m: de "PVC pluvial 63mm x 4m" (674) a la tira de desagüe (3, cód. 1026).
--    Historial: $17.043,02 (14/07 y 30/07), $24.860 (27/08), $17.190,52 (hoy, pedido 706).
update solicitud_compra_item
   set material_id = 3,
       descripcion = 'Caño PVC 63mm x 4m'
 where id = 3560;

update materiales_a_cuenta_cliente
   set descripcion = 'Caño PVC 63mm x 4m'
 where item_id = 3560;

-- 3) Las dos fichas pluvial quedan sin ninguna compra: esta boleta era su única
--    compra y de ahí salió su precio de referencia. Un precio de Awaduct metido
--    en una ficha pluvial es una referencia falsa, así que se limpia.
update stock_materiales set precio_ref = 0 where id in (674, 677);

-- 4) Para que la próxima el buscador encuentre la línea de desagüe cuando el
--    pedido diga "awaduct". Frases completas, nunca el alias suelto "awaduct":
--    el matcher del Combobox es substring y un alias corto contamina búsquedas
--    lejanas.
update stock_materiales
   set alias = alias || array['cano de 63 awaduct', 'cano 63 x 4 awaduct']
 where id = 3;

update stock_materiales
   set alias = alias || array['codo de 63 awaduct', 'codo 63 awaduct']
 where id = 928;

update stock_materiales
   set alias = alias || array['cano 63 x 2 awaduct']
 where id = 2375;

update stock_materiales
   set alias = alias || array['manguito 63 awaduct']
 where id = 2189;

commit;
