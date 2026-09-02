-- =====================================================================
-- Catálogo de materiales — FASE 1b: que se pueda ENCONTRAR
--
-- El 97,3% de los items de solicitud no linkea al catálogo, pero NO
-- porque falten materiales: 62 de las 100 familias más pedidas ya están
-- cargadas. El problema es que la obra pide por el nombre de obra y el
-- catálogo guarda el nombre técnico:
--     "lija 150"       → Lija al agua N°150
--     "taco 8"         → Tarugo fisher 8mm
--     "alargue"        → Prolongación 10m
--     "plástico negro" → Film polietileno 100 micrones
--     "thinner"        → Diluyente x 4lts
-- Sin un campo de sinónimos, el buscador no los encuentra y el operario
-- cae al input de texto libre que está justo al lado.
-- =====================================================================

-- ── 1. Normalizador (IMMUTABLE, para poder indexarlo) ────────────────
-- Se usa `translate` en vez de unaccent() a propósito: unaccent no es
-- IMMUTABLE (depende de un diccionario) y Postgres no la acepta en un
-- índice. Con translate el índice es válido y no hace falta la extensión.
create or replace function public.norm_material(t text) returns text
  language sql immutable strict parallel safe as $$
  select lower(btrim(regexp_replace(
           translate(t, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '\s+', ' ', 'g')))
$$;
comment on function public.norm_material(text) is
  'Normaliza un nombre de material para comparar/indexar: minúsculas, sin tildes ni ñ, espacios colapsados. IMMUTABLE para poder usarla en índices.';

-- ── 2. Sinónimos: cómo lo pide la obra ───────────────────────────────
alter table public.stock_materiales
  add column if not exists alias text[] not null default '{}';
comment on column public.stock_materiales.alias is
  'Cómo se pide este material EN OBRA (t1, alargue, plástico negro, lija 150...). El buscador matchea contra nombre + alias. Es lo que hace encontrable el catálogo: sin esto el operario no da con la fila y escribe texto libre.';
create index if not exists stock_materiales_alias_gin
  on public.stock_materiales using gin (alias);

-- ── 3. Candado antiduplicados ────────────────────────────────────────
-- Verificado antes de crearlo: 0 colisiones entre los 718 activos.
-- Parcial (WHERE activo) para que las bajas lógicas de la fase 1a no
-- bloqueen reusar un nombre.
create unique index if not exists stock_materiales_nombre_norm_uidx
  on public.stock_materiales (public.norm_material(nombre)) where activo;

-- ── 4. Búsqueda difusa para el "¿no será este?" al dar de alta ───────
-- El índice único solo atrapa el duplicado literal. Los reales son
-- semánticos ("Disco flap 4 1/2" contra "Disco flap 115mm"), y para eso
-- hace falta similitud por trigramas.
create extension if not exists pg_trgm;
create index if not exists stock_materiales_nombre_trgm
  on public.stock_materiales using gin (public.norm_material(nombre) gin_trgm_ops);
