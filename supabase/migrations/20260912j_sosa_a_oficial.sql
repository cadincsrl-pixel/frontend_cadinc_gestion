-- Cristian Sosa (066) pasa a Oficial Albañil desde la semana en curso
-- (Renombrada de 20260911r el 09/09: ese prefijo lo tomó otra sesión en
--  paralelo. Aplicada realmente el 08/09 a la noche; el contenido manda.)
--
-- Pedido del user (08/09): "pasemos a Cristian Sosa en tarja a oficial, si es
-- posible que este viernes ya cobre como oficial".
--
-- Hoy es martes 08/09; la semana en curso arrancó el viernes 04/09 y cierra el
-- jueves 10/09 — es la que se paga ESTE viernes 11/09. Por eso el cambio rige
-- desde el 2026-09-04 y no desde el 11: con el 11 la semana que cobra el
-- viernes saldría todavía a precio de medio oficial.
--
-- Es una fecha pasada, pero no pisa nada cerrado: la semana 04/09 no tiene
-- cierre en ninguna obra y Sosa todavía no tiene horas cargadas en ella (su
-- última carga es del jueves 03/09, cierre de la semana anterior). Las semanas
-- anteriores conservan Medio Oficial: el historial es por tramos.
--
--   cat 2 Medio Oficial   $4.200/h
--   cat 1 Oficial Albañil $4.900/h   (precio global vigente desde 2026-07-24)
--
-- Sin overrides que compitan: Sosa no tiene fila en cat_obra y CC DEPOSITO
-- —donde carga sus horas— no tiene tarifas propias, así que rige el global.

insert into personal_cat_historial (leg, cat_id, desde)
values ('066', 1, '2026-09-04')
on conflict (leg, desde) do update set cat_id = excluded.cat_id;

update personal set cat_id = 1 where leg = '066';
