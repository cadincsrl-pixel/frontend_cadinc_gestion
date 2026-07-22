-- Envíos parciales de items de solicitud (pedido del user 2026-07-22:
-- "cuando cargamos un pedido y Sosa tiene cosas de menos no lo deja editar
-- para poner que mandó de menos y que queda pendiente el resto").
--
-- Modelo: `remitos_envio_item.cantidad` ya soporta cantidades por remito;
-- lo que faltaba es el ACUMULADO enviado en el item de la solicitud. El item
-- pasa a 'enviado' recién cuando cantidad_enviada cubre la cantidad efectiva
-- (cantidad_comprada ?? cantidad); mientras tanto conserva su estado
-- (comprado/de_deposito/retirado) y sigue apareciendo como "por enviar" con
-- el pendiente restante.
alter table solicitud_compra_item
  add column cantidad_enviada numeric not null default 0;

-- Backfill: los items ya enviados quedan con el acumulado completo, así el
-- revert de envío y los chips "enviado X/Y" cierran para datos históricos.
update solicitud_compra_item
set cantidad_enviada = coalesce(cantidad_comprada, cantidad)
where estado = 'enviado' and cantidad_enviada = 0;
