-- Limpieza del catálogo, tanda 2: sinónimos sacados de cómo pidió la obra (10/09 → 25/09).
--
-- El matcher del Combobox es includes() sobre nombre + alias (§5.15): "chapa galvanizada 12 4x8"
-- no encuentra "chapa galvanizada 12" + "chapa 4x8". Se agregan las formas tal como se tipearon.
-- Además se vinculan dos renglones de texto libre que tienen ficha segura
-- (teclón ciego → Módulo tapón ciego, válvula carga y descarga → la de mochila).
-- No toca precios, cantidades ni la cuenta del cliente.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v_ren record;
begin
  for v_ren in
    select * from (values
      (2191, array['cupla awaduct 110', 'cupla awaduct 110mm']),
      (2713, array['chapa galvanizada calibre 16 1x2', 'chapa galvanizada 16 1x2']),
      (2773, array['chapa galvanizada 12 4x8', 'chapa galvanizada calibre 12 4x8']),
      (2776, array['escalera andamios', 'escalera de andamios']),
      (2817, array['tierra refractaria x5kg', 'tierra refractaria x 5kg']),
      (2818, array['mecha sds 6x110mm']),
      (2823, array['brazo de ducha x 40cm', 'brazo ducha 40cm', 'brazo largo para ducha x 40cm']),
      (2826, array['bisagra 60x8x2.5', 'bisagra 60x8x2.5 para soldar']),
      (2830, array['capucho para pistola', 'capuchon para pistola', 'pico para pistola']),
      (961,  array['teclon ciego', 'tecla ciega'])
    ) as t(id, alias)
  loop
    update public.stock_materiales m
       set alias = array(
             select distinct x
               from unnest(coalesce(m.alias, '{}'::text[]) || v_ren.alias) as x
              where coalesce(x, '') <> '' and public.norm_txt(x) <> public.norm_txt(m.nombre)),
           updated_by = v_user, updated_at = now()
     where m.id = v_ren.id;
  end loop;

  -- renglones de texto libre con ficha segura
  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', null, i.estado,
         'Vinculado a la ficha "' || m.nombre || '" (#' || m.id || ')',
         jsonb_build_object('motivo', 'vincular_ficha', 'material_nuevo', m.id, 'user_id', v_user)
    from public.solicitud_compra_item i
    join (values (3865, 961), (4458, 2820)) as v(item_id, material_id) on v.item_id = i.id
    join public.stock_materiales m on m.id = v.material_id
   where i.material_id is null;

  update public.solicitud_compra_item i
     set material_id = v.material_id
    from (values (3865, 961), (4458, 2820)) as v(item_id, material_id)
   where i.id = v.item_id and i.material_id is null;
end
$m$;
