-- Alta: bolsa de polietileno por rollo.
--
-- Sale del pedido #661 (depósito), renglón "bolsas para poner tornillos al
-- entregar". El catálogo tenía tres bolsas —arpillera, consorcio y escombro—
-- y ninguna es esta: son las bolsitas en rollo que el depósito usa para separar
-- bulones y tornillos cuando entrega a la obra.
--
-- Unidad `rollo` confirmada por el user: se compra el rollo, no la bolsita.
-- Rubro 6 (Ferretería general), como las otras tres bolsas.
--
-- Sin la fila, el renglón viajaba como texto libre y al recibirlo en depósito
-- no sumaba stock (ver Inbox/Stock del deposito que nunca se registro).

insert into stock_materiales (nombre, unidad, rubro_id, clase, activo, stock_actual, stock_minimo, precio_ref, alias)
values (
  'Bolsa de polietileno x rollo',
  'rollo',
  6,
  'material',
  true,
  0, 0, 0,
  array[
    'bolsa de polietileno',
    'bolsas de polietileno',
    'bolsa polietileno',
    'bolsas para poner tornillos',
    'bolsas para tornillos',
    'bolsas para poner tornillos al entregar',
    'bolsitas para tornillos',
    'rollo de bolsas'
  ]
);
