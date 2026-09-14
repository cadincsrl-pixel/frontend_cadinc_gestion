-- La caja octogonal eran CUATRO productos en una sola ficha. Dato del user el 14/09:
-- "tenemos metálica chica y grande y de pvc chica y grande", y "la grande es la que más
-- se usa".
--
-- La ficha 57 ya venía delatando el problema: entre sus sinónimos convivían
-- "caja ortogonal grande pvc" y "caja pvc octogonal chica", o sea dos variantes distintas
-- apuntando al mismo lugar.
--
-- LOS PRECIOS PAGADOS CONFIRMAN LAS CUATRO. Sus 8 renglones dicen todos apenas "Caja de
-- luz octogonal", pero se pagaron a cuatro valores distintos, y la planilla de Voltaje
-- identifica los dos de abajo:
--     $390,83  → metálica chica   (la planilla: "CAJA OCTOGONAL CHICA METALICA" $391)
--     $562,59  → PVC chica        (la planilla: "CAJA PVC OCTOGONAL CHICA" $563)
--     $955     → metálica grande
--     $1.157,97→ PVC grande
-- El patrón cierra: el PVC sale más caro que la metálica en los dos tamaños.
--
-- LA 57 SE QUEDA COMO **PVC GRANDE**, que es la más usada según el user, para no mover
-- sus 8 renglones ni su historial. Ojo con la consecuencia: esos 8 renglones son en
-- realidad una mezcla de variantes y no hay forma de desenredarlos, porque ninguno dice
-- cuál era. La plata cobrada a cada obra NO cambia (MCC guarda el precio_unit real); lo
-- que queda impreciso es la atribución histórica.
--
-- Las tres nuevas nacen con el precio que ya conocíamos de cada una, vía
-- `fijar_precio_ref`, que es la única puerta al catálogo (§5.14).

do $$
declare r_elec int; id_cp int; id_cm int; id_gm int;
begin
  select id into r_elec from public.stock_rubros where nombre = 'Electricidad';

  update public.stock_materiales
     set nombre = 'Caja de luz octogonal grande PVC',
         alias = array['caja octogonal grande pvc','caja ortogonal grande pvc','caja octogonal grande',
                       'caja ortogonal grande','cajas octogonales grandes','caja pvc octogonal grande'],
         obs = coalesce(obs || ' | ', '') ||
               'Era la única ficha de caja octogonal y absorbía las cuatro variantes. Partida el 2026-09-14; sus 8 renglones previos son una mezcla que no se puede desenredar.'
   where id = 57;
  perform public.fijar_precio_ref(57, 1157.97, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

  insert into public.stock_materiales (nombre, rubro_id, unidad, clase, activo, alias, precio_ref, created_by)
  values ('Caja de luz octogonal chica PVC', r_elec, 'unid', 'material', true,
          array['caja octogonal chica pvc','caja ortogonal chica pvc','caja pvc octogonal chica','caja octogonal chica'],
          0, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8')
  returning id into id_cp;

  insert into public.stock_materiales (nombre, rubro_id, unidad, clase, activo, alias, precio_ref, created_by)
  values ('Caja de luz octogonal chica metálica', r_elec, 'unid', 'material', true,
          array['caja octogonal chica metalica','caja ortogonal chica metalica','caja octogonal metalica chica','caja octogonal chica de chapa'],
          0, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8')
  returning id into id_cm;

  insert into public.stock_materiales (nombre, rubro_id, unidad, clase, activo, alias, precio_ref, created_by)
  values ('Caja de luz octogonal grande metálica', r_elec, 'unid', 'material', true,
          array['caja octogonal grande metalica','caja ortogonal grande metalica','caja octogonal metalica grande','caja octogonal grande de chapa'],
          0, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8')
  returning id into id_gm;

  perform public.fijar_precio_ref(id_cp, 562.59, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
  perform public.fijar_precio_ref(id_cm, 390.83, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
  perform public.fijar_precio_ref(id_gm, 955.00, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');

  if (select count(*) from public.stock_materiales
       where activo and norm_txt(nombre) ~ 'caja de luz octogonal') <> 4 then
    raise exception 'Esperaba 4 fichas de caja octogonal';
  end if;
  if (select count(*) from public.stock_materiales
       where activo and norm_txt(nombre) ~ 'caja de luz octogonal' and precio_ref = 0) <> 0 then
    raise exception 'Alguna quedó sin precio';
  end if;
end $$;
