-- =====================================================================
-- Compras: importador de «Mis Comprobantes Recibidos» de ARCA (2026-09-27)
--
-- Por qué: la contabilidad arranca el 01/07/2026 y las compras de jul–sep
-- no están cargadas (solo ~20 a mano, desde el 18/09). El archivo de ARCA
-- trae una fila por comprobante recibido: se importan como facturas
-- `sin_imputar` (20260927b), impagas, con el desglose que se pueda deducir.
--
-- Molde: ventas_importar_externos (20260924n). El backend normaliza el
-- archivo (formato clásico o el nuevo por alícuota) y manda filas:
--   {fecha, cbte_tipo, pto_vta, numero, numero_hasta, cod_autorizacion,
--    emisor_doc_tipo, emisor_doc_nro, emisor_razon_social, moneda, tipo_cambio,
--    neto_gravado, no_gravado, exento, otros_tributos, iva, total,
--    alicuotas:[{alicuota_id, base_imp, importe}] | null}
--
-- Reglas:
--   · p_confirmar=false es la vista previa (no escribe nada); true importa
--     TODO o NADA (IMPORTACION_CON_ERRORES si alguna fila tiene error).
--   · Bloquean solo los errores de identidad: tipo, número, fecha, moneda sin
--     cotización, total, CUIT del emisor, razón social de un proveedor nuevo,
--     alícuotas que no cuadran y la posible duplicada contra un proveedor sin
--     CUIT. Una fila que no cierra entra con neto/iva null y
--     desglose_a_revisar (aviso `no_cuadra`).
--   · Duplicadas (no son error): repetida en el archivo, o ya cargada para el
--     mismo CUIT, clase, tipo y número normalizado.
--   · Proveedor inexistente: se crea por CUIT (el código PRV lo pone el default).
--   · «Otros Tributos» → tributo `otro` + tributos_a_revisar.
--   · El período IVA es el mes de la fecha (GUC cadinc.pagos_importar: el
--     trigger de 20260927a no valida mes cerrado para el importador).
--   · Importes en valor absoluto (el signo lo da el tipo); moneda extranjera
--     × tipo de cambio de ARCA. Una moneda distinta de pesos con TC nulo, ≤ 0
--     o exactamente 1 se rechaza (MONEDA_SIN_COTIZACION): TC 1 en dólares es
--     el default de un archivo sin la columna, no una cotización.
-- `indice` de cada fila es 1-based (como ventas_importar_externos).
-- =====================================================================

-- ── 1) Código ARCA → tipo y clase (espejo de tipoDesdeArca, lectura/arca.ts) ──
create or replace function public._pagos_tipo_de_arca(p_cbte smallint)
returns table (tipo text, clase text)
language sql immutable set search_path = public, pg_temp as $$
  select x.tipo, case when p_cbte in (3, 8, 13, 53, 203, 208, 213) then 'nota_credito' else 'factura' end
    from (select case
                   when p_cbte in (4, 9, 15, 54)                              then 'recibo'
                   when p_cbte in (1, 2, 3, 5, 51, 52, 53, 81, 201, 202, 203) then 'A'
                   when p_cbte in (6, 7, 8, 10, 82, 206, 207, 208)            then 'B'
                   when p_cbte in (11, 12, 13, 83, 211, 212, 213)             then 'C'
                   when p_cbte = 49                                           then 'otro'
                 end as tipo) x
   where x.tipo is not null
$$;

