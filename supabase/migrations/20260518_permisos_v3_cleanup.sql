-- Permisos v3 — limpieza de DB.
--
-- 1) Elimina flags legacy de profiles.permisos:
--    - tarja.solo_carga_horas (reemplazado por tabs=['tarja'] + obras_scope='asignadas')
--    - tarja.vista_completa   (reemplazado por obras_scope global)
--    - <modulo>.obras_scope    (override por módulo que casi nadie usaba)
--
-- 2) Elimina usuario_obras.modulo + su CHECK constraint
--    (la columna existe pero todas las 35 filas tienen modulo=null).
--
-- 3) Elimina la tabla `modulos` — ya no es source of truth, la constante
--    única ahora vive en `cadincsrl/src/lib/modulos.ts`.
--
-- Backup pre-migración disponible en:
--   public.profiles_backup_2026_05_pre_v3
--   public.usuario_obras_backup_2026_05_pre_v3

begin;

update public.profiles set permisos = (
  select jsonb_object_agg(modkey, modval_clean)
  from (
    select mod_kv.key as modkey,
      (mod_kv.value
        - 'solo_carga_horas'
        - 'vista_completa'
        - 'obras_scope'
      ) as modval_clean
    from jsonb_each(coalesce(profiles.permisos, '{}'::jsonb)) as mod_kv
  ) cleaned
)
where permisos is not null and jsonb_typeof(permisos) = 'object';

alter table public.usuario_obras drop constraint if exists usuario_obras_modulo_chk;
alter table public.usuario_obras drop column if exists modulo;

drop table if exists public.modulos cascade;

commit;
