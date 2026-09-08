-- CASA BELEN (CC-006): la cuenta del Excel entra al sistema
--
-- El user llevaba la cuenta real de la 2da etapa en un Excel (saldos_belen.xlsx)
-- y el sistema solo tenía los materiales. La conciliación del 08/09 cerró AL
-- PESO: los jornales del Excel y los del cálculo canónico coinciden en 6 de 8
-- semanas exacto (y las otras dos difieren $1.800 en total, horas corregidas
-- después de anotar), el 35% del Excel es el mismo 35% cargado en
-- obras_admin_tarifas, y el saldo se explica completo.
--
-- Tres movimientos, con OK del user:
--
-- 1. SE BORRA el cobro trucho de $1.389.680,71 (id 2, lo cargó el propio user
--    el 04/09): no era plata del cliente sino una forma de "saldar" los
--    materiales del sistema mientras la cuenta real vivía en el Excel. Igual a
--    la foto "materiales sistema $1.389.681" de la planilla. Con los cobros
--    reales adentro quedaría contado dos veces. Sus 28 renglones imputados
--    vuelven a "a cobrar", que es donde deben estar. (Ojo del futuro: los dos
--    jpegs "PAGOS ECHEQ TTE..." que parecían colgar de este cobro son de
--    cobros_adjuntos, que referencia a los cobros de LOGÍSTICA — id 2 repetido
--    entre módulos, nada que ver.)
--
-- 2. ENTRAN los 7 cobros reales del Excel: $9.000.000. El medio de pago no
--    estaba registrado en la planilla → 'otro' con la aclaración. Los dos de
--    $1.300.000 son ambos del 07/09 (confirmado por el user). El de abril es
--    anterior al inicio de la obra: un anticipo, es correcto que esté.
--
-- 3. ENTRAN los materiales comprados FUERA del sistema: Bercovich $1.394.000,
--    Chediac $183.799 y perfil C80 $69.838 = $1.647.637, como un pedido de
--    migración con sus tres renglones ya enviados y sus filas de cuenta. La
--    fecha real de cada compra no estaba en el Excel: fecha_resolucion de hoy
--    y la aclaración en el obs de cada renglón.
--
-- QUEDA AFUERA a propósito: "jornales 4-4: $417.150" (la semana pre-sistema
-- con cierre ~04/04). El propio Excel del user no la sumaba al saldo; no entra
-- hasta que él confirme si va y con qué %.
--
-- Saldo esperado tras esto: jornales $4.341.000 × 1,35 + materiales sistema
-- $1.397.221,37 + fuera del sistema $1.647.637 − $9.000.000 = −$94.791,63
-- (el cliente quedó $94.792 adelantado; el Excel decía −$104.762 y la
-- diferencia son los $2.430 de jornales con % y los $7.540 de renglones
-- posteriores a la foto).

-- ── 1. El cobro trucho ──
update public.materiales_a_cuenta_cliente
   set cobro_id = null, monto_cobrado = null, updated_at = now()
 where cobro_id = 2
   and obra_cod = 'CC-006';

delete from public.cuenta_cliente_cobros
 where id = 2 and obra_cod = 'CC-006' and monto = 1389680.71;

-- ── 2. Los cobros reales ──
insert into public.cuenta_cliente_cobros (obra_cod, fecha, monto, medio, obs)
values
  ('CC-006', '2026-04-27',  300000, 'otro', 'Migrado del Excel saldos_belen (2da etapa); medio no registrado.'),
  ('CC-006', '2026-05-29', 3000000, 'otro', 'Migrado del Excel saldos_belen (2da etapa); medio no registrado.'),
  ('CC-006', '2026-06-12',  600000, 'otro', 'Migrado del Excel saldos_belen (2da etapa); medio no registrado.'),
  ('CC-006', '2026-06-22',  500000, 'otro', 'Migrado del Excel saldos_belen (2da etapa); medio no registrado.'),
  ('CC-006', '2026-06-30', 2000000, 'otro', 'Migrado del Excel saldos_belen (2da etapa); medio no registrado.'),
  ('CC-006', '2026-09-07', 1300000, 'otro', 'Migrado del Excel saldos_belen (2da etapa); medio no registrado. Primero de dos pagos iguales del mismo día.'),
  ('CC-006', '2026-09-07', 1300000, 'otro', 'Migrado del Excel saldos_belen (2da etapa); medio no registrado. Segundo de dos pagos iguales del mismo día.');

-- ── 3. Las compras fuera del sistema ──
with pedido as (
  insert into public.solicitud_compra (obra_cod, fecha, estado, prioridad, obs)
  values ('CC-006', '2026-09-08', 'aprobada', 'normal',
          '[migración] Compras de la 2da etapa hechas fuera del sistema, tomadas del Excel saldos_belen el 08/09. Fechas reales de compra no registradas.')
  returning id
),
items as (
  insert into public.solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit, proveedor_id,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  select p.id, x.descripcion, 1, 'unid', 'enviado', x.precio, x.proveedor_id,
         1, '2026-09-08', '2026-09-08',
         'Compra fuera del sistema (Excel 2da etapa); fecha real no registrada.'
  from pedido p,
       (values
         ('Compras Bercovich (fuera del sistema)', 1394000::numeric, 38),
         ('Compras Chediac (fuera del sistema)',    183799::numeric, 27),
         ('Perfil C80 (fuera del sistema)',          69838::numeric, null::int)
       ) as x(descripcion, precio, proveedor_id)
  returning id, solicitud_id, descripcion, cantidad, unidad, precio_unit, proveedor_id
)
insert into public.materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, proveedor_id, fecha_resolucion, pagado_por)
select 'CC-006', i.solicitud_id, i.id, i.descripcion, i.cantidad, i.unidad,
       i.precio_unit, round(i.cantidad * i.precio_unit, 2), 'proveedor',
       i.proveedor_id, '2026-09-08', 'cadinc'
from items i;
