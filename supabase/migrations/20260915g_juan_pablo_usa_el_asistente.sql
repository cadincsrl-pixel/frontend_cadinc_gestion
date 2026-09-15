-- Juan Pablo Ortiz puede usar el asistente IA (y con eso, dictar sus pedidos)
--
-- El user preguntó si el asistente le andaba a Juan Pablo para cargar los
-- pedidos. No: el asistente se gatea con UN flag, `permisos.tarja.asistente_ia`
-- (`requireFlag('tarja','asistente_ia')` en asistente.routes.ts, default false,
-- bypass solo para admin). Juan Pablo es `operador` y su perfil no tenía
-- ninguna clave `tarja`, así que ni veía el botón flotante — `AsistenteChat`
-- hace `if (!asistenteIa) return null` — y la API le devolvía 403 SIN_PERMISO.
--
-- Nada que ver con los pedidos: la carga por dictado exige
-- `certificaciones.creacion`, que YA tenía, y sin lista de `tabs` eso cuenta
-- como todas (`puedeCrearPedidos` en asistente.pedidos.ts). Su `obras_scope`
-- es 'todas'. O sea que con el flag alcanza y no hay que darle nada más.
--
-- El flag NO le da acceso al módulo tarja ni a sus datos: `requireFlag` y
-- `flagCapacidad` leen esa clave del JSONB sin pedir que el módulo esté en
-- `profiles.modulos`. El asistente sigue respondiendo solo con lo que el
-- usuario ya puede ver, porque cada herramienta revalida sus permisos.
--
-- ⚠️ OJO CON EL PATRÓN: la migración gemela `20260913b` (Nicolás, cargar_precios)
-- usa `jsonb_set(permisos, '{certificaciones,cargar_precios}', ...)` y funciona
-- porque esa clave `certificaciones` YA existía. Acá `tarja` no existe, y
-- `jsonb_set` NO crea niveles intermedios: devuelve el JSON intacto y el UPDATE
-- reporta éxito sin haber cambiado nada. Verificado sobre esta fila antes de
-- escribirla. De ahí el `||` en vez de `jsonb_set`.

update public.profiles
   set permisos = permisos
                  || jsonb_build_object(
                       'tarja',
                       coalesce(permisos->'tarja', '{}'::jsonb)
                       || jsonb_build_object('asistente_ia', true)),
       -- Marca que el perfil se aparta de la plantilla de su rol, igual que
       -- hizo `20260915f` al darle `editar_pedidos` el mismo día.
       personalizado = true
 where id = 'a262c99a-e4ea-416f-9601-e6dfd766dc28'
   and coalesce(permisos->'tarja'->>'asistente_ia', 'false') <> 'true';
