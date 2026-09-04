-- Hueco del detector: el demoledor no se detectaba.
--
-- La semilla tenia 'martillo demoledor' y 'martillo perforador', pero en los
-- pedidos la maquina se pide como "demoledor" a secas: "Demoledor 1200w",
-- "demoledor makita grande", "demoledor bosch", "demoledores mediano". Son 16
-- items reales de una herramienta grande y cara que quedaban fuera del ledger
-- del panol y, peor, entraban a la cuenta del cliente como si fueran material.
--
-- Los tres accesorios que arrastraba el patron se tapan por PALABRA CABEZA:
-- "corta fierro demoledor grande" y "cortafierro de los demoledores grandes"
-- son cinceles, no demoledores. Verificado que ninguna de las dos cabezas veta
-- nada legitimo: la fila del catalogo "Cortafierro (cincel) de mano" entra por
-- el brazo 'catalogo' del predicado, que corre ANTES que el de texto.
--
-- El recache de herr_patrones lo propaga solo: entraron 17 demoledores al ledger.

insert into public.herr_patrones (patron, tipo, nota) values
  ('demoledor',   'incluir', 'la maquina se pide asi a secas; "martillo demoledor" no alcanzaba'),
  ('corta',       'excluir', 'corta fierro / corta hierro = cincel del demoledor, no el demoledor'),
  ('cortafierro', 'excluir', 'idem, escrito junto')
on conflict (patron, tipo) do nothing;
