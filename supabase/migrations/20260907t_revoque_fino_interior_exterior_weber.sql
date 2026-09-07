-- Revoque fino Weber extra blanco: la bolsa fisica del deposito (foto del user, 07/09).
-- Es hidrorrepelente, a la cal, sirve interior Y exterior, y viene de 25 kg.
-- Las tres fichas de revoque que hay (723 exterior, 785 interior, 777 tres-en-uno) dicen "x 30kg"
-- y ninguna contempla que el mismo producto va adentro y afuera.
-- Se crea sin precio: no hay ninguna compra registrada contra esta bolsa todavia.
insert into stock_materiales (rubro_id, nombre, unidad, clase, activo, stock_actual, precio_ref, alias, obs)
values (
  4,
  'Revoque fino Weber extra blanco interior/exterior x 25kg',
  'bolsa',
  'material',
  true,
  0,
  0,
  array[
    'revoque fino interior exterior',
    'revoque fino extra blanco',
    'fino extra blanco',
    'weber extra blanco'
  ],
  'Weber Saint-Gobain. Revoque fino a la cal, hidrorrepelente, extra blanco, interior y exterior, aplicacion a la llana, solo agregar agua. Bolsa de 25 kg (las otras fichas de revoque dicen 30 kg y hay que verificarlo).'
);
