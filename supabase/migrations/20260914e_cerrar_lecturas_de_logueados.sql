-- Paso 3b de la auditoría del 12/09: un usuario logueado deja de poder leer TODA la
-- base sin importar su rol.
--
-- Hasta hoy, 53 tablas más eran legibles por cualquier `authenticated`: un chofer
-- podía leer el legajo, el DNI y las horas de todo el personal, o las tarifas, con
-- solo abrir la consola del navegador. Las policies decían `using(true)` y el rol de
-- la app no se consultaba en ningún momento.
--
-- El frontend accede DIRECTO a Supabase en exactamente cuatro lugares (verificado
-- sobre todo `src/`, sin contar auth ni storage):
--   - `middleware.ts`      -> profiles          (gateo de módulos por URL)
--   - `useRopa.ts`         -> ropa_categorias
--   - `useRopa.ts`         -> ropa_entregas
--   - `useRopa.ts`         -> rpc ropa_ultimas_entregas
-- Todo lo demás pasa por el backend Hono, que entra como `service_role` y saltea
-- RLS, así que no lo toca este revoke.
--
-- La RPC es SECURITY INVOKER y devuelve `setof ropa_entregas`: corre con los
-- permisos de quien llama, así que sigue andando porque `ropa_entregas` se conserva.
--
-- `profiles` ya tiene la policy correcta (`auth.uid() = id`): cada uno lee su fila
-- y nada más. Las dos de ropa quedan con SELECT abierto a cualquier logueado, que es
-- lo que la pantalla necesita hoy; si alguna vez hay que recortarlo, se recorta ahí.
--
-- Se revierte con un `grant select on all tables in schema public to authenticated`.

revoke select on all tables in schema public from authenticated;

grant select on public.profiles         to authenticated;
grant select on public.ropa_categorias  to authenticated;
grant select on public.ropa_entregas    to authenticated;

-- Que las tablas futuras tampoco nazcan legibles por cualquier logueado.
alter default privileges for role postgres in schema public revoke select on tables from authenticated;
