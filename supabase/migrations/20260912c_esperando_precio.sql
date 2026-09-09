-- 20260912c — "Esperando precio" (fase 2 mínima del plan de precios, 2026-09-09).
--
-- El user (08/09): "a veces Nicolás compra en cuenta corriente pero no nos entregan los
-- precios hasta una semana después; ahí tendría que poner esperando precio o algo para
-- acordarse de cargarlo". Hasta hoy la compra exigía precio > 0, así que se cargaba un
-- estimado (o $1) y nadie volvía a corregirlo. Ahora la compra puede entrar en $0 con esta
-- marca: el renglón sale en el pedido y en la cuenta corriente como "esperando precio", y la
-- marca se apaga sola cuando alguien carga el precio (trigger), venga de donde venga
-- (Cargar precios, PATCH del ítem, una migración).

alter table public.solicitud_compra_item
  add column if not exists esperando_precio boolean not null default false;

comment on column public.solicitud_compra_item.esperando_precio is
  'Compra registrada sin precio porque el proveedor todavía no lo pasó. Se apaga sola cuando precio_unit > 0 (trg_item_esperando_precio).';

create or replace function public.trg_item_esperando_precio_fn() returns trigger
language plpgsql as $$
begin
  if new.precio_unit is not null and new.precio_unit > 0 then
    new.esperando_precio := false;
  end if;
  return new;
end $$;

drop trigger if exists trg_item_esperando_precio on public.solicitud_compra_item;
create trigger trg_item_esperando_precio
  before insert or update of precio_unit, esperando_precio on public.solicitud_compra_item
  for each row execute function public.trg_item_esperando_precio_fn();

-- Parcial: casi todos los renglones están en false; el índice solo guarda los que esperan.
create index if not exists solicitud_compra_item_esperando_precio_idx
  on public.solicitud_compra_item (solicitud_id) where esperando_precio;

-- La cuenta corriente lo muestra. CREATE OR REPLACE VIEW exige conservar las columnas
-- existentes en su orden: la nueva va al final.
create or replace view public.v_cuenta_corriente with (security_invoker = on) as
 SELECT c.id,
    c.obra_cod,
    COALESCE(o.nom, c.obra_cod) AS obra_nom,
    COALESCE(o.archivada, false) AS obra_archivada,
    COALESCE(o.materiales_a_cargo_de, 'cliente'::text) AS obra_modalidad,
    c.solicitud_id,
    c.item_id,
    c.descripcion,
    c.cantidad,
    c.unidad,
    c.precio_unit,
    c.precio_total,
    c.origen,
    c.proveedor_id,
    p.nombre AS proveedor_nom,
    c.factura_id,
    f.numero AS factura_numero,
    f.adjunto_url AS factura_adjunto_url,
    f.fecha AS factura_fecha,
    c.fecha_resolucion,
    to_char(c.fecha_resolucion::timestamp with time zone, 'YYYY-MM'::text) AS mes,
    c.pagado_por,
    c.a_cargo_de,
    c.cobro_id,
    c.monto_cobrado,
    i.estado AS item_estado,
    i.material_id,
    m.clase,
    m.rubro_id,
    r.nombre AS rubro_nom,
        CASE
            WHEN m.clase = 'epp'::text THEN 'epp'::text
            ELSE 'material'::text
        END AS tipo,
        CASE
            WHEN c.pagado_por = 'cliente'::text THEN 'pago_directo'::text
            WHEN c.a_cargo_de = 'cadinc'::text THEN 'gasto_cadinc'::text
            WHEN c.cobro_id IS NOT NULL THEN 'cobrado'::text
            ELSE 'a_cobrar'::text
        END AS estado,
        CASE
            WHEN c.a_cargo_de = 'cadinc'::text THEN
            CASE
                WHEN m.clase = 'epp'::text THEN 'epp'::text
                ELSE 'llave_en_mano'::text
            END
            ELSE NULL::text
        END AS motivo_cadinc,
    norm_txt((((((((((c.descripcion || ' '::text) || COALESCE(p.nombre, ''::text)) || ' '::text) || COALESCE(o.nom, ''::text)) || ' '::text) || c.obra_cod) || ' '::text) || c.solicitud_id::text) || ' '::text) || COALESCE(f.numero, ''::text)) AS busq,
    c.created_at,
    c.updated_at,
    COALESCE(o.es_interna, false) AS obra_interna,
    c.certificado_id,
    cc.numero AS certificado_numero,
    i.esperando_precio
   FROM materiales_a_cuenta_cliente c
     JOIN solicitud_compra_item i ON i.id = c.item_id
     LEFT JOIN obras o ON o.cod = c.obra_cod
     LEFT JOIN stock_materiales m ON m.id = i.material_id
     LEFT JOIN stock_rubros r ON r.id = m.rubro_id
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     LEFT JOIN facturas_compra f ON f.id = c.factura_id
     LEFT JOIN certificados_cliente cc ON cc.id = c.certificado_id;
