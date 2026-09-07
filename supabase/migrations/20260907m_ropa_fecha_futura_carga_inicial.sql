-- 20260907m — Las 9 entregas de ropa con fecha futura vuelven al 10/04/2026 (user 2026-09-07)
--
-- Nueve entregas (ids 13 a 21) tenían `fecha_entrega = 2026-12-10`, tres meses
-- en el futuro: legajos 017 BARROJO FRANCO, 059 SAGANIA CARLOS ALBERTO y
-- 060 SAGANIA JOSE, con pantalón, botines y camisa cada uno.
--
-- POR QUÉ IMPORTA: una entrega con fecha futura NUNCA vence. El vencimiento se
-- calcula sumándole los meses de la categoría a la fecha de entrega, así que
-- queda todavía más adelante y la prenda figura "al día" para siempre,
-- invisible en el filtro de vencidos.
--
-- LA FECHA CORRECTA ES 2026-04-10, y la evidencia es la propia carga inicial:
-- todos los demás registros tienen `fecha_entrega` = el día en que se cargaron.
--
--   ids  1– 3  AGUERO            created_at 2026-04-09   fecha_entrega 2026-04-09  ✓
--   ids 13–21  los tres de acá   created_at 2026-04-10   fecha_entrega 2026-12-10  ✗
--   ids 22–30  ARDILES/JIMENEZ…  created_at 2026-04-15   fecha_entrega 2026-04-15  ✓
--
-- Se equivocaron de MES: pusieron 12 donde iba 04. (Mi primera sospecha fue
-- diciembre de 2025; los ids bajos la descartaron.)
--
-- OJO CON EL EFECTO: con 6 meses de vencimiento, 10/04/2026 vence el
-- 10/10/2026. Hoy es 07/09/2026, así que estas prendas NO pasan a vencidas
-- todavía: les falta poco más de un mes. Lo que se arregla es que ahora tienen
-- un vencimiento real y van a aparecer cuando corresponda, en vez de quedar
-- verdes para siempre.
--
-- Que se vuelva a cargar una entrega futura ya está bloqueado en el backend
-- (`exigirFechaNoFutura`, commit 6a0ded2) y en el modal (commit c53cf3a).

update public.ropa_entregas
   set fecha_entrega = '2026-04-10',
       obs = case
               when coalesce(obs, '') = '' then 'Fecha corregida 2026-09-07: figuraba 2026-12-10 (mes mal tipeado); se cargó el 10/04/2026.'
               else obs || ' · Fecha corregida 2026-09-07: figuraba 2026-12-10 (mes mal tipeado); se cargó el 10/04/2026.'
             end
 where fecha_entrega = '2026-12-10'
   and leg in ('017', '059', '060')
   and created_at::date = '2026-04-10';
