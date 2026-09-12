-- Loxon LD Interior Mate PRO: ficha propia, y NO es el Pro 720
-- ============================================================
-- 2026-09-12. Del recuento de Sosa + la foto del balde.
--
-- En la fila 5 de la planilla Sosa anoto "LOXON PRO -> 0,5". La hipotesis era
-- que fuera el Sherwin Pro 720 (ficha 1161) anotado fuera de lugar, porque la
-- fila 45 —la del Pro 720— quedo vacia. La foto la descarta: el balde dice
-- "LOXON Larga Duracion / Interior Mate / PRO", con Extra Blancura, Antihongo y
-- Superlavable. Es la sublinea PRO del Loxon LD, otro producto.
--
-- POR QUE 18 LTS Y NO 20: el "termina en 20" vale para las bases ENTONADAS
-- (20260913w) — la base de 18 mas las tintas. Este es blanco de fabrica, extra
-- blancura, no se entona, asi que no recibe tintas. Y la tapa del balde de la
-- foto trae el codigo "...AE1001 18L". Los dos indicios coinciden. Si resulta
-- que es de 20, el arreglo es renombrar el texto: la `unidad` es 'lata' y no
-- cambia, asi que no reinterpreta ningun movimiento.
--
-- Sin precio (§5.15): nunca se compro por el sistema, no hay de donde sacarlo.
--
-- El -2 del Pro 720 (1161) queda en pie y ya tiene explicacion: el 10/09 se
-- despacharon 2 a CC-025 sin que se hubiera registrado la entrada. Sosa no
-- conto ninguno. Ese ajuste va en 20260914b.

insert into stock_materiales (rubro_id, nombre, unidad, clase, precio_ref, stock_actual, stock_minimo, activo, obs, alias)
values (5, 'Látex interior Loxon LD mate PRO blanco x 18lts', 'lata', 'material', 0, 0, 0, true,
  'Alta 2026-09-12 por el recuento: Sosa conto media lata abierta. Sublinea PRO del Loxon Larga Duracion, blanco de fabrica (extra blancura, antihongo, superlavable). NO es el Sherwin Pro 720. Blanco de fabrica: no se entona, se queda en 18 lts.',
  array['loxon pro','loxon ld pro','loxon interior pro','loxon pro interior','loxon pro 18',
        'loxon larga duracion pro','loxon interior mate pro','pro extra blancura',
        'loxon pro blanco','loxon mate pro']);

do $$
declare v_n integer; v_choque integer;
begin
  select count(*) into v_n from stock_materiales
   where activo and nombre = 'Látex interior Loxon LD mate PRO blanco x 18lts';
  if v_n <> 1 then raise exception 'Esperaba 1 ficha Loxon PRO, hay %', v_n; end if;

  select count(*) into v_choque from stock_materiales m
   where m.activo and m.id <> (select id from stock_materiales where nombre = 'Látex interior Loxon LD mate PRO blanco x 18lts')
     and norm_txt(m.nombre || ' ' || coalesce(array_to_string(m.alias,' '),'')) like '%loxon pro%';
  if v_choque > 0 then raise exception '% fichas mas matchean "loxon pro"', v_choque; end if;
end $$;
