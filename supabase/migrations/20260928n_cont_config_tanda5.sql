-- =====================================================================
-- 20260928n — Contabilidad: configuración y mapeos de la tanda 5
-- (asiento de IVA mensual + bienes de uso) (2026-09-24)
--
-- Por qué: las dos piezas nuevas no inventan cuentas ni criterios; todo sale
-- de acá, igual que el motor de automáticos (20260927d).
--
--   · cont_config, claves nuevas:
--       iva_ddjj_arrastre  (false)          compensar los saldos a favor del
--                                           mes anterior en el asiento de IVA
--                                           (P-I1, apagado como la posición
--                                           de Impuestos).
--       bu_frecuencia      ("mensual")      mensual | anual. No se cambia si
--                                           ya hay amortizaciones vigentes en
--                                           el ejercicio de hoy.
--       bu_criterio_alta   ("proporcional") completo | proporcional (año de
--                                           alta, P-B1).
--       bu_corte_inicial   ("2026-06-30")   fecha de la amortización
--                                           acumulada inicial de cada bien;
--                                           solo editable sin amortizaciones.
--     cont_config_json y cont_guardar_config se reescriben COMPLETAS (solo
--     vivían en 20260927d).
--   · Mapeo `iva.ddjj` (a_pagar → pasivo; saldo_a_favor y
--     libre_disponibilidad → activo; libre_disponibilidad cae al técnico si
--     falta). Lo usa el asiento de IVA (20260928o).
--   · Mapeo `bienes.gasto` (subclave = código de un título de bienes de uso,
--     1.2.2.XX, o '' general): SOLO default del alta y del importador de
--     bienes (20260928p); el motor no lo lee, cada bien guarda su cuenta.
--   · CHECK de cont_mapeos rehecho con la lista completa (incluye
--     fondos.concepto de 20260928m). El «en uso» de iva.ddjj y de
--     bienes.gasto lo agregan 20260928o y 20260928p, que crean las tablas.
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

-- ── 1) cont_config ─────────────────────────────────────────────────────
alter table public.cont_config drop constraint cont_config_clave_check;
alter table public.cont_config add constraint cont_config_clave_check check (clave in (
  'automaticos_desde', 'cvlp_modo', 'compras_fecha_contable', 'paga_cliente_modo',
  'iva_ddjj_arrastre', 'bu_frecuencia', 'bu_criterio_alta', 'bu_corte_inicial'));

insert into public.cont_config (clave, valor, updated_at, updated_by) values
  ('iva_ddjj_arrastre', 'false',          now(), null),
  ('bu_frecuencia',     '"mensual"',      now(), null),
  ('bu_criterio_alta',  '"proporcional"', now(), null),
  ('bu_corte_inicial',  '"2026-06-30"',   now(), null)
on conflict (clave) do nothing;

-- ¿Hay corridas de amortización vigentes? (p_solo_ejercicio_hoy: solo las del
-- ejercicio que contiene hoy). Dinámico: la tabla nace en 20260928p.
create or replace function public._cont_hay_amortizaciones(p_solo_ejercicio_hoy boolean)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
declare v boolean;
begin
  if to_regclass('public.cont_amortizacion_corridas') is null then return false; end if;
  execute $q$
    select exists (
      select 1 from public.cont_amortizacion_corridas k
       where k.estado = 'vigente'
         and (not $1 or exists (select 1 from public.cont_ejercicios e
                                 where public.hoy_ar() between e.desde and e.hasta and k.hasta between e.desde and e.hasta)))
  $q$ into v using p_solo_ejercicio_hoy;
  return v;
end $$;