-- Nombre del comprobante (espejo de NOMBRE_CBTE, lectura/arca.ts).
create or replace function public._pagos_nombre_cbte(p_cbte smallint)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_cbte
    when 1 then 'Factura A' when 2 then 'Nota de débito A' when 3 then 'Nota de crédito A' when 4 then 'Recibo A'
    when 6 then 'Factura B' when 7 then 'Nota de débito B' when 8 then 'Nota de crédito B' when 9 then 'Recibo B'
    when 11 then 'Factura C' when 12 then 'Nota de débito C' when 13 then 'Nota de crédito C' when 15 then 'Recibo C'
    when 49 then 'Comprobante de compra de bienes usados'
    when 51 then 'Factura M' when 52 then 'Nota de débito M' when 53 then 'Nota de crédito M' when 54 then 'Recibo M'
    when 81 then 'Tique factura A' when 82 then 'Tique factura B' when 83 then 'Tique'
    when 201 then 'Factura de crédito electrónica A' when 202 then 'Nota de débito electrónica MiPyME A'
    when 203 then 'Nota de crédito electrónica MiPyME A'
    when 206 then 'Factura de crédito electrónica B' when 207 then 'Nota de débito electrónica MiPyME B'
    when 208 then 'Nota de crédito electrónica MiPyME B'
    when 211 then 'Factura de crédito electrónica C' when 212 then 'Nota de débito electrónica MiPyME C'
    when 213 then 'Nota de crédito electrónica MiPyME C'
    else 'Comprobante ' || coalesce(p_cbte::text, '?') end
$$;

