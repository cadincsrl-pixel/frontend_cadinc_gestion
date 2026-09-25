-- Limpieza del catálogo, tanda 6: las 8 fichas que quedaban con el precio inventado de $11
-- (la alta rápida vieja ponía $11 cuando no se sabía el precio, §5.15).
--
-- Con compra real → el precio de esa compra (fuente ultima_compra):
--   2673 planchuela 20x20 $8.569,22 · 2674 hierro 10mm x 15cm $323 · 2675 kit de rodamiento $12.652,50
-- Sin compra con precio → $0, a la lista de tasar.
-- Todas quedan con nombre prolijo; el nombre nuevo baja a renglones y cuenta del cliente
-- (solo lo no cobrado). No toca precios de renglones ni de la cuenta.

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
  v record;
  v_item int;
  v_precio numeric;
begin
  for v in
    select * from (values
      (1561, 'Ficha hembra 20A',              array['ficha hembra 20a', 'ficha hembra 20 a'],                    false),
      (2669, 'Reja p/ baterías',              array['rejas para baterias', 'reja para baterias', 'reja baterias'], false),
      (2670, 'Compuerta',                     array['conpuerta', 'compuerta de chapa'],                          false),
      (2671, 'Tornillo N°6',                  array['tornillo n6', 'tornillo nro 6', 'tornillo numero 6'],       false),
      (2673, 'Planchuela 20x20',              array['planchuela 20x20'],                                         true),
      (2674, 'Hierro 10mm x 15cm',            array['hierro de 10mm x15cm', 'hierro 10 x 15cm', 'pasador hierro 10mm 15cm'], true),
      (2675, 'Kit de rodamiento',             array['kit de rodamiento', 'kit rodamiento', 'kit de rodamientos'],       true),
      (2677, 'Retazos de planchuela 30cm',    array['retasos de planchuelas de 30cm', 'retazos de planchuela', 'recortes de planchuela'], false)
    ) as t(id, nombre, alias, desde_compra)
  loop
    -- la cuenta primero: después el renglón ya no lleva el nombre viejo
    update public.materiales_a_cuenta_cliente c set descripcion = v.nombre, updated_at = now()
      from public.solicitud_compra_item i, public.stock_materiales m
     where m.id = v.id and c.item_id = i.id and i.material_id = m.id
       and c.descripcion = m.nombre and c.cobro_id is null and c.certificado_id is null;

    update public.solicitud_compra_item i set descripcion = v.nombre
      from public.stock_materiales m
     where m.id = v.id and i.material_id = m.id and i.descripcion = m.nombre;

    update public.stock_materiales m
       set alias = array(select distinct x from unnest(coalesce(m.alias, '{}'::text[]) || v.alias) x
                          where coalesce(x, '') <> '' and public.norm_txt(x) <> public.norm_txt(v.nombre)),
           nombre = v.nombre, updated_by = v_user, updated_at = now()
     where m.id = v.id;

    v_item := null; v_precio := 0;
    if v.desde_compra then
      select i.id, i.precio_unit into v_item, v_precio
        from public.solicitud_compra_item i
       where i.material_id = v.id and coalesce(i.precio_unit, 0) > 11
       order by i.fecha_resolucion desc nulls last, i.id desc limit 1;
    end if;

    perform public.fijar_precio_ref(v.id, coalesce(v_precio, 0),
              case when v_item is null then 'sql' else 'ultima_compra' end, v_item, v_user);
  end loop;
end
$m$;
