-- 20260924d — Facturación, fase 5: Factura B (6) y Nota de Crédito B (8).
--
-- La tabla ya admitía 6 y 8 en el CHECK (20260924a) y la vista ya derivaba la
-- letra; lo que faltaba eran dos reglas de la base:
--
-- 1. LETRA. Hasta hoy `_ventas_validar_receptor` solo frenaba una B a un
--    Responsable Inscripto. La regla completa, verificada el 23/09 con
--    FEParamGetCondicionIvaReceptor en homologación:
--      A → CUIT (doc 80) y condición 1, 6, 13 o 16.
--      B → condición 4, 5, 7, 8, 9, 10 o 15 (con cualquier documento).
--    Un monotributista o un RI SIN CUIT no entra en ninguna: ARCA no acepta
--    las condiciones 1/6/13/16 en la clase B. Sale LETRA_INCOMPATIBLE con
--    letra null ("corregí el cliente"). Mismo criterio en el backend
--    (`letraDe` de reglas.ts) y en el frontend (`letraDeCliente`).
--    La NC hereda la letra de la factura (NC_TIPO_NO_COINCIDE ya lo cubría:
--    `_ventas_tipo_factura_de_nc` mapea 8 → 6), así que una NC A contra una
--    FB, o al revés, ya rebotaba.
--
-- 2. CONSUMIDOR FINAL SIN IDENTIFICAR. Desde la RG 5700/2025 (vigente desde
--    el 29/05/2025) hay que identificar al consumidor final (CUIT, CUIL, CDI o
--    DNI) cuando la operación es IGUAL O MAYOR a $ 10.000.000. Un comprobante
--    B con documento 99 ("sin identificar") y total ≥ tope →
--    CF_REQUIERE_IDENTIFICACION. Va como trigger (y no dentro de
--    guardar_borrador / iniciar_emision) porque las dos RPC escriben
--    `rec_doc_tipo` e `imp_total` sobre la fila: el trigger ve la foto
--    definitiva en los dos momentos sin copiar 200 líneas de RPC. Solo mira
--    borradores y emisiones en curso: lo autorizado es historia.
--    El tope vive en `_ventas_tope_cf()`; si ARCA lo cambia, se cambia ahí y
--    en TOPE_CF_IDENTIFICACION (backend y frontend).

-- ── 1. Letra ──────────────────────────────────────────────────────────

create or replace function public._ventas_validar_receptor(p_tipo smallint, p_doc_tipo smallint, p_cond smallint)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_letra text := case
    when p_doc_tipo = 80 and p_cond in (1, 6, 13, 16) then 'A'
    when p_cond in (4, 5, 7, 8, 9, 10, 15)            then 'B'
  end;
  v_pide  text := case when p_tipo in (1, 3, 201, 203) then 'A' when p_tipo in (6, 8) then 'B' end;
begin
  if v_pide is distinct from v_letra then
    raise exception 'LETRA_INCOMPATIBLE' using errcode = 'P0001',
      detail = json_build_object('letra', v_pide, 'letra_cliente', v_letra,
                                 'doc_tipo', p_doc_tipo, 'condicion_iva_id', p_cond)::text;
  end if;
end $$;

comment on function public._ventas_validar_receptor(smallint, smallint, smallint) is
  'Letra del comprobante según el receptor: A = CUIT y condición 1/6/13/16; B = condición 4/5/7/8/9/10/15. Si no coincide, LETRA_INCOMPATIBLE (letra_cliente null = el cliente no admite ninguna). 20260924d.';

-- ── 2. Consumidor final sin identificar ───────────────────────────────

create or replace function public._ventas_tope_cf() returns numeric
language sql immutable set search_path = public, pg_temp as $$ select 10000000::numeric $$;

comment on function public._ventas_tope_cf() is
  'Tope desde el que el consumidor final se identifica (RG ARCA 5700/2025, vigente desde el 29/05/2025): total >= tope con doc 99 no se emite. 20260924d.';

create or replace function public.fn_ventas_cf_identificado() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.estado in ('borrador', 'emitiendo')
     and new.cbte_tipo in (6, 8)
     and new.rec_doc_tipo = 99
     and new.imp_total >= public._ventas_tope_cf() then
    raise exception 'CF_REQUIERE_IDENTIFICACION' using errcode = 'P0001',
      detail = json_build_object('tope', public._ventas_tope_cf(), 'total', new.imp_total,
                                 'cliente_id', new.cliente_id)::text;
  end if;
  return new;
end $$;

create trigger trg_ventas_cf_identificado before insert or update on public.ventas_facturas
  for each row execute function public.fn_ventas_cf_identificado();

-- ── Grants (mismo criterio que 20260924c: solo service_role) ──────────
do $$
declare f text;
begin
  foreach f in array array[
    '_ventas_validar_receptor(smallint, smallint, smallint)',
    '_ventas_tope_cf()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
