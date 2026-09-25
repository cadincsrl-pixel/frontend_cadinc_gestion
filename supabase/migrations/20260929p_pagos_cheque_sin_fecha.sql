-- =====================================================================
-- Compras: un cheque puede quedar SIN fecha de cobro
-- (2026-09-25, serie 20260929)
--
-- Por qué: al reconstruir los pagos a Petronorte con la planilla del dueño
-- (cheques físicos 31268xxx por factura), 16 cheques todavía no se debitaron
-- y nadie tiene a mano su fecha de pago. El dueño decidió cargarlos «sin
-- fecha de pago» antes que inventarla. Hasta hoy pagos_cheques.fecha_cobro
-- era NOT NULL y _pagos_emitir_orden rebotaba con CHEQUE_INVALIDO.
--
-- Diseño:
--   · pagos_cheques.fecha_cobro pasa a admitir NULL.
--   · _pagos_emitir_orden deja de exigirla. Sigue exigiendo número y monto, y
--     que la fecha, si viene, no sea anterior a la de la OP.
--   · pagos_ordenes.fecha_cobro sigue siendo la PRIMERA fecha de sus cheques
--     (min ignora los NULL). pagos_ordenes_fecha_cobro_chk sigue pidiendo al
--     menos una: una OP con cheques y ninguna fecha sigue rebotando.
--   · La pantalla y el backend siguen pidiendo la fecha (zod FechaISO): esto
--     lo usan los pagos reconstruidos. La contabilidad no lee la fecha del
--     cheque (_cont_prop_orden va por monto y cuenta).
-- =====================================================================

alter table public.pagos_cheques alter column fecha_cobro drop not null;

comment on column public.pagos_cheques.fecha_cobro is
  'Cuándo se puede cobrar. NULL = no se sabe todavía (cheque de un pago reconstruido que aún no se debitó; 20260929p).';

create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

do $m$
declare
  v text := pg_get_functiondef('public._pagos_emitir_orden(bigint,jsonb,jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$      if c.numero is null or c.fecha_cobro is null or c.monto is null or c.monto <= 0 then$a$,
$a$      if c.numero is null or c.monto is null or c.monto <= 0 then$a$);
  execute v;
end $m$;
