-- 20260907n — Sinónimos que llevaban a dos productos distintos (user 2026-09-07)
--
-- El user preguntó si los separadores de porcelanato estaban "con muchos
-- sinónimos así no hacen cagada". Auditoría de los 5.937 alias activos:
--   · 171 repetidos
--   · 126 en fichas DISTINTAS
--   ·  45 repetidos DENTRO de la misma ficha (basura, no rompe nada)
--
-- La mayoría de los 126 son sanos: "chapa acanalada" está en las 5 fichas de
-- distinto largo y "planchuela" en los dos espesores. Ahí el buscador ofrece
-- las variantes y el usuario elige la medida, que es lo que queremos.
--
-- Esta migración toca SOLO los que llevan a productos que no se parecen, donde
-- elegir mal cuesta plata o pone otra cosa en la obra.
--
-- Recordar cómo matchea el buscador (memoria alias-substring): concatena
-- nombre + rubro + alias en un solo texto y pide que TODOS los tokens del query
-- estén contenidos. Por eso un alias corto y genérico se lleva búsquedas que no
-- le tocan, y por eso sacar un alias corto casi nunca esconde la ficha: su
-- propio nombre suele contener el texto.
--
-- NO se fusiona ninguna ficha. Tres pares parecen duplicados de verdad y eso lo
-- decide el user, porque mueve los renglones que ya apuntan a cada una:
--   · 62 Fotocelda            vs 1166 Fotocélula (interruptor crepuscular)
--   · 931 Rejilla vent. 15x30 vs  977 Ventilación gas 15x30
--   · 1245 Térmica tetrapolar 4x32A vs 1429 Térmica 4x32A sin marca

create temp table sacar (id int, alias text);
insert into sacar values
  -- ═══ Porcelanato: el juego vs la cuña sola ($33,86 vs $5) ═══════════════
  -- "cuñas niveladoras" describe la CUÑA, no el juego. Queda en 944.
  (555, 'cunas niveladoras'),
  (555, 'cunas niveladoras violetas usadas'),

  -- ═══ Separadores: bolsa de clips vs crucetas ($8.080 la bolsa vs $59) ════
  -- "separadores 2mm" queda en las crucetas, que son EL separador de 2mm
  -- clásico. La bolsa conserva "separadores nivelantes/autonivelantes/de
  -- porcelanato", que sí la describen.
  (318, 'separadores 2mm'),
  -- "separadores" a secas se lleva cualquier búsqueda que contenga la palabra.
  (318, 'separadores'),

  -- ═══ La careta vs la soldadora entera ════════════════════════════════════
  -- 1130 conserva "soldador con careta" y "soldador completo + careta".
  (1130, 'careta de soldar'),

  -- ═══ Estabilizador de portón vs de tensión ═══════════════════════════════
  -- Alias corto sin valor: las dos lo tienen en el nombre o en alias largos.
  (908, 'estabilizador'),
  (1188, 'estabilizador'),

  -- ═══ Tablón de pino vs tablón metálico de andamio ════════════════════════
  -- Las dos dicen "tablón" en el nombre; el alias corto no aporta.
  (638, 'tablon'),
  (1112, 'tablon'),

  -- ═══ Geotextil vs velo de fibra ══════════════════════════════════════════
  -- El "rollo de velo" es el velo de fibra (906).
  (686, 'rollo de velo'),

  -- ═══ Virulana vs viruta de acero mediana ═════════════════════════════════
  -- 1149 se llama literalmente "Viruta de acero mediana"; 818 conserva
  -- "paquetes de viruta mediana", que es largo y específico.
  (818, 'viruta mediana'),

  -- ═══ Mapeflex PU es de MAPEI, no es Sikaflex ═════════════════════════════
  -- Estaba en las DOS fichas de Sikaflex. Queda solo en la 1A Plus, que es la
  -- que se usa (25 renglones contra 2).
  (696, 'mapleflex pu'),

  -- ═══ Módulo suelto vs llave armada (bastidor + tapa) ═════════════════════
  -- Son cosas distintas: el módulo es la tecla, la llave armada viene lista.
  -- "módulo de 1 punto" se queda en los MÓDULOS.
  (53,   'modulo de 1 punto'),
  (53,   'modulos de 1 punto'),
  (1361, 'modulo de 1 punto kalop'),  (1361, 'kalop modulo de 1 punto'),
  (1361, 'modulos de 1 punto kalop'), (1361, 'kalop modulos de 1 punto'),
  (1362, 'modulo de 1 punto cambre'), (1362, 'cambre modulo de 1 punto'),
  (1362, 'modulos de 1 punto cambre'),(1362, 'cambre modulos de 1 punto'),
  (1363, 'modulo de 1 punto jeluz'),  (1363, 'jeluz modulo de 1 punto'),
  (1363, 'modulos de 1 punto jeluz'), (1363, 'jeluz modulos de 1 punto'),
  (1364, 'modulo de 1 punto sica'),   (1364, 'sica modulo de 1 punto'),
  (1364, 'modulos de 1 punto sica'),  (1364, 'sica modulos de 1 punto'),

  -- ═══ Térmica vs diferencial: el peor de todos ════════════════════════════
  -- "easy9 2x25a" y "limit 2x25a" dicen la línea y el calibre pero NO el tipo,
  -- y estaban en la térmica Y en el diferencial. No son intercambiables.
  (1403, 'easy9 2x25a'), (1406, 'easy9 2x25a'),
  (1415, 'easy9 2x40a'), (1412, 'easy9 2x40a'),
  (1401, 'limit 2x25a'), (1404, 'limit 2x25a'),
  (1413, 'limit 2x40a'), (1410, 'limit 2x40a');

update public.stock_materiales m
   set alias = array(select a from unnest(m.alias) a
                      where norm_material(a) not in (select norm_material(s.alias) from sacar s where s.id = m.id)),
       updated_at = now()
 where m.id in (select distinct id from sacar);

-- Las dos térmicas de 2x25 quedaban con un solo alias (el código del
-- proveedor) porque su línea era el único otro. Se les da el nombre con el que
-- se piden, que es el patrón de sus hermanas de 2x40.
update public.stock_materiales
   set alias = array(select distinct x from unnest(
                 alias || array['termica 2x25 sica','llave termica 2x25 sica','sica termica 2x25']) x),
       updated_at = now()
 where id = 1401;
update public.stock_materiales
   set alias = array(select distinct x from unnest(
                 alias || array['termica 2x25 schneider','llave termica 2x25 schneider','schneider termica 2x25']) x),
       updated_at = now()
 where id = 1403;

-- ═══ 45 alias repetidos DENTRO de la misma ficha ═══════════════════════════
-- Dos textos que normalizan igual ("fotocelula" y "fotocélula", "laser" dos
-- veces). No rompen nada, solo ensucian el blob de búsqueda. Se deja uno.
update public.stock_materiales m
   set alias = array(select distinct on (norm_material(a)) a
                       from unnest(m.alias) a order by norm_material(a), a),
       updated_at = now()
 where m.activo
   and (select count(*) from unnest(m.alias) a) <>
       (select count(distinct norm_material(a)) from unnest(m.alias) a);

drop table sacar;
