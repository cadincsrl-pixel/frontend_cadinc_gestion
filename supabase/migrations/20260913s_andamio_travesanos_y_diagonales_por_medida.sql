-- Andamio multidireccional: travesaños y diagonales por medida
-- =============================================================
-- 2026-09-11
--
-- El catálogo tenía UNA ficha genérica de travesaño y UNA de diagonal, sin
-- medida, mientras los parantes ya estaban abiertos uno por uno (6 fichas, de
-- 0,50 a 3 m). Para armar el cuerpo de 2,50 × 1,273 hacen falta dos medidas de
-- cada uno, así que con la ficha genérica el pedido no podía decir cuál.
--
-- LA MEDIDA NO ES 1,25, ES 1,273 m. El catálogo de ENAS (sistema Kibloc) la
-- define "en cuadratura": 1273 mm es la hipotenusa de un cuadrado de 900, y por
-- eso el sistema arma bases no rectangulares (tanques, silos, chimeneas). En
-- obra se le dice "1,25" redondeando. El nombre de la ficha lleva la medida
-- real y los alias se comen las dos formas, porque nadie va a tipear 1,273.
--
-- Las dos fichas genéricas estaban SIN USAR (0 renglones, 0 pañol, 0
-- movimientos, stock 0), así que se reconvierten en las variantes de 2,50 en
-- vez de darlas de baja: no hay movimientos viejos que reinterpretar ni
-- descripciones que propagar, y no quedan filas muertas. El alias genérico
-- ("travesaño de andamio", "larguero", "barral", "cruz de andamio") queda en
-- AMBAS fichas de cada par a propósito: quien busque en genérico tiene que ver
-- las dos y elegir la medida, no caer en una sola por default.
--
-- Se cargan solo las CUATRO del cuerpo que el depósito usa hoy. La serie
-- completa de ENAS tiene 7 travesaños y 5 diagonales verticales; cargarlas
-- ensuciaría el buscador con medidas que nadie pide (CLAUDE.md §5.15: el
-- cuello es la BÚSQUEDA, no el alta).
--
-- Son herramientas (§5.12): clase='herramienta', sin precio, fuera de la
-- cuenta del cliente. rubro_id 26, unidad 'unid', igual que los parantes.
--
-- PENDIENTE, no se toca acá: el parante de 2,50 m (ficha 1272, 5 rosetas) no
-- existe en el catálogo de ENAS, que en cambio tiene uno de 0,25 que a nosotros
-- nos falta. O es de otra marca o alguien lo dedujo de la serie de rosetas.
-- Hay que confirmarlo con el depósito antes de darlo de baja.

begin;

-- ── Travesaños ────────────────────────────────────────────────────────
update stock_materiales set
  nombre = 'Travesaño p/ andamio multidireccional 2,50m',
  obs    = 'Lado largo del cuerpo de 2,50 x 1,273. ENAS/Kibloc.',
  alias  = array[
    'travesaño de andamio','travesaños de andamio','travesano andamio','travesaños andamio',
    'horizontal de andamio','horizontales andamio','larguero de andamio','barral de andamio',
    'travesaño multidireccional','travesaño roseta',
    'travesaño 2500','travesaño 2,50','travesaño 2.50','travesaño de 2,50','travesaño 250',
    'horizontal 2500','horizontal 2,50','larguero 2,50','barral 2,50','travesaño largo'
  ],
  updated_at = now()
where id = 1269;

insert into stock_materiales (rubro_id, nombre, unidad, clase, precio_ref, stock_actual, stock_minimo, activo, obs, alias)
values (26, 'Travesaño p/ andamio multidireccional 1,273m', 'unid', 'herramienta', 0, 0, 0, true,
  'Lado corto del cuerpo de 2,50 x 1,273. En obra se le dice "1,25"; la pieza mide 1,273 (hipotenusa del cuadrado de 900). ENAS/Kibloc.',
  array[
    'travesaño de andamio','travesaños de andamio','travesano andamio','travesaños andamio',
    'horizontal de andamio','horizontales andamio','larguero de andamio','barral de andamio',
    'travesaño multidireccional','travesaño roseta',
    'travesaño 1273','travesaño 1,273','travesaño 1.273',
    'travesaño 1,25','travesaño 1.25','travesaño de 1,25','travesaño 125','travesaño 127',
    'horizontal 1,25','larguero 1,25','barral 1,25','travesaño corto'
  ]);

-- ── Diagonales verticales ─────────────────────────────────────────────
update stock_materiales set
  nombre = 'Diagonal vertical p/ andamio multidireccional 2,50 x 1,50m',
  obs    = 'Cruza la cara larga del cuerpo de 2,50 x 1,273. ENAS/Kibloc.',
  alias  = array[
    'diagonal de andamio','diagonales de andamio','diagonales andamio','diagonal multidireccional',
    'diagonales multidireccional','diagonal roseta','cruz de andamio','arriostre de andamio',
    'diagonal 2500','diagonal 2,50','diagonal 2.50','diagonal de 2,50','diagonal 250',
    'diagonal 2,50 x 1,50','cruz 2,50','diagonal larga'
  ],
  updated_at = now()
where id = 1264;

insert into stock_materiales (rubro_id, nombre, unidad, clase, precio_ref, stock_actual, stock_minimo, activo, obs, alias)
values (26, 'Diagonal vertical p/ andamio multidireccional 1,273 x 1,50m', 'unid', 'herramienta', 0, 0, 0, true,
  'Cruza la cara corta del cuerpo de 2,50 x 1,273. En obra se le dice "1,25". ENAS/Kibloc.',
  array[
    'diagonal de andamio','diagonales de andamio','diagonales andamio','diagonal multidireccional',
    'diagonales multidireccional','diagonal roseta','cruz de andamio','arriostre de andamio',
    'diagonal 1273','diagonal 1,273','diagonal 1.273',
    'diagonal 1,25','diagonal 1.25','diagonal de 1,25','diagonal 125','diagonal 127',
    'diagonal 1,25 x 1,50','cruz 1,25','diagonal corta'
  ]);

do $$
declare v_n integer;
begin
  select count(*) into v_n from stock_materiales
   where activo and clase = 'herramienta'
     and (nombre ilike 'Travesaño p/ andamio%' or nombre ilike 'Diagonal vertical p/ andamio%');
  if v_n <> 4 then
    raise exception 'Esperaba 4 fichas de travesaño/diagonal por medida, hay %', v_n;
  end if;
end $$;

commit;
