-- 20260904w — Las fechas de precio del backfill, a mediodía UTC
--
-- 20260904v cargó `precio_actualizado_en` desde una fecha pura ('2026-08-28'),
-- que en timestamptz queda a las 00:00 UTC. El front la formatea en hora local
-- (Argentina, UTC-3) y la mostraba un día antes: 27/8 en vez de 28/8. Las que
-- escribe el trigger con now() tienen hora real y no tienen el problema.
-- Se corren a las 12:00 UTC (09:00 en Argentina): mismo día en cualquier huso
-- que use el sistema.

update public.stock_materiales
   set precio_actualizado_en = precio_actualizado_en + interval '12 hours'
 where precio_actualizado_en is not null
   and precio_actualizado_en::time = '00:00:00';
