-- Sinónimos, ronda 2 (2026-09-03). Salen de los pedidos en texto libre que no
-- matcheaban ningún nombre ni sinónimo del catálogo: 1.252 descripciones distintas,
-- 101 repetidas. Se mapearon con agentes y se verificaron DOS veces: verificación
-- adversarial por agente + chequeo mecánico en SQL (colisión con otro material,
-- medida del alias vs medida del nombre, hermanos del mismo material sin
-- desambiguar). Regla que manda: un sinónimo es EL MISMO producto (tipo, medida,
-- presentación); un alias mal puesto es peor que ninguno (lección del porcelanato
-- 58x58 → 30x60 del 2026-09-02).
--
-- Lo que se RECHAZÓ (para que no vuelva a proponerse):
--   "disco de widia de 4"" → Disco diamantado 115mm : widia ≠ diamantado (otro producto)
--   "masa"                 → Maza de acero 3kg       : existe Maza de goma, ambiguo
--   "protector auditivo"   → copa                    : existe endoaural, ambiguo
--   "rodillo n22" (solo)   → pelo corto 23cm         : sin corta/larga, ambiguo
--   "pintura exterior loxon" → Latex exterior 20lts  : 7 hermanos por tamaño, ambiguo
--   "pegamento para porcelanato fluido" → 30kg       : "fluido" es otra formulación
--   "chapa galvanizada lisa" → C25 rollo             : el pedido era por metro, otra presentación
--   "sellador con pistola", "loxon ... sw6105 ..."   : ruido, nadie lo vuelve a tipear así
--
-- CORRECCIONES a aliases existentes (errores míos de la siembra del 2026-09-02):
--   "bolsa de separadores" NO son niveladores: son Crucetas separadoras 2mm (553).
--   "sika 1a" y "sika 1a plus" NO son hidrófugo (Sika 1 sí lo es): Sikaflex 1A / 1A Plus
--   es el SELLADOR de poliuretano. Evidencia: el pedido "selladores sika 1a plus" se
--   compró a 19.760 (precio de cartucho de sellador), y los ítems "sikaflex 1a" del
--   histórico son sellador. Se sacan del hidrófugo (111, 326) y van al sellador (179).

create or replace function pg_temp.add_alias(p_id int, variadic p_alias text[]) returns void
language sql as $$
  update public.stock_materiales
     set alias = (select array_agg(distinct a) from unnest(alias || p_alias) a)
   where id = p_id and activo;
$$;

-- ── Correcciones ──────────────────────────────────────────────────────────
update public.stock_materiales set alias = array_remove(array_remove(alias, 'sika 1a'), 'sika 1a plus') where id in (111, 326);
select pg_temp.add_alias(179, 'sika 1a', 'sika 1a plus', 'sikaflex 1a', 'sikaflex 1a plus');
select pg_temp.add_alias(553, 'bolsa de separadores', 'bolsas de separadores', 'separadores');

