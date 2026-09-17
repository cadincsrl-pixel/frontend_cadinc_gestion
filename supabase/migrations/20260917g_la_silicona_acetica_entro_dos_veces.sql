-- Las 9 siliconas acéticas: la compra de 5 se cargó dos veces
--
-- El user, 17/09: "en el depósito me sale que tenemos 9 siliconas
-- transparentes". El número está mal, pero no por lo que él pensaba (creía que
-- eran las blancas que se habían enviado a San Martín). Es más simple y más
-- viejo.
--
-- LA FICHA es la 401, "Silicona acética transp. 280ml", y sus tres movimientos
-- son toda la historia:
--
--   mov 25   29/05 11:39:45   entrada 5   compra, renglón 70
--   mov 26   29/05 11:40:42   entrada 5   compra, renglón 70   <- el mismo renglón
--   mov 536  11/09            salida  1   despacho a CC-004
--                                        ────────────────────
--                                              saldo 9
--
-- Las dos entradas apuntan AL MISMO renglón 70, con 57 segundos de diferencia.
-- Y el renglón 70 pidió 5 unidades y tiene `cantidad_enviada = 5`. O sea que
-- entraron 10 al stock por una compra de 5: la recepción se cargó dos veces
-- (doble click, o dos personas cargando lo mismo).
--
-- El saldo correcto de los papeles es 5 − 1 = 4.
--
-- POR QUÉ UN AJUSTE Y NO BORRAR EL MOVIMIENTO. Borrar mov 26 dejaría la
-- aritmética limpia pero taparía la única evidencia de que la recepción se
-- carga dos veces, que es un problema que va a volver a pasar. El ajuste deja
-- las dos cosas: el saldo correcto y el rastro del error. Misma convención que
-- la limpieza de negativos de esta mañana (20260917a).
--
-- LO QUE ESTO NO RESUELVE. 4 es el número que dicen los papeles, no el que hay
-- en el estante. Si el depósito tiene menos de 4, salieron sin registrarse y
-- eso sale de un recuento físico, no de acá.
--
-- DE PASO, LO QUE EL USER PREGUNTÓ: las siliconas BLANCAS (ficha 150) NO
-- estaban en negativo y la limpieza de hoy no las tocó. Tienen CERO movimientos
-- en toda su historia y el saldo en 0 — nunca entró ni salió una. No se perdió
-- ninguna información ahí. Las que sí venían en negativo eran la 149
-- "Silicona transparente 280ml" (−2) y la 402 "Silicona neutra transp. 280ml"
-- (−3), y la 402 es justamente la que se despachó ayer al techo de San Martín.

insert into public.stock_movimientos
  (material_id, tipo, cantidad, motivo, sub_motivo, obs, fecha, estado, aprobado_at)
values
  (401, 'ajuste', -5, 'ajuste_inventario', 'error_carga',
   'La recepción del renglón 70 (compra de 5 el 29/05) se cargó DOS veces: '
   'movimientos 25 y 26, entradas de 5 con 57 segundos de diferencia y el mismo '
   'renglón. El renglón pidió 5 y al stock entraron 10. Se descuentan las 5 de '
   'más: el saldo de los papeles pasa de 9 a 4. Migración 20260917g. '
   'El número del estante sale de un recuento físico.',
   current_date, 'aprobado', now());

update public.stock_materiales
   set stock_actual = 4,
       updated_at   = now()
 where id = 401
   and stock_actual = 9;
