-- Alperovich (Compras, PRV-0221): la Amarok y sus gastos (dueño, 25/09).
--
-- 1) Centro de costo nuevo: obra interna "CC GERENCIA" (GERENCIA / GASTOS OPERATIVOS). No es obra:
--    gastos operativos de CADINC. Cada obra es su centro de costo (§5.18); interna → su nombre.
-- 2) Dos conceptos nuevos: "Rodados (bien de uso)" y "Gastos bancarios y financieros".
-- 3) Imputación 100% a CC GERENCIA de los 9 comprobantes (entraron sin_imputar de Mis Comprobantes):
--      Rodados (bien de uso)          → FA 00052-10 (Amarok) y FA 00052-11 (flete y patentamiento)
--      Gastos bancarios y financieros → ND 00052-3
--      Mantenimiento y repuestos      → lona y cobertor (FA 00036-22677; el dueño: gasto, NO bien de
--                                       uso), antirrobo y plato de seguridad (22678/22706/22759) y
--                                       sus NC 1129/1134
-- 4) Se aprueban la FA 22678 y la FA 22706: saldo 0 por su NC, quedan "pagada".
--    La FA 22759 ($248,53) queda como deuda real.
-- 5) Alta del bien de uso (BU) Amarok: valor de origen = NETO de las FA 00052-10 y 00052-11 (el IVA
--    es crédito fiscal), alta 28/08/2026, 5 años, cuentas Rodados 1.2.2.04.01 / 1.2.2.04.03 y gasto
--    Amortizaciones Administración 4.2.1.03.05. A confirmar por el contador.

do $m$
declare
  v_user  uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v_rod   bigint;
  v_banc  bigint;
  v_mant  bigint := (select id from public.pagos_conceptos where nombre = 'Mantenimiento y repuestos');
  v_neto  numeric := (select sum(neto) from public.pagos_facturas where id in (683, 684));
begin
  insert into public.obras (cod, nom, es_interna, es_deposito, materiales_a_cargo_de, obs, created_by, updated_by)
  values ('CC GERENCIA', 'GERENCIA / GASTOS OPERATIVOS', true, false, 'cadinc',
          'Centro de costo de gastos operativos y gerenciales de CADINC (no es obra).', v_user, v_user);

  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by)
  values ('Rodados (bien de uso)', 13, v_user, v_user) returning id into v_rod;
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by)
  values ('Gastos bancarios y financieros', 14, v_user, v_user) returning id into v_banc;

  perform public.pagos_imputar_lote(array[683, 684]::bigint[], v_rod, 'CC GERENCIA', v_user);
  perform public.pagos_imputar_lote(array[688]::bigint[], v_banc, 'CC GERENCIA', v_user);
  perform public.pagos_imputar_lote(array[776, 782, 807, 816, 879, 886]::bigint[], v_mant, 'CC GERENCIA', v_user);

  perform public.pagos_aprobar_factura(782, v_user);
  perform public.pagos_aprobar_factura(816, v_user);

  perform public.cont_guardar_bien(jsonb_build_object(
    'descripcion',      'VW Amarok Highline TDI AT 4x2 G2 plata pirita',
    'identificador',    'Chasis 8AWJB62H3SA038641 · Motor CSH 271804',
    'fecha_alta',       '2026-08-28',
    'valor_origen',     v_neto,
    'vida_util_anios',  5,
    'cuenta_origen_id', (select id from public.cont_cuentas where codigo = '1.2.2.04.01'),
    'cuenta_amort_id',  (select id from public.cont_cuentas where codigo = '1.2.2.04.03'),
    'cuenta_gasto_id',  (select id from public.cont_cuentas where codigo = '4.2.1.03.05'),
    'obra_cod',         'CC GERENCIA',
    'pagos_factura_id', 683,
    'obs',              'Leon Alperovich FA A 00052-00000010 (camioneta) + FA A 00052-00000011 (flete y patentamiento), netos de IVA. Pagada con OP-0224/0225/0228/0230 (0228: crédito BBVA $20M).'
  ), v_user);
end
$m$;
