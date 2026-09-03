-- =====================================================================
-- Huecos del catálogo que destapó el pedido de Farmacia America (#650)
--
-- De 13 renglones, 6 no encontraban fila. El user confirmó qué era cada uno:
--   · "placas boar"        → Placa Superboard, espesor 10mm
--   · "placas ocb"         → OSB, espesor 15mm
--   · "manto de aislacion" → lana de vidrio de 50mm (18 m2 → la fila por m2,
--                            no la de rollo)
--   · "T2 boar"            → tornillo T2 punta mecha CON ALAS. No existía:
--                            es distinto del T2 punta mecha comun (766), que
--                            en el mismo pedido se pide aparte.
--   · "T2 agujas"          → T2 punta aguja (77). Fallaba solo por el plural:
--                            norm_material baja a minusculas y saca tildes,
--                            pero no plurales.
--   · "perfil PGU"/"PGC"   → steel framing. NO se dan de alta acá: falta la
--                            medida y el catalogo la lleva en el nombre.
--
-- Ojo con los alias genericos ('boar', 'osb', 'manto de aislacion'): apuntan
-- al espesor/tipo que usa CADINC hoy. Si una obra pide boar de 6 u 8, o lana
-- de otro espesor, el alias la manda a la fila equivocada — ahi hay que
-- sacarlo y elegir a mano (misma leccion que el porcelanato 58x58).
--
-- Verificado antes de aplicar: ninguno de estos 24 alias choca con el nombre
-- ni con un alias de otro material activo.
-- =====================================================================

-- ── 1. Alta: el tornillo con alas para placa cementicia ──────────────
insert into public.stock_materiales (rubro_id, nombre, unidad, activo, clase, alias, obs)
select 3, 'Tornillo T2 punta mecha c/ alas', 'unid', true, 'material',
       array['t2 boar','t2 board','t2 con alas','t2 mecha con alas',
             't2 punta mecha con alas','tornillo t2 con alas',
             'tornillos t2 para superboard','t2 para superboard'],
       'Autoperforante con aletas para fijar placa cementicia (Superboard) sobre perfil. No confundir con el T2 punta mecha comun (766).'
where not exists (
  select 1 from public.stock_materiales
  where activo and public.norm_material(nombre) = public.norm_material('Tornillo T2 punta mecha c/ alas')
);

-- ── 2. Alias que faltaban en filas que ya existian ───────────────────
-- Se agregan sin pisar los alias previos y sin duplicar si ya estaban.
update public.stock_materiales m
set alias = (
  select array_agg(distinct a order by a)
  from unnest(coalesce(m.alias,'{}') || v.nuevos) a
)
from (values
  (77,  array['t2 agujas']),
  (286, array['boar','placa boar','placas boar','placas superboard','superboard']),
  (594, array['ocb','osb','placa ocb','placas ocb','placa osb','placas osb']),
  (83,  array['manto de aislacion','manto aislante','manto de lana de vidrio','lana de vidrio 50'])
) as v(id, nuevos)
where m.id = v.id;
