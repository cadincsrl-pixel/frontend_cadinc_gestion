-- 20260904ak — Obras llave en mano, EPP como clase, y "a cargo de" en la cuenta del cliente
--
-- Pedido del user (2026-09-04): Casa Operarios es llave en mano (CADINC se hace
-- cargo de los gastos) y aun en obras donde el cliente paga los materiales,
-- CADINC quiere saber cuánto gastó en EPP. Hasta hoy la cuenta del cliente
-- mezclaba "qué le cobro al cliente" con "cuánto gastó CADINC en la obra".
--
-- 1) `obras.materiales_a_cargo_de`: 'cliente' (default) o 'cadinc' (llave en mano).
-- 2) `stock_materiales.clase` admite 'epp'. Se marcan las ~28 filas de EPP del
--    rubro Seguridad, y lo que no es EPP (media sombra, lona, cintas de peligro,
--    conos, postes, carteles, matafuegos, baranda, botiquín) pasa a un rubro
--    nuevo "Obrador y señalización".
-- 3) `materiales_a_cuenta_cliente.a_cargo_de`: 'cliente' o 'cadinc'. La pone
--    un trigger al insertar (obra llave en mano o material EPP → 'cadinc'), y
--    se recalcula sola si cambia la obra o la clase del material. UN solo
--    lugar para los 5 escritores de la cuenta (lección de escritores-mcc).
--    "Cuenta del cliente" muestra a_cargo_de='cliente'; "Gastos de CADINC"
--    muestra a_cargo_de='cadinc'.
-- 4) Se reponen las 15 filas de EPP sacadas hoy (20260904aj y el arnés de
--    Lamadrid), ahora como gasto de CADINC: nada se pierde.
-- 5) Vista `v_gastos_cadinc_obra` (obra × tipo × mes) y el tab 'gastos-cadinc'
--    a los perfiles que ven 'cuenta-cliente'.

-- 1) obra ────────────────────────────────────────────────────────────────────
alter table public.obras
  add column if not exists materiales_a_cargo_de text not null default 'cliente'
  check (materiales_a_cargo_de in ('cliente', 'cadinc'));
comment on column public.obras.materiales_a_cargo_de is
  'cliente: los materiales se cobran al cliente (cuenta del cliente). cadinc: obra llave en mano, todo es gasto de CADINC.';

update public.obras set materiales_a_cargo_de = 'cadinc' where cod = 'CC-014';

-- 2) clase epp + rubro obrador ──────────────────────────────────────────────
alter table public.stock_materiales drop constraint if exists stock_materiales_clase_check;
alter table public.stock_materiales
  add constraint stock_materiales_clase_check check (clase in ('material', 'herramienta', 'epp'));

update public.stock_materiales set clase = 'epp'
 where id in (656, 653, 660, 659, 657, 898, 643, 658, 662, 651, 692, 648, 720, 649, 652, 650, 1059,
              982, 645, 644, 661, 892, 655, 663, 647, 646, 900, 654)
   and clase = 'material';

insert into public.stock_rubros (nombre, icono, orden)
select 'Obrador y señalización', '🚧', 17
where not exists (select 1 from public.stock_rubros where nombre = 'Obrador y señalización');

update public.stock_materiales
   set rubro_id = (select id from public.stock_rubros where nombre = 'Obrador y señalización')
 where id in (672, 671, 666, 668, 899, 667, 665, 664, 894, 897, 893, 670, 669, 895, 896);

-- 3) a_cargo_de ──────────────────────────────────────────────────────────────
alter table public.materiales_a_cuenta_cliente
  add column if not exists a_cargo_de text not null default 'cliente'
  check (a_cargo_de in ('cliente', 'cadinc'));
comment on column public.materiales_a_cuenta_cliente.a_cargo_de is
  'cliente: se le cobra (Cuenta del cliente). cadinc: gasto de CADINC (obra llave en mano o EPP). Lo calcula fn_mcc_a_cargo_de.';
create index if not exists materiales_a_cuenta_cliente_obra_a_cargo_idx
  on public.materiales_a_cuenta_cliente (obra_cod, a_cargo_de);

create or replace function public.calc_a_cargo_de(p_obra_cod text, p_item_id integer)
returns text language sql stable as $$
  select case
           when (select materiales_a_cargo_de from public.obras where cod = p_obra_cod) = 'cadinc' then 'cadinc'
           when (select m.clase from public.solicitud_compra_item i
                   left join public.stock_materiales m on m.id = i.material_id
                  where i.id = p_item_id) = 'epp' then 'cadinc'
           else 'cliente'
         end
$$;

create or replace function public.fn_mcc_a_cargo_de()
returns trigger language plpgsql as $$
begin
  new.a_cargo_de := public.calc_a_cargo_de(new.obra_cod, new.item_id);
  return new;
end $$;

drop trigger if exists trg_mcc_a_cargo_de on public.materiales_a_cuenta_cliente;
create trigger trg_mcc_a_cargo_de
  before insert or update of item_id, obra_cod on public.materiales_a_cuenta_cliente
  for each row execute function public.fn_mcc_a_cargo_de();

