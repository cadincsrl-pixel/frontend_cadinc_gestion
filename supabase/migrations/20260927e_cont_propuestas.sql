-- =====================================================================
-- Contabilidad fase 3: propuestas de asiento por origen (2026-09-27)
--
-- Por qué: el contabilizador (20260927f) calcula, para cada origen
-- (factura de venta, comprobante externo, cobro, factura de compra, orden
-- de pago), el asiento ENTERO que le corresponde —la «propuesta»— y lo
-- compara por hash con el que ya existe. Estas funciones solo LEEN: no
-- escriben nada y se pueden llamar para mostrar la propuesta en pantalla.
--
-- Forma de una propuesta (jsonb):
--   {origen_tabla, origen_id, origen_evento:'registro', vigente, fecha, glosa,
--    importe, anulado_el,
--    lineas:[{cuenta_id, debe, haber, aux_cliente_id, aux_proveedor_id,
--             aux_tesoreria_id, obra_cod, glosa}],
--    motivos:[{codigo, detalle}]}
-- `anulado_el` (extra) es la fecha en que se anuló el origen: la usa el
-- contraasiento de un origen anulado con asiento en un período cerrado.
--
-- Reglas:
--   · NUNCA se inventa una cuenta: sin mapeo → motivo SIN_MAPEO {clave,
--     subclave} con la subclave más específica. Con cualquier motivo el
--     origen queda pendiente.
--   · Auxiliares: los pone la cuenta (cont_cuentas.auxiliar). Si la cuenta no
--     lleva auxiliar, el de la fuente se descarta. Si lleva y la fuente no lo
--     trae: AUXILIAR_REQUERIDO (salvo tesorería con UNA sola cuenta de
--     tesorería activa vinculada a esa cuenta contable: se usa esa). Tipo
--     distinto: MAPEO_AUXILIAR_INCOMPATIBLE.
--   · Cierre: agrupa por (cuenta, auxiliar, obra, lado); una diferencia de
--     hasta $0,05 va a general.redondeo si está mapeado; si no, o si es mayor,
--     DESCUADRE_ORIGEN.
--   · El hash (md5) mira la fecha y las líneas; la glosa no.
--   · Las NC (ventas 3/8/203, compras clase nota_credito) invierten todo.
--
-- Internas (stable), solo service_role.
-- =====================================================================

-- ── 1) Piezas comunes ──────────────────────────────────────────────────
create or replace function public._cont_prop_nueva(p_tabla text, p_id bigint, p_vigente boolean, p_fecha date,
                                                   p_glosa text, p_anulado_el date default null)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('origen_tabla', p_tabla, 'origen_id', p_id, 'origen_evento', 'registro',
                            'vigente', coalesce(p_vigente, false), 'fecha', p_fecha,
                            'glosa', left(coalesce(nullif(btrim(p_glosa), ''), p_tabla || ' ' || p_id), 500),
                            'importe', 0, 'anulado_el', p_anulado_el,
                            'lineas', '[]'::jsonb, 'motivos', '[]'::jsonb)
$$;

create or replace function public._cont_prop_motivo(p_prop jsonb, p_codigo text, p_detalle jsonb default null)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case
    when exists (select 1 from jsonb_array_elements(p_prop -> 'motivos') m
                  where m ->> 'codigo' = p_codigo and m -> 'detalle' is not distinct from coalesce(p_detalle, 'null'::jsonb))
      then p_prop
    else jsonb_set(p_prop, '{motivos}', (p_prop -> 'motivos') || jsonb_build_object('codigo', p_codigo, 'detalle', p_detalle))
  end
$$;

-- Agrega una línea. p_debe = lado; un importe negativo cambia de lado.
-- Cuenta: p_cuenta_id explícita (tesorería) o el mapeo (p_clave, p_subs).
create or replace function public._cont_prop_linea(p_prop jsonb, p_clave text, p_subs text[], p_debe boolean, p_importe numeric,
                                                   p_aux_tipo text, p_aux_id bigint, p_obra text, p_glosa text,
                                                   p_cuenta_id bigint default null)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_imp   numeric(14,2) := round(coalesce(p_importe, 0), 2);
  v_debe  boolean := p_debe;
  v_cta   bigint;
  c       public.cont_cuentas%rowtype;
  v_cli   bigint;
  v_prv   bigint;
  v_tes   bigint;
  v_obra  text;
  v_n     int;
