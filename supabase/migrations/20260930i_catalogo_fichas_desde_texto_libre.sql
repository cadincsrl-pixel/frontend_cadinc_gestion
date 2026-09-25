-- Limpieza del catálogo, tanda 7: fichas nuevas para el texto libre del 10/09 al 25/09.
--
-- Solo lo que no deja dudas. Cada ficha nueva:
--   · nace en $0 y, si el renglón tiene una compra con precio EN LA MISMA UNIDAD, toma ese precio
--     por fijar_precio_ref (fuente ultima_compra);
--   · se vincula al renglón (evento 'correccion'); el renglón y la cuenta del cliente (no cobrada)
--     pasan a llevar el nombre de la ficha. Ni precio ni cantidad del renglón cambian.
-- Cable de acero 4mm: ficha por metro SIN vincular ni precio (el renglón dice "1 unid" a $10.790,
-- que no es un metro). Grampa de cable de acero: se vincula, pero sin precio (1 unid a $8.389,50
-- parece un paquete).
-- "Fijador al aguarrás 4lts" ya existía como "Fijador sellador x 4lts" (121, en $0): se vincula
-- ahí, con sinónimo y el precio de esa compra.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v record;
  v_id int;
  v_mechas int := (select rubro_id from public.stock_materiales where id = 862);  -- mismo rubro que las mechas
  v_colas  int := (select rubro_id from public.stock_materiales where id = 611);  -- mismo rubro que la cola vinílica
