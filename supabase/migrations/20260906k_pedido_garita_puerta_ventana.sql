-- 20260906k — Pedido 679 (Garita): se suman la puerta placa y la ventana como texto libre (user 2026-09-06)
-- Son específicas de esa obra (medidas propias), así que no se vinculan al catálogo.
-- Manuel las marcó "está pedida": queda en la obs del renglón.

do $$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_sol int; v_item int;
  r record;
begin
  select id into v_sol from public.solicitud_compra where obra_cod = 'CC-025' and obs like 'Pedido de Manuel por WhatsApp (06/09/2026 16:25)%';
  if v_sol is null then raise exception 'No está el pedido de Garita del WhatsApp'; end if;
  if exists (select 1 from public.solicitud_compra_item where solicitud_id = v_sol and descripcion ilike 'puerta placa%') then
    raise notice 'ya cargados'; return;
  end if;

  for r in
    select * from (values
      ('Puerta placa (a medida, específica de Garita)',   'WhatsApp de Manuel: 1 puerta placa (está pedida)'),
      ('Ventana (a medida, específica de Garita)',        'WhatsApp de Manuel: 1 ventana (está pedida)')
    ) as t(descripcion, obs)
  loop
    insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id)
    values (v_sol, r.descripcion, 1, 'unid', r.obs, 'material', false, 'pendiente', null)
    returning id into v_item;
    insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, user_id)
    values (v_item, v_sol, 'creado', 'pendiente', 1, v_user);
  end loop;

  update public.solicitud_compra
     set obs = replace(obs, 'La puerta placa y la ventana ya estaban pedidas aparte y no se cargaron acá.', 'La puerta placa y la ventana van como texto libre (son a medida) y Manuel avisó que ya están pedidas.'),
         updated_by = v_user, updated_at = now()
   where id = v_sol;
end $$;
