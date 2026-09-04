-- 20260904v — Catálogo de precios: fecha propia del precio + última compra por material
--
-- El user (2026-09-04) quiere una pantalla aparte del Stock para ver el catálogo
-- entero con buscador, precio de referencia, a quién se le compró y de cuándo es
-- el precio, sin ensuciar el Stock con lo que tiene cero. Hasta hoy:
--   · `updated_at` cambiaba con cualquier edición (un alias, un ajuste), así que
--     no servía como "fecha del precio".
--   · el proveedor de la ficha es el asignado a mano (casi siempre vacío); el
--     que interesa es el de la última compra real, que vive en los pedidos.
--
-- 1) `precio_actualizado_en`: la pisa un trigger solo cuando cambia `precio_ref`.
-- 2) Backfill: los precios cargados hoy desde el Excel llevan la fecha de la
--    factura (20260904r / 20260904u); el resto con precio, su `updated_at`.
-- 3) `v_material_ultima_compra`: último renglón COMPRADO por material (no los
--    despachos de depósito, que también terminan en 'enviado').
-- 4) `v_catalogo_materiales`: lo que consume la pantalla, con `busq` normalizada
--    por `norm_txt()` para buscar sin acentos por nombre, sinónimos y rubro.
-- 5) El tab 'catalogo' a los perfiles que ya ven 'stock' (bug Áridos 2026-06-11:
--    un tab que no está en `permisos.certificaciones.tabs` es invisible).

-- 1) fecha del precio ────────────────────────────────────────────────────────
alter table public.stock_materiales
  add column if not exists precio_actualizado_en timestamptz;

comment on column public.stock_materiales.precio_actualizado_en is
  'Cuándo cambió por última vez precio_ref (trigger). No confundir con updated_at, que cambia con cualquier edición.';

create or replace function public.fn_stock_materiales_precio_fecha()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.precio_ref > 0 and new.precio_actualizado_en is null then
      new.precio_actualizado_en := now();
    end if;
  elsif new.precio_ref is distinct from old.precio_ref then
    new.precio_actualizado_en := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_stock_materiales_precio_fecha on public.stock_materiales;
create trigger trg_stock_materiales_precio_fecha
  before insert or update of precio_ref on public.stock_materiales
  for each row execute function public.fn_stock_materiales_precio_fecha();

-- 2) backfill ────────────────────────────────────────────────────────────────
-- Fecha de la factura del Excel para los 104 de 20260904q/r (null = sin fecha).
update public.stock_materiales m
set precio_actualizado_en = v.f::date
from (values
  (1,'2026-07-30'),(5,'2026-07-30'),(7,'2026-09-02'),(16,'2026-07-30'),(18,'2026-07-30'),(28,'2026-08-05'),
  (33,'2026-07-28'),(36,'2026-09-02'),(37,'2026-09-02'),(39,'2026-07-28'),(44,'2026-08-21'),(51,'2026-09-02'),
  (52,'2026-09-02'),(53,'2026-09-02'),(54,'2026-09-02'),(56,'2026-08-21'),(57,'2026-08-28'),(59,'2026-08-28'),
  (66,'2026-07-28'),(68,'2026-08-28'),(71,'2026-08-28'),(72,'2026-08-26'),(73,'2026-08-28'),(74,'2026-08-28'),
  (75,'2026-08-26'),(77,'2026-08-28'),(79,'2026-08-28'),(80,'2026-08-26'),(85,'2026-08-28'),(95,'2026-08-28'),
  (98,'2026-08-28'),(99,'2026-08-28'),(100,'2026-08-28'),(101,'2026-08-28'),(115,'2026-08-20'),(118,'2026-08-20'),
  (137,'2026-08-28'),(173,'2026-08-28'),(184,'2026-07-30'),(191,'2026-07-30'),(201,'2026-08-11'),(203,'2026-07-30'),
  (206,'2026-08-11'),(208,'2026-08-11'),(214,'2026-08-05'),(229,'2026-08-07'),(230,'2026-08-07'),(235,'2026-09-02'),
  (242,'2026-09-02'),(251,'2026-09-02'),(258,'2026-08-28'),(269,'2026-09-02'),(285,'2026-08-26'),(340,'2026-08-31'),
  (358,'2026-08-25'),(365,'2026-07-28'),(419,'2026-08-31'),(432,'2026-08-31'),(433,'2026-08-31'),(441,'2026-07-31'),
  (589,'2026-08-12'),(639,'2026-08-22'),(644,'2026-08-27'),(658,'2026-08-27'),(691,'2026-08-20'),(720,'2026-08-27'),
  (724,'2026-07-30'),(726,'2026-07-30'),(729,'2026-07-28'),(730,'2026-07-30'),(739,'2026-08-05'),(741,'2026-07-30'),
  (745,'2026-07-28'),(747,'2026-08-28'),(748,'2026-08-28'),(749,'2026-08-28'),(753,'2026-07-28'),(763,'2026-08-26'),
  (766,'2026-08-28'),(768,'2026-08-28'),(790,'2026-08-25'),(793,'2026-08-20'),(809,'2026-07-30'),(814,'2026-08-22'),
  (831,'2026-07-28'),(864,'2026-08-31'),(887,'2026-08-11'),(888,'2026-08-25'),(907,'2026-07-28'),(920,'2026-08-28'),
  (924,'2026-09-01'),(933,'2026-08-12'),(937,'2026-08-21'),(938,'2026-08-21'),(939,'2026-08-21'),(940,'2026-08-26'),
  (948,'2026-08-28'),(950,'2026-09-01')
) as v(id, f)
where m.id = v.id;

