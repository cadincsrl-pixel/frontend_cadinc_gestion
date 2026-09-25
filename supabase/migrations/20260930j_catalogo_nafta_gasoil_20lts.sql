-- Limpieza del catálogo, tanda 8: combustible de CC-018 (dueño, 25/09: «fueron 20 litros cada uno»).
--
-- · Las 3 naftas (3881–3883, "1 unid") → Nafta x 20lts (2778, por unidad = bidón de 20 lts).
-- · El diesel (4280, "1 unid" a $67.000) → ficha nueva "Gasoil x 20lts" por unidad, hermana de la
--   de nafta. Gasoil (847) sigue siendo por litro.
--   Los sinónimos de la nueva no llevan "diesel"/"gasoil" solos (§5.15: una palabra sobre fichas
--   hermanas con distinta unidad); siempre van con el "20".
-- Precios del catálogo sin tocar: las tres naftas se pagaron $56.000, $60.000 y $80.000 el mismo
-- día; no hay un número que tomar. Renglones y cuenta del cliente conservan precio y cantidad.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v_gasoil int;
begin
  insert into public.stock_materiales (rubro_id, nombre, unidad, stock_actual, precio_ref, activo, clase, alias, created_by, updated_by)
  select rubro_id, 'Gasoil x 20lts', 'unid', 0, 0, true, 'material',
         array['gasoil x 20l', 'gasoil 20 litros', 'diesel x 20lts', 'diesel 20 litros', 'bidon de gasoil', 'bidon gasoil 20'],
         v_user, v_user
    from public.stock_materiales where id = 2778
  returning id into v_gasoil;

  create temp table _vinc (item_id int, material_id int) on commit drop;
  insert into _vinc values (3881, 2778), (3882, 2778), (3883, 2778), (4280, v_gasoil);

  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', null, i.estado,
         'Texto libre "' || trim(i.descripcion) || '" vinculado a la ficha "' || m.nombre || '" (#' || m.id || '): eran 20 litros',
         jsonb_build_object('motivo', 'vincular_ficha', 'material_nuevo', m.id, 'user_id', v_user)
    from public.solicitud_compra_item i
    join _vinc v on v.item_id = i.id
    join public.stock_materiales m on m.id = v.material_id
   where i.material_id is null;

  update public.materiales_a_cuenta_cliente c set descripcion = m.nombre, updated_at = now()
    from _vinc v
    join public.stock_materiales m on m.id = v.material_id
    join public.solicitud_compra_item i on i.id = v.item_id
   where c.item_id = v.item_id and i.material_id is null
     and c.cobro_id is null and c.certificado_id is null;

  update public.solicitud_compra_item i
     set material_id = v.material_id, descripcion = m.nombre
    from _vinc v
    join public.stock_materiales m on m.id = v.material_id
   where i.id = v.item_id and i.material_id is null;
end
$m$;
