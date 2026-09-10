-- Los despachos en $0 del depósito quedaban sin la marca "esperando precio".
--
-- El flag `precio_al_resolver` (20260912p) le sacó a Sosa el campo de precio
-- al resolver. En COMPRAR el route ya mandaba `esperando_precio: true` junto
-- con el precio en 0, así que el renglón caía solo en la lista de pendientes
-- de tasar. En DESPACHAR no: solo forzaba el precio a 0.
--
-- El detalle es que el depósito casi nunca compra — despacha. O sea que para
-- la única persona que tiene el flag apagado, el flag no hacía nada útil: sus
-- renglones salían en $0 SIN marcar y se mezclaban con los ~194 que ya
-- estaban en $0 desde antes. Hoy Sosa despachó 37 renglones así.
--
-- El arreglo del código va en el backend (despacharItem marca el renglón
-- después de resolver, en el wrapper, para que los caminos RPC y legacy
-- queden iguales — la RPC `resolver_item_despacho` no recibe el flag).
-- Esta migración solo pone al día lo que ya se cargó.
--
-- ALCANCE: despachos posteriores a que el flag existiera (20260912p, aplicada
-- el 09/09 22:25 UTC), en $0, sin marcar, Y QUE TENGAN UNA FILA EN LA CUENTA
-- DEL CLIENTE en $0. Esa última condición es la que importa: las herramientas
-- nunca entran a materiales_a_cuenta_cliente (trigger trg_mcc_sin_herramientas),
-- así que quedan afuera solas — y está bien, una herramienta va y vuelve y no
-- se tasa. De los 37 del día, 16 son material y necesitan precio.
--
-- Idempotente: si se vuelve a correr no hay nada que marcar.

begin;

update solicitud_compra_item i
   set esperando_precio = true
 where i.esperando_precio = false
   and coalesce(i.precio_unit, 0) = 0
   and exists (
     select 1 from materiales_a_cuenta_cliente c
      where c.item_id = i.id and c.precio_unit = 0
   )
   and exists (
     select 1 from solicitud_item_eventos e
      where e.item_id = i.id
        and e.accion = 'despachado'
        and e.created_at >= '2026-09-09 22:25:00+00'
   );

commit;
