-- =====================================================================
-- Compras: tolerancia de saldo (2026-09-25, serie 20260930)
--
-- Por qué: «Deuda por proveedor» mostraba ruido de centavos: ABC S.A. con
-- $0,16 a cuenta, Norte Distribuciones con $0,48, compras a reconstruir con
-- $0,01 de redondeo. Los casos reales (Supermat $30.000 a cuenta, Leon
-- Alperovich $34.000,94) tienen que seguir viéndose.
--
-- 1) Clave nueva de `pagos_config`: `tolerancia_saldo` (número, 0 a 100,
--    dos decimales; default 1.00). Se edita desde Compras › Configuración.
--    `_pagos_tolerancia_saldo()` la lee (default 1.00 si falta).
-- 2) `v_pagos_proveedor_saldo`: un comprobante cuenta como abierto (en
--    facturas_abiertas, para_aprobar, para_imputar, saldo, listo para pagar,
--    vencido, más vieja y a reconstruir) solo si su saldo es >= tolerancia
--    (una NC pendiente: su total). El a cuenta y la NC disponible del
--    proveedor por debajo de la tolerancia valen 0. Así el filtro de filas
--    (activo o algún número) también la respeta.
-- 3) `v_pagos_facturas.vencida` exige saldo >= tolerancia: la campana
--    («facturas vencidas»), su deep-link y el vencido del resumen leen esa
--    columna, así que los tres siguen dando el mismo número.
--
-- Es SOLO lectura y umbral: no cambia estados ni saldos de ninguna factura.
-- Con tolerancia 0 el umbral efectivo es medio centavo (= «> 0» de antes).
-- Parches por ancla sobre las definiciones vivas (pg_temp._una, de 20260929z).
-- =====================================================================

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

-- ── 1) La clave ──
alter table public.pagos_config drop constraint pagos_config_clave_check;
alter table public.pagos_config add constraint pagos_config_clave_check check (clave = any (array[
  'tributo_jurisdiccion_default_id', 'aviso_contador_email', 'aviso_compras_email', 'aviso_responder_a',
  'aviso_nombre_remitente', 'aviso_pie_texto', 'plazos_cheque', 'tolerancia_saldo']::text[]));

insert into public.pagos_config (clave, valor) values ('tolerancia_saldo', '1.00'::jsonb)
on conflict (clave) do nothing;

create or replace function public._pagos_tolerancia_saldo() returns numeric
  language sql stable
  set search_path to 'public', 'pg_temp'
