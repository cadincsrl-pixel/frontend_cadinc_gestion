-- 20260911s — Precio del enduido Prinz x 20 L: $78.917,55, tienda de Prestigio
-- en el mall de ICBC (08/09/2026), el proveedor real. Por fijar_precio_ref.
-- (MercadoLibre y Fravega no mostraron precio: bloqueado / sin stock en zona.)
select public.fijar_precio_ref(2654, 78917.55, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid);
update public.stock_materiales
   set obs = trim(both ' ' from coalesce(obs,'') || ' · 08/09/2026: $78.917,55, Prestigio (tienda ICBC).')
 where id = 2654;
