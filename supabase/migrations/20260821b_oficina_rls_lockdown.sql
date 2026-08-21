-- Cierre de RLS para las tablas oficina_* (sueldos administrativos = dato
-- sensible con flag opt-in `tarja.costos_oficina`).
--
-- Con la policy permisiva de 20260821_oficina_costos, cualquier usuario
-- autenticado del ERP podía leer oficina_sueldos directo por PostgREST con la
-- anon key + su JWT, bypasseando el flag. A diferencia del resto del modelo
-- (§5.4), acá el punto entero de la feature es restringir quién ve sueldos.
--
-- Excepción ACOTADA a estas 3 tablas nuevas — NO cambia el modelo general:
-- RLS queda habilitado SIN policies → `authenticated` no accede; el
-- service_role (backend, que valida el flag en requireFlag antes) bypassea
-- RLS. El service usa el cliente admin `supabase`, no el per-request (§9).

drop policy if exists "auth_all" on oficina_personal;
drop policy if exists "auth_all" on oficina_sueldos;
drop policy if exists "auth_all" on oficina_asignaciones;
