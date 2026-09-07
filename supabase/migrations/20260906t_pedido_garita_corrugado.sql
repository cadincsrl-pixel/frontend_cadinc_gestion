-- 20260906t — Pedido 679 (Garita): se suman "1 rollo de caño 3/4" y "30 conectores 3/4" (user 2026-09-06, 21:50).
-- Caño corrugado 3/4" (id 59) se vende por metro: el rollo estándar es de 25 m → 25 m, con la aclaración en obs.
-- Conector p/ caño corrugado 3/4" (id 915): 30 unidades (los conectores van con el corrugado, no con el rígido).

do $$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_sol int := 679; v_item int;
  r record;
begin
  if not exists (select 1 from public.solicitud_compra where id = v_sol and obra_cod = 'CC-025') then
    raise exception 'El pedido 679 no es el de Garita';
  end if;
  if exists (select 1 from public.solicitud_compra_item where solicitud_id = v_sol and material_id in (59, 915)) then
    raise notice 'ya cargados'; return;
  end if;

  for r in
    select * from (values
      (59,  'Caño corrugado 3/4"',              25::numeric, 'm',    'Pedido del user 06/09 21:50: "1 rollo de caño 3/4" — cargado como 25 m (rollo estándar); ajustar si el rollo es de 50 m'),
      (915, 'Conector p/ caño corrugado 3/4"',  30::numeric, 'unid', 'Pedido del user 06/09 21:50: "30 conectores 3/4"')
    ) as t(material_id, descripcion, cantidad, unidad, obs)
  loop
    insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id)
    values (v_sol, r.descripcion, r.cantidad, r.unidad, r.obs, 'material', false, 'pendiente', r.material_id)
    returning id into v_item;
    insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, user_id)
    values (v_item, v_sol, 'creado', 'pendiente', r.cantidad, v_user);
  end loop;

  update public.solicitud_compra
     set obs = obs || ' Agregado 06/09 21:50: 1 rollo (25 m) de caño corrugado 3/4 y 30 conectores para corrugado 3/4.',
         updated_by = v_user, updated_at = now()
   where id = v_sol;
end $$;
