-- 20260906p — Garita: la puerta placa y la ventana del pedido 679 ya estaban
-- compradas en el pedido 647 (02/09): item 3197 "Puerta placa interior 80cm"
-- ($189.819,90, proveedor 37) e item 3198 "Ventana aluminio corrediza
-- 1.20x1.10" negra ($458.792,72, proveedor 55). Manuel decía "están pedidas"
-- y era literal. Los renglones 3396/3397 (texto libre, 20260906k) se rechazan
-- como duplicados, igual que en el saneamiento del pedido 661.

update public.solicitud_compra_item
   set estado = 'rechazado', fecha_resolucion = now()
 where id in (3396, 3397) and estado = 'pendiente';

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta, user_id)
values
  (3396, 679, 'rechazado', 'pendiente', 'rechazado',
   'Duplicado del item 3197 del pedido 647 (Puerta placa interior 80cm, ya comprada)',
   '{"motivo": "ya pedida en el pedido 647 (comprada 02/09)", "duplicado_de": 3197}'::jsonb, null),
  (3397, 679, 'rechazado', 'pendiente', 'rechazado',
   'Duplicado del item 3198 del pedido 647 (Ventana aluminio corrediza 1.20x1.10 negra, ya comprada)',
   '{"motivo": "ya pedida en el pedido 647 (comprada 02/09)", "duplicado_de": 3198}'::jsonb, null);
