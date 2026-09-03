-- Sinónimos ronda 2, parte 2 (2026-09-03). Ajustes después de la verificación adversarial
-- del workflow (66 confirmados, 6 refutados, 55 sin verificar por límite de uso → verificados
-- a mano con el chequeo mecánico de colisión/medida/hermanos).
--
-- REFUTACIONES aceptadas sobre lo aplicado en 20260903_sinonimos_ronda_2:
--   "mapleflex pu" colgaba de "Sika 221" (696): es el PU genérico de Maple, va a la fila
--     genérica "Sellador poliuretano x 300ml" (179), que ya absorbe otras marcas.
--   "perfil 100x50 preparado" era ambiguo: en obra también le dicen "perfil" al caño
--     estructural 100x50x2 (422). Se saca; queda "perfil c 100x50" que sí dice C.
--   "griferia lavamanos" → "Grifería monocomando baño" (214) era inferencia por descarte
--     (214 nunca fue elegido en ningún pedido). Se saca.
--   "entonador marron": el color es el SKU → la fila 375 pasa a usa_color para que el
--     color viaje en el campo color y no se pierda al aceptar la sugerencia.
--   "bolsa de separadores": CC-004 lo usa para crucetas 2mm (553) y CC-005 para
--     niveladores (555), mismo texto, dos productos. Ambiguo de verdad → sin alias.
--
-- RECHAZADOS del lote sin verificar (para que no vuelvan):
--   "sikafill" solo (hay 5/10/20 kg), "bolsa de poximix" (697 es pasta epoxi por unidad,
--   el pedido era bolsa de 5 kg), "curva 100" (100 ≠ 110), "pegamento fluido" sin
--   porcelanato, "arnes completo + cabo de vida" (dos productos), "pistola para cartucho
--   grande" (pistola de salchicha, otro producto).

create or replace function pg_temp.add_alias(p_id int, variadic p_alias text[]) returns void
language sql as $$
  update public.stock_materiales
     set alias = (select array_agg(distinct a) from unnest(alias || p_alias) a)
   where id = p_id and activo;
$$;
create or replace function pg_temp.del_alias(p_id int, variadic p_alias text[]) returns void
language sql as $$
  update public.stock_materiales
     set alias = (select coalesce(array_agg(a), '{}') from unnest(alias) a where a <> all(p_alias))
   where id = p_id;
$$;

-- ── Correcciones ──────────────────────────────────────────────────────────
select pg_temp.del_alias(696, 'mapleflex pu', 'mapleflex');
select pg_temp.add_alias(179, 'mapleflex pu', 'mapleflex');
select pg_temp.del_alias(154, 'perfil 100x50 preparado');
select pg_temp.del_alias(214, 'griferia lavamanos', 'griferia de lavatorio');
select pg_temp.del_alias(553, 'bolsa de separadores', 'bolsas de separadores', 'separadores');
update public.stock_materiales set usa_color = true where id = 375 and not usa_color;

-- ── Confirmados por los verificadores que yo había frenado ────────────────
select pg_temp.add_alias(647, 'protector auditivo');                 -- convención ya fijada: 'protectores auditivos' → copa; tapones → endoaural
select pg_temp.add_alias(816, 'masa');                               -- 816 ya tiene 'maza' y 'masa chica'; CC-005 pidió 'masa' y 'maza de goma' aparte
select pg_temp.add_alias(441, 'disco de widia de 4"');               -- 441 ya tiene 'disco de widia de 4 1/2'
select pg_temp.add_alias(323, 'pegamento para porcelanato fluido');  -- dice porcelanato; 'fluido' es presentación
select pg_temp.add_alias(877, 'chapa galvanizada lisa');             -- única lisa del catálogo, por rollo
select pg_temp.add_alias(799, 'loxon larga duracion antimanchas satinado sw6105 divine white');

-- ── Nuevos (lotes 6-7, verificados a mano) ────────────────────────────────
select pg_temp.add_alias(7,   'codo pvc 110');
select pg_temp.add_alias(37,  'cable 2.5 rojo');
select pg_temp.add_alias(44,  'tableros de 24', 'tablero de 24 bocas');
select pg_temp.add_alias(54,  'llave de 2 puntos', 'llave de dos puntos');
select pg_temp.add_alias(55,  'llave punto y toma', 'llave de punto y toma', 'punto y toma');
select pg_temp.add_alias(59,  'rollo de cano corrugado 3/4');
select pg_temp.add_alias(62,  'fotocelula');
select pg_temp.add_alias(85,  'omegas', 'omergas');
select pg_temp.add_alias(87,  'cemento x 25kg', 'bolsa de cemento');
select pg_temp.add_alias(98,  'barra del 6', 'barras del 6');
select pg_temp.add_alias(99,  'barras del 8', 'barra del 8');
select pg_temp.add_alias(115, 'quantum frentes x 20 lts');
select pg_temp.add_alias(167, 'disco de corte 4 1/2', 'disco de corte de 4 1/2', 'disco para cortar metal 4 1/2');
select pg_temp.add_alias(168, 'disco de corte n9', 'disco de corte 9');
select pg_temp.add_alias(173, 'sikafill blanca fibrada', 'sikafill fibrada roja', 'sikafill x 20');
select pg_temp.add_alias(184, 'codos de 32 awaduct', 'codo de 32');
select pg_temp.add_alias(187, 'curva 110 pvc', 'curva de 110');
select pg_temp.add_alias(189, 'ramal mh 110');
select pg_temp.add_alias(253, 'modulo cambre red', 'modulo de red');
select pg_temp.add_alias(258, 'curvas 3/4', 'curva de 3/4');
select pg_temp.add_alias(277, 'precinto de 15', 'precintos de 15');
select pg_temp.add_alias(358, 'rodillo n22 antigoteo');
select pg_temp.add_alias(383, 'tornillos del 8 con tacos');
select pg_temp.add_alias(412, 'pc 160', 'perfil c 160');
select pg_temp.add_alias(419, 'angulo de 3/4');
select pg_temp.add_alias(440, 'discos de corte 7');
select pg_temp.add_alias(444, 'mecha comun n8 para metal', 'mecha n8 para metal');
select pg_temp.add_alias(504, 'puerta placa oblak 0.80x2.05', 'puerta placa 0.80', 'puerta placa de 80');
select pg_temp.add_alias(526, 'reja para ventana', 'rejas para ventanas');
select pg_temp.add_alias(644, 'gafa transparente', 'gafa trasparente');
select pg_temp.add_alias(808, 'bolsa de escombro', 'bolsas para escombros', 'bolsas de escombro vacias');
select pg_temp.add_alias(809, 'clavo de 2 1/2', 'clavos 2.1/2');
select pg_temp.add_alias(812, 'pistola para cartuchos de silicona');
select pg_temp.add_alias(859, 'disco para porcelanato aliafort', 'disco para porcelanato');
select pg_temp.add_alias(718, 'disco 7” para circular');

drop function pg_temp.add_alias(int, text[]);
drop function pg_temp.del_alias(int, text[]);
