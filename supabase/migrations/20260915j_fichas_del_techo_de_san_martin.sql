-- Las cuatro fichas que nacieron con el pedido del techo de SAN MARTIN 1050
--
-- Nicolás cargó el pedido 807 (obra CC-028, 40 renglones) y creó cuatro fichas
-- desde el alta rápida. Nacen sin sinónimos, que es lo normal: el alta rápida
-- pide rubro, unidad y precio, no alias. Y sin alias el buscador del pedido no
-- las encuentra salvo que alguien escriba el nombre técnico entero, que es
-- justo el cuello de botella que describe §5.15.
--
-- Las cuatro están limpias para tocar: 0 filas en materiales_a_cuenta_cliente,
-- 0 en herr_entregas, 0 movimientos de stock y ningún renglón fuera del 807
-- (verificado antes de escribir esto). Los renglones del 807 están todos en
-- `pendiente`, así que la descripción desnormalizada se puede sincronizar sin
-- tocar nada congelado.
--
-- ── 1. Nombres ────────────────────────────────────────────────────────
-- 2743 tiene un ERROR DE TIPEO en el nombre: "sinusoudal". Queda en el
-- catálogo para siempre si no se corrige ahora.
--
-- 2742 y 2743 además rompen el formato de sus cinco hermanas, que son
-- 1.10x2m / 3m / 4m / 5m / 6m: las nuevas dicen "1.10x2.5" y "1.10x3.5" SIN la
-- "m". En una lista ordenada por nombre eso se lee como otra cosa, y el
-- Combobox agrupa por nombre.
--
-- 2745 va con "x600ml" pegado mientras su hermana de 300ml (ficha 1241) usa
-- "x 300ml". Misma familia, misma escritura.
--
-- 2744 vino en Mayúscula De Título y con el nombre completo de catálogo de
-- proveedor. Se acorta y el texto largo queda como alias, que es donde sirve.

update public.stock_materiales
   set nombre = 'Chapa sinusoidal galv. C25 1.10x2.5m'
 where id = 2742 and nombre = 'Chapa sinusoidal galv. C25 1.10x2.5';

update public.stock_materiales
   set nombre = 'Chapa sinusoidal galv. C25 1.10x3.5m'
 where id = 2743 and nombre = 'Chapa sinusoudal galv. C25 1.10x3.5';

update public.stock_materiales
   set nombre = 'Tapa selladora curva p/ tornillo de techo'
 where id = 2744 and nombre = 'Tapa Selladora Curva Para Tornillo Techo Chapa Sinusoidal';

update public.stock_materiales
   set nombre = 'Sellador PU 3M 550 x 600ml (salchicha)'
 where id = 2745 and nombre = 'Sellador PU 3M 550 x600ml (salchicha)';

-- La descripción de MCC y del pañol es una foto desnormalizada (§5.17), pero
-- estos renglones todavía están pendientes y no llegaron a ninguna de las dos.
-- Se sincroniza solo la del pedido, que es la que el usuario ve.
update public.solicitud_compra_item i
   set descripcion = m.nombre
  from public.stock_materiales m
 where m.id = i.material_id
   and i.material_id in (2742, 2743, 2744, 2745)
   and i.estado = 'pendiente'
   and i.descripcion is distinct from m.nombre;

-- ── 2. Sinónimos ──────────────────────────────────────────────────────
-- Criterio de §5.15: el matcher del Combobox es `includes()` sobre un blob de
-- nombre + rubro + alias, así que van las formas CON y SIN preposición, y las
-- dos escrituras del decimal (2.5 y 2,5) porque `normalizeText` no toca la
-- puntuación.
--
-- Los genéricos de la familia de chapas ("acanalada", "chapa calibre 25",
-- "chapa ranurada"...) se repiten a propósito en las siete fichas, igual que
-- ya están en las cinco viejas: quien busque en genérico tiene que ver todas
-- las medidas y elegir. Es la misma doctrina que dejó escrita 20260913s para
-- los travesaños. No hay riesgo de los que advierte §5.15 porque todas
-- comparten unidad ('unid') y son el mismo producto en distinto largo.

update public.stock_materiales
   set alias = array['acanalada','chapa acanalada','chapa calibre 25','chapa ranurada',
                     'chapas acanaladas','chapas grises ranuradas','chapas ranuradas',
                     'chapa de 2.5 mts','chapa de 2,5 mts','chapas 2.5 mts','chapa 2.5',
                     'chapa 2,5','chapa sinusoidal 2.5','chapa acanalada 2.5',
                     'chapa de 2.5','chapa de 2,5']::text[]
 where id = 2742;

update public.stock_materiales
   set alias = array['acanalada','chapa acanalada','chapa calibre 25','chapa ranurada',
                     'chapas acanaladas','chapas grises ranuradas','chapas ranuradas',
                     'chapa de 3.5 mts','chapa de 3,5 mts','chapas 3.5 mts','chapa 3.5',
                     'chapa 3,5','chapa sinusoidal 3.5','chapa acanalada 3.5',
                     'chapa de 3.5','chapa de 3,5']::text[]
 where id = 2743;

-- "tapita" es como se pide en la obra; el nombre largo del proveedor entra
-- como alias para que quien copie y pegue del presupuesto la encuentre.
update public.stock_materiales
   set alias = array['tapa selladora','tapas selladoras','tapa selladora curva',
                     'tapita selladora','tapitas selladoras','tapita para tornillo',
                     'tapitas para tornillos','tapa para tornillo de techo',
                     'tapa tornillo techo','tapa tornillo chapa',
                     'tapa selladora chapa sinusoidal','capuchon tornillo techo',
                     'tapa selladora curva para tornillo techo chapa sinusoidal']::text[]
 where id = 2744;

-- OJO con la familia 3M 550: la ficha 1241 es la de 300ml y tiene los alias
-- genéricos ("3m 550", "sellador 3m", "pu 3m 550"). Esta es la de 600ml, y
-- vale el DOBLE. Por eso acá NO se repite ningún genérico corto: todos los
-- alias llevan el tamaño o la palabra "salchicha". Es el caso exacto que
-- advierte §5.15 sobre fichas hermanas con distinta presentación.
update public.stock_materiales
   set alias = array['sellador 3m 600','sellador 3m 550 600','3m 550 600',
                     'sellador 3m 550 600ml','pu 3m 550 600','salchicha 3m',
                     'sellador 3m salchicha','salchicha sellador 3m',
                     'sellador poliuretano 3m 600','sellador canaletas salchicha',
                     '3m 550 salchicha','sellador 3m 550 salchicha']::text[]
 where id = 2745;

-- Y a la de 300ml se le SUMAN (no se le sacan) los alias que la distinguen de
-- la salchicha nueva. Sacarle los genéricos sería romper lo que ya funciona;
-- agregarle los específicos alcanza para que quien diga el tamaño caiga bien.
update public.stock_materiales
   set alias = (
     select array(select distinct e from unnest(
       alias || array['sellador 3m 300','sellador 3m 550 300','3m 550 300',
                      'sellador 3m 550 300ml','pomo 3m 550','cartucho 3m 550']::text[]) e)
   )
 where id = 1241;
