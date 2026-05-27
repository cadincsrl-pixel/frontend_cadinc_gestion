-- Agrega `pagado_por` para distinguir quién paga al proveedor en una compra:
-- - 'cadinc': CADINC adelanta y se suma a la cuenta del cliente (deuda).
-- - 'cliente': el cliente paga directo al proveedor (solo se registra como
--    rendición, NO genera deuda).
--
-- Se persiste en dos lugares:
-- - `solicitud_compra_item.pagado_por`: dónde se decide al comprar (input).
-- - `materiales_a_cuenta_cliente.pagado_por`: se copia al insertar el MCC
--   (estado final). Permite filtrar/sumar la deuda y los pagos directos sin
--   joinear con `solicitud_compra_item`.
--
-- Default `'cadinc'` para que toda la data histórica quede con el supuesto
-- correcto (lo que CADINC ya viene haciendo: adelantar y sumar a la cuenta
-- del cliente).
--
-- Despacho de depósito interno (`origen='deposito'`) se persiste siempre
-- como `'cadinc'` — el material es propio de CADINC, no aplica "cliente paga
-- directo". Lo enforcea el backend en el endpoint de despacho.

ALTER TABLE public.solicitud_compra_item
  ADD COLUMN pagado_por TEXT NOT NULL DEFAULT 'cadinc'
  CHECK (pagado_por IN ('cadinc', 'cliente'));

ALTER TABLE public.materiales_a_cuenta_cliente
  ADD COLUMN pagado_por TEXT NOT NULL DEFAULT 'cadinc'
  CHECK (pagado_por IN ('cadinc', 'cliente'));

-- Índice para filtrar la cuenta del cliente por obra + pagador (el caso de
-- uso típico: "qué le debo al cliente en obra X").
CREATE INDEX IF NOT EXISTS idx_mcc_obra_pagador
  ON public.materiales_a_cuenta_cliente (obra_cod, pagado_por);
