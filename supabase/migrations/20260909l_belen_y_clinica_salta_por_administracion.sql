-- CASA BELEN y CLINICA SALTA pasan a obras por administración
--
-- Porcentajes del user (08/09), cada uno desde el viernes de la primera
-- actividad de su obra, así la cuenta calcula todo lo histórico tal como se
-- venía facturando a mano:
--
--   CASA BELEN (CC-006)            35% operarios ·  0% contratistas · 0% materiales
--     igual que LAMADRID; desde 2026-05-15.
--   CLINICA SALTA (CC CLINICA SALTA) 100% operarios · 20% contratistas · 0% materiales
--     "el doble en operarios" (dijo 200 primero y lo corrigió a 100: costo × 2);
--     desde 2026-03-13.
--
-- El 0% no es "no se cobra": es que esa pata va a la cuenta AL COSTO.

insert into public.obras_admin_tarifas
  (obra_cod, desde, pct_operarios, pct_contratistas, pct_materiales)
values
  ('CC-006',           '2026-05-15',  35,  0, 0),
  ('CC CLINICA SALTA', '2026-03-13', 100, 20, 0)
on conflict (obra_cod, desde) do update
  set pct_operarios    = excluded.pct_operarios,
      pct_contratistas = excluded.pct_contratistas,
      pct_materiales   = excluded.pct_materiales;

update public.obras set por_administracion = true
 where cod in ('CC-006', 'CC CLINICA SALTA');
