-- 20260908h — La chapa galvanizada lisa C25 queda en cero (user 2026-09-07:
-- "de esa chapa hoy en deposito hay cero")
--
-- El saldo era -10 m y en el galpon no hay nada, asi que van +10 para cerrarla.
--
-- De donde salio el -10: el 04/09 se despacharon 10 m a CC-025 contra una ficha
-- que nunca tuvo una entrada registrada. La bobina entro al deposito y se cargo
-- la compra, pero no el ingreso a stock -- el mismo patron que viene apareciendo
-- en todo el recuento. Por eso va como `error_carga` y no como faltante: no
-- falta nada, sobraba un movimiento sin su contrapartida.
--
-- OJO CON EL PEDIDO ABIERTO: el renglon 3457 pide 26 m para CC-025 y esta
-- `pendiente`. Con la ficha en cero, esos 26 m NO se pueden despachar de
-- deposito: hay que comprarlos. Al precio de la cotizacion de hoy son
-- 26 x $13.197,53 = $343.135,78 con IVA (130 kg).
insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, obs, created_by)
values
  (877, 'ajuste', 10, 'ajuste_inventario', 'error_carga', 'pendiente', '2026-09-07',
   'Recuento del deposito 2026-09-07: el sistema decia -10 m y el user confirma que no hay nada. La ficha nunca tuvo una entrada: los 10 m despachados a CC-025 el 04/09 salieron de una bobina que se compro pero no se cargo al stock. Queda en cero.',
   'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
