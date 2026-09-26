-- Imputación con el cubo de Finnegans por total del proveedor en el mes (el renglón del cubo es
-- exactamente la suma de las facturas del proveedor, o de dos proveedores, y no hay otra combinación).
-- Jul: Via Cargo → correos, CC CADINC. Ago: Banco Nación + Galicia → gastos bancarios, CC CADINC;
-- Pollano → materiales sanitarios, CC CADINC; Productos MEV + Barrera → materiales, CC NORTE.
do $m$
declare
  u    uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_co bigint := (select id from public.pagos_conceptos where nombre = 'Correos y encomiendas');
  r    jsonb;
  v_fallas text := '';
begin
  for r in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('ids', jsonb_build_array(119, 343), 'c', v_co, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(459, 702, 715), 'c', 18, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(605, 607), 'c', 2, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(556, 562), 'c', 2, 'o', 'CC NORTE')
  )) loop
    begin
      perform public.pagos_imputar_lote(array(select jsonb_array_elements_text(r->'ids'))::bigint[], (r->>'c')::bigint, r->>'o', u);
    exception when others then
      v_fallas := v_fallas || (r->'ids')::text || ' ' || sqlerrm || '; ';
    end;
  end loop;
  if v_fallas <> '' then raise notice 'No imputadas: %', v_fallas; end if;
end $m$;
