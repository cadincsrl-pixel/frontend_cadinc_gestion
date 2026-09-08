-- 20260911i — Emitir y anular un certificado, y el freeze de la fila
-- certificada o cobrada.
--
-- emitir_certificado_cliente(obra, corte, mano_de_obra, obs, user):
--   1. lock por obra; numero = ultimo + 1 (los anulados tambien cuentan, un
--      numero no se reusa).
--   2. toma los renglones de la obra a cargo del cliente, no pagados directo,
--      sin cobrar, sin certificar, con fecha de resolucion <= corte y precio > 0.
--      Los de precio 0 ("esperando precio") quedan afuera y se devuelve cuantos.
--   3. lleva el precio al catalogo A LA FECHA DE CORTE (precio_ref_en, o el
--      actual si el historial no llega), solo si la ficha tiene precio, la
--      unidad es compatible y el precio SUBE. Nunca baja solo. Deposito y
--      proveedor por igual (decision del user 08/09: "me lo quedo por gestion
--      de compras"). Cada cambio deja su evento precio_cambiado con fuente
--      'certificado' y el id como lote.
--   4. estampa certificado_id, suma totales, inserta el certificado.
-- anular_certificado_cliente(id, motivo, user): solo sin cobros imputados;
--   libera los renglones (los precios quedan como estaban al emitir; se ve en
--   el timeline).
-- Trigger: una fila con certificado_id o cobro_id no cambia precio ni
--   cantidad, salvo `set local cadinc.descongelar = 'on'` en una migracion
--   que lo diga en el diff. Es el freeze que faltaba: hasta hoy vivia solo en
--   editarItem del backend y un UPDATE a mano lo esquivaba.

create or replace function public.emitir_certificado_cliente(
  p_obra_cod     text,
  p_fecha_corte  date,
  p_mano_de_obra numeric default 0,
  p_obs          text default null,
  p_user_id      uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obra       obras%rowtype;
  v_numero     integer;
  v_cert_id    integer;
  v_sin_precio integer;
  v_retasados  integer := 0;
  v_renglones  integer;
  v_materiales numeric;
  r            record;
begin
  if p_mano_de_obra is null or p_mano_de_obra < 0 then
    raise exception 'MANO_DE_OBRA_INVALIDA' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('certificado_cliente:' || p_obra_cod));

  select * into v_obra from obras where cod = p_obra_cod;
  if not found then raise exception 'OBRA_INEXISTENTE' using errcode = 'P0001'; end if;
  if v_obra.es_deposito then raise exception 'OBRA_ES_DEPOSITO' using errcode = 'P0001'; end if;
  if v_obra.archivada then raise exception 'OBRA_ARCHIVADA' using errcode = 'P0001'; end if;

  select coalesce(max(numero), 0) + 1 into v_numero from certificados_cliente where obra_cod = p_obra_cod;

  -- Los que se quedan afuera por estar en $0: se informan, no se certifican.
  select count(*) into v_sin_precio
    from materiales_a_cuenta_cliente c
   where c.obra_cod = p_obra_cod and c.certificado_id is null and c.cobro_id is null
     and c.a_cargo_de = 'cliente' and c.pagado_por = 'cadinc'
     and c.fecha_resolucion <= p_fecha_corte and coalesce(c.precio_unit, 0) <= 0;

  insert into certificados_cliente (obra_cod, numero, fecha_corte, mano_de_obra, obs, emitido_por)
  values (p_obra_cod, v_numero, p_fecha_corte, p_mano_de_obra, nullif(p_obs, ''), p_user_id)
  returning id into v_cert_id;

  -- Precio al catalogo a la fecha de corte, solo hacia arriba, solo con unidad compatible.
  perform set_config('cadinc.mcc_fuente', 'certificado', true);
  perform set_config('cadinc.mcc_lote', v_cert_id::text, true);
  perform set_config('cadinc.precio_user', coalesce(p_user_id::text, ''), true);
  for r in
    select c.id, c.cantidad, c.precio_unit,
           coalesce(precio_ref_en(m.id, p_fecha_corte), m.precio_ref) as precio_catalogo
      from materiales_a_cuenta_cliente c
      join solicitud_compra_item i on i.id = c.item_id
      join stock_materiales m on m.id = i.material_id
     where c.obra_cod = p_obra_cod and c.certificado_id is null and c.cobro_id is null
       and c.a_cargo_de = 'cliente' and c.pagado_por = 'cadinc'
       and c.fecha_resolucion <= p_fecha_corte and c.precio_unit > 0
       and m.precio_ref > 0 and unidad_compatible(c.unidad, m.unidad)
       for update of c
  loop
    if r.precio_catalogo > r.precio_unit then
      update materiales_a_cuenta_cliente
         set precio_unit = r.precio_catalogo,
             precio_total = round(r.cantidad * r.precio_catalogo, 2),
             updated_by = p_user_id, updated_at = now()
       where id = r.id;
      v_retasados := v_retasados + 1;
    end if;
  end loop;

  -- Congelar: el certificado se lleva estos renglones.
  update materiales_a_cuenta_cliente c
     set certificado_id = v_cert_id, updated_by = p_user_id, updated_at = now()
   where c.obra_cod = p_obra_cod and c.certificado_id is null and c.cobro_id is null
     and c.a_cargo_de = 'cliente' and c.pagado_por = 'cadinc'
     and c.fecha_resolucion <= p_fecha_corte and c.precio_unit > 0;
  get diagnostics v_renglones = row_count;

  select coalesce(sum(precio_total), 0) into v_materiales
    from materiales_a_cuenta_cliente where certificado_id = v_cert_id;

  update certificados_cliente
     set total_materiales = v_materiales, total = v_materiales + p_mano_de_obra,
         renglones = v_renglones, updated_at = now()
   where id = v_cert_id;

  return jsonb_build_object(
    'id', v_cert_id, 'numero', v_numero, 'obra_cod', p_obra_cod, 'fecha_corte', p_fecha_corte,
    'mano_de_obra', p_mano_de_obra, 'total_materiales', v_materiales, 'total', v_materiales + p_mano_de_obra,
    'renglones', v_renglones, 'retasados', v_retasados, 'sin_precio_excluidos', v_sin_precio);
end $$;

create or replace function public.anular_certificado_cliente(
  p_id integer, p_motivo text, p_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cert certificados_cliente%rowtype; v_liberados integer;
begin
  select * into v_cert from certificados_cliente where id = p_id for update;
  if not found then raise exception 'CERTIFICADO_NO_EXISTE' using errcode = 'P0001'; end if;
  if v_cert.estado = 'anulado' then raise exception 'CERTIFICADO_YA_ANULADO' using errcode = 'P0001'; end if;
  if exists (select 1 from cuenta_cliente_cobros where certificado_id = p_id)
     or exists (select 1 from materiales_a_cuenta_cliente where certificado_id = p_id and cobro_id is not null) then
    raise exception 'CERTIFICADO_CON_COBROS' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO_OBLIGATORIO' using errcode = 'P0001'; end if;

  update materiales_a_cuenta_cliente
     set certificado_id = null, updated_by = p_user_id, updated_at = now()
   where certificado_id = p_id;
  get diagnostics v_liberados = row_count;

  update certificados_cliente
     set estado = 'anulado', anulado_por = p_user_id, anulado_el = now(), anulado_motivo = p_motivo, updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'renglones_liberados', v_liberados);
end $$;

revoke all on function public.emitir_certificado_cliente(text, date, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.emitir_certificado_cliente(text, date, numeric, text, uuid) to service_role;
revoke all on function public.anular_certificado_cliente(integer, text, uuid) from public, anon, authenticated;
grant execute on function public.anular_certificado_cliente(integer, text, uuid) to service_role;

-- El freeze. BEFORE, sobre las columnas de plata y cantidad.
create or replace function public.fn_mcc_congelada()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if new.precio_unit is not distinct from old.precio_unit
     and new.precio_total is not distinct from old.precio_total
     and new.cantidad is not distinct from old.cantidad then
    return new;
  end if;
  if old.cobro_id is not null then
    raise exception 'MCC_COBRADO' using errcode = 'P0001', detail = old.cobro_id::text;
  end if;
  if old.certificado_id is not null then
    raise exception 'MCC_CERTIFICADO' using errcode = 'P0001', detail = old.certificado_id::text;
  end if;
  return new;
end $$;
drop trigger if exists trg_mcc_congelada on public.materiales_a_cuenta_cliente;
create trigger trg_mcc_congelada
  before update of precio_unit, precio_total, cantidad on public.materiales_a_cuenta_cliente
  for each row execute function public.fn_mcc_congelada();
