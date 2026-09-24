-- =====================================================================
-- 20260924l — Ventas / Cobranzas: los comprobantes externos toman la forma
-- de «Mis Comprobantes — Emitidos» de ARCA (2026-09-23)
--
-- El dueño bajó de ARCA lo emitido del 01/07 al 22/09/2026 (203
-- comprobantes: FA/NCA/FB/NCB PV 2, CVLP 60 PV 10 que emite CASILDA a nombre
-- de CADINC, FCE 201 PV 1). Eso es la fuente de los SALDOS INICIALES y además
-- el LIBRO DE VENTAS histórico (jul–sep), así que `ventas_comprobantes_externos`
-- (20260924k, todavía vacía) pasa a guardar el comprobante completo:
--
--   * `cbte_tipo` = código de ARCA. Débitos: 1, 2, 6, 7, 60, 61, 201, 202.
--     Créditos: 3, 8, 203. `tipo` (FC/ND/NC) y `letra` pasan a ser columnas
--     GENERADAS desde `cbte_tipo`, para que las vistas sigan igual. La CVLP
--     (60/61) es una venta de CADINC: cuenta como FC.
--   * Importes del libro: neto (gravado), no_gravado, exento, iva, total,
--     moneda y tipo de cambio. No se exige total = suma: ARCA puede traer
--     otros tributos que el Excel no desglosa.
--   * Foto del comprador (rec_doc_tipo / rec_doc_nro / rec_razon_social),
--     como en ventas_facturas.
--   * Dedup ÚNICO por (cbte_tipo, pto_vta, numero). Y sigue sin poder
--     duplicar un comprobante autorizado del ERP (mismo código, PV y número).
--   * `saldo_inicial` admite 0: un comprobante ya cobrado queda en el libro
--     con saldo 0.
--   * El Excel NO trae cobranzas: lo que no se puede deducir queda
--     `saldo_a_revisar = true` con saldo = total, hasta que el dueño o la
--     contadora confirmen (`ventas_externos_marcar`, 20260924n): quién
--     (`saldo_confirmado_por/el`), por qué (`saldo_motivo`) y, si se marca
--     cobrada, cuándo (`saldo_cobrado_el`).
-- =====================================================================

drop index public.ventas_externos_numero_uidx;

alter table public.ventas_comprobantes_externos
  drop column tipo,
  drop column letra,
  drop constraint ventas_comprobantes_externos_saldo_inicial_check;

alter table public.ventas_comprobantes_externos
  add column cbte_tipo smallint not null
    check (cbte_tipo in (1, 2, 3, 6, 7, 8, 60, 61, 201, 202, 203)),
  add column tipo text generated always as (
    case when cbte_tipo in (3, 8, 203) then 'NC'
         when cbte_tipo in (2, 7, 202) then 'ND'
         else 'FC' end) stored,
  add column letra text generated always as (
    case when cbte_tipo in (6, 7, 8, 61) then 'B' else 'A' end) stored,
  add column neto              numeric(14,2) not null default 0 check (neto >= 0),
  add column no_gravado        numeric(14,2) not null default 0 check (no_gravado >= 0),
  add column exento            numeric(14,2) not null default 0 check (exento >= 0),
  add column iva               numeric(14,2) not null default 0 check (iva >= 0),
  add column moneda            text not null default 'PES',
  add column tipo_cambio       numeric(12,6) not null default 1 check (tipo_cambio > 0),
  add column rec_doc_tipo      smallint,
  add column rec_doc_nro       text,
  add column rec_razon_social  text,
  add column saldo_a_revisar      boolean not null default false,
  add column saldo_confirmado_por uuid references auth.users(id),
  add column saldo_confirmado_el  timestamptz,
  add column saldo_motivo         text not null default '',
  add column saldo_cobrado_el     date,
  add constraint ventas_externos_saldo_inicial_chk check (saldo_inicial >= 0),
  add constraint ventas_externos_cobrado_chk check (saldo_cobrado_el is null or saldo_inicial = 0);

comment on column public.ventas_comprobantes_externos.cbte_tipo is
  'Código de comprobante de ARCA: 1/2/6/7/60/61/201/202 débitos (FA, ND A, FB, ND B, CVLP A/B, FCE, ND FCE); 3/8/203 créditos (NC A, NC B, NC FCE). 20260924l.';
comment on column public.ventas_comprobantes_externos.saldo_inicial is
  'Deuda (débito) o crédito sin usar (NC) a la fecha de corte. 0 = cobrado/usado (queda en el libro). 20260924l.';
comment on column public.ventas_comprobantes_externos.saldo_a_revisar is
  'true = el saldo es una suposición (saldo = total porque el Excel de ARCA no trae cobranzas). Lo baja ventas_externos_marcar. 20260924l.';

create unique index ventas_externos_numero_uidx on public.ventas_comprobantes_externos (cbte_tipo, pto_vta, numero);
create index ventas_externos_revisar_idx on public.ventas_comprobantes_externos (cliente_id) where saldo_a_revisar;
create index ventas_externos_fecha_idx on public.ventas_comprobantes_externos (fecha, cbte_tipo, pto_vta, numero);

-- Guard: el cambio de tipo ahora es cambio de cbte_tipo; el duplicado contra
-- el ERP se mira con el mismo código de ARCA.
create or replace function public.fn_ventas_externo_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_imp numeric(14,2);
  v_n   int;
  v_id  bigint := case when tg_op = 'INSERT' then null else old.id end;
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select coalesce(sum(importe) filter (where not anulada), 0), count(*)
      into v_imp, v_n
      from public.ventas_imputaciones
     where externo_id = old.id or nc_externo_id = old.id;
    if tg_op = 'DELETE' then
      if v_n > 0 then
        raise exception 'EXTERNO_CON_IMPUTACIONES' using errcode = 'P0001',
          detail = json_build_object('externo_id', old.id, 'imputado', v_imp, 'imputaciones', v_n)::text;
      end if;
      return old;
    end if;
    if v_n > 0 and (new.cliente_id <> old.cliente_id or new.cbte_tipo <> old.cbte_tipo) then
      raise exception 'EXTERNO_CON_IMPUTACIONES' using errcode = 'P0001',
        detail = json_build_object('externo_id', old.id, 'imputado', v_imp, 'imputaciones', v_n, 'campo',
                                   case when new.cliente_id <> old.cliente_id then 'cliente_id' else 'cbte_tipo' end)::text;
    end if;
    if new.saldo_inicial < v_imp then
      raise exception 'EXTERNO_SALDO_MENOR_QUE_IMPUTADO' using errcode = 'P0001',
        detail = json_build_object('externo_id', old.id, 'imputado', v_imp, 'saldo_inicial', new.saldo_inicial)::text;
    end if;
  end if;

  if exists (select 1 from public.ventas_facturas f
              where f.ambiente = 'prod' and f.estado = 'autorizada' and f.cbte_tipo = new.cbte_tipo
                and f.pto_vta = new.pto_vta and f.numero = new.numero) then
    raise exception 'EXTERNO_DUPLICA_FACTURA_ERP' using errcode = 'P0001',
      detail = json_build_object('externo_id', v_id, 'cbte_tipo', new.cbte_tipo,
                                 'pto_vta', new.pto_vta, 'numero', new.numero)::text;
  end if;
  return new;
end $$;

revoke all on function public.fn_ventas_externo_guard() from public, anon, authenticated;
grant execute on function public.fn_ventas_externo_guard() to service_role;
