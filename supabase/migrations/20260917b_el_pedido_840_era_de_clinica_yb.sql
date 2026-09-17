-- El pedido 840 se cargó en MANTENIMIENTO y era de CLINICA YB
--
-- Cristian Sosa lo cargó el 17/09 a las 11:11 y eligió mal la obra. El user lo
-- avisó el mismo día. Cuatro renglones, los cuatro ya despachados de depósito
-- y enviados con el remito RM-1051:
--
--   4094  Látex ext/int Sherwin Pro 720 x 20lts   0,4 lata   material
--   4095  Rodillo lana pelo corto 23cm              1 unid   material
--   4096  Escalera tijera de aluminio               1 unid   HERRAMIENTA
--   4097  Pincel 2"                                 1 unid   material
--
-- POR QUÉ NO ALCANZA CON CAMBIARLO EN LA PANTALLA
-- `PATCH /api/solicitudes/:id` acepta `obra_cod` y actualiza SÓLO la cabecera
-- de `solicitud_compra`. No arrastra nada. O sea que tocarlo desde la UI dejaba
-- el pedido diciendo CLINICA YB y estas cuatro cosas diciendo MANTENIMIENTO:
--
--   materiales_a_cuenta_cliente  3738, 3739, 3740  (la cuenta del cliente)
--   stock_movimientos            878, 879, 880     (a qué obra salió del depósito)
--   remitos_envio                1079 = RM-1051    (el papel que se imprime)
--   herr_entregas                1203              (el pañol, por la escalera)
--
-- Eso es peor que el error original: un error se ve, un pedido partido en dos
-- obras no. Queda anotado como deuda: el cambio de obra debería cascadear en
-- el backend, o directamente no ofrecerse una vez que hay renglones resueltos.
--
-- LO QUE CAMBIA DE FONDO
-- MANTENIMIENTO (`CC CADINC 1`) es obra INTERNA con `materiales_a_cargo_de =
-- 'cadinc'`: lo que se despacha ahí es costo propio de CADINC.
-- CLINICA YB (`CC clinica YB`) es de cliente. O sea que estos renglones pasan
-- de ser gasto nuestro a ser deuda del cliente.
-- No hay que tocar `a_cargo_de` a mano: `trg_mcc_a_cargo_de` es BEFORE UPDATE
-- OF obra_cod y lo recalcula solo con `calc_a_cargo_de`. Los tres renglones de
-- material van a pasar de 'cadinc' a 'cliente'; la escalera no tiene fila en la
-- cuenta porque es herramienta (`trg_mcc_sin_herramientas`), y por lo mismo
-- tampoco generó movimiento de stock (20260916c) — sólo el asiento del pañol.
--
-- LOS PRECIOS QUEDAN EN $0 A PROPÓSITO. Las tres filas están en $0 y ninguna
-- está cobrada ni certificada, así que se pueden mover sin descongelar nada.
-- Valuarlas es una decisión aparte y es del user: en obra de cliente un renglón
-- en $0 NO toma el precio de referencia solo. Para referencia, al día de hoy el
-- catálogo diría $34.181,81 + $9.831,96 + $6.012,01 = $50.025,78.

-- 1. La cabecera del pedido. `trg_audit_cambios` deja el antes → después.
update public.solicitud_compra
   set obra_cod = 'CC clinica YB',
       updated_at = now()
 where id = 840
   and obra_cod = 'CC CADINC 1';

-- 2. La cuenta del cliente. El trigger recalcula `a_cargo_de`.
update public.materiales_a_cuenta_cliente
   set obra_cod = 'CC clinica YB',
       updated_at = now()
 where item_id in (4094, 4095, 4097)
   and obra_cod = 'CC CADINC 1'
   and cobro_id is null
   and certificado_id is null;

-- 3. A qué obra salió del depósito.
update public.stock_movimientos
   set obra_cod = 'CC clinica YB'
 where solicitud_item_id in (4094, 4095, 4097)
   and obra_cod = 'CC CADINC 1';

-- 4. El remito que se imprime.
update public.remitos_envio
   set obra_cod = 'CC clinica YB'
 where id = 1079
   and obra_cod = 'CC CADINC 1';

-- 5. El pañol: la escalera está prestada a CLINICA YB, no a MANTENIMIENTO.
update public.herr_entregas
   set obra_cod = 'CC clinica YB'
 where item_id = 4096
   and obra_cod = 'CC CADINC 1';
