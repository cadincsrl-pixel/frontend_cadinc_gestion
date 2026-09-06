-- 20260906r — Baja de la cuenta "Bot WhatsApp" (auxiliar.cadinc@gmail.com).
--
-- Creada el 06/08 para un flujo de WhatsApp que no existe; tenía permiso de
-- crear pedidos por API con una casilla de Gmail compartida y figuraba "Sin
-- acceso" en la lista de usuarios (modulos[] vacío vs permisos en el JSON).
-- El user decidió borrarla el 2026-09-06 ("no se usará").
--
-- audit_log.user_id tenía FK a auth.users: un log de solo agregar no puede
-- impedir que se borre un usuario. Se saca la FK (el id queda como uuid
-- suelto y el nombre ya viaja en user_nombre) y, con el trigger de solo
-- agregar apagado solo dentro de esta migración, se completa el nombre en
-- las 6 filas viejas del bot para que la pantalla no muestre "…".

alter table public.audit_log drop constraint if exists audit_log_user_id_fkey;

alter table public.audit_log disable trigger trg_audit_log_solo_agregar;
update public.audit_log
   set user_nombre = 'Bot WhatsApp'
 where user_id = 'efbed2d7-7366-487f-8c54-1733f473017c'
   and coalesce(user_nombre, '') = '';
alter table public.audit_log enable trigger trg_audit_log_solo_agregar;

-- Borrar el usuario de Auth cascadea a profiles (y de ahí a usuario_obras y
-- al historial de permisos, ambos sin filas del bot).
delete from auth.users
 where id = 'efbed2d7-7366-487f-8c54-1733f473017c'
   and email = 'auxiliar.cadinc@gmail.com';
