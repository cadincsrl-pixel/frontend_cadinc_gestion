-- =====================================================================
-- Compras: la factura #9 (Norte Distribuciones, A 00011-00000194) se cargó
-- por $24.995 y el papel y el QR dicen $24.994,52 (2026-09-24)
--
-- Está pagada con la OP-0004 (id 8, e-cheq Galicia 3055 por $24.995). La
-- plata ya salió, así que lo pagado no se toca. Pedido del dueño (24/09):
-- que la factura quede con el total correcto y que los $0,48 pagados de más
-- queden A FAVOR DE CADINC en la cuenta del proveedor.
--
-- Cómo se representa: el modelo ya lo tiene. Una OP se arma con líneas
-- `factura`, `a_cuenta` y `nota_credito` (20260918a):
--     monto_pagado = Σ factura + Σ a_cuenta
-- y `v_pagos_proveedor_saldo.a_cuenta_sin_aplicar` suma las líneas a_cuenta
-- de las OP emitidas (saldo_neto = saldo − a_cuenta). Entonces la MISMA OP
-- queda: factura $24.994,52 + a cuenta $0,48 = $24.995 pagados. El monto de
-- la OP y el cheque no cambian.
--
-- Qué hace, en este orden (el orden importa por el recalculador de estado):
--   1. Total de la factura 24.995 → 24.994,52. Primero la factura: si se
--      bajara antes la línea, el recalculador vería 24.994,52 aplicado contra
--      un total de 24.995 y la pasaría a pagada_parcial.
--   2. La línea 9 de la OP 8 (factura) 24.995 → 24.994,52 → sigue «pagada».
--   3. Línea nueva a_cuenta $0,48 en la OP 8.
--   4. Imputación a CC DEPOSITO 24.995 → 24.994,52 (total − percepciones, y
--      percepciones = 0).
--   5. Desglose del papel con `pagos_completar_desglose` (sin forzar: no hay
--      percepciones): IVA 21% base 20.656,63 / 4.337,89, CAE 86384026294232
--      vto 01/10/2026. Cierra exacto: 20.656,63 + 4.337,89 = 24.994,52.
--
-- El escape: `cadinc.descongelar = 'on'`, local a la transacción. Es el que
-- prevén los triggers de pagos (fn_pagos_factura_congelada,
-- fn_pagos_linea_inmutable, fn_pagos_orden_congelada, estado_guard,
-- desaprobar) «SOLO desde una migración con motivo». No hay RPC para esto:
-- `pagos_completar_desglose` usa `cadinc.pagos_desglose`, que a propósito NO
-- deja cambiar el total; y las líneas de una OP son inmutables por diseño
-- (lo normal es anular y rehacer, pero el dueño quiere la MISMA OP y el
-- cheque ya entregado). Se apaga al terminar, antes del desglose, para que
-- la RPC corra con sus propias reglas.
--
-- Rastro: audit_cambios registra el UPDATE de la factura y de la imputación;
-- las líneas de OP no tienen trigger de auditoría, por eso la OP y la
-- factura llevan una nota en `obs`. Guardas: si algo no está como se vio el
-- 24/09 (total, línea, OP, cheque, sin a_cuenta previo), no toca nada.
-- =====================================================================

do $m$
declare
  c_franco constant uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  f   public.pagos_facturas%rowtype;
  o   public.pagos_ordenes%rowtype;
  v_n int;
begin
  -- Guardas: el estado que se vio antes de escribir esto.
  select * into f from public.pagos_facturas where id = 9 for update;
  select * into o from public.pagos_ordenes where id = 8 for update;
  if f.total <> 24995 or f.estado <> 'pagada' or f.proveedor_id <> 14 or f.numero <> '00011-00000194'
     or coalesce(f.percepciones, 0) <> 0 then
    raise exception 'GUARDA_FACTURA_9: %', to_jsonb(f);
  end if;
  if o.estado <> 'emitida' or o.monto_pagado <> 24995 or o.monto_nc <> 0 or o.proveedor_id <> 14 then
    raise exception 'GUARDA_OP_8: %', to_jsonb(o);
  end if;
  select count(*) into v_n from public.pagos_orden_lineas where orden_id = 8;
  if v_n <> 1 or not exists (select 1 from public.pagos_orden_lineas
                              where id = 9 and orden_id = 8 and tipo = 'factura' and factura_id = 9 and monto = 24995) then
    raise exception 'GUARDA_LINEAS_OP_8';
  end if;
  if (select coalesce(sum(monto), 0) from public.pagos_cheques where orden_id = 8) <> 24995 then
    raise exception 'GUARDA_CHEQUES_OP_8';
  end if;
  if (select count(*) from public.pagos_imputaciones where factura_id = 9) <> 1
     or (select monto from public.pagos_imputaciones where factura_id = 9) <> 24995 then
    raise exception 'GUARDA_IMPUTACION_9';
  end if;

  perform set_config('cadinc.descongelar', 'on', true);

  -- 1) Total de la factura.
  update public.pagos_facturas
     set total = 24994.52,
         obs = ltrim(rtrim(coalesce(obs, '') || E'\n' ||
               '24/09 — total corregido de 24.995 a 24.994,52 (papel y QR); los 0,48 pagados de más quedaron a cuenta en la OP-0004'), E'\n'),
         updated_by = c_franco
   where id = 9;

  -- 2) La línea de la OP que pagaba la factura.
  update public.pagos_orden_lineas set monto = 24994.52 where id = 9;

  -- 3) Los 0,48 a favor de CADINC, en la misma OP.
  insert into public.pagos_orden_lineas (orden_id, tipo, factura_id, monto)
  values (8, 'a_cuenta', null, 0.48);

  update public.pagos_ordenes
     set obs = ltrim(rtrim(coalesce(obs, '') || E'\n' ||
               '24/09 — la factura A 00011-00000194 era de 24.994,52, no 24.995: los 0,48 quedan a cuenta del proveedor'), E'\n'),
         updated_by = c_franco
   where id = 8;

  -- 4) Lo imputado a la obra = total − percepciones (0).
  update public.pagos_imputaciones set monto = 24994.52, updated_by = c_franco where factura_id = 9;

  perform set_config('cadinc.descongelar', '', true);

  -- 5) El desglose del papel, por la puerta normal.
  perform public.pagos_completar_desglose(9,
    '{"iva_detalle": [{"alicuota_id": 5, "base_imp": 20656.63, "importe": 4337.89}],
      "tributos": [], "no_gravado": null, "exento": null, "neto": null,
      "cae": "86384026294232", "cae_vto": "2026-10-01", "cbte_tipo_arca": 1}'::jsonb,
    c_franco, false);

  -- Verificación: si algo no cierra, se deshace todo.
  select * into f from public.pagos_facturas where id = 9;
  select * into o from public.pagos_ordenes where id = 8;
  if f.total <> 24994.52 or f.estado <> 'pagada' or f.neto <> 20656.63 or f.iva <> 4337.89
     or f.imputable <> 24994.52 or f.desglose_a_revisar
     or o.monto_pagado <> 24995 or o.monto_aplicado <> 24995
     or (select sum(monto) from public.pagos_orden_lineas where orden_id = 8) <> 24995
     or (select sum(monto) from public.pagos_imputaciones where factura_id = 9) <> 24994.52
     or (select a_cuenta_sin_aplicar from public.v_pagos_proveedor_saldo where proveedor_id = 14) <> 0.48 then
    raise exception 'VERIFICACION_FALLO: factura % / op %', to_jsonb(f), to_jsonb(o);
  end if;
end $m$;
