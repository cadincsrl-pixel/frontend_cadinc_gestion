-- Las plantillas de rol traen los flags de precio
--
-- Auditoría del 10/09: ninguna plantilla —ni la de "compras"— incluía
-- cargar_precios, aprobar_precios ni precio_al_resolver. Todo usuario nuevo
-- nacía sin poder tocar precios y había que acordarse a mano, como pasó con
-- Nicolás el 09/09 (20260913b).
--
-- Dos cambios, alineados con cómo trabaja la empresa (user, 10/09: "Nicolás
-- es el encargado de compras, Sosa de depósito; Sosa no puede tocar precios"):
--
--   · compras  → cargar_precios = true. Es quien compra con la factura
--     delante: el único que puede devolverle al catálogo el precio real.
--   · deposito → precio_al_resolver = false. Resuelve despachos y compras,
--     pero el renglón queda "esperando precio" para que lo cargue quien
--     corresponde.
--
-- No toca a nadie hoy: aplicar una plantilla es una acción manual desde
-- Admin y solo alcanza a los perfiles no personalizados. Hoy no hay ningún
-- usuario con rol_key='compras', y el único de 'deposito' (Sosa) está marcado
-- como personalizado y ya tiene precio_al_resolver en false.

update public.roles
   set permisos = jsonb_set(permisos, '{certificaciones,cargar_precios}', 'true'::jsonb, true)
 where key = 'compras';

update public.roles
   set permisos = jsonb_set(permisos, '{certificaciones,precio_al_resolver}', 'false'::jsonb, true)
 where key = 'deposito';
