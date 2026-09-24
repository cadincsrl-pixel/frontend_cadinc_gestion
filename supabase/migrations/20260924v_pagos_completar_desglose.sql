-- =====================================================================
-- Compras: completar el desglose impositivo de una factura YA PAGADA
-- (2026-09-24)
--
-- Las 15 facturas reales se cargaron antes de 20260924u: están pagadas y
-- con el desglose vacío (neto/iva/percepciones en NULL). Pagada = congelada,
-- así que ni `pagos_editar_factura` ni la pantalla las pueden completar, y el
-- Libro IVA de compras las necesita. El dueño aprobó (24/09) que se pueda
-- completar el desglose, SIEMPRE QUE NO CAMBIE LA PLATA:
--
--   · El total no se toca: neto + no_gravado + exento + iva + percepciones
--     + otros tiene que dar el total guardado (±0,01).
--   · Las percepciones tienen que dar lo mismo que ya dice la factura. Es el
--     número del que cuelga «lo imputado a las obras = total − percepciones»
--     (§5.18). Excepción: si hoy son 0/NULL y la factura no tiene reparto por
--     obra ni pagos que dependan de él, se pueden cargar. Con reparto o pagos,
--     cambiarlas cambiaría lo imputado a la obra → DESGLOSE_CAMBIA_PERCEPCIONES
--     { actuales, nuevas }, salvo que un admin fuerce (p_forzar). Forzado y
--     con UNA obra, la imputación se ajusta sola; con varias, hay que
--     reimputar primero (IMPUTACION_NO_CUADRA).
--   · Si hoy ya hay percepciones cargadas (≠ 0), el detalle tiene que sumarlas
--     exactas: eso nunca se fuerza.
--
-- Qué reemplaza: el detalle de IVA y de tributos, no_gravado, exento, el neto
-- derivado, y cae / cae_vto / cbte_tipo_arca SOLO si vienen. Limpia
-- `desglose_a_revisar` y deja «DD/MM — desglose completado» en la obs (el
-- cambio de columnas lo registra además `audit_cambios`, y la ruta el
-- audit_log del backend).
--
-- La puerta: GUC propio `cadinc.pagos_desglose`, prendido SOLO adentro de la
-- RPC y apagado al salir. Con él:
--   · fn_pagos_desglose_congelado deja escribir el detalle de una pagada;
--   · fn_pagos_factura_congelada sigue frenando proveedor, fecha y total
--     (y percepciones si no es el caso permitido: lo decide la RPC);
--   · fn_pagos_factura_desaprobar NO desaprueba por completar el desglose
--     (el total y lo imputado no cambian), salvo que cambien las percepciones.
-- Todo lo demás sigue frenado igual que antes (FACTURA_CON_PAGOS).
-- =====================================================================

-- ── 1) Triggers: dejar pasar a la RPC y a nadie más ─────────────────────

create or replace function public.fn_pagos_desglose_congelado()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_estado text;
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return coalesce(new, old); end if;
  -- pagos_completar_desglose (20260924v): valida total y percepciones antes.
  if coalesce(current_setting('cadinc.pagos_desglose', true), '') = 'on' then return coalesce(new, old); end if;
  select estado into v_estado from public.pagos_facturas where id = coalesce(new.factura_id, old.factura_id);
  if v_estado in ('pagada_parcial', 'pagada') then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', coalesce(new.factura_id, old.factura_id), 'estado', v_estado, 'campos', json_build_array('desglose'))::text;
  end if;
  return coalesce(new, old);
end $function$;

create or replace function public.fn_pagos_factura_congelada()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if old.estado in ('pagada_parcial','pagada') then
    -- Completar el desglose (20260924v): la RPC ya validó que el total no
    -- cambia y cuándo pueden cambiar las percepciones. Proveedor, fecha y
    -- total siguen congelados igual.
    if coalesce(current_setting('cadinc.pagos_desglose', true), '') = 'on' then
      if new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
         or new.total is distinct from old.total then
        raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
          detail = json_build_object('factura_id', old.id, 'estado', old.estado)::text;
      end if;
      return new;
    end if;
    if new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
    or new.neto is distinct from old.neto or new.iva is distinct from old.iva
    or new.percepciones is distinct from old.percepciones or new.otros is distinct from old.otros
    or new.no_gravado is distinct from old.no_gravado or new.exento is distinct from old.exento
    or new.total is distinct from old.total then
      raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
        detail = json_build_object('factura_id', old.id, 'estado', old.estado)::text;
    end if;
  end if;
  return new;
end $function$;

