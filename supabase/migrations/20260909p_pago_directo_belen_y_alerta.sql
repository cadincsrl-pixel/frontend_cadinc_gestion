-- Los 3 renglones sin tasar de CASA BELEN los pagó Belén, y la alerta aprende
--
-- 1. Los tres renglones que quedaban "a cobrar sin precio" en CC-006 (viga de
--    4m armada, perfiles, tanza de replanteo) los pagó la clienta directamente
--    (dato del user, 08/09). Pasan a pagado_por='cliente' → estado "Pagó
--    directo": salen de la deuda y ya no hay nada que tasarles para cobrar.
--    Se toca el renglón del pedido Y su fila de cuenta, como hace editarItem.
--
-- 2. La alerta de "renglones sin precio" (v_cuenta_cliente_pendientes) deja de
--    contar lo que el cliente pagó directo. Esa alerta existe para priorizar
--    QUÉ TASAR PARA FACTURAR — y a un pago directo no se le factura nada, con
--    o sin precio. Hoy inflaba el número con renglones incobrables por diseño
--    (LAMADRID solo: 25 de sus 26 "sin precio" son pago directo).

update public.solicitud_compra_item
   set pagado_por = 'cliente'
 where id in (402, 403, 497);

update public.materiales_a_cuenta_cliente
   set pagado_por = 'cliente', updated_at = now()
 where item_id in (402, 403, 497) and cobro_id is null;

create or replace view public.v_cuenta_cliente_pendientes as
 SELECT m.obra_cod,
    count(*)::integer AS sin_precio,
    COALESCE(o.archivada, false) AS obra_archivada
   FROM materiales_a_cuenta_cliente m
     LEFT JOIN obras o ON o.cod = m.obra_cod
  WHERE m.precio_unit = 0::numeric
    AND NOT COALESCE(o.es_interna, false)
    AND COALESCE(m.pagado_por, 'cadinc') <> 'cliente'
  GROUP BY m.obra_cod, (COALESCE(o.archivada, false));
