-- =====================================================================
-- 20261001c — Petronorte: su ICL e IDC pasan de «otro» a icl / idc
-- (2026-09-25, pedido del dueño)
--
-- 20261001a reclasificó YPF y dejó Petronorte (proveedor 31) para después.
-- Sus 4 facturas ya tienen el ICL y el IDC separados (descripción «ICL …» /
-- «IDC …»), pero como tipo «otro», así que no computaban el 45 % del ICL
-- como pago a cuenta de IVA aunque el proveedor tiene el flag. No cambian
-- importes ni percepciones: la imputación a las obras queda igual.
-- Por la puerta única `_pagos_guardar_desglose`.
-- =====================================================================

do $m$
declare
  v_f    bigint;
  v_trib jsonb;
  v_n    int := 0;
begin
  perform set_config('cadinc.pagos_desglose', 'on', true);
  for v_f in
    select distinct t.factura_id
      from public.pagos_factura_tributos t join public.pagos_facturas f on f.id = t.factura_id
     where f.proveedor_id = 31 and f.estado <> 'anulada' and t.tipo = 'otro'
       and (t.descripcion ilike 'ICL%' or t.descripcion ilike 'IDC%')
     order by 1
  loop
    select jsonb_agg(jsonb_build_object(
             'tipo', case when t.tipo = 'otro' and t.descripcion ilike 'ICL%' then 'icl'
                          when t.tipo = 'otro' and t.descripcion ilike 'IDC%' then 'idc'
                          else t.tipo end,
             'jurisdiccion', t.jurisdiccion, 'jurisdiccion_id', t.jurisdiccion_id,
             'descripcion', case when t.descripcion ilike 'ICL de %' then 'ICL (Impuesto sobre los Combustibles Líquidos)'
                                 when t.descripcion ilike 'IDC de %' then 'IDC (Impuesto al Dióxido de Carbono)'
                                 else t.descripcion end,
             'alicuota', t.alicuota, 'base_imp', t.base_imp, 'importe', t.importe) order by t.id)
      into v_trib
      from public.pagos_factura_tributos t where t.factura_id = v_f;
    perform public._pagos_guardar_desglose(v_f, null, v_trib);
    v_n := v_n + 1;
  end loop;
  perform set_config('cadinc.pagos_desglose', '', true);

  if v_n <> 4 then
    raise exception 'PETRONORTE_FACTURAS_INESPERADAS %', v_n;
  end if;
  if exists (select 1 from public.pagos_facturas f
              where f.proveedor_id = 31 and f.estado <> 'anulada'
                and abs(f.imputable - coalesce((select sum(monto) from public.pagos_imputaciones i where i.factura_id = f.id), 0)) > 0.01) then
    raise exception 'IMPUTACION_NO_CUADRA_PETRONORTE';
  end if;
end $m$;
