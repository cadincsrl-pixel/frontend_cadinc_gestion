-- 20260908i — Solicitud de la segunda linea de la cotizacion de chapa, para
-- deposito (user 2026-09-07: "una va para garita y la otra cargala para
-- deposito a la solicitud, garita ya esta cargada... hasta que nicolas confirme
-- la compra")
--
-- La cotizacion del 07/09 tiene dos lineas del mismo BOB25, a $2.181,41 el kilo:
--   150 kg = 30 m  -> GARITA (CC-025). Ya esta cargada: es el renglon 3457,
--                     26 m, pendiente. Los 30 m cubren los 26 con sobrante.
--   100 kg = 20 m  -> DEPOSITO. Es la que falta y se crea aca.
--
-- Se crea como pedido PENDIENTE, sin proveedor ni precio, porque la compra
-- todavia no esta confirmada -- la confirma Nicolas. Cuando la confirme, se
-- resuelve el renglon como comprado con su precio y ahi entra a stock.
-- Al ser una obra con es_deposito = true, NO va a la cuenta de ningun cliente:
-- es reposicion de stock (CLAUDE.md 5.1).
with s as (
  insert into public.solicitud_compra
    (obra_cod, solicitante, fecha, estado, prioridad, obs, created_by, updated_by)
  values
    ('CC DEPOSITO', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', '2026-09-07', 'pendiente', 'normal',
     'Reposicion de chapa lisa C25 al deposito. Segunda linea de la cotizacion del 07/09/2026 (100 kg de BOB25 a $2.181,41 el kilo); la primera, de 150 kg, es para Garita. NO COMPRAR hasta que Nicolas confirme.',
     'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8')
  returning id
)
insert into public.solicitud_compra_item
  (solicitud_id, descripcion, cantidad, unidad, material_id, estado, clase, pagado_por, obs)
select s.id,
       'Chapa galvanizada lisa C25 ancho 1,22 m x metro lineal',
       20, 'm', 877, 'pendiente', 'material', 'cadinc',
       'Cotizacion 07/09/2026: 100 kg a $2.181,41 el kilo neto = $2.639,51 con IVA. A 5 kg por metro son 20 m = $263.950,60 con IVA. Sin proveedor ni precio cargado hasta que Nicolas confirme la compra.'
from s;