create or replace function public.cont_config_json()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'automaticos_desde',      public._cont_cfg('automaticos_desde') #>> '{}',
    'cvlp_modo',              public._cont_cfg('cvlp_modo') #>> '{}',
    'compras_fecha_contable', public._cont_cfg('compras_fecha_contable') #>> '{}',
    'paga_cliente_modo',      public._cont_cfg('paga_cliente_modo') #>> '{}',
    'iva_ddjj_arrastre',      coalesce((public._cont_cfg('iva_ddjj_arrastre') #>> '{}')::boolean, false),
    'bu_frecuencia',          coalesce(public._cont_cfg('bu_frecuencia') #>> '{}', 'mensual'),
    'bu_criterio_alta',       coalesce(public._cont_cfg('bu_criterio_alta') #>> '{}', 'proporcional'),
    'bu_corte_inicial',       coalesce(public._cont_cfg('bu_corte_inicial') #>> '{}', '2026-06-30'))
$$;

create or replace function public.cont_guardar_config(p_cambios jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_k   text;
  v_v   jsonb;
  v_d   date;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._cont_flag(p_user_id, 'editar_mapeos') then
    raise exception 'SIN_PERMISO_MAPEOS' using errcode = 'P0001';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', null)::text;
  end if;
  for v_k, v_v in select key, value from jsonb_each(p_cambios) loop
    case v_k
      when 'automaticos_desde' then
        begin
          v_d := (v_v #>> '{}')::date;
        exception when others then v_d := null;
        end;
        if v_d is null or v_d < date '2026-07-01' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
        v_v := to_jsonb(v_d::text);
      when 'cvlp_modo' then
        if coalesce(v_v #>> '{}', '') not in ('neto_liquidado', 'bruto') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      when 'compras_fecha_contable' then
        if coalesce(v_v #>> '{}', '') not in ('fecha', 'mes_iva') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      when 'paga_cliente_modo' then
        -- Pendiente de la decisión del contador (P3.4): hoy solo admite null.
        if jsonb_typeof(v_v) <> 'null' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      when 'iva_ddjj_arrastre' then
        if jsonb_typeof(v_v) <> 'boolean' then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      when 'bu_frecuencia' then
        if coalesce(v_v #>> '{}', '') not in ('mensual', 'anual') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
        if (v_v #>> '{}') is distinct from (public._cont_cfg('bu_frecuencia') #>> '{}')
           and public._cont_hay_amortizaciones(true) then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'valor', v_v, 'motivo', 'hay_amortizaciones')::text;
        end if;
      when 'bu_criterio_alta' then
        if coalesce(v_v #>> '{}', '') not in ('completo', 'proporcional') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
      when 'bu_corte_inicial' then
        begin
          v_d := (v_v #>> '{}')::date;
        exception when others then v_d := null;
        end;
        if v_d is null then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'valor', v_v)::text;
        end if;
        v_v := to_jsonb(v_d::text);
        if v_v is distinct from public._cont_cfg('bu_corte_inicial') and public._cont_hay_amortizaciones(false) then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'valor', v_v, 'motivo', 'hay_amortizaciones')::text;
        end if;
      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k)::text;
    end case;
    update public.cont_config set valor = v_v, updated_by = p_user_id where clave = v_k;
  end loop;
  return public.cont_config_json();
end $$;

-- ── 2) CHECK de cont_mapeos (lista completa) ───────────────────────────
alter table public.cont_mapeos drop constraint cont_mapeos_clave_check;
alter table public.cont_mapeos add constraint cont_mapeos_clave_check check (clave in (
  'compras.concepto', 'compras.sin_imputar', 'compras.iva_cf', 'compras.tributo', 'compras.proveedores',
  'ventas.producto', 'ventas.externo', 'ventas.cliente', 'ventas.iva_df', 'ventas.tributo', 'ventas.deudores',
  'cobros.medio', 'cobros.retencion', 'pagos.puente', 'pagos.cheque_propio', 'pagos.cheque_tercero',
  'general.redondeo', 'fondos.concepto', 'iva.ddjj', 'bienes.gasto'));

-- ── 3) Catálogo, subclaves, etiquetas, listado y validación ────────────
do $m$
declare
  v text;
begin
  v := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v := pg_temp._una(v, $a${"clave":"general.redondeo",$a$,
$a${"clave":"iva.ddjj","etiqueta":"IVA: posición mensual","descripcion":"Cuentas del asiento de IVA del mes: IVA a pagar (pasivo), saldo a favor técnico y de libre disponibilidad (activo). El débito, el crédito y los pagos a cuenta salen de los mapeos de IVA DF, IVA CF, percepciones de IVA y retenciones de IVA.","rubros":["pasivo","activo"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["a_pagar","saldo_a_favor","libre_disponibilidad"],"lookup":"libre_disponibilidad → saldo_a_favor"},
    {"clave":"bienes.gasto","etiqueta":"Bienes de uso: gasto de amortización","descripcion":"Cuenta de gasto por amortización de cada rubro de bienes de uso (título 1.2.2.XX), o una General. Solo es el valor por defecto al dar de alta un bien o importar el inventario: cada bien guarda su propia cuenta.","rubros":["egreso"],"auxiliares":["none"],"subclave_tipo":"rubro_bu","subclaves":[""],"lookup":"rubro → general"},
    {"clave":"general.redondeo",$a$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_valida(text,text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when 'cbte_externo' then$a$,
$a$    when 'rubro_bu' then
      return p_sub = '' or exists (select 1 from public.cont_cuentas c
                                    where c.codigo = p_sub and c.activo and not c.imputable and c.rubro = 'activo');
    when 'cbte_externo' then$a$);
  execute v;

  v := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v := pg_temp._una(v,
$a$    when p_clave = 'ventas.externo' then$a$,
$a$    when p_clave = 'iva.ddjj' then
      case p_sub when 'a_pagar' then 'IVA a pagar' when 'saldo_a_favor' then 'Saldo a favor técnico'
                 when 'libre_disponibilidad' then 'Saldo de libre disponibilidad (si falta, usa el técnico)'
                 else p_sub end
    when p_clave = 'bienes.gasto' then
      case when p_sub = '' then 'General (todos los rubros)'
           else coalesce((select c.codigo || ' ' || c.nombre from public.cont_cuentas c where c.codigo = p_sub), p_sub) end
    when p_clave = 'ventas.externo' then$a$);
  execute v;

  v := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v := pg_temp._una(v,
$a$      union select c.id::text from public.tesoreria_conceptos c where r ->> 'clave' = 'fondos.concepto'$a$,
$a$      union select c.id::text from public.tesoreria_conceptos c where r ->> 'clave' = 'fondos.concepto'
      union select c.codigo from public.cont_cuentas c
             where r ->> 'clave' = 'bienes.gasto' and c.codigo like '1.2.2.%' and c.nivel = 4 and not c.imputable and c.activo$a$);
  execute v;

  -- iva.ddjj: el lado del asiento fija el rubro.
  v := pg_get_functiondef('public.cont_guardar_mapeos(jsonb,uuid)'::regprocedure);
  v := pg_temp._una(v,
$a$    insert into public.cont_mapeos (clave, subclave, cuenta_id, obs, created_by, updated_by)$a$,
$a$    if v_cla = 'iva.ddjj' and v_c.rubro <> (case when v_sub = 'a_pagar' then 'pasivo' else 'activo' end) then
      raise exception 'MAPEO_CUENTA_INCOMPATIBLE' using errcode = 'P0001',
        detail = json_build_object('indice', v_i, 'clave', v_cla, 'subclave', v_sub, 'cuenta_id', v_cta,
                                   'rubro', v_c.rubro, 'auxiliar', v_c.auxiliar,
                                   'permitidos', json_build_object('rubros', json_build_array(case when v_sub = 'a_pagar' then 'pasivo' else 'activo' end),
                                                                   'auxiliares', r -> 'auxiliares'))::text;
    end if;

    insert into public.cont_mapeos (clave, subclave, cuenta_id, obs, created_by, updated_by)$a$);
  execute v;
end $m$;

do $$
declare f text;
begin
  foreach f in array array['_cont_hay_amortizaciones(boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
