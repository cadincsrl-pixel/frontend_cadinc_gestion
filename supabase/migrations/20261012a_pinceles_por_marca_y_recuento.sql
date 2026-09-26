-- Pinceles: una ficha por marca y línea, y el recuento del depósito (27/09/2026).
--
-- Hasta hoy había una ficha por tamaño («Pincel 1"», «Pincel 2"»…) donde se
-- mezclaban El Galgo Silver, Gold, Grand Special, Grand (Lotus) y Rosarpin,
-- con precios que llegan a duplicarse entre líneas del mismo tamaño (§5.15
-- «Marca»). El dueño pidió separarlas y cargar el recuento que hizo Sosa hoy
-- (planilla «Material encontrado que no está en la lista»; Silver N30 = 11
-- según el dueño). Cada ficha nace con el precio final (con IVA) de su última
-- factura y el código del proveedor en alias[1]:
--   Prestigio (El Galgo Silver/Gold/Grand Special, Lotus/Grand), Dosal (Gold
--   N10 y N25, 15/09/2026), Silva (Rosarpin 1700 y 6000).
-- Los N° del pincel son el ancho: 10 = 1", 15 = 1-1/2", 20 = 2", 25 = 2-1/2",
-- 30 = 3", 40 = 4".
--
-- Las fichas genéricas por tamaño se llevan a 0 con un ajuste de recuento y se
-- desactivan; sus sinónimos («pincel de 15», «pincel n20»…) pasan a la línea
-- que el depósito más tiene de ese tamaño, así la obra sigue pidiendo igual y
-- el depósito elige la marca al despachar. «Pincel 4"» y «Pinceleta 4"» siguen,
-- renombradas con lo que son.
--
-- Aplicada el 26/09: quedaron C-2907..C-2918 (Silver 15/20/30, Gold 10/15/20/25/30,
-- Grand Special 20, Grand amarillo 15, Rosarpin 1700 N10/N20), C-0973 y C-0362.
-- Fotos: scripts/subir-fotos-catalogo.mjs (El Galgo, Prestigio y Rosarpin de sus
-- sitios; la del Grand amarillo es la del depósito). Instructivo para rotular:
-- https://claude.ai/artifact/YKUjyrAHJLKvmvm7ePKCZr

do $m$
declare
  v_user constant uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_obs  constant text := 'Recuento de pinceles 27/09/2026 (Sosa): se separaron por marca y línea';
  r      record;
  v_id   int;
  v_ids  jsonb := '{}'::jsonb;
