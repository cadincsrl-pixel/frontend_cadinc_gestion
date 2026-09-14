-- Precios reales de las fichas 10A, que dio el user el 14/09: la hembra $1.700 y la
-- macho $1.860. Son precios FINALES con IVA, como todo en el sistema (CLAUDE.md §5.14).
--
-- Los dos estaban mal, y de maneras distintas:
--   279 hembra: $1.386,58 -> $1.700   (venía de una compra vieja, quedó barata)
--   278 macho:  $350      -> $1.860   (5,3x; era un precio viejo o mal cargado)
--
-- Y estaban mal EN EL ORDEN, que es lo que importa para quien compra: el catálogo
-- decía que la hembra costaba 4 veces la macho, y en realidad la macho sale un poco
-- MÁS que la hembra. Alguien comparando contra el catálogo habría discutido la
-- factura por el lado equivocado.
--
-- Se usa `fijar_precio_ref`, que es la única puerta al catálogo y deja el historial en
-- `stock_materiales_precios`. Nunca un `update ... set precio_ref` a mano.

select public.fijar_precio_ref(279, 1700.00, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
select public.fijar_precio_ref(278, 1860.00, 'manual', null, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
