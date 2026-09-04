-- 20260904az — Herramientas dadas de alta "a las apuradas" desde el pedido: se funden en su tipo
--
-- Los pedidos #669 y #671 (04/09) no salieron como texto libre: el buscador
-- del pedido no encontró "rotormartillo electrico" (tiene una r de más) ni
-- "rotormartillo a bateria", y el "＋ Crear" del combobox les dio de alta
-- filas nuevas en minúscula, clase material (952, 953, 954, 1016). Son
-- duplicados de los tipos cargados en 20260904av. Se funden: los ítems pasan
-- al tipo canónico, el ledger se refresca, las filas quedan de baja y las
-- variantes con la erre de más quedan como sinónimos para la próxima.

create temp table fusion (junk_id int, canon text);
insert into fusion values
  (952,  'Caja de herramientas de mano (kit)'),
  (953,  'Rotomartillo (SDS-plus)'),
  (954,  'Atornillador a batería'),
  (1016, 'Rotomartillo (SDS-plus)');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'herramientas al catalogo 2026-09-04', 'material_id', m.id, 'material_anterior', i.material_id, 'desc_canonica', m.nombre)
from fusion f
join public.solicitud_compra_item i on i.material_id = f.junk_id
join public.stock_materiales m on m.nombre = f.canon;

update public.solicitud_compra_item i
   set material_id = m.id, descripcion = m.nombre, clase = 'herramienta'
  from fusion f join public.stock_materiales m on m.nombre = f.canon
 where i.material_id = f.junk_id;

-- La escalera de #669 ya apuntaba a la fila canónica pero conservó el texto en minúscula.
update public.solicitud_compra_item set descripcion = 'Escalera tijera de aluminio' where id = 3335 and material_id = 956;

update public.herr_entregas e
   set descripcion = m.nombre, descripcion_norm = public.norm_txt(m.nombre), material_id = m.id, updated_at = now()
  from public.solicitud_compra_item i join public.stock_materiales m on m.id = i.material_id
 where e.item_id = i.id and e.estado <> 'anulada'
   and i.id in (3323, 3324, 3325, 3353, 3335)
   and (e.descripcion is distinct from m.nombre or e.material_id is distinct from m.id);

update public.stock_materiales s
   set activo = false,
       obs = coalesce(obs || ' · ', '') || 'Baja 2026-09-04: alta rápida desde el pedido, duplicada de "' || f.canon || '".'
  from fusion f where s.id = f.junk_id;

drop table fusion;

update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['rotormartillo','rotormartillo electrico','rotormartillo a bateria','rotor martillo electrico','rotomartillo electrico','rotomartillo a bateria']))
 where nombre = 'Rotomartillo (SDS-plus)';
update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['atornillador a bateria','atornilladora a bateria con cargador']))
 where nombre = 'Atornillador a batería';
