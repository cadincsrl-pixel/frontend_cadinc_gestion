-- 20260911j — El cobro se imputa contra un certificado, repartido en mano de
-- obra y materiales; y la cuenta corriente muestra el certificado de cada renglon.
--
-- registrar_cobro_cuenta_cliente gana p_certificado_id y p_monto_mano_de_obra
-- (con default, asi el backend viejo sigue llamando igual). Con certificado:
-- los items son TODOS los renglones del certificado sin cobrar (p_item_ids se
-- ignora), monto_materiales = su suma, y el monto tiene que cubrir materiales +
-- mano de obra. Sin certificado, como antes.

drop function if exists public.registrar_cobro_cuenta_cliente(text, date, numeric, text, text, text, text, integer[], uuid);
create or replace function public.registrar_cobro_cuenta_cliente(
  p_obra_cod text, p_fecha date, p_monto numeric, p_medio text, p_obs text,
  p_comprobante_url text, p_comprobante_hash text, p_item_ids integer[], p_user_id uuid,
  p_certificado_id integer default null, p_monto_mano_de_obra numeric default 0
) returns cuenta_cliente_cobros
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cobro     cuenta_cliente_cobros;
  v_items     integer[] := p_item_ids;
  v_mat       numeric := 0;
  v_invalidos integer;
  v_cert      certificados_cliente%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('cuenta_cliente_cobro:' || p_obra_cod));

  if p_comprobante_hash is not null then
    perform 1 from cuenta_cliente_cobros where comprobante_hash = p_comprobante_hash;
    if found then raise exception 'COMPROBANTE_DUPLICADO' using errcode = 'P0001'; end if;
  end if;
  if p_monto_mano_de_obra is null or p_monto_mano_de_obra < 0 then
    raise exception 'MANO_DE_OBRA_INVALIDA' using errcode = 'P0001';
  end if;

  if p_certificado_id is not null then
    select * into v_cert from certificados_cliente where id = p_certificado_id for update;
    if not found then raise exception 'CERTIFICADO_NO_EXISTE' using errcode = 'P0001'; end if;
    if v_cert.estado <> 'emitido' then raise exception 'CERTIFICADO_ANULADO' using errcode = 'P0001'; end if;
    if v_cert.obra_cod <> p_obra_cod then raise exception 'CERTIFICADO_DE_OTRA_OBRA' using errcode = 'P0001'; end if;
    select coalesce(array_agg(id), '{}') into v_items
      from materiales_a_cuenta_cliente where certificado_id = p_certificado_id and cobro_id is null;
  end if;

  if array_length(v_items, 1) > 0 then
    select count(*) into v_invalidos
      from unnest(v_items) as sel(id)
      left join materiales_a_cuenta_cliente m on m.id = sel.id
      left join solicitud_compra_item i on i.id = m.item_id
     where m.id is null or m.obra_cod <> p_obra_cod or m.cobro_id is not null
        or m.pagado_por <> 'cadinc' or m.a_cargo_de <> 'cliente' or m.precio_unit <= 0
        or i.estado is null or i.estado not in ('comprado', 'de_deposito', 'retirado', 'enviado');
    if v_invalidos > 0 then
      raise exception 'ITEM_INVALIDO' using errcode = 'P0001',
        detail = 'Algún item no es imputable (ya pagado / otra obra / a cargo de CADINC / sin tasar / pendiente de retiro).';
    end if;
    select coalesce(sum(precio_total), 0) into v_mat from materiales_a_cuenta_cliente where id = any(v_items);
  end if;

  if p_monto + 0.01 < v_mat + p_monto_mano_de_obra then
    raise exception 'MONTO_INSUFICIENTE' using errcode = 'P0001',
      detail = format('monto=%s materiales=%s mano_de_obra=%s', p_monto, v_mat, p_monto_mano_de_obra);
  end if;

  insert into cuenta_cliente_cobros
    (obra_cod, fecha, monto, medio, obs, comprobante_url, comprobante_hash, created_by, updated_by,
     certificado_id, monto_mano_de_obra, monto_materiales)
  values
    (p_obra_cod, p_fecha, p_monto, p_medio, nullif(p_obs, ''), p_comprobante_url, p_comprobante_hash, p_user_id, p_user_id,
     p_certificado_id, p_monto_mano_de_obra, v_mat)
  returning * into v_cobro;

  if array_length(v_items, 1) > 0 then
    update materiales_a_cuenta_cliente
       set cobro_id = v_cobro.id, monto_cobrado = precio_total, updated_by = p_user_id, updated_at = now()
     where id = any(v_items);
  end if;
  return v_cobro;
end $$;
revoke all on function public.registrar_cobro_cuenta_cliente(text, date, numeric, text, text, text, text, integer[], uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.registrar_cobro_cuenta_cliente(text, date, numeric, text, text, text, text, integer[], uuid, integer, numeric) to service_role;

-- La vista: el certificado de cada renglon, al final (create or replace solo agrega al final).
create or replace view public.v_cuenta_corriente as
 select c.id, c.obra_cod, coalesce(o.nom, c.obra_cod) as obra_nom, coalesce(o.archivada, false) as obra_archivada,
    coalesce(o.materiales_a_cargo_de, 'cliente'::text) as obra_modalidad,
    c.solicitud_id, c.item_id, c.descripcion, c.cantidad, c.unidad, c.precio_unit, c.precio_total, c.origen,
    c.proveedor_id, p.nombre as proveedor_nom, c.factura_id, f.numero as factura_numero, f.adjunto_url as factura_adjunto_url,
    f.fecha as factura_fecha, c.fecha_resolucion, to_char(c.fecha_resolucion::timestamp with time zone, 'YYYY-MM'::text) as mes,
    c.pagado_por, c.a_cargo_de, c.cobro_id, c.monto_cobrado, i.estado as item_estado, i.material_id, m.clase, m.rubro_id,
    r.nombre as rubro_nom,
    case when m.clase = 'epp'::text then 'epp'::text else 'material'::text end as tipo,
    case when c.pagado_por = 'cliente'::text then 'pago_directo'::text
         when c.a_cargo_de = 'cadinc'::text then 'gasto_cadinc'::text
         when c.cobro_id is not null then 'cobrado'::text
         else 'a_cobrar'::text end as estado,
    case when c.a_cargo_de = 'cadinc'::text then
         case when m.clase = 'epp'::text then 'epp'::text else 'llave_en_mano'::text end
         else null::text end as motivo_cadinc,
    norm_txt((((((((((c.descripcion || ' '::text) || coalesce(p.nombre, ''::text)) || ' '::text) || coalesce(o.nom, ''::text)) || ' '::text) || c.obra_cod) || ' '::text) || c.solicitud_id::text) || ' '::text) || coalesce(f.numero, ''::text)) as busq,
    c.created_at, c.updated_at, coalesce(o.es_interna, false) as obra_interna,
    c.certificado_id, cc.numero as certificado_numero
   from materiales_a_cuenta_cliente c
     join solicitud_compra_item i on i.id = c.item_id
     left join obras o on o.cod = c.obra_cod
     left join stock_materiales m on m.id = i.material_id
     left join stock_rubros r on r.id = m.rubro_id
     left join proveedores p on p.id = c.proveedor_id
     left join facturas_compra f on f.id = c.factura_id
     left join certificados_cliente cc on cc.id = c.certificado_id;
alter view public.v_cuenta_corriente set (security_invoker = on);
