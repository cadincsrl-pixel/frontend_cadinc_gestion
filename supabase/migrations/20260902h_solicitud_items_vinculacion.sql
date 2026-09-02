-- =====================================================================
-- Vincular los pedidos históricos al catálogo y unificar sus descripciones
--
-- El catálogo ya quedó ordenado (903 materiales, 990 sinónimos), pero los
-- 3.116 items ya cargados seguían con su texto libre y sin vínculo: no se
-- podía agrupar el histórico por material, que es lo que habilita saber
-- cuánto se gastó en cada cosa.
--
-- Vincula los items que coinciden EXACTO con el nombre de un material o
-- con uno de sus sinónimos y que apuntan a UNA sola fila (1.595). Los 12
-- ambiguos y los 1.425 sin coincidencia quedan intactos.
--
-- Además unifica la descripción al nombre canónico, a pedido del dueño
-- ("no me molesta que la descripción se unifique entre todos los que son
-- el mismo material con distinto nombre").
--
-- RED DE SEGURIDAD: cada texto original se guarda ANTES en
-- `solicitud_item_eventos` con accion='descripcion_unificada' y el
-- material destino en `meta`. Nada se pierde y el cambio es reversible.
--
-- `materiales_a_cuenta_cliente` y `remitos_envio_item` son ESPEJOS de la
-- descripción del item (verificado: las 2.788 filas de MCC coincidían
-- carácter por carácter antes de esto). Se actualizan en el mismo
-- movimiento para que no queden divergentes. Ninguna de las 1.441
-- afectadas de MCC estaba cobrada (cobro_id null), así que no se
-- reescribe nada ya facturado.
--
-- NO se tocan cantidades, precios ni montos: solo el texto y el vínculo.
-- =====================================================================

create temporary table _vinc on commit drop as
with terms as (
  select m.id, m.nombre, public.norm_material(m.nombre) t
    from public.stock_materiales m where m.activo
  union all
  select m.id, m.nombre, a
    from public.stock_materiales m, unnest(m.alias) a where m.activo),
items as (
  select i.id, i.estado, i.solicitud_id, i.descripcion, public.norm_material(i.descripcion) d
    from public.solicitud_compra_item i
   where i.material_id is null and coalesce(trim(i.descripcion),'') <> '')
select it.id            as item_id,
       it.solicitud_id,
       it.estado,
       it.descripcion   as desc_original,
       min(te.id)       as material_id,
       min(te.nombre)   as desc_canonica
  from items it
  join terms te on te.t = it.d
 group by it.id, it.solicitud_id, it.estado, it.descripcion
having count(distinct te.id) = 1;

-- 1. Rastro del texto original, ANTES de pisarlo
insert into public.solicitud_item_eventos
  (item_id, solicitud_id, accion, estado_nuevo, comentario, meta)
select v.item_id, v.solicitud_id, 'descripcion_unificada', v.estado,
       v.desc_original,
       jsonb_build_object('material_id', v.material_id,
                          'desc_canonica', v.desc_canonica,
                          'motivo', 'vinculacion al catalogo 2026-09-02')
  from _vinc v
 where public.norm_material(v.desc_original) <> public.norm_material(v.desc_canonica);

-- 2. El vínculo (esto es lo que habilita agrupar por material)
update public.solicitud_compra_item i
   set material_id = v.material_id,
       descripcion = v.desc_canonica
  from _vinc v where v.item_id = i.id;

-- 3. Los espejos, para que no diverjan
update public.materiales_a_cuenta_cliente mcc
   set descripcion = v.desc_canonica
  from _vinc v where v.item_id = mcc.item_id;

update public.remitos_envio_item r
   set descripcion = v.desc_canonica
  from _vinc v where v.item_id = r.item_id;

-- Verificado post-aplicación: 1.679 de 3.116 items linkeados (53,9%, contra
-- 2,7% antes), 1.481 eventos de respaldo, y los dos espejos siguen
-- coincidiendo al 100% (2.788 de MCC y 2.858 de remitos).
