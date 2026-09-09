-- 20260911z — Cierre de los pendientes del recuento (user 08/09 noche).
--
-- CASCOS: Sosa conto 13 en la ficha 643 (10 de un modelo y 3 del otro); el
-- user: "cascos amarillos 10, cascos blancos 3". La 643 pasa a ser la del
-- amarillo (ya tenia los alias "casco amarillo") y se abre una ficha para el
-- blanco con el mismo precio de referencia hasta la primera compra. Se mueven
-- 3 unidades con dos ajustes de inventario aprobados (-3 / +3).
--
-- ARNESES (656): los 2 a los que les falta la pieza del enganche se arreglan
-- (user). Siguen fuera del stock (4) hasta que esten; queda anotado.
--
-- PORCELANATO 58x58 (910, por m2): Sosa conto 10 cajas, 2 de otro modelo. El
-- user: "no importan las cajas, importan los m2". La factura de Lamadrid
-- (Zeramiko 00051-00008710, 30/07) dice 36 m2 de "porcelanato SL 58x58" y no
-- esta escaneada en el sistema, asi que no se le puede leer el contenido de
-- la caja. San Lorenzo 58x58 rinde 1,35 m2 por caja (4 piezas) en casi todas
-- sus lineas (Urba, De Jura, Moods; solo las de 5 piezas rinden 1,68). Se
-- cargan 10 x 1,35 = 13,5 m2. Si esas cajas son el sobrante de la compra de
-- Lamadrid (pagada por el cliente), no son stock de CADINC sino material del
-- cliente en deposito: avisar y se mueve.

-- ═══ cascos ═══════════════════════════════════════════════════════════════
update public.stock_materiales
   set nombre = 'Casco seguridad amarillo c/ arnés',
       alias  = array(select distinct x from unnest(alias || array['casco seguridad amarillo','casco de seguridad','casco de seguridad amarillo']) x order by x),
       obs    = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: pasa a ser la ficha del casco AMARILLO. Los 3 blancos del recuento van a su propia ficha.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 643 and nombre = 'Casco seguridad c/ arnés';

do $$
declare
  v_id int;
begin
  insert into public.stock_materiales (rubro_id, nombre, unidad, stock_actual, precio_ref, alias, clase, activo, usa_color, obs)
  values (15, 'Casco seguridad blanco c/ arnés', 'unid', 0, 0,
          array['casco blanco','cascos blancos','casco seguridad blanco','casco de seguridad blanco'],
          'epp', true, false,
          'Alta 08/09/2026 (recuento): 3 cascos blancos que estaban contados junto con los amarillos en la ficha 643. Precio de referencia copiado del amarillo hasta la primera compra.')
  returning id into v_id;

  perform public.fijar_precio_ref(v_id, 4874.06, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);

  insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, created_by, obs)
  values (v_id, 'ajuste', 3, 'ajuste_inventario', 'otro', 'aprobado', date '2026-09-08',
          'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
          'Recuento 08/09 (Sosa): 3 cascos blancos, separados de la ficha 643 (Casco seguridad amarillo).');

  update public.stock_materiales set stock_actual = 3, updated_at = now() where id = v_id;

  insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, created_by, obs)
  select 643, 'ajuste', -3, 'ajuste_inventario', 'otro', 'aprobado', date '2026-09-08',
         'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
         'Recuento 08/09: de los 13, 3 son blancos y pasan a la ficha ' || v_id || ' (Casco seguridad blanco). Quedan 10 amarillos.'
    from public.stock_materiales where id = 643 and stock_actual = 13;

  update public.stock_materiales
     set stock_actual = 10, updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
   where id = 643 and stock_actual = 13;
end $$;

-- ═══ arneses ══════════════════════════════════════════════════════════════
update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: hay 2 arneses fuera del stock porque les falta la pieza del enganche; se arreglan (user). Cuando esten, sumarlos (4 → 6).'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 656;

-- ═══ porcelanato 58x58 ════════════════════════════════════════════════════
insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, sub_motivo, estado, fecha, created_by, obs)
select 910, 'ajuste', 13.5 - m.stock_actual, 'ajuste_inventario', 'ingreso_sin_compra', 'aprobado', date '2026-09-08',
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid,
       'Recuento 08/09 (Sosa): 10 cajas (2 de otro modelo). San Lorenzo 58x58 rinde 1,35 m2/caja (4 piezas): 13,5 m2. El sistema decia ' || m.stock_actual || '.'
  from public.stock_materiales m where m.id = 910 and m.stock_actual <> 13.5;

update public.stock_materiales
   set stock_actual = 13.5,
       obs = trim(both ' ' from coalesce(obs, '') || ' · 08/09/2026: 10 cajas en el deposito (2 de otro modelo) = 13,5 m2 a 1,35 m2/caja (San Lorenzo 58x58, 4 piezas). Si son el sobrante de la compra de Lamadrid (pagada por el cliente), son material del cliente y no stock de CADINC.'),
       updated_at = now(), updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid
 where id = 910;
