-- Dueño, 25/09, siguiendo el cubo de compras de Finnegans del contador:
-- 1) La Amarok (BU-0003) vale sólo la camioneta: $49.773.755,66 (neto de la FA 00052-10). El
--    flete y patentamiento (FA 00052-11, $3.223.140,50 neto) el contador lo lleva a «Gastos Varios»
--    (producto «Patentamiento»): sale del bien de uso y su concepto pasa a «Otros».
-- 2) YPF FA 01420-00321890 (resumen cierre 15/09, $33.810.944,58) NO es de un mes ya pagado: se
--    debita ~30/09. Pasa a deuda (pagos_pasar_a_deuda). Las demás de septiembre importadas como
--    «históricas» quedan como están hasta que el dueño diga.

do $m$
declare
  u uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  b public.cont_bienes_uso%rowtype;
begin
  select * into b from public.cont_bienes_uso where id = 3;
  perform public.cont_guardar_bien(jsonb_build_object(
    'id', b.id, 'descripcion', b.descripcion, 'identificador', b.identificador, 'fecha_alta', b.fecha_alta,
    'valor_origen', (select neto from public.pagos_facturas where id = 683),
    'vida_util_anios', b.vida_util_anios, 'valor_residual', b.valor_residual, 'amort_acum_inicial', b.amort_acum_inicial,
    'criterio_alta', b.criterio_alta, 'cuenta_origen_id', b.cuenta_origen_id, 'cuenta_amort_id', b.cuenta_amort_id,
    'cuenta_gasto_id', b.cuenta_gasto_id, 'obra_cod', b.obra_cod, 'pagos_factura_id', b.pagos_factura_id,
    'obs', 'Leon Alperovich FA A 00052-00000010, neta de IVA. El flete y patentamiento (FA 00052-11) va a gasto, como en Finnegans. Pagada con OP-0224/0225/0228/0230 (0228: crédito BBVA $20M).'
  ), u);

  update public.pagos_facturas set concepto_id = (select id from public.pagos_conceptos where nombre = 'Otros'), updated_by = u
   where id = 684;

  perform public.pagos_pasar_a_deuda(895, u);
end
$m$;