create or replace function public.fn_pagos_factura_desaprobar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  -- Completar el desglose no cambia el total ni lo imputado: no desaprueba.
  -- Si cambian las percepciones (caso permitido por la RPC) sí, como siempre.
  if coalesce(current_setting('cadinc.pagos_desglose', true), '') = 'on'
     and coalesce(new.percepciones, 0) = coalesce(old.percepciones, 0) then
    return new;
  end if;
  if old.estado = 'aprobada' and (
       new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
    or new.total is distinct from old.total or new.neto is distinct from old.neto or new.iva is distinct from old.iva
    or new.percepciones is distinct from old.percepciones or new.otros is distinct from old.otros
    or new.no_gravado is distinct from old.no_gravado or new.exento is distinct from old.exento
    or new.paga_cliente is distinct from old.paga_cliente or new.vence_el is distinct from old.vence_el
    or new.forma_pago_prevista is distinct from old.forma_pago_prevista) then
    new.estado := 'pendiente';
    new.aprobada_por := null;
    new.aprobada_at := null;
  end if;
  return new;
end $function$;

-- ── 2) La RPC ───────────────────────────────────────────────────────────
-- p_desglose = { iva_detalle: [{alicuota_id, base_imp, importe}],
--                tributos: [{tipo, jurisdiccion, descripcion, alicuota, base_imp, importe}],
--                no_gravado, exento, neto (sólo sin alícuotas: B/C),
--                cae, cae_vto, cbte_tipo_arca }
-- `iva_detalle` y `tributos` son obligatorios (pueden ir vacíos).

