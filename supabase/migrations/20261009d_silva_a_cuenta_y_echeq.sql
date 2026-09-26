-- =====================================================================
-- 20261009d — Silva: el «a cuenta» de $80.117,34 se aplica a lo viejo, y
-- sus facturas nacen con e-cheq al vencimiento (2026-09-26)
--
-- 1. Dueño: «si silva no lo tiene lo saquemos del sistema así no nos
--    difiere la cuenta corriente». La OP-759 del 26/08 (e-cheq 2976 + 4
--    endosos Casilda, $1.343.310) pagó la FA 25791 ($1.263.192,66) y dejó
--    $80.117,34 «a cuenta». El estado de cuenta de Silva al 26/09 no muestra
--    ningún saldo a favor ni nada impago antes de agosto: Silva lo aplicó a
--    lo viejo. La plata salió de verdad (Galicia y cartera), así que NO se
--    borra el pago: el renglón «a cuenta» se reemplaza por las facturas «a
--    reconstruir» más cercanas a la fecha del pago:
--      FA 25502 (11/08) $0,01 · FA 25295 (27/07) $0,02 · FA 24569 (11/06) $80.117,31
--    La OP sigue sumando lo mismo.
-- 2. Dueño: «lo de silva que se cargue se debería poner en forma de pago
--    echeq con la fecha del vencimiento». Silva ya vence a fin del mes
--    siguiente; la forma habitual pasa a `echeq` (_pagos_prevision_pago arma
--    un e-cheq al vencimiento en cada factura nueva, a mano o importada).
--    Las pendientes que ya estaban cargadas toman la misma previsión.
-- =====================================================================
do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_op   bigint := 1328;  -- OP-759
  f      record;
  v_prev jsonb;
begin
  if (select monto from pagos_orden_lineas where orden_id = v_op and tipo = 'a_cuenta') is distinct from 80117.34 then
    raise exception 'A_CUENTA_NO_ESPERADO';
  end if;
  -- Las líneas de una OP emitida son inmutables (fn_pagos_linea_inmutable).
  -- Escape con motivo: el pago y su monto no cambian, solo a qué facturas se
  -- aplica el sobrante que Silva no reconoce como saldo a favor.
  perform set_config('cadinc.descongelar', 'on', true);
  delete from pagos_orden_lineas where orden_id = v_op and tipo = 'a_cuenta';
  insert into pagos_orden_lineas (orden_id, tipo, factura_id, monto) values
    (v_op, 'factura', 482, 0.01),
    (v_op, 'factura', 277, 0.02),
    (v_op, 'factura', 3911, 80117.31);
  perform set_config('cadinc.descongelar', 'off', true);
  perform _pagos_recalcular_estado(482);
  perform _pagos_recalcular_estado(277);
  perform _pagos_recalcular_estado(3911);
  update pagos_ordenes
     set obs = obs || ' | 26/09: el sobrante ($80.117,34) se aplicó a FA 25502, 25295 y 24569 (Silva no muestra saldo a favor). 20261009d.',
         updated_by = v_user
   where id = v_op;

  update pagos_proveedores set forma_pago_habitual = 'echeq', updated_by = v_user where id = 30;
  for f in select pf.id, pf.fecha, pf.clase, pf.tipo_comprobante from pagos_facturas pf join v_pagos_facturas v on v.id = pf.id
            where pf.proveedor_id = 30 and pf.estado = 'pendiente' and not v.pago_a_reconstruir and v.saldo > 0.005 and pf.clase = 'factura' loop
    v_prev := _pagos_prevision_pago(30, f.fecha, f.clase, f.tipo_comprobante);
    update pagos_facturas
       set forma_pago_prevista = v_prev ->> 'forma',
           plan_cheques = nullif(v_prev -> 'plan_cheques', 'null'::jsonb),
           updated_by = v_user
     where id = f.id;
  end loop;
end $m$;
