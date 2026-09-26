-- Imputación por centro de costo de compras de agosto y septiembre 2026 con el cubo de Finnegans
-- (misma regla que 20261001p: solo facturas cuyo importe identifica sin duda el renglón del cubo).
-- Truck NOA FA 7-12690 estaba en CC-020 por el habitual del proveedor; el cubo la tiene en HIDROGRUA,
-- que el dueño mandó a CC RETRO (25/09).
-- García Jorge Sebastián FA 2-654 (Neuquén, aires) → Materiales de obra (contador, 25/09).

do $m$
declare
  u   uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_al bigint := (select id from public.pagos_conceptos where nombre = 'Alarma y monitoreo');
  v_co bigint := (select id from public.pagos_conceptos where nombre = 'Correos y encomiendas');
  v_mr bigint := (select id from public.pagos_conceptos where nombre = 'Mantenimiento de rodados');
  v_ro bigint; v_li bigint;
  r   jsonb;
  v_fallas text := '';
  v_tot numeric;
begin
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by) values ('Ropa de trabajo', 49, u, u) returning id into v_ro;
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by) values ('Librería', 50, u, u) returning id into v_li;
  perform public.cont_guardar_mapeos(jsonb_build_array(
    jsonb_build_object('clave','compras.concepto','subclave', v_ro::text,'cuenta_id',1350),
    jsonb_build_object('clave','compras.concepto','subclave', v_li::text,'cuenta_id',1376)
  ), u);

  for r in select * from jsonb_array_elements(jsonb_build_array(
    -- agosto
    jsonb_build_object('ids', jsonb_build_array(687), 'c', v_co, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(383), 'c', 9,  'o', 'CC-013'),
    jsonb_build_object('ids', jsonb_build_array(506), 'c', 9,  'o', 'CC-005'),
    jsonb_build_object('ids', jsonb_build_array(379), 'c', 6,  'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(426), 'c', v_li, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(493), 'c', 2,  'o', 'CC-005'),
    jsonb_build_object('ids', jsonb_build_array(461), 'c', 2,  'o', 'CC-021'),
    jsonb_build_object('ids', jsonb_build_array(578), 'c', 2,  'o', 'CC CADINC 1'),
    jsonb_build_object('ids', jsonb_build_array(504), 'c', 2,  'o', 'CC-026'),
    jsonb_build_object('ids', jsonb_build_array(681), 'c', 2,  'o', 'CC-011'),
    jsonb_build_object('ids', jsonb_build_array(557, 583), 'c', 2, 'o', 'CC-009'),
    jsonb_build_object('ids', jsonb_build_array(395), 'c', 2,  'o', 'CC-020'),
    jsonb_build_object('ids', jsonb_build_array(606), 'c', 2,  'o', 'CC-018'),
    jsonb_build_object('ids', jsonb_build_array(529), 'c', 3,  'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(499), 'c', v_ro, 'o', 'CC-020'),
    -- septiembre
    jsonb_build_object('ids', jsonb_build_array(861), 'c', v_al, 'o', 'CC CADINC'),
    jsonb_build_object('ids', jsonb_build_array(770), 'c', 9,  'o', 'CC-013'),
    jsonb_build_object('ids', jsonb_build_array(772), 'c', 9,  'o', 'CC-018'),
    jsonb_build_object('ids', jsonb_build_array(14),  'c', 2,  'o', 'CC-033'),
    jsonb_build_object('ids', jsonb_build_array(813), 'c', 2,  'o', 'CC-017'),
    jsonb_build_object('ids', jsonb_build_array(917), 'c', 2,  'o', 'CC-029'),
    jsonb_build_object('ids', jsonb_build_array(850), 'c', 2,  'o', 'CC-013'),
    jsonb_build_object('ids', jsonb_build_array(734), 'c', 2,  'o', 'CC-002'),
    jsonb_build_object('ids', jsonb_build_array(885), 'c', 2,  'o', 'CC-027'),
    jsonb_build_object('ids', jsonb_build_array(16),  'c', 2,  'o', 'CC-032'),
    jsonb_build_object('ids', jsonb_build_array(778), 'c', 2,  'o', 'CC-015'),
    jsonb_build_object('ids', jsonb_build_array(744), 'c', 2,  'o', 'CC-016'),
    jsonb_build_object('ids', jsonb_build_array(932), 'c', v_mr, 'o', 'CC CADINC')
  )) loop
    begin
      perform public.pagos_imputar_lote(array(select jsonb_array_elements_text(r->'ids'))::bigint[], (r->>'c')::bigint, r->>'o', u);
    exception when others then
      v_fallas := v_fallas || (r->'ids')::text || ' ' || sqlerrm || '; ';
    end;
  end loop;

  select sum(monto) into v_tot from public.pagos_imputaciones where factura_id = 511;
  perform public._pagos_reemplazar_imputaciones(511, jsonb_build_array(jsonb_build_object('obra_cod','CC RETRO','monto',v_tot)), u);

  if v_fallas <> '' then raise notice 'No imputadas: %', v_fallas; end if;
end $m$;
