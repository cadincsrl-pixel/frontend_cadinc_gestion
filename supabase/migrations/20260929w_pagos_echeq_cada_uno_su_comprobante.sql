-- =====================================================================
-- Compras: con cheque o e-cheq, el archivo de CADA cheque ES el comprobante
-- del pago; no hay un comprobante aparte (2026-09-25, pedido del dueño)
--
-- Por qué: «el comprobante del echeq y del pago cuando es echeq o cheque
-- físico es el mismo» / «en cada línea echeq deberíamos subir comprobante».
-- 20260929u dejaba elegir: o cada echeq con su archivo, o un comprobante
-- aparte de todo el pago. La pantalla mostraba las dos cosas y parecían dos
-- documentos distintos.
--
-- 1) _pagos_emitir_orden (parche por ancla sobre la definición viva):
--    · echeq: CADA cheque trae `foto_path` y ese path está entre los adjuntos
--      de la OP. Un comprobante aparte ya NO lo reemplaza (se sigue
--      aceptando si viene: no molesta). Si falta alguno →
--      ECHEQ_SIN_ARCHIVO { forma_pago, cheques_sin_archivo: [números] }.
--    · transferencia: igual que siempre (COMPROBANTE_REQUERIDO).
--    · cheque físico: igual que siempre (el archivo por cheque es opcional).
--    · Pago reconstruido (cadinc.pagos_reconstruir): exento, igual que antes.
--    Vale para la OP suelta, el lote y «ya pagada al cargar» (todas pasan por
--    acá). Espejo: comprobanteFaltante() del backend y
--    chequesSinComprobante() del frontend.
--
-- 2) v_pagos_ordenes.tiene_comprobante (parche por ancla sobre
--    pg_get_viewdef, misma posición y tipo): true si hay comprobante clásico
--    (`comprobante_pago`) O si la OP es cheque/e-cheq y TODOS sus cheques
--    tienen su archivo (adjunto `cheque` vigente). Un cheque está cubierto si
--    su número figura en el obs del adjunto («Cheque N° X» / «Cheques N° X,
--    Y», como los arma adjuntosDeCheques), o si hay al menos tantos adjuntos
--    `cheque` como cheques (por si alguien editó el obs). Así las OP en
--    e-cheq no aparecen «sin comprobante» ni cuentan en ese KPI.
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

-- ── 1) La regla, en la RPC ──
do $m$
declare
  v text := pg_get_functiondef('public._pagos_emitir_orden(bigint,jsonb,jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  -- E-cheq (20260929u): el archivo de CADA echeq es el comprobante. Los que
  -- no traen foto_path (o cuyo path no está entre los adjuntos) quedan acá.
$a$,
$a$  -- E-cheq (20260929w): el archivo de CADA echeq es el comprobante, y un
  -- comprobante aparte ya no lo reemplaza. Los que no traen foto_path (o cuyo
  -- path no está entre los adjuntos) quedan acá.
$a$);
  v := pg_temp._una(v,
$a$  if v_forma in ('transferencia', 'echeq') and not v_reconstruir
     and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'comprobante_pago')
     and not (v_forma = 'echeq' and jsonb_array_length(v_cheques) > 0 and jsonb_array_length(v_sin_archivo) = 0) then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = (jsonb_build_object('forma_pago', v_forma, 'tipo', 'comprobante_pago')
                || case when v_forma = 'echeq' then jsonb_build_object('cheques_sin_archivo', v_sin_archivo) else '{}'::jsonb end)::text;
  end if;$a$,
$a$  if v_forma = 'echeq' and not v_reconstruir and jsonb_array_length(v_sin_archivo) > 0 then
    raise exception 'ECHEQ_SIN_ARCHIVO' using errcode = 'P0001',
      detail = jsonb_build_object('forma_pago', v_forma, 'cheques_sin_archivo', v_sin_archivo)::text;
  end if;
  if v_forma = 'transferencia' and not v_reconstruir
     and not exists (select 1 from jsonb_array_elements(v_adjuntos) e where e ->> 'tipo' = 'comprobante_pago') then
    raise exception 'COMPROBANTE_REQUERIDO' using errcode = 'P0001',
      detail = jsonb_build_object('forma_pago', v_forma, 'tipo', 'comprobante_pago')::text;
  end if;$a$);
  execute v;
end $m$;

-- ── 2) «Sin comprobante» en la bandeja de pagos ──
do $m$
declare
  v text := pg_get_viewdef('public.v_pagos_ordenes'::regclass, true);
begin
  v := pg_temp._una(v,
$a$COALESCE(adj.tiene_comprobante, false) AS tiene_comprobante,$a$,
$a$(COALESCE(adj.tiene_comprobante, false)
      OR (o.forma_pago = ANY (ARRAY['cheque'::text, 'echeq'::text])
          AND (EXISTS (SELECT 1 FROM pagos_cheques ch0 WHERE ch0.orden_id = o.id))
          AND (
            NOT (EXISTS (SELECT 1 FROM pagos_cheques ch
                          WHERE ch.orden_id = o.id
                            AND NOT (EXISTS (SELECT 1 FROM pagos_ordenes_adjuntos ca
                                              WHERE ca.orden_id = o.id AND ca.tipo = 'cheque'::text AND ca.deleted_at IS NULL
                                                AND btrim(ch.numero) = ANY (regexp_split_to_array(
                                                      regexp_replace(COALESCE(ca.obs, ''::text), '^\s*Cheques?\s+N°\s*'::text, ''::text),
                                                      '\s*,\s*'::text))))))
            OR (SELECT count(*) FROM pagos_ordenes_adjuntos ca2
                 WHERE ca2.orden_id = o.id AND ca2.tipo = 'cheque'::text AND ca2.deleted_at IS NULL)
               >= (SELECT count(*) FROM pagos_cheques ch2 WHERE ch2.orden_id = o.id)))) AS tiene_comprobante,$a$);
  execute 'create or replace view public.v_pagos_ordenes as ' || v;
end $m$;
