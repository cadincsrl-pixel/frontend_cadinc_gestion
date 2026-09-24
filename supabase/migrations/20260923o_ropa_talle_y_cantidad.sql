-- =====================================================================
-- Ropa: talle y cantidad en cada entrega (2026-09-23)
--
-- Pedido del dueño (mejoras de Ropa, puntos 1–3). Hasta hoy la entrega no
-- guardaba ni el talle ni la cantidad: cuando se anotaba, iba a mano en
-- `obs` («40, 39,39»). La constancia de entrega de la Res. SRT 299/11 pide
-- la cantidad por renglón, y el talle es lo que hace falta para reponer.
--
--   · ropa_entregas.cantidad (default 1) y .talle (texto libre corto: 42,
--     XL, 39…). Las 223 entregas existentes quedan en 1 y sin talle.
--   · ropa_categorias.talle_de: de qué talle de la ficha del trabajador sale
--     la precarga (pantalon / botines / camisa). Las 3 categorías actuales se
--     completan acá; una categoría nueva (guantes, casco) puede no tener.
-- =====================================================================

alter table public.ropa_entregas
  add column if not exists cantidad integer not null default 1,
  add column if not exists talle    text    not null default '';

alter table public.ropa_entregas drop constraint if exists ropa_entregas_cantidad_chk;
alter table public.ropa_entregas add constraint ropa_entregas_cantidad_chk check (cantidad between 1 and 20);
alter table public.ropa_entregas drop constraint if exists ropa_entregas_talle_chk;
alter table public.ropa_entregas add constraint ropa_entregas_talle_chk check (length(talle) <= 12);

alter table public.ropa_categorias add column if not exists talle_de text;
alter table public.ropa_categorias drop constraint if exists ropa_categorias_talle_de_chk;
alter table public.ropa_categorias add constraint ropa_categorias_talle_de_chk
  check (talle_de is null or talle_de in ('pantalon', 'botines', 'camisa'));

update public.ropa_categorias set talle_de = 'pantalon' where talle_de is null and nombre ilike 'pantal%';
update public.ropa_categorias set talle_de = 'botines'  where talle_de is null and nombre ilike 'botin%';
update public.ropa_categorias set talle_de = 'camisa'   where talle_de is null and nombre ilike 'camisa%';

comment on column public.ropa_entregas.cantidad is 'Unidades entregadas (20260923o). La constancia Res. SRT 299/11 la pide por renglón.';
comment on column public.ropa_entregas.talle    is 'Talle entregado (20260923o). Se precarga desde la ficha del trabajador según ropa_categorias.talle_de.';
comment on column public.ropa_categorias.talle_de is 'De qué talle de la ficha del trabajador sale la precarga: pantalon | botines | camisa (20260923o).';