-- Las 48 altas de hoy: la fecha de la factura viene en el obs.
update public.stock_materiales
set precio_actualizado_en = (substring(obs from '\d{4}-\d{2}-\d{2}'))::date
where obs like 'Alta 2026-09-04 desde el Excel%' and obs ~ '\d{4}-\d{2}-\d{2}';

-- El resto con precio (los 38 previos y las filas sin fecha en el Excel): aproximación.
update public.stock_materiales
set precio_actualizado_en = updated_at
where precio_ref > 0 and precio_actualizado_en is null;

-- 3) última compra por material ─────────────────────────────────────────────
create index if not exists solicitud_compra_item_material_id_idx
  on public.solicitud_compra_item (material_id) where material_id is not null;

create or replace view public.v_material_ultima_compra
with (security_invoker = true) as
select distinct on (i.material_id)
       i.material_id,
       i.id                  as item_id,
       i.solicitud_id,
       s.obra_cod,
       i.precio_unit,
       i.proveedor_id,
       p.nombre              as proveedor_nombre,
       i.fecha_resolucion::date as fecha,
       i.pagado_por
from public.solicitud_compra_item i
join public.solicitud_compra s on s.id = i.solicitud_id
left join public.proveedores p on p.id = i.proveedor_id
where i.material_id is not null
  and i.precio_unit > 0
  and i.estado in ('comprado', 'en_proveedor', 'retirado', 'enviado')
  -- Compra real, no despacho de depósito (que también termina en 'enviado' y
  -- lleva el precio_ref como precio_unit): proveedor cargado, o evento de
  -- compra, o fila en la cuenta del cliente con origen proveedor.
  and (
    i.proveedor_id is not null
    or exists (select 1 from public.solicitud_item_eventos e
                where e.item_id = i.id and e.accion in ('comprado', 'en_proveedor'))
    or exists (select 1 from public.materiales_a_cuenta_cliente c
                where c.item_id = i.id and c.origen = 'proveedor')
  )
order by i.material_id, i.fecha_resolucion desc nulls last, i.id desc;

-- 4) vista de la pantalla ────────────────────────────────────────────────────
create or replace view public.v_catalogo_materiales
with (security_invoker = true) as
select m.id, m.rubro_id, r.nombre as rubro, r.icono as rubro_icono,
       m.nombre, m.unidad, m.precio_ref, m.precio_actualizado_en,
       m.proveedor_id, pp.nombre as proveedor_nombre,
       m.alias, m.clase, m.activo, m.usa_color, m.stock_actual, m.obs, m.updated_at,
       public.norm_txt(m.nombre || ' ' || coalesce(array_to_string(m.alias, ' '), '') || ' ' || r.nombre) as busq,
       u.precio_unit      as uc_precio,
       u.proveedor_nombre as uc_proveedor,
       u.fecha            as uc_fecha,
       u.solicitud_id     as uc_pedido,
       u.obra_cod         as uc_obra
from public.stock_materiales m
join public.stock_rubros r on r.id = m.rubro_id
left join public.proveedores pp on pp.id = m.proveedor_id
left join public.v_material_ultima_compra u on u.material_id = m.id;

grant select on public.v_material_ultima_compra, public.v_catalogo_materiales to authenticated, service_role;

-- 5) el tab a quien ya ve 'stock' ───────────────────────────────────────────
update public.profiles
   set permisos = jsonb_set(permisos, '{certificaciones,tabs}',
                            (permisos->'certificaciones'->'tabs') || '["catalogo"]'::jsonb)
 where permisos->'certificaciones' ? 'tabs'
   and jsonb_typeof(permisos->'certificaciones'->'tabs') = 'array'
   and permisos->'certificaciones'->'tabs' @> '["stock"]'::jsonb
   and not (permisos->'certificaciones'->'tabs' @> '["catalogo"]'::jsonb);
