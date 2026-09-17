-- Todos los saldos negativos del depósito a cero
--
-- Pedido del user el 17/09, después de limpiar los 47 de herramienta
-- (20260916c): "pongamos todos los stock negativos en 0".
--
-- QUÉ SE LIMPIA: 102 fichas, −11.599,6 unidades.
--
--   tramo              fichas   unidades
--   −1000 o peor            1    −10.300   <- la tapa selladora, ella sola es
--   −100 a −999             5       −742      el 89% del total
--   −10 a −99              14       −387
--   −1 a −9                82       −170,6
--
-- Por clase: 94 fichas de material activas (−11.586,6), 6 de material dadas de
-- baja (−7) y 2 de EPP (−6). Las de herramienta ya están en cero desde ayer.
--
-- DE DÓNDE SALEN. Un saldo negativo no es un error de tipeo: es un despacho de
-- depósito que salió sin que la entrada estuviera cargada. El camino legacy
-- (`despacharItemLegacy`, que es el que está vivo en prod porque
-- USE_RPC_RESOLVER está apagado) NO valida saldo — descuenta y listo. Los tres
-- generadores, por orden de plata:
--   · la compra que llega y se despacha el mismo día sin pasar por el recibo;
--   · los alias de una palabra sobre fichas hermanas con distinta unidad
--     (CLAUDE.md §5.15: "arena" pegando en bolsas y en toneladas);
--   · los bultos y fracciones (se compra un tambor y se despachan litros).
-- La ficha 2744 "Tapa selladora curva" es el ejemplo puro: nació el 15/09, un
-- solo movimiento — salida de 10.300 a CC-028 el 16/09 a las 10:11 — y quedó
-- en −10.300. Nunca se cargó la compra.
--
-- POR QUÉ SE PUEDE PONER EN CERO. El saldo negativo no es información: es la
-- ausencia de información. Dice "salió más de lo que entró", no dice cuánto
-- hay. Cero es igual de falso pero no envenena la próxima cuenta: mientras la
-- ficha está en −75, cada entrada nueva se come el pozo en silencio y el
-- depósito sigue sin saber lo que tiene. El número verdadero sale de un
-- recuento físico, no de esta tabla.
--
-- CÓMO, PARA NO PERDER LA TRAZA. No es un UPDATE pelado: por cada ficha queda
-- un movimiento de ajuste `ajuste_inventario / error_carga` con el delta y el
-- motivo escrito. O sea que dentro de tres meses, mirando Stock › Movimientos,
-- se ve QUÉ se emparejó, CUÁNTO y POR QUÉ — que es exactamente lo que no se
-- podía reconstruir de los negativos anteriores. Es la misma convención que
-- usan los 151 ajustes que ya hay en la base (todos aprobados; el circuito de
-- aprobación funciona, nadie tiene ajustes trabados).
--
-- Los movimientos históricos NO se tocan. El negativo se explica sumándolos.

-- 1. El ajuste, uno por ficha, ANTES de mover el saldo (necesita el valor viejo).
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, obs, fecha, estado, aprobado_at)
select m.id,
       'ajuste',
       -m.stock_actual,                      -- el delta que lo lleva a cero
       'ajuste_inventario',
       'error_carga',
       format('Saldo negativo emparejado a cero (migración 20260917a). '
              'Venía en %s: despachos de depósito sin la entrada cargada. '
              'El saldo real sale de un recuento físico.', m.stock_actual),
       current_date,
       'aprobado',
       now()
  from public.stock_materiales m
 where m.stock_actual < 0;

-- 2. El saldo.
update public.stock_materiales
   set stock_actual = 0,
       updated_at   = now()
 where stock_actual < 0;
