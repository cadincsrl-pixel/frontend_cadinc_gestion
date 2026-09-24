-- =====================================================================
-- Contabilidad: la compra con desglose a revisar queda PENDIENTE
-- (2026-09-28)
--
-- Por qué (criterio del contador, 24/09): una factura / NC de compra con
-- `pagos_facturas.desglose_a_revisar = true` (factura A sin alícuotas
-- identificadas) queda pendiente hasta revisarla, igual que en el Libro IVA
-- compras, que ya la deja afuera. Hasta hoy `_cont_prop_compra` solo miraba
-- `neto is null`: estas facturas traen neto e IVA total, así que se
-- contabilizaban con el IVA entero a la cuenta general (`compras.iva_cf`
-- sin alícuota). Al aplicar esto había 11 con asiento confirmado (todas en
-- períodos abiertos) y 9 más pendientes por otro motivo.
--
-- Qué cambia:
-- 1) _cont_prop_compra: con el flag (o A sin neto, como antes) la propuesta
--    lleva el motivo DESGLOSE_A_REVISAR {factura_id} y NINGUNA línea; el
--    importe informado es el total del comprobante. Los motivos previos
--    (PAGA_CLIENTE_SIN_CRITERIO) se conservan.
-- 2) _cont_motivo_bloqueante(motivos): motivos que dicen que el ORIGEN no es
--    contabilizable (hoy solo DESGLOSE_A_REVISAR), a diferencia de los de
--    configuración (SIN_MAPEO, AUXILIAR_REQUERIDO…), que se arreglan en el
--    mapeo y no tocan el asiento que ya existe.
-- 3) _cont_aplicar: origen vigente con motivo bloqueante y asiento activo →
--    en período abierto se ANULA (como un origen anulado, motivo_anulacion
--    «Origen no contabilizable: …»); en período cerrado queda
--    «desactualizado» (no se hace contraasiento automático).
-- 4) _cont_estado_origen: ese caso se ve como «a_revertir» (período
--    abierto) mientras no corra el contabilizador; después, sin asiento, como
--    «pendiente» con el motivo.
-- 5) Cuando se corrige (`pagos_completar_desglose` baja el flag), la
--    propuesta vuelve a tener líneas y la próxima corrida crea el asiento.
--    No hace falta tocar pagos_completar_desglose.
--
-- Parche por anclas sobre la definición viva (20260927e/f).
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

-- ── 1) Motivos bloqueantes ─────────────────────────────────────────────
create or replace function public._cont_motivo_bloqueante(p_motivos jsonb)
returns text language sql immutable set search_path = public, pg_temp as $$
  select m ->> 'codigo'
    from jsonb_array_elements(coalesce(p_motivos, '[]'::jsonb)) m
   where m ->> 'codigo' in ('DESGLOSE_A_REVISAR')
   limit 1
$$;

comment on function public._cont_motivo_bloqueante(jsonb) is
  'Primer motivo que hace NO contabilizable al origen en sí (hoy DESGLOSE_A_REVISAR). Con uno así, un asiento activo en período abierto se anula. Los motivos de configuración (SIN_MAPEO…) no bloquean. 20260928d.';

revoke all on function public._cont_motivo_bloqueante(jsonb) from public, anon, authenticated;
grant execute on function public._cont_motivo_bloqueante(jsonb) to service_role;

do $m$
declare
  v text;
begin
  -- ── 2) _cont_prop_compra ─────────────────────────────────────────────
  v := pg_get_functiondef('public._cont_prop_compra(bigint)'::regprocedure);
  v := pg_temp._una(v,
$a$  s := case when f.clase = 'nota_credito' then -1 else 1 end;$a$,
$a$  -- Desglose a revisar (criterio del contador, 24/09): pendiente hasta
  -- revisarla, igual que en el Libro IVA. Sin líneas: no se contabiliza
  -- con el IVA total a la cuenta general.
  if f.desglose_a_revisar or (f.tipo_comprobante = 'A' and f.neto is null) then
    p := public._cont_prop_motivo(p, 'DESGLOSE_A_REVISAR', jsonb_build_object('factura_id', p_id));
    return public._cont_prop_cerrar(p) || jsonb_build_object('importe', f.total);
  end if;

  s := case when f.clase = 'nota_credito' then -1 else 1 end;$a$);
  execute v;

  -- ── 3) _cont_aplicar ─────────────────────────────────────────────────
  v := pg_get_functiondef('public._cont_aplicar(jsonb, uuid, boolean)'::regprocedure);
  v := pg_temp._una(v,
$a$  if jsonb_array_length(v_mot) > 0 then
    if v_tiene and a.origen_hash is distinct from v_hash then$a$,
$a$  if jsonb_array_length(v_mot) > 0 then
    -- El origen dejó de ser contabilizable (20260928d): el asiento se anula en
    -- período abierto; en cerrado queda desactualizado.
    if v_tiene and public._cont_motivo_bloqueante(v_mot) is not null then
      if v_a_ab then
        update public.cont_asientos
           set estado = 'anulado',
               motivo_anulacion = 'Origen no contabilizable: ' || public._cont_motivo_bloqueante(v_mot),
               anulado_por = p_user_id, anulado_at = now(), updated_by = p_user_id
         where id = a.id;
        return jsonb_build_object('accion', 'anulado', 'asiento_id', a.id, 'motivos', v_mot);
      end if;
      return jsonb_build_object('accion', 'desactualizado', 'asiento_id', a.id, 'motivos', v_mot);
    end if;
    if v_tiene and a.origen_hash is distinct from v_hash then$a$);
  execute v;

  -- ── 4) _cont_estado_origen ───────────────────────────────────────────
  v := pg_get_functiondef('public._cont_estado_origen(text, bigint, date)'::regprocedure);
  v := pg_temp._una(v,
$a$  elsif jsonb_array_length(v_mot) > 0 then
    v_est := case when a.id is not null and a.origen_hash$a$,
$a$  elsif jsonb_array_length(v_mot) > 0 then
    v_est := case when a.id is not null and public._cont_motivo_bloqueante(v_mot) is not null
                       and v_pest = 'abierto' and public._cont_periodo_abierto(a.fecha) then 'a_revertir'
                  when a.id is not null and a.origen_hash$a$);
  execute v;
end $m$;
