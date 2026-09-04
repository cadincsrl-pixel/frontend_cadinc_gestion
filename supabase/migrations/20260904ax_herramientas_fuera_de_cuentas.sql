-- 20260904ax — Las herramientas salen de TODAS las cuentas de obra, y no vuelven a entrar
--
-- User (2026-09-04): "sacalas de todas". Regla ya aplicada obra por obra en
-- Lamadrid, Casa Operarios y Clínica Salta: la herramienta va al pañol
-- (herr_entregas), no a la cuenta del cliente ni al gasto de la obra.
-- Alcance: renglones de materiales_a_cuenta_cliente cuyo ítem es herramienta
-- por clase del ítem o por clase del catálogo (herr_origen 'clase'/'catalogo').
-- Los detectados solo por patrón de texto NO se tocan (el detector tiene
-- falsos positivos; hoy no queda ninguno en cuentas). Ninguno está cobrado.
-- Hoy: 309 renglones en 29 obras, $158.211 (casi todo sin precio).
--
-- Y el candado: un trigger AFTER INSERT en la cuenta borra el renglón si el
-- ítem es herramienta por clase o catálogo, dejando el evento. Cubre a los
-- cinco escritores de MCC de una vez sin romper los `insert ... returning`
-- (el RETURNING ya se calculó cuando corre el AFTER).

-- 1) limpieza ────────────────────────────────────────────────────────────────
create temp table herr as
select c.id as mcc_id, c.item_id, c.solicitud_id, c.obra_cod, c.cantidad, c.origen, c.precio_total, i.estado, i.descripcion
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.cobro_id is null
  and i.herr_origen in ('clase', 'catalogo');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select h.item_id, h.solicitud_id, 'sacado_de_cuenta_cliente', null, h.estado, h.cantidad,
       'Herramienta cargada en la cuenta de la obra; va al pañol: ' || h.descripcion,
       jsonb_build_object('motivo', 'herramientas fuera de todas las cuentas 2026-09-04', 'obra', h.obra_cod, 'origen_mcc', h.origen, 'precio_total', h.precio_total, 'detectada_por', 'user')
from herr h;

delete from public.materiales_a_cuenta_cliente c using herr h where c.id = h.mcc_id;
drop table herr;

-- 2) candado ─────────────────────────────────────────────────────────────────
create or replace function public.fn_mcc_sin_herramientas()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_es boolean;
  v_estado text;
begin
  select (i.clase = 'herramienta' or m.clase = 'herramienta'), i.estado
    into v_es, v_estado
    from public.solicitud_compra_item i
    left join public.stock_materiales m on m.id = i.material_id
   where i.id = new.item_id;

  if coalesce(v_es, false) then
    insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
    values (new.item_id, new.solicitud_id, 'sacado_de_cuenta_cliente', null, v_estado, new.cantidad,
            'Herramienta: no va a la cuenta de la obra, va al pañol (' || new.descripcion || ')',
            jsonb_build_object('motivo', 'candado herramientas fuera de la cuenta', 'origen_mcc', new.origen, 'precio_total', new.precio_total, 'detectada_por', 'trigger'));
    delete from public.materiales_a_cuenta_cliente where id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_mcc_sin_herramientas on public.materiales_a_cuenta_cliente;
create trigger trg_mcc_sin_herramientas
  after insert on public.materiales_a_cuenta_cliente
  for each row execute function public.fn_mcc_sin_herramientas();

comment on function public.fn_mcc_sin_herramientas() is
  'Las herramientas (clase del ítem o del catálogo) no van a materiales_a_cuenta_cliente: van al pañol (herr_entregas). Borra el renglón recién insertado y deja el evento. 20260904ax.';
