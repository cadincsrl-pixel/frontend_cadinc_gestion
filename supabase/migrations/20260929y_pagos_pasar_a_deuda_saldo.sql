-- =====================================================================
-- Compras: «Es deuda» también para el SALDO de una factura ya pagada en parte
-- (2026-09-25, serie 20260929)
--
-- Por qué: al reconstruir los pagos de Voltaje con su estado de cuenta, la
-- FA 0006-00003681 quedó con $30.000,08 impagos (se pagó el 03/09 con 6
-- cheques de Casilda endosados que sumaban un redondo y no alcanzó).
-- pagos_pasar_a_deuda (20260929n) exigía que la factura no tuviera pagos ni
-- NC (FACTURA_CON_PAGOS), así que ese saldo quedaba «a reconstruir» para
-- siempre: sin contar como deuda.
--
-- Ahora: con pagos o NC aplicadas también se puede; lo que pasa a deuda es
-- el SALDO que queda. Sin saldo no hay nada que pasar (FACTURA_SIN_SALDO).
-- El resto de la función no cambia (permiso, flag efectivo, marca y GUC).
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
  v text := pg_get_functiondef('public.pagos_pasar_a_deuda(bigint,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
    'select v.pago_a_reconstruir, v.pagado, v.acreditado, v.nc_aplicado into v_v',
    'select v.pago_a_reconstruir, v.pagado, v.acreditado, v.nc_aplicado, v.saldo into v_v');
  v := pg_temp._una(v,
$a$  if coalesce(v_v.pagado, 0) > 0 or coalesce(v_v.acreditado, 0) > 0 or coalesce(v_v.nc_aplicado, 0) > 0 then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'pagado', v_v.pagado, 'acreditado', v_v.acreditado, 'nc_aplicado', v_v.nc_aplicado)::text;
  end if;$a$,
$b$  -- 20260929y: con pagos o NC también se puede; pasa a deuda el saldo que queda.
  if coalesce(v_v.saldo, 0) <= 0 then
    raise exception 'FACTURA_SIN_SALDO' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'saldo', v_v.saldo)::text;
  end if;$b$);
  execute v;
end $m$;
