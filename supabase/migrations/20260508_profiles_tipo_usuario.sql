-- Tipo de usuario (plantilla de permisos aplicada).
-- Sirve para listar usuarios por rol funcional y para detectar si fue
-- modificado manualmente (en ese caso queda 'personalizado').
alter table public.profiles
  add column if not exists tipo_usuario text;

comment on column public.profiles.tipo_usuario is
  'Plantilla de permisos aplicada al usuario (administrativo, compras, encargado_deposito, jefe_obra, capataz). null o "personalizado" si fue editado manualmente.';
