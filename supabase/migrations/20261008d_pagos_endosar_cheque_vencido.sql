-- Compras: endosar un cheque de tercero que ya venció (27/09/2026).
--
-- Caso: pago a Silva SRL con un cheque de Bradel del Pueblo SRL que se cobraba
-- el 25/09, endosado el 26/09. La regla «ningún cheque se cobra antes de la
-- fecha del pago» lo frenaba, pero un cheque de un tercero se puede endosar
-- después de su fecha: sigue valiendo 30 días. La regla sigue igual para los
-- cheques PROPIOS; para los de tercero sólo frena si pasaron más de 30 días.
-- La fecha de cobro derivada de la OP (primera fecha de sus cheques, CHECK
-- pagos_ordenes_cobro_orden_chk) no puede quedar antes del pago: con un cheque
-- de tercero vencido la OP toma la fecha del pago.
--
-- Mismo criterio en el backend (`validarCheques`) y en la pantalla
-- (`estadoCheques` / `problemaCheques`). Se parchea por ancla para no
-- reescribir la función entera.

do $m$
declare
  d text := pg_get_functiondef('public._pagos_emitir_orden(bigint, jsonb, jsonb, jsonb, uuid, boolean)'::regprocedure);
  a1 text := '      if c.fecha_cobro < v_fecha then';
  n1 text := '      if c.fecha_cobro < v_fecha and (c.es_propio or c.fecha_cobro < v_fecha - 30) then';
  a2 text := '  if v_fecha_cobro is not null and v_fecha_cobro < v_fecha then';
  n2 text := '  -- Un cheque de tercero endosado puede estar vencido (hasta 30 días): la OP sale con la fecha del pago.
  if v_fecha_cobro is not null and v_fecha_cobro < v_fecha and v_forma in (''cheque'', ''echeq'') then
    v_fecha_cobro := v_fecha;
  end if;
' || a2;
begin
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then
    raise exception 'ANCLA_CHEQUE: se esperaba exactamente una vez';
  end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then
    raise exception 'ANCLA_ORDEN: se esperaba exactamente una vez';
  end if;
  d := replace(d, a1, n1);
  d := replace(d, a2, n2);
  execute d;
end $m$;