create or replace function public.pagos_completar_desglose(
  p_factura_id bigint, p_desglose jsonb, p_user_id uuid, p_forzar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  f            public.pagos_facturas%rowtype;
  v_iva        jsonb;
  v_trib       jsonb;
  v_ng         numeric(14,2);
  v_ex         numeric(14,2);
  v_iva_tot    numeric(14,2);
  v_base       numeric(14,2);
  v_n_iva      int;
  v_perc_new   numeric(14,2);
  v_otros_new  numeric(14,2);
  v_perc_act   numeric(14,2);
  v_neto       numeric(14,2);
  v_suma       numeric(14,2);
  v_n_imp      int;
  v_con_pagos  boolean;
  v_cambia_perc boolean := false;
  v_ajustada   boolean := false;
  v_cae        text;
  v_imputable  numeric(14,2);
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;

  v_iva  := p_desglose -> 'iva_detalle';
  v_trib := p_desglose -> 'tributos';
  if jsonb_typeof(v_iva) is distinct from 'array' or jsonb_typeof(v_trib) is distinct from 'array' then
    raise exception 'DESGLOSE_REQUERIDO' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(v_iva) e
              where e ->> 'alicuota_id' is null or e ->> 'base_imp' is null or e ->> 'importe' is null
                 or (e ->> 'alicuota_id')::int not in (3,4,5,6,8,9)
                 or (e ->> 'base_imp')::numeric < 0 or (e ->> 'importe')::numeric < 0)
     or (select count(*) <> count(distinct e ->> 'alicuota_id') from jsonb_array_elements(v_iva) e)
     or exists (select 1 from jsonb_array_elements(v_trib) e
                 where e ->> 'importe' is null or (e ->> 'importe')::numeric < 0
                    or coalesce(e ->> 'tipo', '') not in ('percepcion_iva','percepcion_iibb','percepcion_ganancias',
                                                          'percepcion_municipal','impuestos_internos','otro')) then
    raise exception 'DESGLOSE_INVALIDO' using errcode = 'P0001';
  end if;

  v_ng := round((p_desglose ->> 'no_gravado')::numeric, 2);
  v_ex := round((p_desglose ->> 'exento')::numeric, 2);
  if coalesce(v_ng, 0) < 0 or coalesce(v_ex, 0) < 0 then
    raise exception 'DESGLOSE_INVALIDO' using errcode = 'P0001';
  end if;
  v_cae := nullif(btrim(coalesce(p_desglose ->> 'cae', '')), '');
  if v_cae is not null and v_cae !~ '^\d{14}$' then
    raise exception 'CAE_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'cae')::text;
  end if;

  select coalesce(sum(round((e ->> 'importe')::numeric, 2)), 0), coalesce(sum(round((e ->> 'base_imp')::numeric, 2)), 0), count(*)
    into v_iva_tot, v_base, v_n_iva
    from jsonb_array_elements(v_iva) e;
  select coalesce(sum(round((e ->> 'importe')::numeric, 2)) filter (where e ->> 'tipo' like 'percepcion\_%'), 0),
         coalesce(sum(round((e ->> 'importe')::numeric, 2)) filter (where e ->> 'tipo' not like 'percepcion\_%'), 0)
    into v_perc_new, v_otros_new
    from jsonb_array_elements(v_trib) e;

  -- Neto: con alícuotas es la suma de las bases; sin alícuotas (B, C) el que
  -- venga, o lo que queda del total.
  if v_n_iva > 0 then
    v_neto := v_base;
  else
    -- Una A sin alícuotas sólo si es toda exenta / no gravada: si no, es un
    -- desglose a medio cargar que dejaría «IVA 0» en el Libro IVA.
    if f.tipo_comprobante = 'A' and coalesce(v_ng, 0) + coalesce(v_ex, 0) = 0 then
      raise exception 'DESGLOSE_SIN_IVA' using errcode = 'P0001';
    end if;
    v_neto := coalesce(round((p_desglose ->> 'neto')::numeric, 2),
                       f.total - coalesce(v_ng, 0) - coalesce(v_ex, 0) - v_perc_new - v_otros_new);
    if v_neto < 0 then raise exception 'DESGLOSE_INVALIDO' using errcode = 'P0001'; end if;
  end if;

  -- 1) El total no se toca.
  v_suma := v_neto + v_iva_tot + coalesce(v_ng, 0) + coalesce(v_ex, 0) + v_perc_new + v_otros_new;
  if abs(v_suma - f.total) > 0.01 then
    raise exception 'DESGLOSE_NO_CUADRA' using errcode = 'P0001',
      detail = json_build_object('suma', v_suma, 'total', f.total)::text;
  end if;

  -- 2) Las percepciones, tampoco (salvo el caso sin reparto ni pagos).
  v_perc_act := coalesce(f.percepciones, 0);
  if v_perc_new <> v_perc_act then
    select count(*) into v_n_imp from public.pagos_imputaciones where factura_id = p_factura_id;
    select exists (select 1 from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
                    where l.factura_id = p_factura_id and o.estado = 'emitida') into v_con_pagos;
    if v_perc_act <> 0 then
      raise exception 'DESGLOSE_CAMBIA_PERCEPCIONES' using errcode = 'P0001',
        detail = json_build_object('actuales', v_perc_act, 'nuevas', v_perc_new, 'forzable', false)::text;
    end if;
    if (v_n_imp > 0 or v_con_pagos) and not (coalesce(p_forzar, false) and public._pagos_es_admin(p_user_id)) then
      raise exception 'DESGLOSE_CAMBIA_PERCEPCIONES' using errcode = 'P0001',
        detail = json_build_object('actuales', v_perc_act, 'nuevas', v_perc_new, 'forzable', true,
                                   'obras', v_n_imp, 'con_pagos', v_con_pagos)::text;
    end if;
    if v_n_imp > 1 then
      raise exception 'IMPUTACION_NO_CUADRA' using errcode = 'P0001',
        detail = json_build_object('suma', f.imputable, 'imputable', f.total - v_perc_new, 'varias_obras', true)::text;
    end if;
    v_cambia_perc := true;
  end if;

  perform set_config('cadinc.pagos_desglose', 'on', true);

  update public.pagos_facturas
     set neto           = v_neto,
         no_gravado     = v_ng,
         exento         = v_ex,
         cae            = case when p_desglose ? 'cae' and v_cae is not null then v_cae else cae end,
         cae_vto        = case when nullif(p_desglose ->> 'cae_vto', '') is not null then (p_desglose ->> 'cae_vto')::date else cae_vto end,
         cbte_tipo_arca = case when nullif(p_desglose ->> 'cbte_tipo_arca', '') is not null then (p_desglose ->> 'cbte_tipo_arca')::smallint else cbte_tipo_arca end,
         desglose_a_revisar = false,
         obs            = ltrim(rtrim(coalesce(obs, '') || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — desglose completado'), E'\n'),
         updated_by     = p_user_id
   where id = p_factura_id;

  -- La única puerta del detalle: deriva iva, neto (con alícuotas), percepciones y otros.
  perform public._pagos_guardar_desglose(p_factura_id, v_iva, v_trib);

  -- Sin percepciones, `_pagos_guardar_desglose` deja NULL si eran NULL: mismo imputable.
  if v_cambia_perc then
    select imputable into v_imputable from public.pagos_facturas where id = p_factura_id;
    if exists (select 1 from public.pagos_imputaciones where factura_id = p_factura_id) then
      update public.pagos_imputaciones set monto = v_imputable, updated_by = p_user_id where factura_id = p_factura_id;
      v_ajustada := true;
    end if;
  end if;

  select * into f from public.pagos_facturas where id = p_factura_id;
  perform public._pagos_validar_desglose(f.neto, f.iva, f.percepciones, f.otros, f.total, f.no_gravado, f.exento);

  perform set_config('cadinc.pagos_desglose', '', true);

  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id),
    'percepciones_cambiadas', v_cambia_perc,
    'imputacion_ajustada', v_ajustada);
end $function$;

revoke all on function public.pagos_completar_desglose(bigint, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.pagos_completar_desglose(bigint, jsonb, uuid, boolean) to service_role;

comment on function public.pagos_completar_desglose(bigint, jsonb, uuid, boolean) is
  'Completa el desglose ARCA (IVA por alícuota, tributos, no gravado, exento, CAE) de una factura, aunque esté pagada, sin cambiar total ni percepciones. 20260924v.';