as $f$
  select coalesce(
    (select case when jsonb_typeof(valor) = 'number' and (valor #>> '{}')::numeric between 0 and 100
                 then (valor #>> '{}')::numeric end
       from public.pagos_config where clave = 'tolerancia_saldo'),
    1.00)
$f$;
comment on function public._pagos_tolerancia_saldo() is
  'Compras: montos por debajo no cuentan como deuda ni saldo a favor en «Deuda por proveedor» ni como vencidos. pagos_config.tolerancia_saldo, default 1.00. 20260930e.';
revoke all on function public._pagos_tolerancia_saldo() from public, anon, authenticated;
grant execute on function public._pagos_tolerancia_saldo() to service_role;

-- Lectura
do $m$
declare
  v text := pg_get_functiondef('public.pagos_config_json()'::regprocedure);
begin
  v := pg_temp._una(v,
$a$    'plazos_cheque',
$a$,
$a$    'tolerancia_saldo', public._pagos_tolerancia_saldo(),
    'plazos_cheque',
$a$);
  execute v;
end $m$;

-- Escritura: número entre 0 y 100, a lo sumo 2 decimales.
do $m$
declare
  v text := pg_get_functiondef('public.pagos_guardar_config(jsonb,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$      when 'plazos_cheque' then$a$,
$a$      when 'tolerancia_saldo' then
        if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$'
           or (v_v #>> '{}')::numeric > 100 then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'tolerancia_invalida', 'min', 0, 'max', 100)::text;
        end if;
        v_v := to_jsonb(round((v_v #>> '{}')::numeric, 2));

      when 'plazos_cheque' then$a$);
  execute v;
end $m$;

-- ── 2) Deuda por proveedor ──
do $m$
declare
  v text := rtrim(btrim(pg_get_viewdef('public.v_pagos_proveedor_saldo'::regclass, true)), ';');
begin
  -- Columnas de salida (primero saldo_neto: su ancla contiene la de nc_disponible)
  v := pg_temp._una(v,
    '(COALESCE(s.saldo, 0::numeric) - COALESCE(ac.a_cuenta, 0::numeric) - COALESCE(s.nc_disponible, 0::numeric))::numeric(14,2) AS saldo_neto',
    '(COALESCE(s.saldo, 0::numeric) - th.a_cuenta - th.nc)::numeric(14,2) AS saldo_neto');
  v := pg_temp._una(v,
    'COALESCE(ac.a_cuenta, 0::numeric)::numeric(14,2) AS a_cuenta_sin_aplicar',
    'th.a_cuenta::numeric(14,2) AS a_cuenta_sin_aplicar');
  v := pg_temp._una(v,
    'COALESCE(s.nc_disponible, 0::numeric)::numeric(14,2) AS nc_disponible',
    'th.nc::numeric(14,2) AS nc_disponible');
  -- La tolerancia, una vez por consulta
  v := pg_temp._una(v,
    'FROM pagos_proveedores p
',
    'FROM pagos_proveedores p
     CROSS JOIN ( SELECT GREATEST(_pagos_tolerancia_saldo(), 0.005) AS tol) tz
');
  -- Lo abierto
  v := pg_temp._una(v,
    'count(*) FILTER (WHERE v.clase = ''factura''::text) AS facturas_abiertas',
    'count(*) FILTER (WHERE v.clase = ''factura''::text AND v.saldo >= tz.tol) AS facturas_abiertas');
  v := pg_temp._una(v,
    'count(*) FILTER (WHERE v.estado = ''pendiente''::text AND NOT v.sin_imputar) AS para_aprobar',
    'count(*) FILTER (WHERE v.estado = ''pendiente''::text AND NOT v.sin_imputar AND CASE WHEN v.clase = ''nota_credito''::text THEN v.total ELSE v.saldo END >= tz.tol) AS para_aprobar');
  v := pg_temp._una(v,
    'count(*) FILTER (WHERE v.estado = ''pendiente''::text AND v.sin_imputar) AS para_imputar',
    'count(*) FILTER (WHERE v.estado = ''pendiente''::text AND v.sin_imputar AND CASE WHEN v.clase = ''nota_credito''::text THEN v.total ELSE v.saldo END >= tz.tol) AS para_imputar');
  v := pg_temp._una(v,
    'sum(v.saldo) AS saldo,',
    'sum(v.saldo) FILTER (WHERE v.saldo >= tz.tol) AS saldo,');
  v := pg_temp._una(v,
    'sum(v.saldo) FILTER (WHERE v.estado = ANY (ARRAY[''aprobada''::text, ''pagada_parcial''::text])) AS saldo_aprobado',
    'sum(v.saldo) FILTER (WHERE (v.estado = ANY (ARRAY[''aprobada''::text, ''pagada_parcial''::text])) AND v.saldo >= tz.tol) AS saldo_aprobado');
  v := pg_temp._una(v,
    'sum(v.saldo) FILTER (WHERE v.vencida) AS vencido',
    'sum(v.saldo) FILTER (WHERE v.vencida AND v.saldo >= tz.tol) AS vencido');
  v := pg_temp._una(v,
    'min(v.vence_el) AS mas_vieja',
    'min(v.vence_el) FILTER (WHERE v.saldo >= tz.tol) AS mas_vieja');
  -- A reconstruir
  v := pg_temp._una(v,
    'sum(v.saldo) AS a_reconstruir',
    'sum(v.saldo) FILTER (WHERE v.saldo >= tz.tol) AS a_reconstruir');
  v := pg_temp._una(v,
    'count(*) FILTER (WHERE v.clase = ''factura''::text) AS facturas_a_reconstruir',
    'count(*) FILTER (WHERE v.clase = ''factura''::text AND v.saldo >= tz.tol) AS facturas_a_reconstruir');
  -- A cuenta y NC disponible: por debajo de la tolerancia valen 0
  v := pg_temp._una(v,
    ') rc ON true',
    ') rc ON true
     CROSS JOIN LATERAL ( SELECT
                CASE WHEN COALESCE(ac.a_cuenta, 0::numeric) >= tz.tol THEN ac.a_cuenta ELSE 0::numeric END AS a_cuenta,
                CASE WHEN COALESCE(s.nc_disponible, 0::numeric) >= tz.tol THEN s.nc_disponible ELSE 0::numeric END AS nc) th');
  -- Filtro de filas
  v := pg_temp._una(v,
    'COALESCE(ac.a_cuenta, 0::numeric) > 0::numeric OR COALESCE(s.nc_disponible, 0::numeric) > 0::numeric',
    'th.a_cuenta > 0::numeric OR th.nc > 0::numeric');
  execute 'create or replace view public.v_pagos_proveedor_saldo with (security_invoker = true) as ' || v;
end $m$;

-- ── 3) «Vencida» con saldo de verdad ──
do $m$
declare
  v text := rtrim(btrim(pg_get_viewdef('public.v_pagos_facturas'::regclass, true)), ';');
begin
  v := pg_temp._una(v,
    '     JOIN pagos_proveedores p ON p.id = f.proveedor_id
',
    '     JOIN pagos_proveedores p ON p.id = f.proveedor_id
     CROSS JOIN ( SELECT GREATEST(_pagos_tolerancia_saldo(), 0.005) AS tol) tz
');
  v := pg_temp._una(v,
    'AND NOT f.pago_a_reconstruir AS vencida',
    'AND NOT f.pago_a_reconstruir AND (f.total - COALESCE(pg.pagado, 0::numeric) - COALESCE(pg.acreditado, 0::numeric) - COALESCE(ncf.acreditado, 0::numeric)) >= tz.tol AS vencida');
  execute 'create or replace view public.v_pagos_facturas as ' || v;
end $m$;

comment on view public.v_pagos_proveedor_saldo is
  'Deuda por proveedor. Desde 20260930e respeta pagos_config.tolerancia_saldo: comprobantes, a cuenta y NC por debajo no cuentan.';
