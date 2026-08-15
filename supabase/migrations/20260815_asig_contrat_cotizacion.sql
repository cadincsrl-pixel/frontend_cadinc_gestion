-- Cotización inicial del contratista por obra.
-- Vive en asig_contrat (la asignación obra×contratista) y las certificaciones
-- semanales se van descontando de este monto para calcular el saldo adeudado.
alter table public.asig_contrat
  add column if not exists cotizacion numeric check (cotizacion is null or cotizacion >= 0),
  add column if not exists cotizacion_obs text;

comment on column public.asig_contrat.cotizacion is
  'Cotización inicial acordada con el contratista para esta obra. Saldo = cotizacion - sum(certificaciones.monto de la obra).';
comment on column public.asig_contrat.cotizacion_obs is
  'Observaciones de la cotización (alcance, condiciones, adicionales).';
