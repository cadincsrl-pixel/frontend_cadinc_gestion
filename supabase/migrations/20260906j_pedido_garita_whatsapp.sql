-- 20260906j — Pedido de Garita (CC-025) cargado desde el WhatsApp de Manuel (06/09/2026 16:25), entrega tentativa mañana 07/09 10:00
--
-- Manuel lo tituló "Pedido hipódromo" pero el user aclaró: es para Garita.
-- Renglones: 4 rejillas de ventilación 15x30, 2 bolsas de revoque 3 en 1, 25
-- bolsas de arena mediana, 10 bolsas de cemento, 2 selladores para canaletas
-- (3M 550 negro), 30 m² de lana de vidrio (rollo de 1,20 m → 25 m). "1 puerta
-- placa (está pedida)" y "1 ventana (está pedida)" NO se cargan: ya están
-- pedidas en otro lado. Queda como pedido pendiente para resolver desde la
-- pantalla (depósito o compra), sin precios.
--
-- De paso: la fila 931 se llamaba "Rejilla de piso 15x30" pero es la rejilla
-- de VENTILACIÓN aprobada de 200 cm² (El Fontanero 02/09/2026, $2.714,36 neto):
-- se renombra y se propaga al único renglón que la usaba.

update public.stock_materiales
   set nombre = 'Rejilla de ventilación 15x30 (200 cm², aprobada)',
       alias = array(select distinct unnest(coalesce(alias,'{}') || array['rejilla de ventilacion 15x30','rejilla ventilacion 15x30','rejilla de ventilacion','rejilla vent 15x30','rejilla 200 cm2','rejilla aprobada 15x30','rejilla de piso 15x30'])),
       obs = coalesce(obs || ' · ', '') || 'Renombrada 2026-09-06: es la rejilla de ventilación aprobada 200 cm² (El Fontanero 02/09/2026), no de piso.',
       updated_at = now()
 where id = 931 and nombre = 'Rejilla de piso 15x30';
update public.solicitud_compra_item set descripcion = 'Rejilla de ventilación 15x30 (200 cm², aprobada)' where material_id = 931 and descripcion = 'Rejilla de piso 15x30';
update public.materiales_a_cuenta_cliente c set descripcion = 'Rejilla de ventilación 15x30 (200 cm², aprobada)', updated_at = now()
  from public.solicitud_compra_item i where c.item_id = i.id and i.material_id = 931 and c.descripcion = 'Rejilla de piso 15x30' and c.cobro_id is null;

do $$
declare
  v_user uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_sol int; v_item int; v_mat int;
  r record;
begin
  if exists (select 1 from public.solicitud_compra where obra_cod = 'CC-025' and obs like 'Pedido de Manuel por WhatsApp (06/09/2026 16:25)%') then
    raise notice 'ya cargado'; return;
  end if;

  insert into public.solicitud_compra (obra_cod, solicitante, fecha, estado, prioridad, obs, aprobado_por, entrega_tentativa, created_by, updated_by)
  values ('CC-025', v_user, '2026-09-06', 'aprobada', 'normal',
          'Pedido de Manuel por WhatsApp (06/09/2026 16:25), lo tituló "Pedido hipódromo" pero es para Garita. Entrega mañana 07/09 a las 10:00. La puerta placa y la ventana ya estaban pedidas aparte y no se cargaron acá.',
          v_user, '2026-09-07 10:00:00', v_user, v_user)
  returning id into v_sol;

  for r in
    select * from (values
      ('Rejilla de ventilación 15x30 (200 cm², aprobada)', 4::numeric,  'unid',  null::text,   '4 rejillas de ventilación de 15x30'),
      ('Revoque premezclado 3 en 1 x 30kg',                2,           'bolsa', null,         '2 bls de revoque 3 en 1'),
      ('Arena x 25kg',                                     25,          'bolsa', null,         '25 bls de arena mediana'),
      ('Cemento Portland x 25kg',                          10,          'bolsa', null,         '10 bls de cemento'),
      ('Sellador PU 3M 550 x 300ml',                       2,           'unid',  'negro',      '2 sellador para canaletas'),
      ('Lana de vidrio 50mm (rollo 1.20m)',                25,          'm',     null,         '30 m2 de lana vidrio = 25 m de rollo de 1,20 m')
    ) as t(nombre, cant, unidad, color, texto)
  loop
    select id into v_mat from public.stock_materiales where nombre = r.nombre and activo limit 1;
    if v_mat is null then raise exception 'No existe en el catálogo: %', r.nombre; end if;
    insert into public.solicitud_compra_item (solicitud_id, descripcion, cantidad, unidad, obs, clase, devuelve, estado, material_id, color)
    values (v_sol, r.nombre, r.cant, r.unidad, 'WhatsApp de Manuel: ' || r.texto, 'material', false, 'pendiente', v_mat, r.color)
    returning id into v_item;
    insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, user_id)
    values (v_item, v_sol, 'creado', 'pendiente', r.cant, v_user);
  end loop;
  raise notice 'pedido #%', v_sol;
end $$;
