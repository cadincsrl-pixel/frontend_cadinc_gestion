-- Pasaje Kotch fue llave en mano; Balsa Franco es por administración al costo
--
-- Los dos salieron del resumen de todas las obras, el mismo día que nació.
--
-- 1. PASAJE KOTCH (CC-021). El user: "pasaje kotch no me aparece como llave
--    en mano, me sigue apareciendo un saldo en los materiales". Nadie la había
--    tocado (último cambio el 05/08, sin entradas hoy en audit_log): estaba
--    con materiales al cliente, 27 renglones a cobrar por $634.696,27 que no
--    iban a cobrarse. Mismo arreglo que Pinar 2 (20260917i): un UPDATE, y
--    `trg_obras_recalc_a_cargo_de` pasa los 27 a gasto de CADINC. Sin cobros,
--    certificados ni renglones congelados. Probado con rollback: 27
--    renglones en gasto_cadinc, cero a cobrar.
--
-- 2. BALSA FRANCO (CC-030). El user: "balsa franco no tiene porcentaje". Es
--    por administración (la creó él hoy 18:02) y se factura AL COSTO. La
--    tabla la marcaba en naranja como "sin porcentajes cargados, calculando
--    al costo" — que es exactamente la situación, pero como omisión. Con una
--    versión explícita en 0/0/0 el sistema deja de preguntar: es decisión, no
--    olvido. `desde` = el viernes de la semana del primer material (16/09).

update public.obras
   set materiales_a_cargo_de = 'cadinc',
       updated_at = now()
 where cod = 'CC-021'
   and materiales_a_cargo_de = 'cliente';

insert into public.obras_admin_tarifas (obra_cod, desde, pct_operarios, pct_contratistas, pct_materiales, created_by)
values ('CC-030', '2026-09-11', 0, 0, 0, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8')
on conflict (obra_cod, desde) do nothing;
