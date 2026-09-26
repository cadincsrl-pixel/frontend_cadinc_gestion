-- Compras: la cuenta de origen de la OP se completa sola (27/09/2026).
--
-- «Sale de la cuenta» era opcional y arrancaba vacío: 60 OP emitidas quedaron
-- sin cuenta (la mayoría e-cheq y cheques). Regla acordada con el dueño:
--   · efectivo                → la caja;
--   · tarjeta                 → la última tarjeta usada con el proveedor, si no la primera;
--   · cheque/e-cheq propio    → la cuenta del banco del cheque (Galicia → Banco Galicia);
--                               si el banco tiene varias cuentas, la más usada;
--   · lo demás (transferencia, débito, cheques de tercero, banco no reconocido)
--                             → la última cuenta usada con ese proveedor y esa forma;
--                               si no hay, la más usada con esa forma;
--   · «otro» y nota de crédito → sin cuenta (compensaciones: no sale plata).
-- Una cuenta elegida a mano siempre manda. El asiento de un cheque de tercero no
-- usa esta cuenta (va a pagos.cheque_tercero), así que ahí es solo informativa.
--
-- La misma función la usa la pantalla para mostrar «automática: X» antes de
-- confirmar (POST /api/pagos/ordenes/cuenta-origen-sugerida).
--
-- Además: las OP emitidas sin cuenta pasan a Banco Galicia («todas las OP hasta
-- ahora salieron del Galicia», dueño 27/09), salvo las de efectivo, que van a
-- Caja como las otras 133, y las «otro», que son compensaciones.

create or replace function public._pagos_norm_banco(p text)
 returns text
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select nullif(btrim(regexp_replace(
           ' ' || translate(lower(coalesce(p, '')), 'áéíóúü.,', 'aeiouu  ') || ' ',
           '\s(banco|bco|de|la|del|el|argentina|sa|s a|cta|cuenta)(?=\s)', ' ', 'g')), '')
$function$;

create or replace function public._pagos_cuenta_origen_sugerida(p_proveedor_id bigint, p_forma text, p_cheques jsonb)
 returns bigint
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id    bigint;
  v_banco text;
  v_clave text;
begin
  if p_forma is null or p_forma in ('otro', 'nota_credito') then
    return null;
  end if;

  if p_forma = 'efectivo' then
    select id into v_id from public.tesoreria_cuentas
     where activo and tipo = 'caja' and moneda = 'ARS' order by id limit 1;
    return v_id;
  end if;

  if p_forma = 'tarjeta' then
    select o.cuenta_origen_id into v_id
      from public.pagos_ordenes o join public.tesoreria_cuentas t on t.id = o.cuenta_origen_id and t.activo and t.tipo = 'tarjeta'
     where o.proveedor_id = p_proveedor_id and o.estado = 'emitida'
     order by o.id desc limit 1;
    if v_id is null then
      select id into v_id from public.tesoreria_cuentas where activo and tipo = 'tarjeta' order by id limit 1;
    end if;
    return v_id;
  end if;

  -- Cheque propio: la cuenta de su banco (la más usada si ese banco tiene varias).
  if p_forma in ('cheque', 'echeq') and jsonb_typeof(p_cheques) = 'array' then
    select x ->> 'banco' into v_banco
      from jsonb_array_elements(p_cheques) x
     where coalesce((x ->> 'es_propio')::boolean, true) and nullif(btrim(x ->> 'banco'), '') is not null
     limit 1;
    v_clave := split_part(public._pagos_norm_banco(v_banco), ' ', 1);
    if length(v_clave) >= 4 then
      select t.id into v_id
        from public.tesoreria_cuentas t
       where t.activo and t.tipo = 'banco' and t.moneda = 'ARS'
         and ' ' || coalesce(public._pagos_norm_banco(t.banco), '') || ' ' || coalesce(public._pagos_norm_banco(t.nombre), '') || ' '
             like '% ' || v_clave || '%'
       order by (select count(*) from public.pagos_ordenes o where o.cuenta_origen_id = t.id and o.estado = 'emitida') desc, t.id
       limit 1;
      if v_id is not null then return v_id; end if;
    end if;
  end if;

  -- Lo último que se usó con este proveedor y esta forma.
  select o.cuenta_origen_id into v_id
    from public.pagos_ordenes o join public.tesoreria_cuentas t on t.id = o.cuenta_origen_id and t.activo and t.moneda = 'ARS'
   where o.proveedor_id = p_proveedor_id and o.estado = 'emitida' and o.forma_pago = p_forma
   order by o.id desc limit 1;
  if v_id is not null then return v_id; end if;

  -- Lo más usado con esta forma.
  select o.cuenta_origen_id into v_id
    from public.pagos_ordenes o join public.tesoreria_cuentas t on t.id = o.cuenta_origen_id and t.activo and t.moneda = 'ARS'
   where o.estado = 'emitida' and o.forma_pago = p_forma
   group by o.cuenta_origen_id order by count(*) desc, o.cuenta_origen_id limit 1;
  return v_id;
end $function$;

revoke all on function public._pagos_norm_banco(text) from public, anon, authenticated;
revoke all on function public._pagos_cuenta_origen_sugerida(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public._pagos_norm_banco(text) to service_role;
grant execute on function public._pagos_cuenta_origen_sugerida(bigint, text, jsonb) to service_role;

-- _pagos_emitir_orden: sin cuenta elegida, la sugerida.
do $m$
declare
  d text := pg_get_functiondef('public._pagos_emitir_orden(bigint, jsonb, jsonb, jsonb, uuid, boolean)'::regprocedure);
  a text := '  v_cta_origen := nullif(p_orden ->> ''cuenta_origen_id'', '''')::bigint;';
  n text := a || '
  if v_cta_origen is null then
    -- Sin cuenta elegida, la automática (20261009e).
    v_cta_origen := public._pagos_cuenta_origen_sugerida(p_proveedor_id, v_forma, v_cheques);
  end if;';
begin
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then
    raise exception 'ANCLA_CTA_ORIGEN: se esperaba exactamente una vez';
  end if;
  execute replace(d, a, n);
end $m$;

-- Las OP que quedaron sin cuenta.
update public.pagos_ordenes
   set cuenta_origen_id = case when forma_pago = 'efectivo' then 3 else 1 end,
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
 where estado = 'emitida' and cuenta_origen_id is null
   and forma_pago in ('cheque', 'echeq', 'transferencia', 'debito_automatico', 'efectivo');
