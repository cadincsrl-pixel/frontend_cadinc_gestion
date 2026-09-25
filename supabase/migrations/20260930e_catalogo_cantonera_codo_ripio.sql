-- Limpieza del catálogo, tanda 3 (respuestas del dueño, 25/09).
--
-- 1) 2790 "cantonera x 2.60m" es la metálica de durlock, NO la de PVC (615): queda aparte,
--    con nombre y sinónimos que la distingan.
-- 2) 2781 "codos awaduct 110" es el codo de 90: en Awaduct es el 87°30' MH (2275). Se unifica ahí
--    (renglón, movimientos y el stock −2 que arrastraba).
-- 3) 2799 "rpio bruto fino x m3": typo en el nombre. Sigue siendo ficha propia (m3 ≠ bolsa, 911).

do $m$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';  -- Franco Leiro (admin)
begin
  -- 1) cantonera de durlock
  update public.solicitud_compra_item set descripcion = 'Cantonera metálica p/ durlock x 2.60m'
   where material_id = 2790 and descripcion = 'cantonera x 2.60m';
  update public.materiales_a_cuenta_cliente c set descripcion = 'Cantonera metálica p/ durlock x 2.60m', updated_at = now()
    from public.solicitud_compra_item i
   where c.item_id = i.id and i.material_id = 2790 and c.descripcion = 'cantonera x 2.60m' and c.cobro_id is null;
  update public.stock_materiales
     set nombre = 'Cantonera metálica p/ durlock x 2.60m',
         alias = array['cantonera x 2.60m', 'cantonera durlock', 'cantonera metalica', 'cantonera de chapa', 'esquinero durlock'],
         updated_by = v_user, updated_at = now()
   where id = 2790;

  -- 2) codo awaduct 110 → 87°30' MH
  insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
  select i.id, i.solicitud_id, 'correccion', null, i.estado,
         'Ficha genérica: "codos awaduct 110" (#2781) → "Codo Awaduct 110mm 87°30'' MH" (#2275), el de 90',
         jsonb_build_object('motivo', 'ficha_duplicada', 'material_anterior', 2781, 'material_nuevo', 2275, 'user_id', v_user)
    from public.solicitud_compra_item i where i.material_id = 2781;

  update public.solicitud_compra_item
     set descripcion = case when descripcion = 'codos awaduct 110' then 'Codo Awaduct 110mm 87°30'' MH' else descripcion end,
         material_id = 2275
   where material_id = 2781;

  update public.materiales_a_cuenta_cliente c
     set descripcion = 'Codo Awaduct 110mm 87°30'' MH', updated_at = now()
    from public.solicitud_compra_item i
   where c.item_id = i.id and i.material_id = 2275 and c.descripcion = 'codos awaduct 110' and c.cobro_id is null;

  update public.stock_movimientos set material_id = 2275 where material_id = 2781;

  update public.stock_materiales d
     set stock_actual = d.stock_actual + o.stock_actual,
         alias = array(select distinct x from unnest(coalesce(d.alias, '{}'::text[])
                   || array['codos awaduct 110', 'codo awaduct 110', 'codo awaduct 110 90', 'codo 90 awaduct 110', 'codo 110 a 90']) x),
         updated_by = v_user, updated_at = now()
    from public.stock_materiales o
   where d.id = 2275 and o.id = 2781;

  update public.stock_materiales
     set activo = false, stock_actual = 0,
         obs = coalesce(obs || ' · ', '') || 'Unificada en "Codo Awaduct 110mm 87°30'' MH" (#2275) el 25/09/2026: era el de 90.',
         updated_by = v_user, updated_at = now()
   where id = 2781;

  -- 3) ripio: typo
  update public.solicitud_compra_item set descripcion = 'Ripio bruto fino x m3'
   where material_id = 2799 and descripcion = 'rpio bruto fino x m3';
  update public.materiales_a_cuenta_cliente c set descripcion = 'Ripio bruto fino x m3', updated_at = now()
    from public.solicitud_compra_item i
   where c.item_id = i.id and i.material_id = 2799 and c.descripcion = 'rpio bruto fino x m3' and c.cobro_id is null;
  update public.stock_materiales
     set nombre = 'Ripio bruto fino x m3',
         alias = array['ripio bruto fino m3', 'ripio x m3', 'metro de ripio', 'm3 de ripio'],
         updated_by = v_user, updated_at = now()
   where id = 2799;
end
$m$;
