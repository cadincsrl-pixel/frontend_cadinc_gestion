-- El pedido 838 quedó partido entre CC-004 y CC-028
--
-- Hoy 17/09 a las 12:29 Nicolás cambió la obra del pedido 838 desde la
-- pantalla: `obra_cod: CC-004 → CC-028` (audit_log 32298). Es un cambio
-- legítimo — SAN MARTIN 1050 y TECHO SAN MARTIN 1050 son dos obras distintas
-- en la misma dirección y el pedido iba al techo.
--
-- El problema es lo que la pantalla NO hace. `PATCH /api/solicitudes/:id`
-- acepta `obra_cod` y actualiza SÓLO la cabecera de `solicitud_compra`. Una
-- hora antes, arreglando el pedido 840 (migración 20260917b), quedó anotado
-- exactamente esto como deuda. Acá está el mismo caso, ocurrido de verdad:
--
--   el pedido dice ............ CC-028
--   4 filas de la cuenta ...... CC-004
--   6 movimientos de stock .... CC-004  (movs 859 a 864)
--   el remito RM-1050 ......... CC-004
--   2 asientos del pañol ...... CC-004  (Espátula 125mm y Espátula 40mm)
--
-- Así, la obra del techo no ve el material que recibió y la de abajo lo sigue
-- debiendo. Y no se nota: cada pantalla por separado muestra algo coherente.
--
-- ESTA VEZ NO SE MUEVE PLATA. Las dos obras son de cliente
-- (`materiales_a_cargo_de = 'cliente'`) y ninguna es por administración, así
-- que `calc_a_cargo_de` devuelve lo mismo antes y después: los renglones de
-- EPP y herramienta siguen a cargo de CADINC y el resto del cliente. Además
-- los seis renglones están en $0. Lo único que cambia es QUÉ OBRA figura.
--
-- Los cuatro renglones de la cuenta no están cobrados ni certificados, así que
-- no hay que descongelar nada.

-- 1. La cuenta del cliente. `trg_mcc_a_cargo_de` recalcula solo (y da igual).
update public.materiales_a_cuenta_cliente
   set obra_cod = 'CC-028',
       updated_at = now()
 where item_id in (select id from public.solicitud_compra_item where solicitud_id = 838)
   and obra_cod = 'CC-004'
   and cobro_id is null
   and certificado_id is null;

-- 2. A qué obra salió del depósito.
update public.stock_movimientos
   set obra_cod = 'CC-028'
 where solicitud_item_id in (select id from public.solicitud_compra_item where solicitud_id = 838)
   and obra_cod = 'CC-004';

-- 3. El remito que se imprime.
update public.remitos_envio
   set obra_cod = 'CC-028'
 where id in (select distinct remito_envio_id from public.solicitud_compra_item
               where solicitud_id = 838 and remito_envio_id is not null)
   and obra_cod = 'CC-004';

-- 4. El pañol: las dos espátulas están en el techo, no abajo.
update public.herr_entregas
   set obra_cod = 'CC-028'
 where item_id in (select id from public.solicitud_compra_item where solicitud_id = 838)
   and obra_cod = 'CC-004';

-- La cabecera NO se toca: Nicolás ya la dejó en CC-028.
