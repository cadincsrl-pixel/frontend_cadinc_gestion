-- Un motivo de salida para lo que el depósito consume para sí mismo.
--
-- Hasta hoy la única forma de descontar stock sin pedido era la salida manual
-- de la pestaña Stock, cuyos motivos son compra / despacho_obra / devolucion:
-- un lavado del auto o la limpieza del galpón quedaban como un "despacho a
-- obra" sin obra, y la única pista de qué fue era la observación, opcional.
-- En toda la historia hay UNA salida manual, sin observación: nadie lo usaba.
--
-- Los otros dos caminos no sirven a propósito: el pedido a CC DEPOSITO
-- resuelto "de depósito" está bloqueado (DESPACHO_A_DEPOSITO, ver
-- solicitudes.service.ts) y el ajuste de inventario significa "conté distinto",
-- no "lo usamos" — mezclarlos es justo lo que el recuento intenta separar.

alter table public.stock_movimientos
  drop constraint if exists stock_movimientos_motivo_check;

alter table public.stock_movimientos
  add constraint stock_movimientos_motivo_check
  check (motivo = any (array['compra','despacho_obra','devolucion','ajuste_inventario','consumo_interno']));

-- Un consumo es siempre una salida, y sin el "para qué" no sirve como registro:
-- el punto de este motivo es que en el próximo recuento se lea qué pasó.
alter table public.stock_movimientos
  drop constraint if exists stock_movimientos_consumo_interno_chk;

alter table public.stock_movimientos
  add constraint stock_movimientos_consumo_interno_chk
  check (motivo <> 'consumo_interno' or (tipo = 'salida' and coalesce(btrim(obs), '') <> ''));

comment on constraint stock_movimientos_consumo_interno_chk on public.stock_movimientos is
  'consumo_interno = salida con observacion obligatoria (limpieza, lavado, arreglo del deposito). No pasa por aprobacion ni toca la cuenta del cliente.';
