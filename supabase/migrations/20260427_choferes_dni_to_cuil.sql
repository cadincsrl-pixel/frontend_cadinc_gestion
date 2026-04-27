-- =====================================================================
-- choferes.dni → choferes.cuil
--
-- El campo identificatorio del chofer en CADINC es CUIL (no DNI puro):
-- es lo que se usa para liquidación, AFIP, libros laborales. Renombrar
-- la columna deja la semántica clara y consistente con la UI.
--
-- IF EXISTS guard: la migración es idempotente — si ya se corrió, no
-- vuelve a renombrar.
-- =====================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'choferes'
      and column_name = 'dni'
  ) then
    alter table public.choferes rename column dni to cuil;
  end if;
end $$;
