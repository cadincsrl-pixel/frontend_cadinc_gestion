-- 20260904ap — Cuenta corriente de obras: vista unificada, resumen por grupo y candado en cobros
--
-- Reemplaza (en dos pasos) las pestañas "Cuenta del cliente" y "Gastos de
-- CADINC" por una sola vista. Diseño en Obsidian/Proyectos "Cuenta corriente
-- de obras" (2026-09-04, aprobado por el user).
--
-- 1) v_cuenta_corriente: cada renglón de materiales_a_cuenta_cliente con sus
--    joins y UN estado excluyente, en este orden de precedencia:
--      pago_directo  pagado_por = 'cliente'   (el cliente le pagó al proveedor: rendición)
--      gasto_cadinc  a_cargo_de = 'cadinc'    (obra llave en mano, o EPP)
--      cobrado       cobro_id not null        (imputado a un pago, congelado)
--      a_cobrar      el resto                 (deuda viva del cliente)
--    más tipo (material | epp), motivo_cadinc (llave_en_mano | epp), mes y
--    busq (norm_txt de material + proveedor + obra + pedido + factura).
-- 2) cuenta_corriente_resumen(...): totales del conjunto filtrado por grupo
--    (obra | mes | proveedor) × estado × tipo. No filtra por estado ni tipo a
--    propósito: el frontend recorta esas dos dimensiones sobre el resultado y
--    así los chips muestran cuánto hay en cada una.
--    cuenta_corriente_pagos(...): Σ pagos del cliente por obra.
--    Las dos son SECURITY INVOKER; el alcance de obras lo pasa el backend.
-- 3) registrar_cobro_cuenta_cliente: un renglón a cargo de CADINC no se puede
--    imputar a un pago del cliente (faltaba desde 20260904ak).

-- 1) vista ───────────────────────────────────────────────────────────────────
create or replace view public.v_cuenta_corriente with (security_invoker = true) as
select
  c.id,
  c.obra_cod,
  coalesce(o.nom, c.obra_cod)                   as obra_nom,
  coalesce(o.archivada, false)                  as obra_archivada,
  coalesce(o.materiales_a_cargo_de, 'cliente')  as obra_modalidad,
  c.solicitud_id, c.item_id, c.descripcion, c.cantidad, c.unidad,
  c.precio_unit, c.precio_total, c.origen,
  c.proveedor_id, p.nombre                      as proveedor_nom,
  c.factura_id, f.numero as factura_numero, f.adjunto_url as factura_adjunto_url, f.fecha as factura_fecha,
  c.fecha_resolucion,
  to_char(c.fecha_resolucion, 'YYYY-MM')        as mes,
  c.pagado_por, c.a_cargo_de, c.cobro_id, c.monto_cobrado,
  i.estado                                      as item_estado,
  i.material_id, m.clase, m.rubro_id, r.nombre  as rubro_nom,
  case when m.clase = 'epp' then 'epp' else 'material' end as tipo,
  case when c.pagado_por = 'cliente' then 'pago_directo'
       when c.a_cargo_de = 'cadinc'  then 'gasto_cadinc'
       when c.cobro_id is not null   then 'cobrado'
       else 'a_cobrar' end                      as estado,
  case when c.a_cargo_de = 'cadinc'
       then (case when m.clase = 'epp' then 'epp' else 'llave_en_mano' end) end as motivo_cadinc,
  public.norm_txt(c.descripcion || ' ' || coalesce(p.nombre, '') || ' ' || coalesce(o.nom, '') || ' '
                  || c.obra_cod || ' ' || c.solicitud_id::text || ' ' || coalesce(f.numero, '')) as busq,
  c.created_at, c.updated_at
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
left join public.obras o            on o.cod = c.obra_cod
left join public.stock_materiales m on m.id = i.material_id
left join public.stock_rubros r     on r.id = m.rubro_id
left join public.proveedores p      on p.id = c.proveedor_id
left join public.facturas_compra f  on f.id = c.factura_id;

grant select on public.v_cuenta_corriente to authenticated, service_role;

-- 2) resumen por grupo y pagos por obra ─────────────────────────────────────
create or replace function public.cuenta_corriente_resumen(
  p_obras        text[]  default null,   -- null = alcance global
  p_obra_cod     text    default null,
  p_grupo        text    default 'obra', -- obra | mes | proveedor
  p_sin_precio   boolean default false,
  p_proveedor_id integer default null,
  p_origen       text    default null,
  p_desde        date    default null,
  p_hasta        date    default null,
  p_palabras     text[]  default null,   -- ya normalizadas con norm_txt
  p_archivadas   boolean default false
)
returns table (
  grupo text, grupo_nom text, modalidad text, estado text, tipo text,
  renglones integer, total numeric, sin_precio integer, ultimo date
)
language sql stable
set search_path = public, pg_temp
as $$
  select
    case p_grupo
      when 'mes'       then v.mes
      when 'proveedor' then coalesce(v.proveedor_id::text, case when v.origen = 'deposito' then 'deposito' else 'sin' end)
      else v.obra_cod end,
    case p_grupo
      when 'mes'       then v.mes
      when 'proveedor' then coalesce(v.proveedor_nom, case when v.origen = 'deposito' then 'Depósito' else 'Sin proveedor' end)
      else v.obra_nom end,
    case when p_grupo = 'obra' then v.obra_modalidad end,
    v.estado, v.tipo,
    count(*)::integer,
    coalesce(sum(v.precio_total), 0),
    count(*) filter (where v.precio_unit = 0)::integer,
    max(v.fecha_resolucion)
  from public.v_cuenta_corriente v
  where (p_obras is null or v.obra_cod = any(p_obras))
    and (p_obra_cod is null or v.obra_cod = p_obra_cod)
    and (not p_sin_precio or v.precio_unit = 0)
    and (p_proveedor_id is null or v.proveedor_id = p_proveedor_id)
    and (p_origen is null or v.origen = p_origen)
    and (p_desde is null or v.fecha_resolucion >= p_desde)
    and (p_hasta is null or v.fecha_resolucion <= p_hasta)
    and (p_archivadas or p_obra_cod is not null or not v.obra_archivada)
    and (p_palabras is null or cardinality(p_palabras) = 0
         or (select bool_and(v.busq like '%' || w || '%') from unnest(p_palabras) w))
  group by 1, 2, 3, 4, 5
