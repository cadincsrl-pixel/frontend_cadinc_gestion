-- Limpieza del catálogo, tanda 1 (revisión del 25/09 de lo cargado desde el 10/09).
--
-- 1) Diez fichas nacidas como `material` que son herramientas: pasan a `herramienta`
--    (rubro "Herramientas y máquinas"). El trigger trg_material_clase_saca_de_mcc saca
--    de la cuenta del cliente los renglones no cobrados (percutor y cajón en CC-004, $0).
-- 2) Las que ya tenían tipo se fusionan con fusionar_tipo_herramienta:
--      2680 percutor chico            → 1113 Taladro percutor
--      2681 cajon de herramienta      → 1125 Caja de herramientas de mano (kit)
--      2682 pinza perro               → 839  Pinza de fuerza 10"
--      2722 escalera simple extencible→ 1101 Escalera extensible de aluminio
--      2784 escale multifucion        → 2785 Escalera multifunción
--    Sus movimientos de stock netean 0 (salida + ajuste), así que el stock del destino no cambia.
-- 3) Las nuevas quedan con nombre prolijo, sinónimos y el precio inventado de $11 en 0.
-- 4) Caño Awaduct duplicado: 2686 "caño awaduct 110 x 1m" → 2380 "Caño Awaduct 110mm x 1m"
--    (no es herramienta, se mueve a mano con el mismo criterio que la fusión).

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v_nota text;
  v_ren record;
begin
  -- 1) reclasificar
  update public.stock_materiales
     set clase = 'herramienta', rubro_id = 26, updated_by = v_user, updated_at = now()
   where id in (2680, 2681, 2682, 2683, 2684, 2685, 2722, 2767, 2784, 2785)
     and clase = 'material';

  -- 2) fusionar con el tipo que ya existía
  perform public.fusionar_tipo_herramienta(2680, 1113, v_user);
  perform public.fusionar_tipo_herramienta(2681, 1125, v_user);
  perform public.fusionar_tipo_herramienta(2682,  839, v_user);
  perform public.fusionar_tipo_herramienta(2722, 1101, v_user);
  perform public.fusionar_tipo_herramienta(2784, 2785, v_user);

  -- 3) nombre prolijo + sinónimos; el nombre nuevo baja a renglones y pañol que llevaban el viejo
  for v_ren in
    select * from (values
      (2683, 'Tijera de hojalatero',                   array['tijera hojalatero', 'tijera para chapa', 'tijera de chapa']),
      (2684, 'Remachadora manual',                     array['remachadora', 'pinza remachadora', 'remachadora pop']),
      (2685, 'Plegadora manual',                       array['plegadora', 'plegadora de chapa', 'pinza plegadora']),
      (2767, 'Pistola p/ sellador en salchicha 600ml', array['pistola 600ml', 'pistola salchicha', 'pistola para salchicha', 'pistola de sellador grande', 'pistola p/ cartucho de silicona 600ml']),
      (2785, 'Escalera multifunción',                  array['escalera multifuncion', 'escalera multiproposito', 'escalera articulada', 'escalera multiposicion'])
    ) as t(id, nombre, alias)
  loop
    update public.solicitud_compra_item i
       set descripcion = v_ren.nombre
      from public.stock_materiales m
     where m.id = v_ren.id and i.material_id = m.id and i.descripcion = m.nombre;

    update public.herr_entregas e
       set descripcion = v_ren.nombre, descripcion_norm = public.norm_txt(v_ren.nombre),
           updated_by = v_user, updated_at = now()
      from public.stock_materiales m
     where m.id = v_ren.id and e.material_id = m.id and e.descripcion = m.nombre;

    update public.stock_materiales m
       set alias = array(
             select distinct x
               from unnest(coalesce(m.alias, '{}'::text[]) || v_ren.alias || array[public.norm_txt(m.nombre)]) as x
              where coalesce(x, '') <> '' and public.norm_txt(x) <> public.norm_txt(v_ren.nombre)),
           nombre = v_ren.nombre, updated_by = v_user, updated_at = now()
     where m.id = v_ren.id;
  end loop;

  -- el $11 era un precio inventado por la alta vieja
  perform public.fijar_precio_ref(id, 0, 'sql', null, v_user)
     from public.stock_materiales where id in (2683, 2684, 2685) and precio_ref = 11;

  -- el pañol toma las herramientas cuando se toca material_id (§5.12)
  update public.solicitud_compra_item set material_id = material_id
   where material_id in (2683, 2684, 2685, 2767, 2785);

  -- 4) Awaduct 110 x 1m duplicado: 2686 → 2380
  v_nota := 'Ficha duplicada: "caño awaduct 110 x 1m" (#2686) → "Caño Awaduct 110mm x 1m" (#2380)';

  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', null, i.estado, v_nota,
         jsonb_build_object('motivo', 'ficha_duplicada', 'material_anterior', 2686, 'material_nuevo', 2380, 'user_id', v_user)
    from public.solicitud_compra_item i where i.material_id = 2686;

  update public.solicitud_compra_item
     set descripcion = case when descripcion = 'caño awaduct 110 x 1m' then 'Caño Awaduct 110mm x 1m' else descripcion end,
         material_id = 2380
   where material_id = 2686;

  update public.materiales_a_cuenta_cliente c
     set descripcion = 'Caño Awaduct 110mm x 1m', updated_at = now()
    from public.solicitud_compra_item i
   where c.item_id = i.id and i.material_id = 2380 and c.descripcion = 'caño awaduct 110 x 1m' and c.cobro_id is null;

  update public.stock_movimientos set material_id = 2380 where material_id = 2686;

  update public.stock_materiales d
     set stock_actual = d.stock_actual + o.stock_actual,
         alias = array(select distinct x from unnest(coalesce(d.alias, '{}'::text[]) || array['cano awaduct 110 x 1m', 'cano awaduct 110', 'awaduct 110 x 1']) x),
         updated_by = v_user, updated_at = now()
    from public.stock_materiales o
   where d.id = 2380 and o.id = 2686;

  update public.stock_materiales
     set activo = false, stock_actual = 0,
         obs = coalesce(obs || ' · ', '') || 'Duplicada de "Caño Awaduct 110mm x 1m" (#2380), unificada el 25/09/2026.',
         updated_by = v_user, updated_at = now()
   where id = 2686;
end
$m$;
