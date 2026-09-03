-- =====================================================================
-- Tres alias que mandaban al producto equivocado (colocación de cerámicos)
--
-- Salieron de revisar el pedido #651 de Lamadrid (CC-016). Probando los
-- textos crudos del mensaje de obra contra el catálogo:
--
--   "cortadora ceramica" → Rueda de REPUESTO p/ cortadora (883)
--   "cuñas"             → Cuña de madera p/ ENCOFRADO (901)
--   "llana del 12"      → nada (existía el plural "llanas del 12", no el
--                          singular; norm_material no saca plurales)
--
-- Los dos primeros no es que fallaran: devolvían con confianza el producto
-- equivocado, que es peor que no encontrar nada.
-- =====================================================================

-- ── 1. El alias de la cortadora estaba en el repuesto ────────────────
-- 883 sigue con sus "repuesto de..." que sí le corresponden.
update public.stock_materiales
set alias = (select coalesce(array_agg(a order by a), '{}')
             from unnest(alias) a
             where public.norm_material(a) <> public.norm_material('cortadora ceramica'))
where id = 883;

-- ── 2. La cortadora (creada el 03/09 sin alias y en minúscula) ───────
-- Se normaliza el nombre a la convención del catálogo y se le dan los
-- alias que antes se llevaba el repuesto.
update public.stock_materiales
set nombre = 'Cortadora de cerámica',
    alias  = array['cortadora ceramica','cortadora ceramicos',
                   'cortadora manual de ceramica','cortadora de porcelanato'],
    obs    = 'Herramienta que se presta a la obra y vuelve: cargarla con devuelve=true. El repuesto de la rueda es el material 883.'
where id = 943;

-- ── 3. "cuñas" a secas es ambiguo: no lleva alias ───────────────────
-- En encofrado son las de madera (901); en colocación de pisos son las
-- del sistema nivelador (555). Misma regla que con "bolsa de
-- separadores": si un texto significa cosas distintas según la obra, se
-- elige a mano. Quedan sólo los alias que dicen de cuál se habla.
update public.stock_materiales
set alias = array['cuna de madera','cunas de madera','cunas de encofrado','cunas para encofrado']
where id = 901;

-- ── 4. Plural/singular de la llana ──────────────────────────────────
update public.stock_materiales m
set alias = (select array_agg(distinct a order by a)
             from unnest(coalesce(m.alias,'{}') || array['llana del 12','llana 12']) a)
where m.id = 775;
