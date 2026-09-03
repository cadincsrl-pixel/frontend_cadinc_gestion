-- =====================================================================
-- Alta de la línea de steel framing: PGU y PGC 100mm
--
-- Los dos renglones que quedaban en texto libre del pedido de Farmacia
-- America (#650). Medida confirmada por el user: 100mm.
--
-- No confundir con solera/montante de Durlock (73/71): esos son perfiles de
-- chapa para tabique NO portante; PGU/PGC son los de steel framing, y en el
-- mismo pedido la obra los pide por separado.
--
-- Sin largo en el nombre a propósito: el user dio el ancho, que es lo que
-- define qué se compra. Si después se estandariza un largo (6m suele ser lo
-- que viene), se renombra.
--
-- Los alias genéricos 'pgu'/'pgc' apuntan al 100mm, que es lo que usan hoy.
-- Si alguna obra pide PGU de otra medida, hay que sacarlos y elegir a mano.
-- =====================================================================

insert into public.stock_materiales (rubro_id, nombre, unidad, activo, clase, alias, obs)
select v.rubro, v.nombre, 'unid', true, 'material', v.alias, v.obs
from (values
  (3, 'Perfil PGU 100mm', array['pgu','perfil pgu','pgu 100','perfil pgu 100','perfil pgu 100mm'],
      'Steel framing: perfil galvanizado U (solera de la estructura). No es la solera de Durlock (73).'),
  (3, 'Perfil PGC 100mm', array['pgc','perfil pgc','pgc 100','perfil pgc 100','perfil pgc 100mm'],
      'Steel framing: perfil galvanizado C (montante de la estructura). No es el montante de Durlock (71).')
) as v(rubro, nombre, alias, obs)
where not exists (
  select 1 from public.stock_materiales m
  where m.activo and public.norm_material(m.nombre) = public.norm_material(v.nombre)
);
