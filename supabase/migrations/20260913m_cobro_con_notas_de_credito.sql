-- El cobro de un certificado tiene que contemplar las devoluciones.
--
-- Bug silencioso que aparece al emitir notas de crédito (20260913k). El caso:
-- un certificado EMITIDO pero todavía NO cobrado. Sus renglones tienen
-- `certificado_id` y `cobro_id` nulo, así que `devolver_material` los ve
-- congelados y emite nota de crédito. Después, al cobrar ese certificado,
-- `registrar_cobro_cuenta_cliente` arma `v_mat` con el precio_total BRUTO de
-- esos renglones y exige `p_monto >= v_mat + mano_de_obra`. Pero el cliente va
-- a pagar menos, justamente por la devolución → MONTO_INSUFICIENTE, y no hay
-- forma de cobrar.
--
-- Dos cambios y los dos hacen falta:
--
--   1. `v_mat` pasa a ser NETO de las notas emitidas contra esos renglones.
--      Es lo que el cliente debe de verdad.
--
--   2. `monto_cobrado` de cada renglón también se netea. Si no, la suma de los
--      monto_cobrado quedaría por encima del monto del cobro y el saldo libre
--      del pago se iría a negativo — que es exactamente el error de cálculo que
--      me comí hoy al mirar el cobro de CLINICA SALTA mirando una sola tabla.
--
-- `greatest(..., 0)` en los dos lados: una nota nunca puede dejar un importe
-- negativo, ni aunque alguien devuelva más valor del que tenía el renglón.

create or replace function public.registrar_cobro_cuenta_cliente(
  p_obra_cod text, p_fecha date, p_monto numeric, p_medio text, p_obs text,
  p_comprobante_url text, p_comprobante_hash text, p_item_ids integer[],
  p_user_id uuid, p_certificado_id integer default null, p_monto_mano_de_obra numeric default 0)
returns cuenta_cliente_cobros
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cobro     cuenta_cliente_cobros;
  v_items     integer[] := p_item_ids;
  v_mat       numeric := 0;
  v_notas     numeric := 0;
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

    -- Lo devuelto ya no se le debe al cliente (20260913m).
    select coalesce(sum(n.monto), 0) into v_notas
      from public.cuenta_cliente_notas_credito n
      join public.materiales_a_cuenta_cliente m on m.item_id = n.item_id
     where m.id = any(v_items) and not n.anulada;
    v_mat := greatest(v_mat - v_notas, 0);
  end if;

  if p_monto + 0.01 < v_mat + p_monto_mano_de_obra then
    raise exception 'MONTO_INSUFICIENTE' using errcode = 'P0001',
      detail = format('monto=%s materiales=%s mano_de_obra=%s notas=%s', p_monto, v_mat, p_monto_mano_de_obra, v_notas);
  end if;

  insert into cuenta_cliente_cobros
    (obra_cod, fecha, monto, medio, obs, comprobante_url, comprobante_hash, created_by, updated_by,
     certificado_id, monto_mano_de_obra, monto_materiales)
  values
    (p_obra_cod, p_fecha, p_monto, p_medio, nullif(p_obs, ''), p_comprobante_url, p_comprobante_hash, p_user_id, p_user_id,
     p_certificado_id, p_monto_mano_de_obra, v_mat)
  returning * into v_cobro;

  if array_length(v_items, 1) > 0 then
    -- monto_cobrado NETO de las notas del renglón: la suma de los
    -- monto_cobrado tiene que cerrar con v_mat, si no el saldo libre del cobro
    -- se va a negativo.
    update materiales_a_cuenta_cliente m
       set cobro_id      = v_cobro.id,
           monto_cobrado = greatest(m.precio_total - coalesce((
             select sum(n.monto) from public.cuenta_cliente_notas_credito n
              where n.item_id = m.item_id and not n.anulada), 0), 0),
           updated_by = p_user_id,
           updated_at = now()
     where m.id = any(v_items);
  end if;
  return v_cobro;
end $function$;
