-- =====================================================================
-- Compras: período IVA elegido al importar «Recibidos» de ARCA
-- (2026-09-28)
--
-- Por qué: el archivo del contador viene por PERÍODO DE IVA, no por fecha:
-- el de julio trae una factura del 07/06 que se informó en julio. Hasta hoy
-- `pagos_importar_recibidos` ponía siempre periodo_iva = mes de la fecha, y
-- esa factura caía en el Libro IVA de junio.
--
-- Qué cambia: parámetro opcional nuevo AL FINAL, `p_periodo_iva date default
-- null`. Si viene (primer día de un mes, no posterior al mes actual; si no,
-- PERIODO_IVA_INVALIDO), las filas cuya fecha es de ese mes o anterior
-- entran con ese período IVA; las de meses posteriores conservan su mes
-- (nunca un período anterior al mes de la fecha, igual que el trigger
-- fn_pagos_periodo_iva). La vista previa devuelve `periodo_iva` por fila.
-- Sin el parámetro todo sigue igual (mes de la fecha).
--
-- DROP + CREATE (cambia la firma). El backend desplegado la llama con
-- parámetros nombrados sin p_periodo_iva: sigue andando por el default.
-- Parche por anclas sobre la definición viva (20260927c/j, 20260928b).
-- =====================================================================

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
  v text;
begin
  v := pg_get_functiondef('public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text, boolean)'::regprocedure);

  -- 1) Firma: parámetro nuevo al final.
  v := pg_temp._una(v,
$a$p_historica boolean DEFAULT false)$a$,
$a$p_historica boolean DEFAULT false, p_periodo_iva date DEFAULT NULL::date)$a$);

  -- 2) Variable.
  v := pg_temp._una(v,
$a$  v_errs     int := 0;
begin$a$,
$a$  v_errs     int := 0;
  v_piva     date;
begin$a$);

  -- 3) Validación del parámetro (antes de escribir nada).
  v := pg_temp._una(v,
$a$  if p_confirmar then
    perform pg_advisory_xact_lock(hashtext('pagos_importar_recibidos'));$a$,
$a$  -- Período IVA elegido para todo el archivo (20260928g): un mes, no futuro.
  if p_periodo_iva is not null
     and (p_periodo_iva <> date_trunc('month', p_periodo_iva::timestamp)::date
          or p_periodo_iva > date_trunc('month', public.hoy_ar()::timestamp)::date) then
    raise exception 'PERIODO_IVA_INVALIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'periodo_iva', 'periodo_iva', p_periodo_iva)::text;
  end if;

  if p_confirmar then
    perform pg_advisory_xact_lock(hashtext('pagos_importar_recibidos'));$a$);

  -- 4) Período IVA de la fila: el elegido si la fecha es de ese mes o anterior.
  v := pg_temp._una(v,
$a$    -- 10) Alta (solo confirmando y sin error).$a$,
$a$    v_piva := case
                when v_fecha is null then null
                when p_periodo_iva is not null and date_trunc('month', v_fecha::timestamp)::date <= p_periodo_iva then p_periodo_iva
                else date_trunc('month', v_fecha::timestamp)::date
              end;

    -- 10) Alta (solo confirmando y sin error).$a$);

  v := pg_temp._una(v,
$a$v_clase, null, date_trunc('month', v_fecha::timestamp)::date,$a$,
$a$v_clase, null, v_piva,$a$);

  -- 5) La vista previa lo muestra.
  v := pg_temp._una(v,
$a$'fecha', v_fecha, 'cbte_tipo', v_cbte,$a$,
$a$'fecha', v_fecha, 'periodo_iva', v_piva, 'cbte_tipo', v_cbte,$a$);

  drop function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text, boolean);
  execute v;
end $m$;

comment on function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text, boolean, date) is
  'Importa «Mis Comprobantes Recibidos» de ARCA como facturas sin_imputar (vista previa con p_confirmar=false; todo o nada al confirmar). 20260927c. p_historica (20260928b): meses ya pagados, nacen pago_a_reconstruir. p_periodo_iva (20260928g): período IVA de las filas con fecha de ese mes o anterior.';

revoke all on function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text, boolean, date) from public, anon, authenticated;
grant execute on function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text, boolean, date) to service_role;

notify pgrst, 'reload schema';