-- si cambia la obra (llave en mano ↔ cliente), se recalculan sus filas no cobradas
create or replace function public.fn_obras_recalc_a_cargo_de()
returns trigger language plpgsql as $$
begin
  update public.materiales_a_cuenta_cliente c
     set a_cargo_de = public.calc_a_cargo_de(c.obra_cod, c.item_id)
   where c.obra_cod = new.cod and c.cobro_id is null
     and c.a_cargo_de is distinct from public.calc_a_cargo_de(c.obra_cod, c.item_id);
  return null;
end $$;

drop trigger if exists trg_obras_recalc_a_cargo_de on public.obras;
create trigger trg_obras_recalc_a_cargo_de
  after update of materiales_a_cargo_de on public.obras
  for each row when (old.materiales_a_cargo_de is distinct from new.materiales_a_cargo_de)
  execute function public.fn_obras_recalc_a_cargo_de();

-- si cambia la clase de un material (a/de epp), se recalculan las filas de sus renglones
create or replace function public.fn_stock_materiales_recalc_a_cargo_de()
returns trigger language plpgsql as $$
begin
  update public.materiales_a_cuenta_cliente c
     set a_cargo_de = public.calc_a_cargo_de(c.obra_cod, c.item_id)
    from public.solicitud_compra_item i
   where i.id = c.item_id and i.material_id = new.id and c.cobro_id is null
     and c.a_cargo_de is distinct from public.calc_a_cargo_de(c.obra_cod, c.item_id);
  return null;
end $$;

drop trigger if exists trg_stock_materiales_recalc_a_cargo_de on public.stock_materiales;
create trigger trg_stock_materiales_recalc_a_cargo_de
  after update of clase on public.stock_materiales
  for each row when (old.clase is distinct from new.clase)
  execute function public.fn_stock_materiales_recalc_a_cargo_de();

-- backfill de lo que ya está en la cuenta
update public.materiales_a_cuenta_cliente c
   set a_cargo_de = public.calc_a_cargo_de(c.obra_cod, c.item_id)
 where c.a_cargo_de is distinct from public.calc_a_cargo_de(c.obra_cod, c.item_id);

-- 4) reponer el EPP sacado hoy, como gasto de CADINC ───────────────────────
insert into public.materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad, precio_unit, precio_total,
   origen, proveedor_id, factura_id, fecha_resolucion, pagado_por)
select s.obra_cod, i.solicitud_id, i.id, i.descripcion, e.cantidad, i.unidad,
       coalesce(i.precio_unit, 0), round(e.cantidad * coalesce(i.precio_unit, 0), 2),
       coalesce(e.meta->>'origen_mcc', 'deposito'), i.proveedor_id, i.factura_id,
       coalesce(i.fecha_resolucion, now()), coalesce(i.pagado_por, 'cadinc')
from public.solicitud_item_eventos e
join public.solicitud_compra_item i on i.id = e.item_id
join public.solicitud_compra s on s.id = i.solicitud_id
where e.accion = 'sacado_de_cuenta_cliente'
  and (e.meta->>'motivo' = 'EPP costo CADINC 2026-09-04'
       or (e.meta->>'motivo' = 'limpieza cuenta CC-016 2026-09-04 (2)' and e.item_id = 2346))
  and e.cantidad is not null
  and not exists (select 1 from public.materiales_a_cuenta_cliente c where c.item_id = i.id);

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Repuesto en la cuenta como gasto de CADINC (EPP): ' || i.descripcion,
       jsonb_build_object('motivo', 'a_cargo_de 2026-09-04', 'a_cargo_de', c.a_cargo_de)
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.item_id in (select e.item_id from public.solicitud_item_eventos e
                     where e.accion = 'sacado_de_cuenta_cliente'
                       and (e.meta->>'motivo' = 'EPP costo CADINC 2026-09-04'
                            or (e.meta->>'motivo' = 'limpieza cuenta CC-016 2026-09-04 (2)' and e.item_id = 2346)))
  and c.created_at > now() - interval '1 minute';

-- 5) vista de gastos y tab ──────────────────────────────────────────────────
create or replace view public.v_gastos_cadinc_obra
with (security_invoker = true) as
select c.obra_cod,
       case when m.clase = 'epp' then 'epp' else 'material' end as tipo,
       date_trunc('month', c.fecha_resolucion)::date as mes,
       count(*)::integer as renglones,
       sum(c.precio_total) as total,
       count(*) filter (where c.precio_unit = 0)::integer as sin_precio
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
left join public.stock_materiales m on m.id = i.material_id
where c.a_cargo_de = 'cadinc'
group by 1, 2, 3;

grant select on public.v_gastos_cadinc_obra to authenticated, service_role;

update public.profiles
   set permisos = jsonb_set(permisos, '{certificaciones,tabs}',
                            (permisos->'certificaciones'->'tabs') || '["gastos-cadinc"]'::jsonb)
 where permisos->'certificaciones' ? 'tabs'
   and jsonb_typeof(permisos->'certificaciones'->'tabs') = 'array'
   and permisos->'certificaciones'->'tabs' @> '["cuenta-cliente"]'::jsonb
   and not (permisos->'certificaciones'->'tabs' @> '["gastos-cadinc"]'::jsonb);
