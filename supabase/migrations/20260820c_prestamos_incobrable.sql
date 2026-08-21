-- Préstamos: tipo nuevo 'incobrable' — da de baja el saldo de un operario
-- que renunció (u otra causa) SIN registrarlo como recupero.
--
-- Semántica:
--   · Salda la deuda igual que 'descontado' (saldo = otorgados − descontados
--     − incobrables).
--   · NO es un descuento de semana: no participa del neto a pagar en cierres
--     ni de los totales de plata recuperada (los exports filtran por
--     tipo='descontado' explícito y quedan correctos sin cambios).
--   · Se reporta aparte como pérdida ("Incobrables: $X" en la página).
--
-- Widening del CHECK: agregar valores nunca viola filas existentes.

ALTER TABLE public.prestamos
  DROP CONSTRAINT prestamos_tipo_check;

ALTER TABLE public.prestamos
  ADD CONSTRAINT prestamos_tipo_check
  CHECK (tipo = ANY (ARRAY['otorgado'::text, 'descontado'::text, 'incobrable'::text]));