-- ── 2) Importador ───────────────────────────────────────────────────────
create or replace function public.pagos_importar_recibidos(p_filas jsonb, p_user_id uuid, p_confirmar boolean default false,
                                                           p_archivo text default '', p_hash text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_e        jsonb;
  v_i        bigint;
  v_res      jsonb := '[]'::jsonb;
  v_err      text;
  v_det      jsonb;
  v_dup      jsonb;
  v_avisos   jsonb;
  v_txt      text;
  v_cbte     smallint;
  v_tipo     text;
  v_clase    text;
  v_pv       int;
  v_num      bigint;
  v_hasta    bigint;
  v_fecha    date;
  v_mon      text;
  v_tc       numeric;
  v_obs      text;
  v_net      numeric(14,2);
  v_ng       numeric(14,2);
  v_ex       numeric(14,2);
  v_ot       numeric(14,2);
  v_iva      numeric(14,2);
  v_tot      numeric(14,2);
  v_doc_txt  text;
  v_cuit     text;
  v_rs       text;
  v_prov     bigint;
  v_prov_act boolean;
  v_prov_rs  text;
  v_prov_nvo boolean;
  v_numero   text;
  v_nn       text;
  v_key      text;
  v_vistos   text[] := '{}';
  v_exist    bigint;
  v_iva_det  jsonb;
  v_trib     jsonb;
  v_neto     numeric(14,2);
  v_ivaf     numeric(14,2);
  v_desg     boolean;
  v_trib_rev boolean;
  v_sb       numeric(14,2);
  v_si       numeric(14,2);
  v_suma     numeric(14,2);
  v_cae      text;
  v_fid      bigint;
  v_imp_id   bigint;
  v_provs    jsonb := '{}'::jsonb;
  v_f        public.pagos_facturas%rowtype;
  v_constr   text;
  v_nuevas   int := 0;
  v_dups     int := 0;
  v_errs     int := 0;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'SIN_FILAS' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 2000)::text;
  end if;
  if p_confirmar then
    perform pg_advisory_xact_lock(hashtext('pagos_importar_recibidos'));
    perform set_config('cadinc.pagos_importar', 'on', true);
    insert into public.pagos_importaciones (origen, archivo, hash_sha256, created_by)
    values ('arca_recibidos', left(btrim(coalesce(p_archivo, '')), 255), nullif(btrim(coalesce(p_hash, '')), ''), p_user_id)
    returning id into v_imp_id;
  end if;

  for v_e, v_i in select e, n from jsonb_array_elements(p_filas) with ordinality as t(e, n) loop
    v_err := null; v_det := null; v_dup := null; v_avisos := '[]'::jsonb; v_obs := '';
    v_cbte := null; v_tipo := null; v_clase := null; v_pv := null; v_num := null; v_hasta := null; v_fecha := null;
    v_tc := 1; v_net := null; v_ng := null; v_ex := null; v_ot := null; v_iva := null; v_tot := null;
    v_cuit := null; v_rs := null; v_prov := null; v_prov_rs := null; v_prov_nvo := false;
    v_numero := null; v_nn := null; v_exist := null;
    v_iva_det := null; v_trib := '[]'::jsonb; v_neto := null; v_ivaf := null; v_desg := false; v_trib_rev := false;
    v_fid := null; v_cae := null;
    begin
      -- 1) Tipo.
      v_txt := coalesce(v_e ->> 'cbte_tipo', '');
      v_cbte := nullif(substring(v_txt from '^\s*(\d{1,3})'), '')::smallint;
      select t.tipo, t.clase into v_tipo, v_clase from public._pagos_tipo_de_arca(v_cbte) t;
      if v_tipo is null then
        v_err := 'TIPO_NO_SOPORTADO'; v_det := jsonb_build_object('cbte_tipo', v_e -> 'cbte_tipo');
      end if;

      -- 2) Número.
      if v_err is null then
        v_pv := nullif(regexp_replace(coalesce(v_e ->> 'pto_vta', ''), '\D', '', 'g'), '')::int;
        v_num := nullif(regexp_replace(coalesce(v_e ->> 'numero', ''), '\D', '', 'g'), '')::bigint;
        v_hasta := nullif(regexp_replace(coalesce(v_e ->> 'numero_hasta', ''), '\D', '', 'g'), '')::bigint;
        if v_pv is null or v_pv not between 0 and 99999 then
          v_err := 'PTO_VTA_INVALIDO'; v_det := jsonb_build_object('pto_vta', v_e -> 'pto_vta');
        elsif v_num is null or v_num not between 1 and 99999999 then
          v_err := 'NUMERO_INVALIDO'; v_det := jsonb_build_object('numero', v_e -> 'numero');
        elsif v_hasta is not null and v_hasta <> v_num then
          v_err := 'RANGO_DE_NUMEROS'; v_det := jsonb_build_object('desde', v_num, 'hasta', v_hasta);
        end if;
      end if;

      -- 3) Fecha.
      if v_err is null then
        v_txt := btrim(coalesce(v_e ->> 'fecha', ''));
        v_fecha := case when v_txt ~ '^\d{4}-\d{2}-\d{2}' then substring(v_txt, 1, 10)::date
                        when v_txt ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(v_txt, 'DD/MM/YYYY') end;
        if v_fecha is null or v_fecha > public.hoy_ar() then
          v_err := 'FECHA_INVALIDA'; v_det := jsonb_build_object('fecha', v_e -> 'fecha');
        end if;
      end if;

      -- 4) Moneda.
      if v_err is null then
        v_mon := upper(btrim(coalesce(v_e ->> 'moneda', '')));
        if v_mon in ('', 'PES', '$', 'ARS') then
          v_mon := 'PES'; v_tc := 1;
        else
          v_tc := nullif(v_e ->> 'tipo_cambio', '')::numeric;
          if v_tc is null or v_tc <= 0 or v_tc = 1 then
            v_err := 'MONEDA_SIN_COTIZACION'; v_det := jsonb_build_object('moneda', v_mon, 'tipo_cambio', v_e -> 'tipo_cambio');
          else
            v_avisos := v_avisos || jsonb_build_object('codigo', 'moneda_extranjera', 'detalle', jsonb_build_object('moneda', v_mon, 'tipo_cambio', v_tc));
            v_obs := 'Moneda ' || v_mon || ', TC ' || v_tc::text || ' (ARCA)';
          end if;
        end if;
      end if;

      -- 5) Importes (valor absoluto, a pesos) y total.
      if v_err is null then
        v_net := round(abs(coalesce(nullif(v_e ->> 'neto_gravado', '')::numeric, 0)) * v_tc, 2);
        v_ng  := round(abs(coalesce(nullif(v_e ->> 'no_gravado', '')::numeric, 0)) * v_tc, 2);
        v_ex  := round(abs(coalesce(nullif(v_e ->> 'exento', '')::numeric, 0)) * v_tc, 2);
        v_ot  := round(abs(coalesce(nullif(v_e ->> 'otros_tributos', '')::numeric, 0)) * v_tc, 2);
        v_iva := round(abs(coalesce(nullif(v_e ->> 'iva', '')::numeric, 0)) * v_tc, 2);
        v_tot := round(abs(coalesce(nullif(v_e ->> 'total', '')::numeric, 0)) * v_tc, 2);
        if v_tot <= 0 then
          v_err := 'TOTAL_INVALIDO'; v_det := jsonb_build_object('total', v_e -> 'total');
        end if;
      end if;

      -- 6) Emisor → proveedor (por CUIT).
      if v_err is null then
        v_doc_txt := upper(btrim(coalesce(v_e ->> 'emisor_doc_tipo', '')));
        v_cuit := regexp_replace(coalesce(v_e ->> 'emisor_doc_nro', ''), '\D', '', 'g');
        v_rs := nullif(btrim(coalesce(v_e ->> 'emisor_razon_social', '')), '');
        if not (v_doc_txt = '80' or v_doc_txt like 'CUIT%') or length(v_cuit) <> 11 then
          v_err := 'EMISOR_SIN_CUIT';
          v_det := jsonb_build_object('doc_tipo', v_e -> 'emisor_doc_tipo', 'doc_nro', v_e -> 'emisor_doc_nro');
          v_cuit := null;
        else
          select p.id, p.activo, p.razon_social into v_prov, v_prov_act, v_prov_rs
            from public.pagos_proveedores p where p.cuit = v_cuit;
          if v_prov is not null then
            if not v_prov_act then
              v_avisos := v_avisos || jsonb_build_object('codigo', 'proveedor_inactivo', 'detalle', jsonb_build_object('proveedor_id', v_prov));
            end if;
          else
            v_prov_nvo := true;
            if v_provs ? v_cuit then
              v_prov := nullif(v_provs -> v_cuit ->> 'proveedor_id', '')::bigint;
              v_prov_rs := v_provs -> v_cuit ->> 'razon_social';
            elsif v_rs is null or length(v_rs) < 3 then
              v_err := 'RAZON_SOCIAL_REQUERIDA'; v_det := jsonb_build_object('cuit', v_cuit);
            else
              if p_confirmar then
                insert into public.pagos_proveedores (razon_social, cuit, obs, created_by, updated_by)
                values (v_rs, v_cuit,
                        'Alta automática del importador de ARCA recibidos (20260927c). Completar datos de pago y actualizar desde ARCA.',
                        p_user_id, p_user_id)
                returning id into v_prov;
              end if;
              v_prov_rs := v_rs;
              v_provs := v_provs || jsonb_build_object(v_cuit,
                jsonb_build_object('cuit', v_cuit, 'razon_social', v_rs, 'proveedor_id', v_prov));
            end if;
          end if;
        end if;
      end if;

      -- 7) Número guardado (idéntico a normNumeroFactura del backend).
      if v_err is null then
        v_numero := lpad(v_pv::text, 5, '0') || '-' || lpad(v_num::text, 8, '0');
        v_nn := case when v_pv = 0 then v_num::text else v_pv::text || '-' || v_num::text end;
      end if;

      -- 8) Duplicados.
      if v_err is null then
        v_key := v_cuit || '|' || v_cbte || '|' || v_pv || '|' || v_num;
        if v_key = any (v_vistos) then
          v_dup := jsonb_build_object('motivo', 'repetida_en_el_archivo');
        else
          v_vistos := v_vistos || v_key;
          select f.id into v_exist
            from public.pagos_facturas f join public.pagos_proveedores p on p.id = f.proveedor_id
           where p.cuit = v_cuit and f.clase = v_clase and f.tipo_comprobante = v_tipo
             and f.numero_norm = v_nn and f.estado <> 'anulada'
           order by f.id limit 1;
          if v_exist is not null then
            v_dup := jsonb_build_object('motivo', 'ya_cargada', 'factura_id_existente', v_exist);
          else
            select f.id into v_exist
              from public.pagos_facturas f join public.pagos_proveedores p on p.id = f.proveedor_id
             where p.cuit is null and f.numero_norm = v_nn and f.clase = v_clase and f.total = v_tot
               and f.estado <> 'anulada'
             order by f.id limit 1;
            if v_exist is not null then
              v_err := 'POSIBLE_DUPLICADA'; v_det := jsonb_build_object('factura_id', v_exist);
            end if;
          end if;
        end if;
      end if;

      -- 9) Desglose.
      if v_err is null and v_dup is null then
        if v_tipo = 'A' then
          v_neto := v_net; v_ivaf := v_iva;
          if jsonb_typeof(v_e -> 'alicuotas') = 'array' then
            -- Formato nuevo: columnas por alícuota.
            select coalesce(jsonb_agg(jsonb_build_object('alicuota_id', g.a, 'base_imp', g.b, 'importe', g.i) order by g.a), '[]'::jsonb),
                   coalesce(sum(g.b), 0), coalesce(sum(g.i), 0)
              into v_iva_det, v_sb, v_si
              from (select (x ->> 'alicuota_id')::int as a,
                           round(sum(abs(coalesce(nullif(x ->> 'base_imp', '')::numeric, 0))) * v_tc, 2) as b,
                           round(sum(abs(coalesce(nullif(x ->> 'importe', '')::numeric, 0))) * v_tc, 2) as i
                      from jsonb_array_elements(v_e -> 'alicuotas') x
                     where (x ->> 'alicuota_id') ~ '^\d+$' and (x ->> 'alicuota_id')::int in (3, 4, 5, 6, 8, 9)
                     group by 1) g
             where g.b > 0 or g.i > 0;
            if abs(v_sb - v_net) > 0.01 or abs(v_si - v_iva) > 0.01 then
              v_err := 'ALICUOTAS_NO_CUADRAN';
              v_det := jsonb_build_object('suma_base', v_sb, 'neto', v_net, 'suma_iva', v_si, 'iva', v_iva);
            elsif jsonb_array_length(v_iva_det) = 0 then
              if not (v_net = 0 and v_ng + v_ex > 0) then
                v_iva_det := null; v_desg := true;
                v_avisos := v_avisos || jsonb_build_object('codigo', 'alicuota_no_inferida', 'detalle', jsonb_build_object('razon', 'sin_alicuotas'));
              end if;
            else
              v_neto := v_sb; v_ivaf := v_si;
            end if;
          else
            -- Formato clásico: solo neto e IVA totales. Se infiere 21 % o 10,5 %.
            if v_net = 0 and v_iva = 0 then
              if v_ng + v_ex > 0 then
                v_iva_det := '[]'::jsonb;
              else
                v_desg := true;
                v_avisos := v_avisos || jsonb_build_object('codigo', 'alicuota_no_inferida', 'detalle', jsonb_build_object('razon', 'sin_neto_ni_iva'));
              end if;
            elsif v_net > 0 and abs(v_iva - round(v_net * 0.21, 2)) <= 0.05 then
              v_iva_det := jsonb_build_array(jsonb_build_object('alicuota_id', 5, 'base_imp', v_net, 'importe', v_iva));
            elsif v_net > 0 and abs(v_iva - round(v_net * 0.105, 2)) <= 0.05 then
              v_iva_det := jsonb_build_array(jsonb_build_object('alicuota_id', 4, 'base_imp', v_net, 'importe', v_iva));
            else
              v_iva_det := null; v_desg := true;
              v_avisos := v_avisos || jsonb_build_object('codigo', 'alicuota_no_inferida', 'detalle', jsonb_build_object('razon',
                case when v_iva = 0 then 'iva_cero' when v_net = 0 then 'iva_sin_neto' else 'alicuota_distinta_o_mixta' end));
            end if;
          end if;
        else
          -- B, C, recibo y 49: sin IVA discriminado.
          v_iva_det := '[]'::jsonb; v_ivaf := 0;
          v_neto := v_tot - v_ng - v_ex - v_ot;
          if v_neto < 0 then
            v_avisos := v_avisos || jsonb_build_object('codigo', 'no_cuadra', 'detalle',
              jsonb_build_object('suma', v_ng + v_ex + v_ot, 'total', v_tot));
            v_neto := 0;
          end if;
        end if;
      end if;

      if v_err is null and v_dup is null then
        if v_ot > 0 then
          v_trib := jsonb_build_array(jsonb_build_object('tipo', 'otro', 'jurisdiccion', null,
                      'descripcion', 'Otros tributos según ARCA (sin clasificar)', 'importe', v_ot));
          v_trib_rev := true;
        end if;
        v_suma := coalesce(v_neto, 0) + coalesce(v_ivaf, 0) + v_ng + v_ex + v_ot;
        if abs(v_suma - v_tot) > 0.01 then
          v_iva_det := null; v_neto := null; v_ivaf := null; v_desg := true;
          if not exists (select 1 from jsonb_array_elements(v_avisos) a where a ->> 'codigo' = 'no_cuadra') then
            v_avisos := v_avisos || jsonb_build_object('codigo', 'no_cuadra', 'detalle', jsonb_build_object('suma', v_suma, 'total', v_tot));
          end if;
        end if;
        v_cae := nullif(regexp_replace(coalesce(v_e ->> 'cod_autorizacion', ''), '\D', '', 'g'), '');
        if v_cae !~ '^\d{14}$' then v_cae := null; end if;
      end if;
    exception when others then
      v_err := 'FILA_INVALIDA'; v_det := jsonb_build_object('sqlstate', sqlstate, 'mensaje', sqlerrm);
    end;

    -- 10) Alta (solo confirmando y sin error).
    if v_err is null and v_dup is null and p_confirmar then
      begin
        insert into public.pagos_facturas (
          proveedor_id, tipo_comprobante, numero, numero_norm, fecha, vence_el, neto, iva, no_gravado, exento, total,
          forma_pago_prevista, descripcion, obs, cae, cbte_tipo_arca, lectura_estado, clase, concepto_id, periodo_iva,
          sin_imputar, desglose_a_revisar, tributos_a_revisar, origen_carga, importacion_id, created_by, updated_by)
        values (
          v_prov, v_tipo, v_numero, v_nn, v_fecha, null, v_neto, v_ivaf, v_ng, v_ex, v_tot,
          'transferencia', 'Importada de ARCA — ' || public._pagos_nombre_cbte(v_cbte), v_obs, v_cae, v_cbte, 'manual',
          v_clase, null, date_trunc('month', v_fecha::timestamp)::date,
          true, v_desg, v_trib_rev, 'arca_recibidos', v_imp_id, p_user_id, p_user_id)
        returning id into v_fid;
        perform public._pagos_guardar_desglose(v_fid, v_iva_det, v_trib);
        select * into v_f from public.pagos_facturas where id = v_fid;
        perform public._pagos_validar_desglose(v_f.neto, v_f.iva, v_f.percepciones, v_f.otros, v_f.total, v_f.no_gravado, v_f.exento);
      exception
        when unique_violation then
          get stacked diagnostics v_constr = constraint_name;
          v_fid := null;
          if v_constr = 'pagos_facturas_prov_tipo_numero_uidx' then
            select f.id into v_exist from public.pagos_facturas f
             where f.proveedor_id = v_prov and f.clase = v_clase and f.tipo_comprobante = v_tipo
               and f.numero_norm = v_nn and f.estado <> 'anulada' limit 1;
            v_dup := jsonb_build_object('motivo', 'ya_cargada', 'factura_id_existente', v_exist);
          else
            v_err := 'FILA_INVALIDA'; v_det := jsonb_build_object('sqlstate', sqlstate, 'mensaje', sqlerrm);
          end if;
        when others then
          v_fid := null;
          v_err := 'FILA_INVALIDA'; v_det := jsonb_build_object('sqlstate', sqlstate, 'mensaje', sqlerrm);
      end;
    end if;

    if v_err is not null then
      v_errs := v_errs + 1;
    elsif v_dup is not null then
      v_dups := v_dups + 1;
    else
      v_nuevas := v_nuevas + 1;
    end if;

    v_res := v_res || jsonb_build_object(
      'indice', v_i,
      'estado', case when v_err is not null then 'error' when v_dup is not null then 'duplicada' else 'nueva' end,
      'error', v_err,
      'detalle', coalesce(v_det, v_dup),
      'avisos', v_avisos,
      'fecha', v_fecha, 'cbte_tipo', v_cbte, 'tipo_comprobante', v_tipo, 'clase', v_clase,
      'numero', v_numero, 'cuit', v_cuit, 'razon_social', coalesce(v_prov_rs, v_rs),
      'proveedor_id', v_prov, 'proveedor_nuevo', v_prov_nvo,
      'neto', v_neto, 'iva', v_ivaf, 'no_gravado', v_ng, 'exento', v_ex, 'otros_tributos', v_ot, 'total', v_tot,
      'iva_detalle', v_iva_det, 'desglose_a_revisar', v_desg, 'tributos_a_revisar', v_trib_rev,
      'factura_id', v_fid, 'factura_id_existente', v_dup ->> 'factura_id_existente');
  end loop;

  if p_confirmar and v_errs > 0 then
    raise exception 'IMPORTACION_CON_ERRORES' using errcode = 'P0001',
      detail = jsonb_build_object('errores', (select jsonb_agg(x) from jsonb_array_elements(v_res) x where x ->> 'estado' = 'error'))::text;
  end if;

  if p_confirmar then
    update public.pagos_importaciones i
       set filas = jsonb_array_length(p_filas), nuevas = v_nuevas, duplicadas = v_dups,
           proveedores_nuevos = (select count(*) from jsonb_object_keys(v_provs)),
           fecha_desde = (select min((x ->> 'fecha')::date) from jsonb_array_elements(v_res) x where x ->> 'estado' = 'nueva'),
           fecha_hasta = (select max((x ->> 'fecha')::date) from jsonb_array_elements(v_res) x where x ->> 'estado' = 'nueva')
     where i.id = v_imp_id;
  end if;

  return jsonb_build_object(
    'confirmado', p_confirmar,
    'importacion_id', v_imp_id,
    'total_filas', jsonb_array_length(p_filas),
    'nuevas', v_nuevas, 'duplicadas', v_dups, 'errores', v_errs,
    'a_revisar_desglose', (select count(*) from jsonb_array_elements(v_res) x
                            where x ->> 'estado' = 'nueva' and (x ->> 'desglose_a_revisar')::boolean),
    'a_revisar_tributos', (select count(*) from jsonb_array_elements(v_res) x
                            where x ->> 'estado' = 'nueva' and (x ->> 'tributos_a_revisar')::boolean),
    'moneda_extranjera', (select count(*) from jsonb_array_elements(v_res) x
                           where x ->> 'estado' = 'nueva'
                             and exists (select 1 from jsonb_array_elements(x -> 'avisos') a where a ->> 'codigo' = 'moneda_extranjera')),
    'proveedores_nuevos', coalesce((select jsonb_agg(value order by value ->> 'razon_social') from jsonb_each(v_provs)), '[]'::jsonb),
    'por_mes', coalesce((select jsonb_agg(jsonb_build_object('periodo', m.periodo, 'nuevas', m.nuevas, 'total', m.total) order by m.periodo)
                           from (select to_char((x ->> 'fecha')::date, 'YYYY-MM') as periodo, count(*) as nuevas,
                                        sum(case when x ->> 'clase' = 'nota_credito' then -1 else 1 end * (x ->> 'total')::numeric) as total
                                   from jsonb_array_elements(v_res) x
                                  where x ->> 'estado' = 'nueva'
                                  group by 1) m), '[]'::jsonb),
    'filas', v_res);
end $$;

comment on function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text) is
  'Importa «Mis Comprobantes Recibidos» de ARCA como facturas sin_imputar (vista previa con p_confirmar=false; todo o nada al confirmar). 20260927c.';

do $$
declare f text;
begin
  foreach f in array array[
    '_pagos_tipo_de_arca(smallint)',
    '_pagos_nombre_cbte(smallint)',
    'pagos_importar_recibidos(jsonb, uuid, boolean, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
