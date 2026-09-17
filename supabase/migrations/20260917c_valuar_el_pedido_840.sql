-- Los tres renglones del pedido 840 (CLINICA YB) a precio de catálogo
--
-- Continuación de 20260917b, que movió el pedido de MANTENIMIENTO a CLINICA YB.
-- Al pasar de una obra interna a una de cliente, los tres renglones de material
-- quedaron como deuda del cliente pero en $0. El user pidió valuarlos a precio
-- de catálogo el 17/09.
--
--   item  ficha  material                              cant.  precio ref.      total
--   4094   1161  Látex ext/int Sherwin Pro 720 x20lts  0,4 l   85.454,52    34.181,81
--   4095    126  Rodillo lana pelo corto 23cm          1 u      9.831,96     9.831,96
--   4097    128  Pincel 2"                             1 u      6.012,01     6.012,01
--                                                                          ─────────
--                                                                          50.025,78
--
-- El item 4096 (Escalera tijera) NO se valúa: es herramienta, no tiene fila en
-- la cuenta del cliente y no se le cobra a nadie (CLAUDE.md §5.12).
--
-- POR QUÉ NO SE HACE SOLO. En obra de cliente un renglón en $0 no toma el
-- precio de referencia por su cuenta — es una decisión de plata y va explícita.
-- En obras llave en mano sí se hace automático, porque ahí el precio es un
-- costo propio y no una factura al cliente.
--
-- NO HAY QUE DESCONGELAR NADA: las tres filas tienen `cobro_id` y
-- `certificado_id` en null, así que `fn_mcc_congelada` las deja pasar. El
-- trigger `trg_mcc_precio_cambiado` deja el evento `precio_cambiado` con el
-- antes y el después, que es como se ve después en Admin › Movimientos de
-- precios.
--
-- El precio se toma de `stock_materiales.precio_ref` LEYENDO la ficha, no
-- escrito a mano: si alguien retasó entre que escribí esto y que corre, corre
-- con el precio de ese momento y no con una copia vieja. Los precios del
-- catálogo son FINALES con IVA (§5.14), así que no se les suma nada.

-- 1. La cuenta del cliente.
update public.materiales_a_cuenta_cliente mcc
   set precio_unit  = m.precio_ref,
       precio_total = round(mcc.cantidad * m.precio_ref, 2),
       updated_at   = now()
  from public.solicitud_compra_item i
  join public.stock_materiales m on m.id = i.material_id
 where i.id = mcc.item_id
   and mcc.item_id in (4094, 4095, 4097)
   and mcc.precio_unit = 0
   and mcc.cobro_id is null
   and mcc.certificado_id is null
   and m.precio_ref > 0;

-- 2. El renglón del pedido, para que la pantalla del pedido diga lo mismo que
--    la cuenta corriente.
update public.solicitud_compra_item i
   set precio_unit = m.precio_ref
  from public.stock_materiales m
 where m.id = i.material_id
   and i.id in (4094, 4095, 4097)
   and i.precio_unit = 0
   and m.precio_ref > 0;