begin
  -- 1. Fichas nuevas.
  for r in select * from (values
    ('silver15', 'Pincel El Galgo Silver N°15 (1-1/2")', 22, 1549.20, array['61719','pincel silver 15','pincel silver n15','galgo silver 15','pincel el galgo silver 15']),
    ('silver20', 'Pincel El Galgo Silver N°20 (2")',     8,  2094.53, array['61720','pincel silver 20','pincel silver n20','galgo silver 20','pincel el galgo silver 20']),
    ('silver30', 'Pincel El Galgo Silver N°30 (3")',     11, 3175.48, array['61722','pincel silver 30','pincel silver n30','galgo silver 30','pincel el galgo silver 30']),
    ('gold10',   'Pincel El Galgo Gold N°10 (1")',       20, 3257.12, array['1005710','pincel gold 10','pincel gold n10','galgo gold 10','pincel el galgo gold 10']),
    ('gold15',   'Pincel El Galgo Gold N°15 (1-1/2")',   20, 3360.31, array['61714','pincel gold 15','pincel gold n15','galgo gold 15','pincel el galgo gold 15']),
    ('gold20',   'Pincel El Galgo Gold N°20 (2")',       11, 3985.64, array['61715','pincel gold 20','pincel gold n20','galgo gold 20','pincel el galgo gold 20']),
    ('gold25',   'Pincel El Galgo Gold N°25 (2-1/2")',   4,  8238.35, array['1005725','61716','pincel gold 25','pincel gold n25','galgo gold 25','pincel el galgo gold 25']),
    ('gold30',   'Pincel El Galgo Gold N°30 (3")',       19, 6410.68, array['61717','pincel gold 30','pincel gold n30','galgo gold 30','pincel el galgo gold 30']),
    ('grandsp20','Pincel El Galgo Grand Special N°20 (2")', 2, 5203.35, array['61452','pincel grand special 20','grand special n20','pincel el galgo grand special 20']),
    ('grand15',  'Pincel Grand amarillo N°15 (1-1/2")',  4,  1530.93, array['35279','pincel grand 15','pincel grand n15','pincel lotus 15','pincel amarillo 15']),
    ('ros10',    'Pincel Rosarpin 1700 N°10 (1")',       1,  3151.00, array['7798074701772','pincel rosarpin 10','pincel rosarpin n10','rosarpin 1700 n10','pincel 1700 n10']),
    ('ros20',    'Pincel Rosarpin 1700 N°20 (2")',       2,  6012.01, array['7798074701796','pincel rosarpin 20','pincel rosarpin n20','rosarpin 1700 n20','pincel 1700 n20'])
  ) as t(clave, nombre, contado, precio, alias) loop
    insert into public.stock_materiales (rubro_id, nombre, unidad, clase, alias, stock_actual, created_by, updated_by)
    values (5, r.nombre, 'unid', 'material', r.alias, 0, v_user, v_user)
    returning id into v_id;
    perform public.fijar_precio_ref(v_id, r.precio, 'ultima_compra', null, v_user);
    insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, sub_motivo, obs, fecha, created_by, estado, aprobado_por, aprobado_at)
    values (v_id, 'ajuste', r.contado, 'ajuste_inventario', 'error_carga',
            v_obs || ': el sistema decía 0 y se contaron ' || r.contado || ' unid.', current_date, v_user, 'aprobado', v_user, now());
    update public.stock_materiales set stock_actual = r.contado where id = v_id;
    v_ids := v_ids || jsonb_build_object(r.clave, v_id);
  end loop;

  -- 2. Las dos que siguen, con lo que son.
  update public.stock_materiales
     set nombre = 'Pincel 4" cerda negra (sin marca)', updated_by = v_user
   where id = 362;
  update public.stock_materiales
     set nombre = 'Pinceleta Rosarpin 6000 N°40 (4")',
         alias = array['7798074700119'] || array_remove(alias, '7798074700119'), updated_by = v_user
   where id = 973;

  -- 3. Recuento de las que ya existían: 362 y 973 al contado; las genéricas a 0.
  for r in select * from (values (362, 1), (973, 2), (361, 0), (800, 0), (128, 0), (795, 0), (129, 0)) as t(id, contado) loop
    insert into public.stock_movimientos (material_id, tipo, cantidad, motivo, sub_motivo, obs, fecha, created_by, estado, aprobado_por, aprobado_at)
    select m.id, 'ajuste', r.contado - m.stock_actual, 'ajuste_inventario', 'error_carga',
           v_obs || ': el sistema decía ' || m.stock_actual || ' y se contaron ' || r.contado || ' unid.'
           || case when r.contado = 0 then ' (quedaron en las fichas por marca)' else '' end,
           current_date, v_user, 'aprobado', v_user, now()
      from public.stock_materiales m
     where m.id = r.id and m.stock_actual <> r.contado;
    update public.stock_materiales set stock_actual = r.contado, updated_by = v_user where id = r.id;
  end loop;

  -- 4. Sinónimos de las genéricas → la línea con más stock de ese tamaño, y
  --    las genéricas se desactivan. Los que nombran otra línea no viajan.
  for r in select * from (values
    (361, 'gold10'), (800, 'silver15'), (128, 'silver20'), (795, 'gold25'), (129, 'silver30')
  ) as t(generica, destino) loop
    update public.stock_materiales d
       set alias = d.alias || array(
             select a from unnest((select g.alias from public.stock_materiales g where g.id = r.generica)) a
              where a !~* '(silver|traso)' and not a = any (d.alias)),
           updated_by = v_user
     where d.id = (v_ids ->> r.destino)::int;
    update public.stock_materiales
       set alias = '{}', activo = false, updated_by = v_user,
           obs = concat_ws(E'\n', nullif(obs, ''), 'Desactivada el 27/09/2026: los pinceles se separaron por marca y línea (sinónimos pasados a ' || (v_ids ->> r.destino) || ').')
     where id = r.generica;
  end loop;
end $m$;
