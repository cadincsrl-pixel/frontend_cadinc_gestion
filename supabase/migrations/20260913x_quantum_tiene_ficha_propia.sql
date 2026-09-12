-- Quantum sale de la ficha generica y tiene la suya
-- =================================================
-- 2026-09-12. Del recuento de Sosa + la foto del balde.
--
-- La etiqueta dice "Quantum - Latex Acrilico Exterior-Interior Mate, 20L,
-- BLANCO" (Sherwin Williams). Dos cosas de eso importan:
--   1. Es exterior E interior. Sosa lo conto en la seccion de interior y estaba
--      bien; la ficha que decia "Latex exterior x 20lts" era la equivocada.
--   2. Es un producto de marca escondido dentro de una ficha generica, que es
--      justo el patron que §5.15 marca como fuente de duplicados.
--
-- Se crea ficha propia siguiendo el nombre de su hermano de linea, la 1161
-- "Latex exterior/interior Sherwin Pro 720 x 20lts".
--
-- NO se renombra la 115: sus cinco renglones dicen "Latex exterior x 20lts" sin
-- color ni marca, asi que no hay evidencia de que fueran Quantum. Renombrarla
-- reclamaria retroactivamente cinco compras que quizas no lo eran. Lo que si se
-- hace es SACARLE el alias 'quantum frentes x 20 lts': con la ficha propia
-- creada, ese alias mandaria las busquedas de Quantum a la generica.
--
-- Sin precio (§5.15): los renglones de la 115 van de $139.640 a $177.412 pero
-- ninguno esta atribuido a Quantum, asi que inventar el precio seria adivinar.
--
-- El alias 'quantum frentes' NO se muda: la etiqueta no dice "frentes" en
-- ninguna parte. Si aparece un Quantum Frentes de verdad, lleva ficha aparte.

insert into stock_materiales (rubro_id, nombre, unidad, clase, precio_ref, stock_actual, stock_minimo, activo, obs, alias)
values (5, 'Látex exterior/interior Quantum blanco x 20lts', 'lata', 'material', 0, 0, 0, true,
  'Alta 2026-09-12 por el recuento: Sosa conto 1 balde. Sherwin Williams, latex acrilico mate, sirve para interior y exterior. Antes se pedia por la ficha generica 115.',
  array['quantum','quantum 20','quantum blanco','latex quantum','quantum sherwin',
        'sherwin quantum','quantum mate','quantum acrilico','quantum exterior interior',
        'quantum 20 lts','quantum x 20']);

update stock_materiales
   set alias = array_remove(alias, 'quantum frentes x 20 lts'),
       obs = coalesce(nullif(obs,'') || ' ', '') ||
             'El alias de Quantum se movio a su ficha propia el 2026-09-12 (ver 20260913x): esta queda como latex exterior generico sin marca.',
       updated_at = now()
 where id = 115;

do $$
declare v_nueva integer; v_alias integer;
begin
  select count(*) into v_nueva from stock_materiales
   where activo and nombre = 'Látex exterior/interior Quantum blanco x 20lts';
  if v_nueva <> 1 then raise exception 'Esperaba 1 ficha Quantum, hay %', v_nueva; end if;

  select count(*) into v_alias from stock_materiales m, unnest(m.alias) a
   where m.id = 115 and norm_txt(a) like '%quantum%';
  if v_alias <> 0 then raise exception 'La ficha 115 todavia tiene % alias de quantum', v_alias; end if;
end $$;
