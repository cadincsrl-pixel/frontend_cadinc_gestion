-- =====================================================================
-- Contabilidad: la cuenta de ventas por CLIENTE (clave `ventas.cliente`)
-- (2026-09-28)
--
-- Por qué (pedido del contador, 24/09): la cuenta de ventas se separa por
-- cliente. Los clientes de transporte (Prosal, Complejo Alimenticio San
-- Salvador, Transporte Global, Casilda…) van a 4.1.1.01.03 «Prestaciones de
-- servicios» y el resto a 4.1.1.01.01 «Ventas Obras». Hasta hoy la cuenta de
-- la línea de ventas salía de `ventas.producto` (facturas del ERP) o de
-- `ventas.externo` (comprobantes externos, por código de comprobante), y casi
-- todo lo de julio en adelante son externos: por código no se distingue un
-- flete de un avance de obra.
--
-- Qué hace:
-- 1) Clave nueva `ventas.cliente` (subclave = ventas_clientes.id como texto;
--    rubros ['ingreso'], auxiliares ['none'], subclave_tipo 'cliente').
-- 2) Si el cliente del comprobante tiene mapeo (a una cuenta activa e
--    imputable), MANDA sobre `ventas.producto` y `ventas.externo` para la
--    línea de ventas, en ventas_facturas y ventas_comprobantes_externos,
--    NC y CVLP incluidas (el signo lo sigue poniendo el comprobante). Sin
--    mapeo, todo sigue como antes. Deudores, IVA y tributos no cambian.
-- 3) _cont_subclave_valida acepta ids existentes de ventas_clientes;
--    cont_mapeos_listar ofrece los clientes con comprobantes desde
--    `automaticos_desde` (etiqueta = razón social, ordenados por nombre);
--    _cont_mapeo_en_uso los cuenta.
-- 4) El CHECK de cont_mapeos.clave suma la clave nueva.
--
-- El origen_hash (_cont_hash) ya incluye la cuenta de cada línea: si el
-- mapeo aplicable cambia de cuenta, cambia el hash y el origen pasa a
-- «desactualizado» / se regenera. No hace falta tocar _cont_hash.
-- Parche por anclas sobre la definición viva (20260927d/e/m).
-- =====================================================================

alter table public.cont_mapeos drop constraint cont_mapeos_clave_check;
alter table public.cont_mapeos add constraint cont_mapeos_clave_check check (clave = any (array[
  'compras.concepto', 'compras.sin_imputar', 'compras.iva_cf', 'compras.tributo', 'compras.proveedores',
  'ventas.producto', 'ventas.externo', 'ventas.cliente', 'ventas.iva_df', 'ventas.tributo', 'ventas.deudores',
  'cobros.medio', 'cobros.retencion', 'pagos.puente', 'pagos.cheque_propio', 'pagos.cheque_tercero',
  'general.redondeo']));

create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

do $m$
declare
  v text;
