-- LAMADRID 566 (CC-016) pasa a obra por administración
--
-- Porcentajes del user (08/09): 35% sobre la mano de obra, 0% sobre
-- contratistas y 0% sobre materiales — esas dos patas se le cobran al cliente
-- al costo, y por eso el % existe igual con valor cero: la cuenta las suma sin
-- recargo en vez de ignorarlas.
--
-- Desde 2026-07-10, que es el viernes de la primera semana con horas cargadas
-- (la obra arrancó ahí; el primer material es del 21/07 y la primera
-- certificación del 07/08): la cuenta calcula TODO lo histórico con este
-- porcentaje, que es como se venía facturando a mano.

insert into public.obras_admin_tarifas
  (obra_cod, desde, pct_operarios, pct_contratistas, pct_materiales)
values ('CC-016', '2026-07-10', 35, 0, 0)
on conflict (obra_cod, desde) do update
  set pct_operarios = 35, pct_contratistas = 0, pct_materiales = 0;

update public.obras set por_administracion = true where cod = 'CC-016';
