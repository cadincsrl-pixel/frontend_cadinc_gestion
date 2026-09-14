-- 9 DE JULIO 882 vuelve a ser obra de presupuesto cerrado
--
-- Es la reparacion del dano de un bug que yo mismo introduje HOY, y que la
-- revision adversarial habia predicho unas horas antes de que pasara.
--
-- QUE PASO, con hora:
--   ~12:0x  se despliega 7c1b56a, que muestra el panel COSTOS DE OBRA tambien
--           en las obras de presupuesto cerrado. Ese panel trae adentro un
--           boton "% Cambiar" que hasta ese momento solo se veia en llave en
--           mano, donde guardar porcentajes es inofensivo.
--   12:17:55 el dueno guarda porcentajes para CC-013: 0 / 0 / 0. Los tres en
--           CERO: no estaba cambiando de regimen, estaba mirando el panel.
--   12:17:55 el backend, en el mismo request, hace
--           `update obras set por_administracion = true` — porque en toda obra
--           que no sea llave en mano interpreta "cargar %" como "marcala por
--           administracion" (obras.service.ts, guardarAdminTarifa).
--
-- Resultado: la obra cambio de REGIMEN sin que nadie lo pidiera. El dueno lo
-- detecto solo, al preguntarme que tipo de obra era: "para mi es obra con
-- presupuesto".
--
-- NO SE MOVIO PLATA, verificado antes de tocar nada: 58 renglones, 54 al
-- cliente y 4 gasto propio (los EPP), 0 consumibles marcados, 0 renglones
-- tocados hoy, 0 imputaciones, 0 desalineados. El dano fue de pantalla: el
-- panel cambio de "costos" a "por administracion", se habilito "Imputar lo
-- pagado" y el PDF del cliente habria salido con 4 lineas en vez de 1.
--
-- El bug ya no se puede repetir: 54f295c deshabilita el editor de % del panel
-- de costos en toda obra que no sea llave en mano, con el motivo escrito en el
-- tooltip. Esto repara la obra que alcanzo a pasar.
--
-- Se borra tambien la fila de porcentajes 0/0/0, que no significa nada y seria
-- una mina: el codigo avisa que los porcentajes viejos de una obra "empiezan a
-- FACTURAR retroactivamente" el dia que alguien la marque por administracion.

delete from public.obras_admin_tarifas
 where obra_cod = 'CC-013'
   and desde = '2026-09-11'
   and pct_operarios = 0 and pct_contratistas = 0 and pct_materiales = 0;

update public.obras set por_administracion = false where cod = 'CC-013';
