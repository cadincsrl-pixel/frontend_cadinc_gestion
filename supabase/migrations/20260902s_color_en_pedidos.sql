-- Color como atributo del PEDIDO, no como fila del catálogo.
--
-- POR QUÉ ASÍ Y NO CON UNA FILA POR COLOR:
-- El catálogo ya intentó el camino de la grilla de colores y falló. Hay 19 filas de
-- "Esmalte sintético <color> x <tamaño>" (7 colores x 3 tamaños) y **17 nunca se
-- usaron**: cero stock, cero movimientos, cero pedidos. Solo "negro x 20lts" tiene
-- stock (5) y "naranja x 4lts" un pedido.
-- Mientras tanto, lo que SÍ se pide son las filas SIN color: Pastina x 5kg (14
-- pedidos), Latex p/ cielorraso x 20lts (6), Latex satinado interior x 20lts (5) —
-- y el color se termina escribiendo en texto libre ("plastina color gris",
-- "entonadores negro", "latex blanco interior", "20 lts verde tenis").
-- O sea: pre-generar la grilla infla el catálogo y no lo usa nadie; el color es un
-- dato del pedido.
--
-- Tampoco hace falta stock por color: de los 19 esmaltes solo uno tiene existencia.
--
-- `usa_color` en el material decide si la UI muestra el campo. Sin eso habría un
-- input de color en las 900 filas, incluido el tornillo, y sería ruido.

alter table public.stock_materiales
  add column if not exists usa_color boolean not null default false;

comment on column public.stock_materiales.usa_color is
  'El color es una eleccion real para este material (pintura, pastina, cables). '
  'La UI del pedido muestra el campo color solo cuando esto es true.';

alter table public.solicitud_compra_item
  add column if not exists color text;

comment on column public.solicitud_compra_item.color is
  'Color pedido para la obra. Texto libre a propósito: la carta de colores es del '
  'proveedor y cambia. Se llena solo si el material tiene usa_color.';

-- Familias donde el color es una eleccion real, segun lo que se pide en texto libre.
update public.stock_materiales
   set usa_color = true
 where activo
   and (
     public.norm_material(nombre) ~ 'esmalte|latex|pintura|antioxido|pastina|entonador|revestimiento plastico|membrana'
     -- cables: el color es funcional (fase / neutro / tierra), no estetico
     or public.norm_material(nombre) ~ '^cable'
     -- ceramicos y porcelanatos: se piden por tono (beige, hueso, gris)
     or public.norm_material(nombre) ~ 'ceramico|porcelanato|zocalo'
     or public.norm_material(nombre) ~ 'sellador|silicona'
   )
   -- lo que ya trae el color en el nombre no necesita el campo
   and public.norm_material(nombre) !~ '(^| )(blanco|negro|gris|rojo|verde|azul|amarillo|marron|beige|hueso|celeste|naranja|bordo|crema)( |$)';
