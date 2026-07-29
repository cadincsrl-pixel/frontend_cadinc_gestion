-- Categoría de gasto "Cubiertas", separada de "Gomería".
--
-- Hoy las dos cosas conviven bajo Gomería y una tapa a la otra: de los
-- $5.426.000 de esa categoría, UNA compra de cubiertas ($3.224.000, "8
-- cubiertas" del 07/05 en AH568GJ) es el 59% del total. El resto son arreglos
-- de $80k a $200k — rotaciones, alineados, auxilios. Mezclados, ni el reporte
-- por categoría ni el costo por camión dicen nada útil.
--
-- Va con orden 25 para quedar al lado de Gomería en los selectores.
-- `aplica_a = 'camion'`: una cubierta es del equipo, nunca del chofer.

insert into public.gastos_categorias (codigo, nombre, aplica_a, orden)
values ('cubiertas', 'Cubiertas', 'camion', 25)
on conflict (codigo) do nothing;