begin
  if v_imp = 0 then return p_prop; end if;
  if v_imp < 0 then v_imp := -v_imp; v_debe := not v_debe; end if;

  if p_cuenta_id is not null then
    v_cta := p_cuenta_id;
    select * into c from public.cont_cuentas where id = v_cta;
    if not found or not c.activo or not c.imputable then
      return public._cont_prop_motivo(p_prop, 'TESORERIA_SIN_CUENTA',
        jsonb_build_object('tesoreria_id', case when p_aux_tipo = 'tesoreria' then p_aux_id end, 'cuenta_id', v_cta,
                           'motivo', 'cuenta_inactiva_o_no_imputable'));
    end if;
  else
    v_cta := public._cont_cuenta_mapeada(p_clave, p_subs);
    if v_cta is null then
      return public._cont_prop_motivo(p_prop, 'SIN_MAPEO', jsonb_build_object('clave', p_clave, 'subclave', p_subs[1]));
    end if;
    select * into c from public.cont_cuentas where id = v_cta;
  end if;

  if c.auxiliar = 'none' then
    null;   -- el auxiliar de la fuente no aplica a esta cuenta
  elsif c.auxiliar = coalesce(p_aux_tipo, '') and p_aux_id is not null then
    case c.auxiliar
      when 'cliente'   then v_cli := p_aux_id;
      when 'proveedor' then v_prv := p_aux_id;
      when 'tesoreria' then v_tes := p_aux_id;
    end case;
  elsif c.auxiliar = 'tesoreria' and (p_aux_tipo is null or p_aux_tipo = 'tesoreria') then
    select count(*), min(t.id) into v_n, v_tes from public.tesoreria_cuentas t where t.cuenta_id = c.id and t.activo;
    if v_n <> 1 then
      return public._cont_prop_motivo(p_prop, 'AUXILIAR_REQUERIDO',
        jsonb_build_object('cuenta_id', c.id, 'auxiliar', c.auxiliar, 'clave', p_clave));
    end if;
  elsif p_aux_tipo is null or p_aux_tipo = c.auxiliar then
    return public._cont_prop_motivo(p_prop, 'AUXILIAR_REQUERIDO',
      jsonb_build_object('cuenta_id', c.id, 'auxiliar', c.auxiliar, 'clave', p_clave));
  else
    return public._cont_prop_motivo(p_prop, 'MAPEO_AUXILIAR_INCOMPATIBLE',
      jsonb_build_object('cuenta_id', c.id, 'auxiliar', c.auxiliar, 'fuente', p_aux_tipo, 'clave', p_clave));
  end if;

  v_obra := (select o.cod from public.obras o where o.cod = p_obra);

  return jsonb_set(p_prop, '{lineas}', (p_prop -> 'lineas') || jsonb_build_object(
    'cuenta_id', v_cta, 'lado', case when v_debe then 'D' else 'H' end, 'importe', v_imp,
    'aux_cliente_id', v_cli, 'aux_proveedor_id', v_prv, 'aux_tesoreria_id', v_tes,
    'obra_cod', v_obra, 'glosa', left(coalesce(p_glosa, ''), 300)));
end $$;

