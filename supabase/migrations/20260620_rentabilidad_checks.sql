-- Defensa en profundidad para el simulador de rentabilidad: que no se puedan
-- cargar parámetros que inflan el margen en silencio (además del zod del backend).
-- tipo_cambio = 0 → amortizaciones en USD colapsan a 0 e inflan el margen.
-- valor_residual > valor_tractor → amortización negativa (baja el costo, infla margen).
alter table public.rentabilidad_parametros
  add constraint rentabilidad_parametros_tipo_cambio_chk
    check (tipo_cambio_usd_ars > 0),
  add constraint rentabilidad_parametros_residual_chk
    check (valor_residual_tractor_usd <= valor_tractor_usd);
