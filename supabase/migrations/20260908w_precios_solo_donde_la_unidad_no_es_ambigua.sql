-- 20260908q — Se cargan los precios que faltaban, pero SOLO donde la unidad del
-- renglon no deja lugar a dudas (user 2026-09-07: "repasa los materiales de
-- todas las obras a ver que podes poner precio ... sin necesitarme")
--
-- Despues de meter la pata con la pintura (ver 20260908p), la regla ahora es
-- explicita. Se tasa cuando:
--   a) la unidad del renglon es LA MISMA que la de la ficha, o
--   b) el renglon dice "unid" y la ficha es un ENVASE CONTABLE (bolsa, balde,
--      lata, rollo, juego, unid): ahi "1 unid" solo puede querer decir "1 de
--      esos", no hay factor de conversion posible.
--
-- NO se tasa cuando el renglon dice "unid" y la ficha se mide por magnitud
-- continua (m, m2, kg, lt, tn) -- "1 unid" de un material que se vende por
-- metro no dice cuantos metros son -- ni cuando las dos unidades son
-- magnitudes distintas.
--
-- El reparto es elocuente y explica por que hoy me equivoque:
--   SEGUROS   173 renglones -> $ 3.668.867
--   AMBIGUOS   35 renglones -> $20.951.870   <-- toda la plata grande esta aca
--
-- Ninguno de los tasados esta cobrado. Los 35 ambiguos quedan en $0 y con el
-- motivo escrito en la observacion del renglon.
update public.materiales_a_cuenta_cliente m
set precio_unit  = sm.precio_ref,
    precio_total = m.cantidad * sm.precio_ref
from public.solicitud_compra_item i, public.stock_materiales sm
where i.id = m.item_id and sm.id = i.material_id
  and coalesce(m.precio_unit, 0) = 0
  and coalesce(sm.precio_ref, 0) > 0
  and m.cobro_id is null
  and (m.unidad = sm.unidad
       or (m.unidad = 'unid' and sm.unidad in ('unid','bolsa','balde','lata','rollo','juego')));

update public.solicitud_compra_item i
set precio_unit = m.precio_unit
from public.materiales_a_cuenta_cliente m
where m.item_id = i.id
  and coalesce(i.precio_unit, 0) = 0
  and coalesce(m.precio_unit, 0) > 0;

-- Los ambiguos quedan marcados, para que no haya que volver a descubrirlos.
update public.solicitud_compra_item i
set obs = coalesce(i.obs || ' · ', '') ||
      'SIN TASAR POR UNIDAD AMBIGUA: el renglon esta en "' || i.unidad ||
      '" y la ficha se mide por "' || sm.unidad || '" ($' ||
      to_char(sm.precio_ref, 'FM999G999G999D00') || '). Falta saber la equivalencia antes de ponerle precio.'
from public.stock_materiales sm
where sm.id = i.material_id
  and coalesce(i.precio_unit, 0) = 0
  and coalesce(sm.precio_ref, 0) > 0
  and i.unidad is distinct from sm.unidad
  and not (i.unidad = 'unid' and sm.unidad in ('unid','bolsa','balde','lata','rollo','juego'))
  and coalesce(i.obs, '') not like '%UNIDAD AMBIGUA%'
  and coalesce(i.obs, '') not like '%REVISAR UNIDAD%';
