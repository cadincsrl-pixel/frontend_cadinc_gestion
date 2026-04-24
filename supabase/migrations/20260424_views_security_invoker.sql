-- =====================================================================
-- Hardening: views de combustible con security_invoker = true.
--
-- En PostgreSQL 15+, una view creada sin esta opción ejecuta las RLS
-- policies de las tablas subyacentes con el rol del OWNER de la view
-- (en Supabase típicamente postgres/supabase_admin), no del invocante.
-- Eso significa que aunque la RLS de la tabla base restrinja a un rol
-- específico, la view las bypasea.
--
-- Hoy el proyecto usa RLS permisiva (using=true), así que no hay
-- explotación inmediata. Pero si en el futuro se estrictan policies
-- sobre cargas_combustible o gastos_logistica, estas views seguirían
-- devolviendo todo. Defensa en profundidad.
--
-- Ver: https://www.postgresql.org/docs/current/sql-createview.html
-- =====================================================================

alter view public.v_cargas_combustible       set (security_invoker = true);
alter view public.v_consumo_camion_odometro  set (security_invoker = true);
alter view public.v_consumo_chofer_mes       set (security_invoker = true);
