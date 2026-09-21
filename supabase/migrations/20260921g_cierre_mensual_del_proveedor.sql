-- =====================================================================
-- El vencimiento de cuenta corriente cierra por mes (2026-09-21)
--
-- Hasta hoy el vencimiento sugerido era siempre `fecha de la factura +
-- plazo_pago_dias`, o sea que cada factura arrastraba el suyo. El dueño
-- explicó que con varios proveedores no es así:
--
--   · Silva      → «cierra el último día del mes y vence a los 30 días del
--                   último día hábil». Todo lo comprado en el mes vence el
--                   MISMO día: una factura del 2 y otra del 28 caen juntas.
--   · ABC S.A.   → «cierra a los 30 días de la fecha de factura». Es el modo
--                   que ya existía.
--
-- Los dos conviven, así que el modo va por proveedor:
--
--   vencimiento_modo = 'dias'            vence = fecha + plazo_pago_dias
--   vencimiento_modo = 'cierre_mensual'  cierre = cierre_dia (o el último día
--                                        del mes si es null), se corre al
--                                        último día hábil, y vence a
--                                        plazo_pago_dias de ahí.
--
-- `plazo_pago_dias` se REUSA en los dos modos (son los «30 días» de ambas
-- frases), así que no se agrega una columna más para lo mismo.
--
-- Default 'dias': los 5 proveedores de hoy siguen calculando igual que antes.
-- ABC ya queda bien sin tocar nada. Silva todavía no existe en el padrón: se
-- carga con el modo nuevo cuando lo den de alta.
--
-- El vencimiento sigue siendo EDITABLE a mano en el modal, y hace falta que
-- lo sea: el sistema no tiene calendario de feriados (no existe en ninguno de
-- los dos repos ni en la base), así que «día hábil» es lunes a viernes y un
-- cierre que caiga feriado no se corrige solo.
-- =====================================================================

alter table public.pagos_proveedores
  add column if not exists vencimiento_modo text    not null default 'dias',
  add column if not exists cierre_dia       integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pagos_proveedores_venc_modo_chk') then
    alter table public.pagos_proveedores
      add constraint pagos_proveedores_venc_modo_chk
      check (vencimiento_modo in ('dias', 'cierre_mensual'));
  end if;

  -- El día de cierre sólo tiene sentido con cierre mensual, y 1..31.
  -- null = el último día del mes, que es el caso de Silva.
  if not exists (select 1 from pg_constraint where conname = 'pagos_proveedores_cierre_dia_chk') then
    alter table public.pagos_proveedores
      add constraint pagos_proveedores_cierre_dia_chk
      check (cierre_dia is null or (vencimiento_modo = 'cierre_mensual' and cierre_dia between 1 and 31));
  end if;
end $$;

comment on column public.pagos_proveedores.vencimiento_modo is
  'Cómo se sugiere el vencimiento: dias = fecha + plazo_pago_dias; cierre_mensual = cuenta corriente, todo el mes vence junto (20260921g).';
comment on column public.pagos_proveedores.cierre_dia is
  'Día del mes en que cierra la cuenta corriente. NULL = el último día del mes. Sólo con vencimiento_modo = cierre_mensual.';