-- Agrupa, redondea, cuadra (redondeo ≤ $0,05) y deja las líneas con debe/haber.
create or replace function public._cont_prop_cerrar(p_prop jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_lin   jsonb;
  v_debe  numeric(14,2);
  v_haber numeric(14,2);
  v_dif   numeric(14,2);
  v_red   bigint;
  v_p     jsonb := p_prop;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', g.cta,
           'debe',  case when g.lado = 'D' then g.imp else 0 end,
           'haber', case when g.lado = 'H' then g.imp else 0 end,
           'aux_cliente_id', g.cli, 'aux_proveedor_id', g.prv, 'aux_tesoreria_id', g.tes,
           'obra_cod', g.obra, 'glosa', g.glosa) order by g.ord), '[]'::jsonb),
         coalesce(sum(g.imp) filter (where g.lado = 'D'), 0), coalesce(sum(g.imp) filter (where g.lado = 'H'), 0)
    into v_lin, v_debe, v_haber
    from (select (e ->> 'cuenta_id')::bigint as cta, e ->> 'lado' as lado,
                 (e ->> 'aux_cliente_id')::bigint as cli, (e ->> 'aux_proveedor_id')::bigint as prv,
                 (e ->> 'aux_tesoreria_id')::bigint as tes, e ->> 'obra_cod' as obra,
                 round(sum((e ->> 'importe')::numeric), 2) as imp, min(n) as ord,
                 (array_agg(e ->> 'glosa' order by n))[1] as glosa
            from jsonb_array_elements(p_prop -> 'lineas') with ordinality as t(e, n)
           group by 1, 2, 3, 4, 5, 6) g
   where g.imp <> 0;

  if (v_p ->> 'vigente')::boolean and not exists (
       select 1 from public.cont_periodos p where (v_p ->> 'fecha')::date between p.desde and p.hasta) then
    v_p := public._cont_prop_motivo(v_p, 'FECHA_SIN_PERIODO', jsonb_build_object('fecha', v_p -> 'fecha'));
  end if;

  if jsonb_array_length(v_p -> 'motivos') = 0 then
    v_dif := v_debe - v_haber;
    if v_dif <> 0 then
      v_red := public._cont_cuenta_mapeada('general.redondeo', array['']);
      if abs(v_dif) <= 0.05 and v_red is not null then
        v_lin := v_lin || jsonb_build_object('cuenta_id', v_red,
                   'debe', case when v_dif < 0 then -v_dif else 0 end, 'haber', case when v_dif > 0 then v_dif else 0 end,
                   'aux_cliente_id', null, 'aux_proveedor_id', null, 'aux_tesoreria_id', null, 'obra_cod', null,
                   'glosa', 'Redondeo');
        if v_dif < 0 then v_debe := v_debe - v_dif; end if;
      else
        v_p := public._cont_prop_motivo(v_p, 'DESCUADRE_ORIGEN', jsonb_build_object('diferencia', v_dif));
      end if;
    end if;
  end if;

  return v_p || jsonb_build_object('lineas', v_lin, 'importe', greatest(v_debe, v_haber));
end $$;

-- md5 de {fecha, líneas ordenadas}. La glosa no entra.
create or replace function public._cont_hash(p_prop jsonb)
returns text language sql immutable set search_path = public, pg_temp as $$
  select md5(jsonb_build_object(
    'fecha', p_prop -> 'fecha',
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_array(
               (e ->> 'cuenta_id')::bigint, (e ->> 'aux_cliente_id')::bigint, (e ->> 'aux_proveedor_id')::bigint,
               (e ->> 'aux_tesoreria_id')::bigint, e ->> 'obra_cod',
               ((e ->> 'debe')::numeric)::numeric(14,2)::text, ((e ->> 'haber')::numeric)::numeric(14,2)::text)
             order by (e ->> 'cuenta_id')::bigint, (e ->> 'aux_cliente_id')::bigint nulls first,
                      (e ->> 'aux_proveedor_id')::bigint nulls first, (e ->> 'aux_tesoreria_id')::bigint nulls first,
                      e ->> 'obra_cod' nulls first, (e ->> 'debe')::numeric, (e ->> 'haber')::numeric)
        from jsonb_array_elements(p_prop -> 'lineas') e), '[]'::jsonb))::text)
$$;

