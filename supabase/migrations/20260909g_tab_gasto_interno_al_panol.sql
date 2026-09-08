-- Sosa puede ver lo que gasta el pañol
--
-- Carga los pedidos del depósito todos los días y hoy no ve ni un peso de lo
-- que cuestan: sus tabs son stock, stock-proveedor, solicitudes y catalogo.
-- Sin esto la pantalla de gasto interno existe para todos menos para el único
-- que la va a usar, y la feature se abandona igual que la salida manual.
--
-- Va la tab 'gasto-interno' y NO 'cuenta-corriente' a propósito: la segunda le
-- abriría la deuda viva de todos los clientes. Ese recorte es la razón de que
-- sean dos pantallas y no un filtro de la misma.

-- La plantilla del rol, para que quien venga después lo herede.
update public.roles
   set permisos = jsonb_set(
         permisos,
         '{certificaciones,tabs}',
         coalesce(permisos->'certificaciones'->'tabs', '[]'::jsonb) || '["gasto-interno"]'::jsonb)
 where key = 'deposito'
   and not coalesce(permisos->'certificaciones'->'tabs', '[]'::jsonb) @> '["gasto-interno"]'::jsonb;

-- Y la persona, que está marcada como personalizada y por eso "Aplicar a N
-- usuarios" no la tocaría.
update public.profiles
   set permisos = jsonb_set(
         permisos,
         '{certificaciones,tabs}',
         coalesce(permisos->'certificaciones'->'tabs', '[]'::jsonb) || '["gasto-interno"]'::jsonb)
 where rol_key = 'deposito'
   and permisos->'certificaciones' is not null
   and not coalesce(permisos->'certificaciones'->'tabs', '[]'::jsonb) @> '["gasto-interno"]'::jsonb;
