-- Limpieza del catálogo, tanda 4 (dueño, 25/09: «que vayan por pedido como servicio»).
--
-- Estacionamiento, permiso de carga y descarga y contenedor se piden por Pedidos, como SERVICIO.
-- 1) Fichas nuevas (rubro Servicios, clase servicio): estacionamiento y permiso de carga y descarga.
--    Contenedor ya tenía ficha (2758).
-- 2) Los 6 renglones de texto libre se vinculan a su ficha. No cambian precio, cantidad ni la cuenta
--    del cliente: a_cargo_de sigue igual (servicio no es epp/herramienta); solo el nombre.
-- 3) "diesel" es combustible (material): sinónimo en Gasoil (847, por litro). El renglón 4280
--    NO se vincula: se compró "1 unid" a $67.000 (una carga en plata) y colgado de una ficha por
--    litro ensuciaría la última compra del catálogo.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v_est int;
  v_per int;
begin
  insert into public.stock_materiales (rubro_id, nombre, unidad, stock_actual, precio_ref, activo, clase, alias, created_by, updated_by)
  values (28, 'Estacionamiento de vehículos (servicio)', 'unid', 0, 0, true, 'servicio',
          array['estacionamiento', 'estacionamiento vehiculos', 'estacionamiento de vehiculos', 'cochera', 'playa de estacionamiento'],
          v_user, v_user)
  returning id into v_est;

  insert into public.stock_materiales (rubro_id, nombre, unidad, stock_actual, precio_ref, activo, clase, alias, created_by, updated_by)
  values (28, 'Permiso de carga y descarga (servicio)', 'unid', 0, 0, true, 'servicio',
          array['permiso carga y descarga', 'permiso de carga', 'permiso de descarga', 'permiso municipal carga y descarga'],
          v_user, v_user)
  returning id into v_per;

  create temp table _vinc (item_id int, material_id int) on commit drop;
  insert into _vinc values
    (4349, v_est), (4344, v_est), (4347, v_est), (4276, v_est),
    (4345, v_per),
    (4576, 2758);

  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', null, i.estado,
         'Texto libre "' || trim(i.descripcion) || '" vinculado al servicio "' || m.nombre || '" (#' || m.id || ')',
         jsonb_build_object('motivo', 'vincular_servicio', 'material_nuevo', m.id, 'user_id', v_user)
    from public.solicitud_compra_item i
    join _vinc v on v.item_id = i.id
    join public.stock_materiales m on m.id = v.material_id
   where i.material_id is null;

  update public.materiales_a_cuenta_cliente c
     set descripcion = m.nombre, updated_at = now()
    from _vinc v
    join public.stock_materiales m on m.id = v.material_id
    join public.solicitud_compra_item i on i.id = v.item_id
   where c.item_id = v.item_id and i.material_id is null
     and c.cobro_id is null and c.certificado_id is null;

  update public.solicitud_compra_item i
     set material_id = v.material_id, clase = 'servicio', descripcion = m.nombre
    from _vinc v
    join public.stock_materiales m on m.id = v.material_id
   where i.id = v.item_id and i.material_id is null;

  -- diesel = gasoil (material, por litro)
  update public.stock_materiales
     set alias = array(select distinct x from unnest(coalesce(alias, '{}'::text[]) || array['diesel', 'gas oil', 'gasoil x litro', 'combustible diesel']) x),
         updated_by = v_user, updated_at = now()
   where id = 847;
end
$m$;