begin
  create temp table _nuevas (
    nombre text, rubro_id int, unidad text, alias text[], item_id int, con_precio boolean
  ) on commit drop;

  insert into _nuevas values
    -- equipo solar (CC-030)
    ('Panel solar 500W',                                   2, 'unid', array['panel solar 500w', 'panel solar', 'placa solar', 'modulo fotovoltaico'], 4161, true),
    ('Cable solar 4mm²',                                   2, 'm',    array['cable solar 4mm', 'cable solar', 'cable fotovoltaico 4mm'],             4163, true),
    ('Regulador de carga solar MPPT 30A 12/24V',           2, 'unid', array['regulador de carga solar', 'regulador mppt', 'controlador de carga solar', 'regulador solar 30a'], 4162, true),
    ('Inversor de corriente 12V a 220V 2000W',             2, 'unid', array['inversor de corriente', 'inversor 12 a 220', 'inversor 12v 220v', 'inversor 2000w'], 4255, true),
    ('Llave de corte de batería',                          2, 'unid', array['llave de corte bateria', 'corta corriente bateria', 'desconectador de bateria'], 4257, true),
    -- cable de acero
    ('Cable de acero galvanizado 16mm 6x19+1',             6, 'm',    array['cable de acero galvanizado 16mm', 'cable acero 16mm', 'cable de acero 16mm'], 4427, true),
    ('Cable de acero galvanizado 4mm',                     6, 'm',    array['cable acero galvanizado 4mm', 'cable de acero 4mm', 'cable acero 4mm'], null, false),
    ('Grampa p/ cable de acero',                           6, 'unid', array['grampas cable de acero', 'grampa cable de acero', 'prensacable de acero', 'grillete cable acero'], 4554, false),
    -- varios
    ('Acople rápido p/ manguera 3/4"',                     1, 'unid', array['acople rapido 3/4', 'acople rapido', 'acople rapido manguera', 'conector rapido manguera'], 3874, true),
    ('Sikadur 32 Gel (adhesivo epoxi) x kg',               6, 'kg',   array['sikadur 32', 'sikadur -32', 'sikadur 32 gel', 'epoxi bicomponente'], 4124, true),
    ('Laminado plástico (fórmica) blanco 090 0.8mm',      13, 'unid', array['formica 090 blanco', 'formica blanca', 'formica', 'laminado plastico blanco'], 4138, true),
    ('Sierra copa diamantada 32mm',                 v_mechas, 'unid', array['sierra copa diamantada 32', 'mecha copa diamantada 32mm', 'copa diamantada 32'], 3877, true),
    ('Mecha p/ vidrio 8mm',                         v_mechas, 'unid', array['mecha makita para vidrio 8mm', 'mecha para vidrio 8', 'mecha vidrio 8mm', 'mecha p/ vidrio y ceramica 8mm'], 3878, true),
    ('Cola vinílica Fanacola x 750g',                v_colas, 'unid', array['fanacola x 750g', 'fanacola', 'cola fanacola'], 4463, true),
    ('Latex p/ cielorraso x 4lts',                         5, 'lata', array['latex para cielorraso x4lts', 'latex cielorraso 4lts', 'latex cielorraso x 4'], 3777, false),
    ('Membrana poliuretánica Venier Supercapa roja x 20kg', 8, 'balde', array['venier supercapa x20kg rojo', 'supercapa roja', 'venier supercapa rojo'], 4577, true),
    ('Velo de poliéster p/ membrana x 50m',                8, 'unid', array['velo x 50 mts', 'velo x 50m', 'velo de poliester', 'velo p/ membrana 50m'], 4578, true),
    ('Base p/ tanque de agua 1100 lts',                    1, 'unid', array['base para tanque 1100 lts', 'base tanque 1100', 'base p/ tanque'], 4457, false),
    ('Boya de PVC p/ tanque',                              1, 'unid', array['boya de pvc', 'boya pvc', 'flotante pvc'], 4333, false);

  for v in select * from _nuevas loop
    insert into public.stock_materiales (rubro_id, nombre, unidad, stock_actual, precio_ref, activo, clase, alias, created_by, updated_by)
    values (v.rubro_id, v.nombre, v.unidad, 0, 0, true, 'material', v.alias, v_user, v_user)
    returning id into v_id;

    if v.item_id is not null then
      insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
      select i.id, i.solicitud_id, 'correccion', null, i.estado,
             'Texto libre "' || trim(i.descripcion) || '" vinculado a la ficha "' || v.nombre || '" (#' || v_id || ')',
             jsonb_build_object('motivo', 'vincular_ficha', 'material_nuevo', v_id, 'user_id', v_user)
        from public.solicitud_compra_item i where i.id = v.item_id and i.material_id is null;

      update public.materiales_a_cuenta_cliente c set descripcion = v.nombre, updated_at = now()
        from public.solicitud_compra_item i
       where c.item_id = i.id and i.id = v.item_id and i.material_id is null
         and c.cobro_id is null and c.certificado_id is null;

      update public.solicitud_compra_item set material_id = v_id, descripcion = v.nombre
       where id = v.item_id and material_id is null;

      if v.con_precio then
        perform public.fijar_precio_ref(v_id, i.precio_unit, 'ultima_compra', i.id, v_user)
           from public.solicitud_compra_item i where i.id = v.item_id and coalesce(i.precio_unit, 0) > 0;
      end if;
    end if;
  end loop;

  -- fijador al aguarrás = Fijador sellador x 4lts (121)
  update public.stock_materiales
     set alias = array(select distinct x from unnest(coalesce(alias, '{}'::text[]) || array['fijador al aguarras 4lts', 'fijador al aguarras', 'fijador sellador al aguarras']) x),
         updated_by = v_user, updated_at = now()
   where id = 121;
  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', null, i.estado,
         'Texto libre "' || trim(i.descripcion) || '" vinculado a la ficha "Fijador sellador x 4lts" (#121)',
         jsonb_build_object('motivo', 'vincular_ficha', 'material_nuevo', 121, 'user_id', v_user)
    from public.solicitud_compra_item i where i.id = 4515 and i.material_id is null;
  update public.materiales_a_cuenta_cliente c set descripcion = 'Fijador sellador x 4lts', updated_at = now()
    from public.solicitud_compra_item i
   where c.item_id = i.id and i.id = 4515 and i.material_id is null and c.cobro_id is null and c.certificado_id is null;
  update public.solicitud_compra_item set material_id = 121, descripcion = 'Fijador sellador x 4lts'
   where id = 4515 and material_id is null;
  perform public.fijar_precio_ref(121, 33168.41, 'ultima_compra', 4515, v_user);
end
$m$;
