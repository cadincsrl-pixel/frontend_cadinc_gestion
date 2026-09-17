-- Clínica Heras, Clínica YB y Clínica San Juan son por administración, con
-- los porcentajes de Clínica Salta
--
-- El user, 17/09, con el resumen nuevo de todas las obras adelante: "clinica
-- san juan, clinica heras, clinica YB son por administracion con los mismos
-- porcentajes que clinica salta". Son las obras de ANIMAR, que las paga todas
-- juntas con un solo saldo (diario del 08/09).
--
-- CÓMO ESTABAN:
--   CC CLINICA HERAS   presupuesto cerrado  → 113 renglones a cobrar, $4,7M,
--                                             y $11,2M de jornales que no se
--                                             facturaban
--   CC clinica YB      por administración   → pero SIN porcentajes: al costo
--   CC-029 SAN JUAN    presupuesto cerrado  → 6 renglones, $66.579
--
-- QUÉ PORCENTAJES. Salta tiene dos versiones: 100/20/0 desde el 13/03 y
-- 95/20/0 desde el 04/09. El 08/09 el user dijo que el correcto para ANIMAR
-- es 95 y que el 100 era un error del sistema que iba a corregir él (memoria
-- animar-clinica-salta). Se le preguntó cuál copiar y eligió 95/20/0 EN TODAS
-- LAS SEMANAS. Salta no se toca: es su acomodo manual.
--
-- DESDE CUÁNDO. El % se aplica por semana con la versión vigente, y antes de
-- la primera versión no hay % (0). Así que `desde` es el VIERNES de la primera
-- semana con movimiento de cada obra, para que ninguna quede al costo:
--   Heras     13/03 (primera hora ese mismo día — arrancó con Salta)
--   YB        03/04
--   San Juan  11/09 (primer material el 16/09, miércoles)
-- El backend exige viernes (`DESDE_NO_ES_VIERNES`); los tres lo son.
--
-- QUÉ ARRASTRA. Marcar `por_administracion` dispara
-- `trg_obras_recalc_a_cargo_de`, que recalcula `a_cargo_de` de la cuenta.
-- En estas tres no cambia nada: ya estaban a cargo del cliente, no tienen
-- consumibles propios (que en administración volverían a la deuda), ni
-- cobros, ni certificados, ni renglones congelados. Lo que cambia es el
-- TOTAL: ahora entran jornales y contratistas con su %.
--
-- Es lo mismo que hace `guardarAdminTarifa` desde la pantalla (upsert por
-- obra+desde, y prender el flag en obras de cliente), tres veces.

insert into public.obras_admin_tarifas (obra_cod, desde, pct_operarios, pct_contratistas, pct_materiales, created_by)
values
  ('CC CLINICA HERAS', '2026-03-13', 95, 20, 0, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'),
  ('CC clinica YB',    '2026-04-03', 95, 20, 0, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'),
  ('CC-029',           '2026-09-11', 95, 20, 0, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8')
on conflict (obra_cod, desde) do update
  set pct_operarios    = excluded.pct_operarios,
      pct_contratistas = excluded.pct_contratistas,
      pct_materiales   = excluded.pct_materiales;

update public.obras
   set por_administracion = true,
       updated_at = now()
 where cod in ('CC CLINICA HERAS', 'CC-029')
   and not por_administracion;