$$;

create or replace function public.cuenta_corriente_pagos(p_obras text[] default null, p_obra_cod text default null)
returns table (obra_cod text, pagos integer, monto numeric)
language sql stable
set search_path = public, pg_temp
as $$
  select c.obra_cod, count(*)::integer, coalesce(sum(c.monto), 0)
  from public.cuenta_cliente_cobros c
  where (p_obras is null or c.obra_cod = any(p_obras))
    and (p_obra_cod is null or c.obra_cod = p_obra_cod)
  group by 1
$$;

grant execute on function public.cuenta_corriente_resumen(text[], text, text, boolean, integer, text, date, date, text[], boolean) to authenticated, service_role;
grant execute on function public.cuenta_corriente_pagos(text[], text) to authenticated, service_role;

-- 3) candado: solo lo a cargo del cliente se imputa a un pago ───────────────
create or replace function public.registrar_cobro_cuenta_cliente(p_obra_cod text, p_fecha date, p_monto numeric, p_medio text, p_obs text, p_comprobante_url text, p_comprobante_hash text, p_item_ids integer[], p_user_id uuid)
 returns cuenta_cliente_cobros
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cobro          cuenta_cliente_cobros;
  v_total_imputado numeric := 0;
  v_invalidos      integer;
begin
  perform pg_advisory_xact_lock(hashtext('cuenta_cliente_cobro:' || p_obra_cod));

  if p_comprobante_hash is not null then
    perform 1 from cuenta_cliente_cobros where comprobante_hash = p_comprobante_hash;
    if found then
      raise exception 'COMPROBANTE_DUPLICADO' using errcode = 'P0001';
    end if;
  end if;

  if array_length(p_item_ids, 1) > 0 then
    -- Item imputable = fila MCC de ESTA obra, sin cobro previo, deuda real
    -- (la pagó CADINC y es a cargo del cliente: 20260904ap), tasado, y con el
    -- item de la solicitud en estado FINAL: se exige la whitelist (no solo
    -- excluir 'en_proveedor') para que un item a mitad de un revert
    -- concurrente (ya en 'pendiente') tampoco pase (TOCTOU).
    select count(*) into v_invalidos
    from unnest(p_item_ids) as sel(id)
    left join materiales_a_cuenta_cliente m on m.id = sel.id
    left join solicitud_compra_item i on i.id = m.item_id
    where m.id is null
       or m.obra_cod <> p_obra_cod
       or m.cobro_id is not null
       or m.pagado_por <> 'cadinc'
       or m.a_cargo_de <> 'cliente'
       or m.precio_unit <= 0
       or i.estado is null
       or i.estado not in ('comprado', 'de_deposito', 'retirado', 'enviado');
    if v_invalidos > 0 then
      raise exception 'ITEM_INVALIDO'
        using errcode = 'P0001',
              detail = 'Algún item no es imputable (ya pagado / otra obra / a cargo de CADINC / sin tasar / pendiente de retiro).';
    end if;

    select coalesce(sum(precio_total), 0) into v_total_imputado
    from materiales_a_cuenta_cliente where id = any(p_item_ids);

    if p_monto + 0.01 < v_total_imputado then
      raise exception 'MONTO_INSUFICIENTE'
        using errcode = 'P0001',
              detail = format('monto=%s imputado=%s', p_monto, v_total_imputado);
    end if;
  end if;

  insert into cuenta_cliente_cobros
    (obra_cod, fecha, monto, medio, obs, comprobante_url, comprobante_hash,
     created_by, updated_by)
  values
    (p_obra_cod, p_fecha, p_monto, p_medio, nullif(p_obs, ''),
     p_comprobante_url, p_comprobante_hash, p_user_id, p_user_id)
  returning * into v_cobro;

  if array_length(p_item_ids, 1) > 0 then
    update materiales_a_cuenta_cliente
       set cobro_id      = v_cobro.id,
           monto_cobrado = precio_total,
           updated_by    = p_user_id,
           updated_at    = now()
     where id = any(p_item_ids);
  end if;

  return v_cobro;
end
$function$;
