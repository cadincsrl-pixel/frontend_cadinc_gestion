-- 20260906m — audit_log: solo el backend escribe y lee; nadie edita ni borra.
--
-- Hasta hoy la tabla tenía la policy permisiva `audit_log_all` (using true /
-- with check true) y grants completos para anon y authenticated: cualquier
-- usuario logueado podía, con la anon key y su JWT, leer todo el log, borrar
-- sus propias filas o inventar filas a nombre de otro. El backend ahora
-- inserta y lee con el cliente admin (service_role), así que a los roles de
-- API se les saca todo. Sin policies + RLS activo, aunque alguien vuelva a
-- dar GRANT, PostgREST deniega igual.
--
-- ⚠ Aplicar DESPUÉS de deployar el backend que usa el cliente admin
-- (cadincsrl `audit.service.ts`): si no, el backend viejo (JWT del usuario)
-- deja de poder insertar y la pantalla de Auditoría deja de cargar.

drop policy if exists audit_log_all on public.audit_log;
revoke all on table public.audit_log from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;
alter table public.audit_log enable row level security;

-- Solo agregar: ni UPDATE ni DELETE ni TRUNCATE, ni siquiera con
-- service_role. Si alguna vez hay que depurar el log, se deshabilita el
-- trigger en una migración (queda versionado) y se vuelve a habilitar.
create or replace function public.audit_log_solo_agregar() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log es de solo agregar: % no permitido', tg_op
    using errcode = 'restrict_violation',
          hint = 'Deshabilitá trg_audit_log_solo_agregar en una migración si hace falta depurar el log.';
end $$;

drop trigger if exists trg_audit_log_solo_agregar on public.audit_log;
create trigger trg_audit_log_solo_agregar
  before update or delete on public.audit_log
  for each row execute function public.audit_log_solo_agregar();

drop trigger if exists trg_audit_log_sin_truncate on public.audit_log;
create trigger trg_audit_log_sin_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_solo_agregar();
