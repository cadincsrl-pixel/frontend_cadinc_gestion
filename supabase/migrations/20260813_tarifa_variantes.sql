-- Variantes de tarifa (2026-08-13)
--
-- Hay empresas que pagan distinto por la MISMA ruta según su cliente final.
-- Una tarifa de empresa+cantera(+depósito) puede tener ahora una "variante"
-- (Tarifa 1/2/3 o texto libre). El tramo elige qué variante aplica al cargarse.
--
-- Semántica:
--   * tarifas_empresa_cantera.variante NULL  = tarifa única/base (comportamiento actual).
--   * tramos.tarifa_variante NULL           = el tramo factura con la tarifa base.
--   * La resolución (tarifaParaFecha front / tarifaDelViaje back) matchea
--     variante del tramo ↔ variante de la tarifa ANTES de la escalera de
--     especificidad. Sin match exacto no hay tarifa (queda visible como
--     "sin tarifa" en cobros/liquidaciones, no cae en silencio a la base).

alter table tarifas_empresa_cantera add column if not exists variante text;
alter table tramos add column if not exists tarifa_variante text;

comment on column tarifas_empresa_cantera.variante is
  'Variante de tarifa para la misma ruta (Tarifa 1/2/3 o libre). NULL = tarifa única/base.';
comment on column tramos.tarifa_variante is
  'Qué variante de tarifa factura este tramo. NULL = tarifa base. Debe matchear tarifas_empresa_cantera.variante.';
