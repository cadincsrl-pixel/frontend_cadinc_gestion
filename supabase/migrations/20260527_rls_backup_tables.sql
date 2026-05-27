-- Habilita RLS en las dos tablas de backup creadas por la migración
-- `20260518_permisos_v3_cleanup.sql`. La sintaxis `CREATE TABLE x_backup AS
-- SELECT ...` no copia los settings de RLS del original, así que estas
-- tablas quedaron expuestas via PostgREST con la anon key.
--
-- Sin policies → bloqueo total para anon/authenticated. El service_role
-- bypassa RLS, así que si en algún momento se necesita auditar los backups
-- se hace desde SQL Editor o con el service_role key del backend.
--
-- Alerta original del Supabase Security Advisor: `rls_disabled_in_public`.

ALTER TABLE public.usuario_obras_backup_2026_05_pre_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_backup_2026_05_pre_v3 ENABLE ROW LEVEL SECURITY;
