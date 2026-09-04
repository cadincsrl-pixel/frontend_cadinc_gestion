-- 20260904aw — Escalera tijera: la fila ya existía en minúscula y 32 renglones quedaron sin vincular
--
-- 20260904av insertaba "Escalera tijera de aluminio" solo si no existía
-- (comparando en minúscula) y vinculaba por nombre exacto. Existía la fila
-- 956 "escalera tijera de aluminio" (material, Ferretería, 1 renglón): no se
-- insertó la nueva y el vínculo exacto no encontró nada. Acá se recicla la
-- 956 como la fila canónica, se le suman los sinónimos, se vinculan los 32
-- renglones y se funde en ella la 947 "escalera tijera extencible" (2 renglones).

update public.stock_materiales
   set nombre = 'Escalera tijera de aluminio',
       clase = 'herramienta',
       rubro_id = (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'),
       alias = array(select distinct unnest(alias || array['escalera','escaleras','escalera tijera','escalera de tijera','escalera aluminio','escalera de aluminio','escalera de aluminio chica','escalera aluminio tijera','escalera tijera aluminio','escalera 5 peldaños','escalera 8 peldaños','escalera 9 peldaños','escalera 11 peldaños','escalera 12 peldaños','escalera 14 peldaños','escalera 16 peldaños','escalera pintores','escalera de pintores','escalera aluminio pintores','escalera martel','escalera tijera extensible','escalera extensible tijera','escalera tijera extencible','escalera nueva','escalera doble'])),
       obs = coalesce(obs || ' · ', '') || 'Tipo de herramienta del pañol (2026-09-04); la unidad concreta es la ficha HER. Absorbe la fila "escalera tijera extencible".'
 where id = 956;

create temp table vinc (item_id int);
insert into vinc select unnest(array[1508,1799,1733,3027,3162,3116,1950,1220,528,1038,1168,1246,1004,3174,266,882,1374,2042,3136,3180,573,218,708,2537,1403,2623,383,2859,2208,538,2070,2036]);
-- los de la fila duplicada 947 también
insert into vinc select id from public.solicitud_compra_item where material_id = 947;

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.descripcion,
       jsonb_build_object('motivo', 'herramientas al catalogo 2026-09-04', 'material_id', 956, 'material_anterior', i.material_id, 'desc_canonica', 'Escalera tijera de aluminio')
from vinc v join public.solicitud_compra_item i on i.id = v.item_id
where i.material_id is distinct from 956;

update public.solicitud_compra_item i
   set material_id = 956, descripcion = 'Escalera tijera de aluminio', clase = 'herramienta'
  from vinc v where i.id = v.item_id and i.material_id is distinct from 956;

update public.herr_entregas e
   set descripcion = 'Escalera tijera de aluminio', descripcion_norm = public.norm_txt('Escalera tijera de aluminio'), material_id = 956, updated_at = now()
  from vinc v
 where e.item_id = v.item_id and e.estado <> 'anulada'
   and (e.descripcion is distinct from 'Escalera tijera de aluminio' or e.material_id is distinct from 956);

drop table vinc;

update public.stock_materiales set activo = false, obs = coalesce(obs || ' · ', '') || 'Baja 2026-09-04: duplicada de "Escalera tijera de aluminio" (956).'
 where id = 947;