begin
  -- 1) Regla nueva (va antes de ventas.iva_df, pegada a las otras de ventas).
  v := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v := pg_temp._una(v,
$a${"clave":"ventas.iva_df",$a$,
$a${"clave":"ventas.cliente","etiqueta":"Ventas por cliente","descripcion":"Cuenta de ingreso de un cliente puntual (por ejemplo, los de transporte a «Prestaciones de servicios»). Si el cliente tiene mapeo, manda sobre «Ventas por producto» y «Ventas externas», NC y CVLP incluidas; sin mapeo se usa la regla del producto o del comprobante.","rubros":["ingreso"],"auxiliares":["none"],"subclave_tipo":"cliente","subclaves":[],"lookup":"cliente → producto / comprobante"},
    {"clave":"ventas.iva_df",$a$);
  execute v;

  -- 2) Validación: id existente de ventas_clientes.
  v := pg_get_functiondef('public._cont_subclave_valida(text, text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'cbte_externo' then
$a$,
$a$    when 'cliente' then
      return p_sub ~ '^[0-9]{1,18}$' and exists (select 1 from public.ventas_clientes c where c.id = p_sub::bigint);
    when 'cbte_externo' then
$a$);
  execute v;

  -- 3) Etiqueta: razón social.
  v := pg_get_functiondef('public._cont_subclave_etiqueta(text, text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when p_clave = 'ventas.externo' then
$a$,
$a$    when p_clave = 'ventas.cliente' then
      coalesce((select c.razon_social || case when c.activo then '' else ' (baja)' end
                  from public.ventas_clientes c where p_sub ~ '^[0-9]{1,18}$' and c.id = p_sub::bigint), 'Cliente ' || p_sub)
    when p_clave = 'ventas.externo' then
$a$);
  execute v;

  -- 4) En uso: comprobantes del cliente desde la fecha de arranque.
  v := pg_get_functiondef('public._cont_mapeo_en_uso(text, text, date)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'ventas.externo' then
$a$,
$a$    when 'ventas.cliente' then
      if p_sub ~ '^[0-9]{1,18}$' then
        select (select count(*) from public.ventas_facturas v
                 where v.ambiente = 'prod' and v.estado = 'autorizada' and v.fecha_cbte >= p_desde and v.cliente_id = p_sub::bigint)
             + (select count(*) from public.ventas_comprobantes_externos x
                 where x.fecha >= p_desde and x.cliente_id = p_sub::bigint)
          into v_n;
      end if;
    when 'ventas.externo' then
$a$);
  execute v;

  -- 5) Listado: los clientes con comprobantes desde la fecha de arranque,
  --    ordenados por razón social.
  v := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v := pg_temp._una(v,
$a$      union select x.cbte_tipo::text from public.ventas_comprobantes_externos x where r ->> 'clave' = 'ventas.externo'
$a$,
$a$      union select x.cbte_tipo::text from public.ventas_comprobantes_externos x where r ->> 'clave' = 'ventas.externo'
      union select v.cliente_id::text from public.ventas_facturas v
             where r ->> 'clave' = 'ventas.cliente' and v.ambiente = 'prod' and v.estado = 'autorizada' and v.fecha_cbte >= v_desde
      union select x.cliente_id::text from public.ventas_comprobantes_externos x
             where r ->> 'clave' = 'ventas.cliente' and x.fecha >= v_desde
$a$);
  v := pg_temp._una(v,
$a$order by case when s.sub = '' then 0 else 1 end, s.n)$a$,
$a$order by case when s.sub = '' then 0 else 1 end,
                        case when r ->> 'clave' = 'ventas.cliente' then public._cont_subclave_etiqueta(r ->> 'clave', s.sub) end,
                        s.n)$a$);
  execute v;

  -- 6) Motor: facturas del ERP.
  v := pg_get_functiondef('public._cont_prop_venta_factura(bigint)'::regprocedure);
  v := pg_temp._una(v,
$a$  v_hay_ali boolean;
$a$,
$a$  v_hay_ali boolean;
  v_por_cli boolean;
$a$);
  v := pg_temp._una(v,
$a$  p := public._cont_prop_linea(p, 'ventas.producto', array[v.producto], false,
$a$,
$a$  -- El mapeo por cliente manda sobre el del producto (20260928c).
  v_por_cli := public._cont_cuenta_mapeada('ventas.cliente', array[v.cliente_id::text]) is not null;
  p := public._cont_prop_linea(p,
                               case when v_por_cli then 'ventas.cliente' else 'ventas.producto' end,
                               case when v_por_cli then array[v.cliente_id::text] else array[v.producto] end, false,
$a$);
  execute v;

  -- 7) Motor: comprobantes externos (CVLP y el resto).
  v := pg_get_functiondef('public._cont_prop_venta_externo(bigint)'::regprocedure);
  v := pg_temp._una(v,
$a$  g    text;
$a$,
$a$  g    text;
  v_por_cli boolean;
$a$);
  v := pg_temp._una(v,
$a$  select razon_social into v_rs from public.ventas_clientes where id = x.cliente_id;
$a$,
$a$  select razon_social into v_rs from public.ventas_clientes where id = x.cliente_id;
  -- El mapeo por cliente manda sobre el del comprobante (20260928c).
  v_por_cli := public._cont_cuenta_mapeada('ventas.cliente', array[x.cliente_id::text]) is not null;
$a$);
  v := pg_temp._una(v,
$a$      p := public._cont_prop_linea(p, 'ventas.externo', array[x.cbte_tipo::text, '60', ''], false, (x.liquido - x.iva) * tc, null, null, null, g);
$a$,
$a$      p := public._cont_prop_linea(p,
                                   case when v_por_cli then 'ventas.cliente' else 'ventas.externo' end,
                                   case when v_por_cli then array[x.cliente_id::text] else array[x.cbte_tipo::text, '60', ''] end,
                                   false, (x.liquido - x.iva) * tc, null, null, null, g);
$a$);
  v := pg_temp._una(v,
$a$  p := public._cont_prop_linea(p, 'ventas.externo', array[x.cbte_tipo::text, ''], false,
$a$,
$a$  p := public._cont_prop_linea(p,
                               case when v_por_cli then 'ventas.cliente' else 'ventas.externo' end,
                               case when v_por_cli then array[x.cliente_id::text] else array[x.cbte_tipo::text, ''] end, false,
$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
