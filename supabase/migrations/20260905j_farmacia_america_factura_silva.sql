-- 20260905j — Farmacia America (CC-023): factura Silva A 0025-00026034 de los perfiles PGU/PGC
--
-- El user mandó la factura (04/09/2026): 4 PGU 100 x 6 m a $23.401,66 neto y
-- 8 PGC 100 x 6 m a $27.032,19 neto (Barbieri steel frame). Ya estaba cargada
-- la compra en el pedido #650 (renglones 3206 y 3207, Silva, 04/09, precios
-- finales exactos $28.316,01 y $32.708,95) pero sin factura: se registra la
-- factura y se engancha a los renglones y a la cuenta. La obra es del cliente:
-- los dos renglones quedan "a cobrar" a la farmacia.

do $$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_fact int;
begin
  select id into v_fact from public.facturas_compra where proveedor_id = 4 and numero = '25-26034';
  if v_fact is null then
    insert into public.facturas_compra (proveedor_id, numero, fecha, total, obs, created_by, updated_by)
    values (4, '25-26034', '2026-09-04', 382682.23,
            'Factura A 0025-00026034 · 4 PGU 100 + 8 PGC 100 x 6 m (Barbieri) p/ Farmacia America (pedido #650) · neto $309.864,16 + IVA 21 % $65.071,47 + percepciones $7.746,60 · cuenta corriente. Cargada por SQL (20260905j), sin adjunto.',
            v_user, v_user)
    returning id into v_fact;
  end if;

  update public.solicitud_compra_item set factura_id = v_fact where id in (3206, 3207) and factura_id is null;
  update public.materiales_a_cuenta_cliente set factura_id = v_fact, updated_at = now() where item_id in (3206, 3207) and factura_id is null;

  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
  select i.id, i.solicitud_id, 'correccion', null, i.estado, 'Se asoció la factura Silva A 0025-00026034 (04/09/2026)',
         jsonb_build_object('motivo', 'CC-023 factura Silva 2026-09-05', 'factura_id', v_fact), v_user
    from public.solicitud_compra_item i where i.id in (3206, 3207);
end $$;
