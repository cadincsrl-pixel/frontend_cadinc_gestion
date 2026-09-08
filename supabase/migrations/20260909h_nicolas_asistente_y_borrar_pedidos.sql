-- Nicolás Valdez: asistente prendido y permiso para borrar pedidos
--
-- Paso previo a que el asistente pueda cargar pedidos dictados. Dos cambios,
-- los dos con OK del user (2026-09-08):
--
-- 1. `tarja.asistente_ia` estaba en null, o sea que requireFlag le devolvía 403
--    y Nicolás no veía ni el botón del asistente. Es el único que carga la
--    mayoría de los pedidos y era el que no lo tenía.
--
-- 2. `certificaciones.eliminacion` en true. Hoy puede crear pedidos y no
--    borrarlos: si el asistente le carga uno mal, se lo tiene que pedir a otro.
--    Si crear se vuelve barato —que es todo el punto de dictarlos— deshacer
--    tiene que serlo también. La ventana se cierra sola igual: eliminar_solicitud
--    ya rechaza con 409 si algún renglón entró a un cobro.

update public.profiles
   set permisos = jsonb_set(
         jsonb_set(permisos, '{tarja,asistente_ia}', 'true'::jsonb, true),
         '{certificaciones,eliminacion}', 'true'::jsonb, true)
 where nombre = 'Nicolas Valdez';