-- Reparto proporcional por resto mayor, en centavos: Σ exacto = importe.
-- p_pesos: [{obra_cod, peso}]. Sin pesos → una sola parte sin obra.
create or replace function public._cont_repartir(p_importe numeric, p_pesos jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_cents bigint := round(abs(coalesce(p_importe, 0)) * 100);
  v_sig   int := case when coalesce(p_importe, 0) < 0 then -1 else 1 end;
  v_tot   numeric;
  v_out   jsonb;
begin
  select sum((e ->> 'peso')::numeric) into v_tot
    from jsonb_array_elements(coalesce(p_pesos, '[]'::jsonb)) e where (e ->> 'peso')::numeric > 0;
  if v_tot is null or v_tot <= 0 then
    return jsonb_build_array(jsonb_build_object('obra_cod', null, 'importe', round(coalesce(p_importe, 0), 2)));
  end if;
  with p as (
    select e ->> 'obra_cod' as obra, (e ->> 'peso')::numeric as peso, n
      from jsonb_array_elements(p_pesos) with ordinality as t(e, n) where (e ->> 'peso')::numeric > 0),
  b as (select obra, n, v_cents * peso / v_tot as exacto, floor(v_cents * peso / v_tot)::bigint as base from p),
  r as (select b.*, row_number() over (order by exacto - base desc, n) as rk,
               v_cents - sum(base) over () as sobra from b)
  select jsonb_agg(jsonb_build_object('obra_cod', obra,
           'importe', round(v_sig * (base + case when rk <= sobra then 1 else 0 end) / 100.0, 2)) order by n)
    into v_out from r;
  return v_out;
end $$;

-- ── 2) Venta emitida desde el ERP ──────────────────────────────────────
create or replace function public._cont_prop_venta_factura(p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  v   public.ventas_facturas%rowtype;
  p   jsonb;
  s   int;
  tc  numeric;
  g   text;
  a   record;
  v_hay_ali boolean;
begin
  select * into v from public.ventas_facturas where id = p_id;
  if not found then return null; end if;
  g := case v.cbte_tipo when 1 then 'FA' when 3 then 'NCA' when 6 then 'FB' when 8 then 'NCB'
                        when 201 then 'FCE A' when 203 then 'NC FCE A' else 'Cbte ' || v.cbte_tipo end
       || ' ' || lpad(v.pto_vta::text, 5, '0') || '-' || lpad(coalesce(v.numero, v.numero_intentado, 0)::text, 8, '0')
       || ' — ' || v.rec_razon_social;
  p := public._cont_prop_nueva('ventas_facturas', p_id, v.ambiente = 'prod' and v.estado = 'autorizada', v.fecha_cbte, g);
  if not (p ->> 'vigente')::boolean then return p; end if;

  s  := case when v.cbte_tipo in (3, 8, 203) then -1 else 1 end;
  tc := case when v.moneda = 'PES' then 1 else v.cotizacion end;

  p := public._cont_prop_linea(p, 'ventas.deudores', array[''], true, s * v.imp_total * tc, 'cliente', v.cliente_id, null, g);
  p := public._cont_prop_linea(p, 'ventas.producto', array[v.producto], false,
                               s * (v.imp_neto + v.imp_op_ex + v.imp_tot_conc) * tc, null, null, v.obra_cod, g);
  v_hay_ali := false;
  for a in select alicuota_id, importe from public.ventas_factura_alicuotas where factura_id = p_id order by alicuota_id loop
    v_hay_ali := true;
    p := public._cont_prop_linea(p, 'ventas.iva_df', array[a.alicuota_id::text, ''], false, s * a.importe * tc, null, null, null, g);
  end loop;
  if not v_hay_ali and v.imp_iva > 0 then
    p := public._cont_prop_linea(p, 'ventas.iva_df', array[''], false, s * v.imp_iva * tc, null, null, null, g);
  end if;
  if v.imp_trib > 0 then
    p := public._cont_prop_linea(p, 'ventas.tributo', array[''], false, s * v.imp_trib * tc, null, null, null, g);
  end if;
  return public._cont_prop_cerrar(p);
end $$;

-- ── 3) Comprobante externo de ventas (ARCA / saldos) ───────────────────
create or replace function public._cont_prop_venta_externo(p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  x    public.ventas_comprobantes_externos%rowtype;
  v_rs text;
  p    jsonb;
  s    int;
  tc   numeric;
  g    text;
begin
  select * into x from public.ventas_comprobantes_externos where id = p_id;
  if not found then return null; end if;
  select razon_social into v_rs from public.ventas_clientes where id = x.cliente_id;
  g := 'Externo ' || x.cbte_tipo || ' ' || lpad(x.pto_vta::text, 5, '0') || '-' || lpad(x.numero::text, 8, '0')
       || ' — ' || coalesce(nullif(x.rec_razon_social, ''), v_rs, '');
  p := public._cont_prop_nueva('ventas_comprobantes_externos', p_id, true, x.fecha, g);

  s  := case when x.cbte_tipo in (3, 8, 203) then -1 else 1 end;
  tc := case when coalesce(x.moneda, 'PES') = 'PES' then 1 else x.tipo_cambio end;

  if x.cbte_tipo in (60, 61) and coalesce(public._cont_cfg('cvlp_modo') #>> '{}', 'neto_liquidado') = 'neto_liquidado' then
    if x.liquido is null then
      p := public._cont_prop_motivo(p, 'CVLP_SIN_LIQUIDO', jsonb_build_object('externo_id', p_id));
    elsif x.liquido - x.iva <= 0 then
      p := public._cont_prop_motivo(p, 'CVLP_LIQUIDO_INVALIDO', jsonb_build_object('externo_id', p_id, 'liquido', x.liquido, 'iva', x.iva));
    else
      p := public._cont_prop_linea(p, 'ventas.deudores', array[''], true, x.liquido * tc, 'cliente', x.cliente_id, null, g);
      p := public._cont_prop_linea(p, 'ventas.iva_df', array[''], false, x.iva * tc, null, null, null, g);
      p := public._cont_prop_linea(p, 'ventas.externo', array[x.cbte_tipo::text, '60', ''], false, (x.liquido - x.iva) * tc, null, null, null, g);
    end if;
    return public._cont_prop_cerrar(p);
  end if;

  p := public._cont_prop_linea(p, 'ventas.deudores', array[''], true, s * x.total * tc, 'cliente', x.cliente_id, null, g);
  p := public._cont_prop_linea(p, 'ventas.externo', array[x.cbte_tipo::text, ''], false,
                               s * (x.neto + x.no_gravado + x.exento) * tc, null, null, null, g);
  p := public._cont_prop_linea(p, 'ventas.iva_df', array[''], false, s * x.iva * tc, null, null, null, g);
  return public._cont_prop_cerrar(p);
end $$;

-- ── 4) Cobro ───────────────────────────────────────────────────────────
create or replace function public._cont_prop_cobro(p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  c    public.ventas_cobros%rowtype;
  v_rs text;
  p    jsonb;
  g    text;
  m    record;
  r    record;
  t    public.tesoreria_cuentas%rowtype;
  v_j  text;
begin
  select * into c from public.ventas_cobros where id = p_id;
  if not found then return null; end if;
  select razon_social into v_rs from public.ventas_clientes where id = c.cliente_id;
  g := 'Cobro N° ' || c.numero || ' — ' || coalesce(v_rs, '');
  p := public._cont_prop_nueva('ventas_cobros', p_id, c.ambiente = 'prod' and c.estado = 'vigente', c.fecha, g,
                               (c.anulado_el at time zone 'America/Argentina/Buenos_Aires')::date);
  if not (p ->> 'vigente')::boolean then return p; end if;

  for m in select * from public.ventas_cobro_medios where cobro_id = p_id order by orden, id loop
    if m.forma = 'transferencia' then
      select * into t from public.tesoreria_cuentas where ventas_cuenta_id = m.cuenta_bancaria_id;
      if found then
        if t.cuenta_id is null then
          p := public._cont_prop_motivo(p, 'TESORERIA_SIN_CUENTA', jsonb_build_object('tesoreria_id', t.id));
        else
          p := public._cont_prop_linea(p, 'cobros.medio', array['transferencia'], true, m.importe, 'tesoreria', t.id, null, g, t.cuenta_id);
        end if;
      elsif public._cont_cuenta_mapeada('cobros.medio', array['transferencia']) is not null then
        p := public._cont_prop_linea(p, 'cobros.medio', array['transferencia'], true, m.importe, null, null, null, g);
      else
        p := public._cont_prop_motivo(p, 'TESORERIA_SIN_VINCULO', jsonb_build_object('cuenta_bancaria_id', m.cuenta_bancaria_id));
      end if;
    else
      p := public._cont_prop_linea(p, 'cobros.medio', array[m.forma], true, m.importe, null, null, null, g);
    end if;
  end loop;

  for r in select * from public.ventas_cobro_retenciones where cobro_id = p_id order by orden, id loop
    v_j := public.norm_txt(r.jurisdiccion);
    p := public._cont_prop_linea(p, 'cobros.retencion',
           case when v_j <> '' then array[r.tipo || '|' || v_j, r.tipo] else array[r.tipo] end,
           true, r.importe, null, null, null, g);
  end loop;

  p := public._cont_prop_linea(p, 'ventas.deudores', array[''], false, c.total, 'cliente', c.cliente_id, null, g);
  return public._cont_prop_cerrar(p);
end $$;

-- ── 5) Factura / NC de compra ──────────────────────────────────────────
create or replace function public._cont_prop_compra(p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  f      public.pagos_facturas%rowtype;
  v_rs   text;
  p      jsonb;
  g      text;
  s      int;
  v_fec  date;
  v_gas  numeric(14,2);
  v_trib numeric(14,2);
  a      record;
  t      record;
  v_j    text;
  v_hay  boolean;
begin
  select * into f from public.pagos_facturas where id = p_id;
  if not found then return null; end if;
  select razon_social into v_rs from public.pagos_proveedores where id = f.proveedor_id;
  g := 'Compra ' || case when f.clase = 'nota_credito' then 'NC ' else '' end || f.tipo_comprobante || ' '
       || coalesce(f.numero, 's/n') || ' — ' || coalesce(v_rs, '');
  v_fec := case when coalesce(public._cont_cfg('compras_fecha_contable') #>> '{}', 'mes_iva') = 'mes_iva'
                     and f.periodo_iva > date_trunc('month', f.fecha::timestamp)::date
                then f.periodo_iva else f.fecha end;
  p := public._cont_prop_nueva('pagos_facturas', p_id, f.estado <> 'anulada', v_fec, g,
                               (f.anulado_at at time zone 'America/Argentina/Buenos_Aires')::date);
  if not (p ->> 'vigente')::boolean then return p; end if;

  if f.paga_cliente and jsonb_typeof(coalesce(public._cont_cfg('paga_cliente_modo'), 'null'::jsonb)) = 'null' then
    p := public._cont_prop_motivo(p, 'PAGA_CLIENTE_SIN_CRITERIO', jsonb_build_object('factura_id', p_id));
  end if;

  s := case when f.clase = 'nota_credito' then -1 else 1 end;
  select coalesce(sum(importe), 0) into v_trib from public.pagos_factura_tributos where factura_id = p_id;

  -- Gasto.
  if f.tipo_comprobante = 'A' then
    if f.neto is null then
      p := public._cont_prop_motivo(p, 'DESGLOSE_A_REVISAR', jsonb_build_object('factura_id', p_id));
      v_gas := null;
    else
      v_gas := f.neto + coalesce(f.no_gravado, 0) + coalesce(f.exento, 0);
    end if;
  else
    v_gas := f.total - v_trib;
  end if;
  if v_gas is not null then
    if f.sin_imputar then
      p := public._cont_prop_linea(p, 'compras.sin_imputar', array[''], true, s * v_gas, null, null, null, g);
    else
      for a in select x ->> 'obra_cod' as obra, (x ->> 'importe')::numeric as imp
                 from jsonb_array_elements(public._cont_repartir(v_gas,
                        (select jsonb_agg(jsonb_build_object('obra_cod', i.obra_cod, 'peso', i.monto) order by i.id)
                           from public.pagos_imputaciones i where i.factura_id = p_id))) x loop
        p := public._cont_prop_linea(p, 'compras.concepto', array[coalesce(f.concepto_id::text, '')], true, s * a.imp,
                                     null, null, a.obra, g);
      end loop;
    end if;
  end if;

  -- IVA crédito fiscal (solo A).
  if f.tipo_comprobante = 'A' then
    v_hay := false;
    for a in select alicuota_id, importe from public.pagos_factura_iva where factura_id = p_id order by alicuota_id loop
      v_hay := true;
      p := public._cont_prop_linea(p, 'compras.iva_cf', array[a.alicuota_id::text, ''], true, s * a.importe, null, null, null, g);
    end loop;
    if not v_hay and coalesce(f.iva, 0) > 0 then
      p := public._cont_prop_linea(p, 'compras.iva_cf', array[''], true, s * f.iva, null, null, null, g);
    end if;
  end if;

  -- Tributos (percepciones, impuestos internos, «otro» sin clasificar).
  for t in select tipo, jurisdiccion, importe from public.pagos_factura_tributos where factura_id = p_id order by id loop
    v_j := public.norm_txt(t.jurisdiccion);
    p := public._cont_prop_linea(p, 'compras.tributo',
           case when v_j <> '' then array[t.tipo || '|' || v_j, t.tipo] else array[t.tipo] end,
           true, s * t.importe, null, null, null, g);
  end loop;

  p := public._cont_prop_linea(p, 'compras.proveedores', array[''], false, s * f.total, 'proveedor', f.proveedor_id, null, g);
  return public._cont_prop_cerrar(p);
end $$;

-- ── 6) Orden de pago ───────────────────────────────────────────────────
create or replace function public._cont_prop_orden(p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  o    public.pagos_ordenes%rowtype;
  v_rs text;
  p    jsonb;
  g    text;
  q    record;
  t    public.tesoreria_cuentas%rowtype;
begin
  select * into o from public.pagos_ordenes where id = p_id;
  if not found then return null; end if;
  select razon_social into v_rs from public.pagos_proveedores where id = o.proveedor_id;
  g := 'OP-' || lpad(o.numero::text, 4, '0') || ' — ' || coalesce(v_rs, '');
  p := public._cont_prop_nueva('pagos_ordenes', p_id,
                               o.estado = 'emitida' and o.forma_pago <> 'nota_credito' and o.monto_pagado > 0, o.fecha, g,
                               (o.anulado_at at time zone 'America/Argentina/Buenos_Aires')::date);
  if not (p ->> 'vigente')::boolean then return p; end if;

  p := public._cont_prop_linea(p, 'compras.proveedores', array[''], true, o.monto_pagado, 'proveedor', o.proveedor_id, null, g);

  if o.forma_pago in ('cheque', 'echeq') then
    for q in select * from public.pagos_cheques where orden_id = p_id order by id loop
      if q.es_propio then
        p := public._cont_prop_linea(p, 'pagos.cheque_propio', array[''], false, q.monto,
                                     case when o.cuenta_origen_id is not null then 'tesoreria' end, o.cuenta_origen_id, null,
                                     g || ' · cheque ' || q.numero);
      else
        p := public._cont_prop_linea(p, 'pagos.cheque_tercero', array[''], false, q.monto, null, null, null,
                                     g || ' · cheque ' || q.numero);
      end if;
    end loop;
  elsif o.cuenta_origen_id is not null then
    select * into t from public.tesoreria_cuentas where id = o.cuenta_origen_id;
    if t.cuenta_id is null then
      p := public._cont_prop_motivo(p, 'TESORERIA_SIN_CUENTA', jsonb_build_object('tesoreria_id', o.cuenta_origen_id));
    else
      p := public._cont_prop_linea(p, null, null, false, o.monto_pagado, 'tesoreria', t.id, null, g, t.cuenta_id);
    end if;
  else
    p := public._cont_prop_linea(p, 'pagos.puente', array[''], false, o.monto_pagado, null, null, null, g);
  end if;
  return public._cont_prop_cerrar(p);
end $$;

-- ── 7) Despachador ─────────────────────────────────────────────────────
create or replace function public._cont_propuesta(p_tabla text, p_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if p_tabla is null or p_tabla not in ('ventas_facturas', 'ventas_comprobantes_externos', 'ventas_cobros',
                                        'pagos_facturas', 'pagos_ordenes') then
    raise exception 'ORIGEN_INVALIDO' using errcode = 'P0001', detail = json_build_object('origen_tabla', p_tabla)::text;
  end if;
  v := case p_tabla
         when 'ventas_facturas'              then public._cont_prop_venta_factura(p_id)
         when 'ventas_comprobantes_externos' then public._cont_prop_venta_externo(p_id)
         when 'ventas_cobros'                then public._cont_prop_cobro(p_id)
         when 'pagos_facturas'               then public._cont_prop_compra(p_id)
         when 'pagos_ordenes'                then public._cont_prop_orden(p_id)
       end;
  if v is null then
    raise exception 'ORIGEN_NO_EXISTE' using errcode = 'P0001',
      detail = json_build_object('origen_tabla', p_tabla, 'origen_id', p_id)::text;
  end if;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_cont_prop_nueva(text, bigint, boolean, date, text, date)',
    '_cont_prop_motivo(jsonb, text, jsonb)',
    '_cont_prop_linea(jsonb, text, text[], boolean, numeric, text, bigint, text, text, bigint)',
    '_cont_prop_cerrar(jsonb)',
    '_cont_hash(jsonb)',
    '_cont_repartir(numeric, jsonb)',
    '_cont_prop_venta_factura(bigint)',
    '_cont_prop_venta_externo(bigint)',
    '_cont_prop_cobro(bigint)',
    '_cont_prop_compra(bigint)',
    '_cont_prop_orden(bigint)',
    '_cont_propuesta(text, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
