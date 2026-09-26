-- Imputación por centro de costo de compras de julio 2026 a partir del cubo de Finnegans.
-- El cubo viene sumado por centro de costo / cuenta / producto (sin número de factura): acá van
-- solo las facturas cuyo importe identifica sin duda el renglón del cubo.
-- Petronorte = GERENCIAL (confirmado por el dueño 25/09). Supermat FA 822, 990 y 1063 suman, con el
-- combustible de Lubre, exactamente los renglones de GERENCIAL.
-- Equivalencias de centros de costo Finnegans → obras en la nota de Obsidian del mapeo.
-- Conceptos nuevos (respuestas del contador): alarmas, teléfono, correos.

do $m$
declare
  u   uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_al bigint; v_te bigint; v_co bigint;
  r   jsonb;
  v_fallas text := '';
begin
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by) values ('Alarma y monitoreo', 46, u, u) returning id into v_al;
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by) values ('Teléfono e internet', 47, u, u) returning id into v_te;
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by) values ('Correos y encomiendas', 48, u, u) returning id into v_co;
  perform public.cont_guardar_mapeos(jsonb_build_array(
    jsonb_build_object('clave','compras.concepto','subclave', v_al::text,'cuenta_id',1368),
    jsonb_build_object('clave','compras.concepto','subclave', v_te::text,'cuenta_id',1366),
    jsonb_build_object('clave','compras.concepto','subclave', v_co::text,'cuenta_id',1379)
  ), u);

  for r in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('ids', jsonb_build_array(98),  'c', v_al, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(368), 'c', 18, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(292), 'c', 9,  'o', 'CC-018'),
    jsonb_build_object('ids', jsonb_build_array(268), 'c', 9,  'o', 'CC NORTE'),
    jsonb_build_object('ids', jsonb_build_array(194), 'c', 9,  'o', 'CC PRADERAS'),
    jsonb_build_object('ids', jsonb_build_array(351), 'c', 6,  'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(318), 'c', 12, 'o', 'CC-019'),
    jsonb_build_object('ids', jsonb_build_array(166), 'c', 2,  'o', 'CC-014'),
    jsonb_build_object('ids', jsonb_build_array(139), 'c', 2,  'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(207), 'c', 1,  'o', 'CC CLINICA HERAS'),
    jsonb_build_object('ids', jsonb_build_array(130), 'c', 1,  'o', 'CC GERENCIA'),
    jsonb_build_object('ids', jsonb_build_array(187, 244, 311), 'c', 2, 'o', 'CC GERENCIA')
  )) loop
    begin
      perform public.pagos_imputar_lote(array(select jsonb_array_elements_text(r->'ids'))::bigint[], (r->>'c')::bigint, r->>'o', u);
    exception when others then
      v_fallas := v_fallas || (r->'ids')::text || ' ' || sqlerrm || '; ';
    end;
  end loop;
  if v_fallas <> '' then raise notice 'No imputadas: %', v_fallas; end if;
end $m$;