-- ── Sinónimos nuevos (verificados) ────────────────────────────────────────
-- Construcción en seco / albañilería
select pg_temp.add_alias(286, 'superboard 10mm');
select pg_temp.add_alias(723, 'bolsas de fino exterior', 'fino exterior');
select pg_temp.add_alias(109, 'pegamento de ceramico', 'pegamento para ceramico', 'bolsas de pegamento de ceramico');
select pg_temp.add_alias(94,  'ladrillos huecos del 12', 'ladrillo hueco del 12');
select pg_temp.add_alias(556, 'alfajias 1x2', 'alfajia 1x2');
select pg_temp.add_alias(555, 'arcos niveladores + cunas', 'arcos niveladores', 'niveladores + cunas');
select pg_temp.add_alias(337, 'reglas de 3ml', 'regla de 3 metros', 'regla de 3m');
-- Ferretería
select pg_temp.add_alias(809, 'clavos 2.5', 'clavos de 2.5');
select pg_temp.add_alias(107, 'clavo de 2"', 'clavos de 2');
select pg_temp.add_alias(384, 'tacos y tornillos n10', 'tornillos con tacos del 10', 'tacos del 10');
select pg_temp.add_alias(383, 'tacos con tornillos del 8 fresados', 'tacos del 8');
select pg_temp.add_alias(854, 'tornillos de 5"', 'tornillo de 5 pulgadas');
select pg_temp.add_alias(435, 'barra lisa del 10', 'hierro liso del 10');
select pg_temp.add_alias(443, 'mecha comun n6 para metal', 'mecha n6 para metal', 'mecha de 6 para metal');
select pg_temp.add_alias(440, 'disco de corte n7', 'disco de corte 7', 'disco de 7');
select pg_temp.add_alias(718, 'disco 7" para circular', 'disco para circular');
select pg_temp.add_alias(839, 'pinza de perro', 'pinsa de perro');
select pg_temp.add_alias(825, 'punta philips', 'punta phillips');
select pg_temp.add_alias(742, 'alargues de 15', 'alargue de 15 metros', 'prolongacion de 15');
select pg_temp.add_alias(691, 'paquetes de estopas', 'paquete de estopa');
select pg_temp.add_alias(818, 'bolsas de viruta fina', 'viruta fina');
select pg_temp.add_alias(903, 'tachos de 20l', 'tachos de 20lts', 'tacho de 20 litros vacio');
select pg_temp.add_alias(151, 'espuma poliuretanica', 'espuma de poliuretano');
select pg_temp.add_alias(671, 'botiquin');
select pg_temp.add_alias(720, 'guantes de cuero pares', 'guantes de cuero');
-- Pintura
select pg_temp.add_alias(126, 'rodillo lana corta', 'rodillo n22 lana corta', 'rodillos n22 pelo corto', 'rodillo lana pelo corto');
select pg_temp.add_alias(358, 'rodillo antigoteo');
select pg_temp.add_alias(361, 'pincel de 1"', 'pincel de 1 pulgada');
select pg_temp.add_alias(120, 'tacho 20 lts de fijador', 'fijador x 20');
select pg_temp.add_alias(117, 'loxon frentes blanco x 4lts', 'loxon frentes 4 lts');
select pg_temp.add_alias(375, 'entonador marron', 'entonadores');
select pg_temp.add_alias(149, 'silicona transparente');
select pg_temp.add_alias(696, 'mapleflex pu', 'mapleflex');
-- Sanitaria / termofusión / PVC
select pg_temp.add_alias(29,  'deposito de inodoro', 'deposito inodoro');
select pg_temp.add_alias(214, 'griferia lavamanos', 'griferia de lavatorio');
select pg_temp.add_alias(201, 't fusion de 25', 'te de 25 fusion', 'te termofusion 25');
select pg_temp.add_alias(17,  'codos de 20', 'codo de 20 fusion');
select pg_temp.add_alias(206, 'tubo macho de 25 x 3/4', 'tubo macho 25x3/4');
select pg_temp.add_alias(208, 'tubo hembra de 25x3/4', 'tubo hembra 25x3/4');
select pg_temp.add_alias(32,  'flexible de 40 cm', 'flexible 40cm');
select pg_temp.add_alias(5,   'codos de 40', 'codo pvc de 40');
select pg_temp.add_alias(189, 'ramal y de 110', 'ramal y de 110x110', 'ramal y 110');
select pg_temp.add_alias(190, 'ramal y de 110x63', 'ramal y 110 a 63');
select pg_temp.add_alias(195, 'reduccion de 63 a 50', 'reduccion 63 a 50');
select pg_temp.add_alias(196, 'reduccion de 50 a 40 awaduct', 'reduccion de 50 a 40');
select pg_temp.add_alias(181, 'canos de 32 awaduct', 'cano de 32 awaduct', 'cano 32 pvc');
select pg_temp.add_alias(673, 'canos de 110 pluvial', 'cano pluvial de 110');
select pg_temp.add_alias(588, 'sombrerete');
select pg_temp.add_alias(491, 'agarre para la canaleta', 'soporte de canaleta');
select pg_temp.add_alias(323, 'pegamento para porcelanato', 'pegamento de porcelanato');
-- Electricidad
select pg_temp.add_alias(53,  'llaves de 1 punto cambre', 'llave de 1 punto', 'modulos de 1 punto', 'modulo de 1 punto');
select pg_temp.add_alias(251, 'llave combinacion cambre', 'llave de combinacion', 'modulo combinacion');
select pg_temp.add_alias(255, 'tapas ciegas cambre', 'tapa ciega cambre');
select pg_temp.add_alias(249, 'reloj mecanico riel din', 'reloj riel din', 'timer riel din');
select pg_temp.add_alias(238, 'cable utp categoria 5', 'cable red categoria 5', 'cable utp cat 5');
select pg_temp.add_alias(239, 'cable utp cat 6', 'cable utp categoria 6');
select pg_temp.add_alias(37,  'cable verde amarillo 2.5', 'cable tierra 2.5');
select pg_temp.add_alias(257, 'cano 1" rigido', 'cano rigido de 1');
select pg_temp.add_alias(259, 'curva de 1"', 'curva rigida de 1');
select pg_temp.add_alias(59,  'rollo de cano 3/4', 'rollo de corrugado 3/4', 'corrugado de 3/4');
-- Herrería / carpintería
select pg_temp.add_alias(154, 'perfil 100x50 preparado', 'perfil c 100x50');
select pg_temp.add_alias(144, 'cerradura comun', 'cerradura de embutir comun');
-- Soldadura
select pg_temp.add_alias(165, 'electrodos de 2.5');

drop function pg_temp.add_alias(int, text[]);
