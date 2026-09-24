-- =====================================================================
-- 20260924k — Ventas: Cobranzas y estado de deudores, parte 1 — tablas
--
-- Contrato: «Ventas — Cobranzas y estado de deudores (v1)». Modelo Bejerman:
-- recibo (RC) con medios + retenciones, aplicación de comprobantes con
-- imputación parcial, compensación entre comprobantes y saldos iniciales de
-- lo que quedó impago en Finnegans / portal de ARCA.
--
-- Qué agrega:
--   1. `ventas_clientes.plazo_pago_dias` (default 30).
--   2. `ventas_facturas.vence_el` (+ `vence_el_manual`): vencimiento de COBRO.
--      No es dato fiscal (el que va a ARCA es `fch_vto_pago` y NO se toca).
--        · automático = fecha_cbte + plazo del cliente; en la FCE (201) =
--          fch_vto_pago; en una NC = fecha_cbte (no se cobra).
--        · lo mantiene el trigger `trg_ventas_factura_vence` mientras la
--          factura NO está autorizada (sigue a la fecha y al cliente del
--          borrador y a la fecha que devuelve ARCA al autorizar);
--        · `vence_el_manual = true` lo fija a mano `ventas_cambiar_vencimiento`
--          (en borrador y en autorizada). Pasarle NULL vuelve a automático.
--      Backfill de TODAS las filas existentes.
--   3. El guard de inmutabilidad (`fn_ventas_factura_guard`) suma
--      vence_el / vence_el_manual a las columnas libres SOLO con el GUC
--      `cadinc.ventas_vencimiento = 'on'`, que setea únicamente
--      `ventas_cambiar_vencimiento`. Lo que ya era libre (Finnegans,
--      obs_interna) sigue igual. Todo lo demás de una autorizada sigue
--      rebotando con FACTURA_AUTORIZADA_INMUTABLE.
--   4. `ventas_comprobantes_externos` — saldos iniciales (FC/ND/NC de
--      Finnegans o del portal que siguen abiertos). Los escribe el backend
--      directo (ABM) o `ventas_importar_externos`. Una NC externa resta.
--   5. `ventas_cobros` (el recibo, RC), `ventas_cobro_medios`,
--      `ventas_cobro_retenciones`, `ventas_imputaciones`. Contenido SOLO por
--      las RPC `ventas_*` (GUC cadinc.ventas_rpc), como las facturas. Nada se
--      borra: un cobro se anula (y anula sus imputaciones); una imputación se
--      anula. Las retenciones admiten tocar a mano solo el adjunto.
--   6. Bucket privado `ventas-docs` (certificados de retención), mismo molde
--      que `pagos-docs` (20260918b): firmado desde el backend, sin policies.
--      Dedup por sha256 en `ventas_cobro_retenciones.adjunto_hash`.
--
-- Retenciones (confirmado por el dueño 23/09): le retienen IIBB, TEM, SUSS,
-- Ganancias e IVA. `tem` = Tributo Económico Municipal (la municipal de
-- Tucumán); va con esa clave y no como 'municipal'. 'otra' para lo raro.
--
-- Base cerrada como el resto de `ventas_*`: RLS permisiva y NINGÚN privilegio
-- para anon/authenticated.
-- =====================================================================

-- ── 1. Plazo de pago del cliente ──────────────────────────────────────

alter table public.ventas_clientes
  add column plazo_pago_dias smallint not null default 30 check (plazo_pago_dias between 0 and 365);
comment on column public.ventas_clientes.plazo_pago_dias is
  'Días para el vencimiento de cobro por defecto: vence_el = fecha_cbte + plazo (salvo FCE: fch_vto_pago). 20260924k.';

-- ── 2. Vencimiento de cobro de la factura ─────────────────────────────

alter table public.ventas_facturas
  add column vence_el        date,
  add column vence_el_manual boolean not null default false;
comment on column public.ventas_facturas.vence_el is
  'Vencimiento de COBRO (no fiscal; lo fiscal es fch_vto_pago). Automático = fecha_cbte + plazo del cliente (FCE 201: fch_vto_pago; NC: fecha_cbte). En autorizada solo lo cambia ventas_cambiar_vencimiento. 20260924k.';
comment on column public.ventas_facturas.vence_el_manual is
  'true = vence_el lo fijó alguien con ventas_cambiar_vencimiento y el trigger ya no lo recalcula. 20260924k.';

-- 3. Guard: vence_el libre SOLO bajo cadinc.ventas_vencimiento.
create or replace function public.fn_ventas_factura_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_libres text[] := array['numero_finnegans', 'registrada_at', 'registrada_por', 'obs_interna', 'updated_at', 'updated_by'];
  v_rpc    boolean := coalesce(current_setting('cadinc.ventas_rpc', true), '') = 'on';
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- 20260924k: el vencimiento de cobro no es fiscal. Lo abre solo
  -- ventas_cambiar_vencimiento (y el backfill de esta migración).
  if coalesce(current_setting('cadinc.ventas_vencimiento', true), '') = 'on' then
    v_libres := v_libres || array['vence_el', 'vence_el_manual'];
  end if;

  if tg_op = 'DELETE' then
    -- Solo se borra un borrador que nunca fue a ARCA. Lo demás queda de historia.
    if old.estado = 'borrador' and old.numero_intentado is null and old.intento_n = 0 then
      return old;
    end if;
    raise exception '%', case when old.estado = 'autorizada' then 'FACTURA_AUTORIZADA_INMUTABLE' else 'FACTURA_NO_BORRABLE' end
      using errcode = 'P0001', detail = json_build_object('factura_id', old.id, 'estado', old.estado)::text;
  end if;

  if tg_op = 'INSERT' then
    if not v_rpc then
      raise exception 'VENTAS_SOLO_RPC' using errcode = 'P0001', detail = json_build_object('operacion', 'insert')::text;
    end if;
    if new.estado <> 'borrador' or new.numero is not null or new.cae is not null or new.numero_intentado is not null then
      raise exception 'FACTURA_NACE_BORRADOR' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.estado = 'autorizada'
     and (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'FACTURA_AUTORIZADA_INMUTABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', old.id)::text;
  end if;
  if not v_rpc and (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'VENTAS_SOLO_RPC' using errcode = 'P0001',
      detail = json_build_object('factura_id', old.id, 'estado', old.estado)::text;
  end if;
  return new;
end $$;

-- Vencimiento automático mientras la factura no está autorizada. Corre
-- DESPUÉS del guard (orden alfabético: …_factura_guard < …_factura_vence), así
-- que no dispara VENTAS_SOLO_RPC. Una autorizada no se toca acá: la mueve solo
-- ventas_cambiar_vencimiento.
create or replace function public.fn_ventas_factura_vence() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_plazo int;
begin
  if tg_op = 'UPDATE' and old.estado = 'autorizada' then
    return new;
  end if;
  if new.cbte_tipo in (3, 8, 203) then
    new.vence_el := new.fecha_cbte;                      -- una NC no se cobra
    new.vence_el_manual := false;
  elsif new.cbte_tipo = 201 then
    new.vence_el := coalesce(new.fch_vto_pago, new.fecha_cbte);   -- FCE: el vencimiento de pago informado a ARCA
    new.vence_el_manual := false;
  elsif not new.vence_el_manual or new.vence_el is null then
    select plazo_pago_dias into v_plazo from public.ventas_clientes where id = new.cliente_id;
    new.vence_el := new.fecha_cbte + coalesce(v_plazo, 30);
    new.vence_el_manual := false;
  end if;
  -- ARCA puede devolver otra fecha al autorizar: nunca vencer antes de emitir.
  if new.vence_el < new.fecha_cbte then
    new.vence_el := new.fecha_cbte;
  end if;
  return new;
end $$;
create trigger trg_ventas_factura_vence before insert or update on public.ventas_facturas
  for each row execute function public.fn_ventas_factura_vence();

-- Backfill: todas las filas (las autorizadas pasan por el guard con el GUC).
do $$
begin
  perform set_config('cadinc.ventas_vencimiento', 'on', true);
  update public.ventas_facturas f
     set vence_el = case when f.cbte_tipo in (3, 8, 203) then f.fecha_cbte
                         when f.cbte_tipo = 201 then greatest(coalesce(f.fch_vto_pago, f.fecha_cbte), f.fecha_cbte)
                         else f.fecha_cbte + coalesce(c.plazo_pago_dias, 30) end,
         vence_el_manual = false
    from public.ventas_clientes c
   where c.id = f.cliente_id and f.vence_el is null;
  perform set_config('cadinc.ventas_vencimiento', 'off', true);
end $$;

alter table public.ventas_facturas
  alter column vence_el set not null,
  add constraint ventas_facturas_vence_el_chk check (vence_el >= fecha_cbte);

-- Deudores por vencimiento.
create index ventas_facturas_deudores_idx on public.ventas_facturas (cliente_id, vence_el)
  where estado = 'autorizada';

-- ventas_factura_eventos: el cambio de vencimiento queda en la historia.
alter table public.ventas_factura_eventos drop constraint ventas_factura_eventos_tipo_check;
alter table public.ventas_factura_eventos add constraint ventas_factura_eventos_tipo_check
  check (tipo in ('creada', 'editada', 'emision_iniciada', 'intento', 'autorizada', 'rechazada', 'error_reconciliar',
                  'vuelta_a_borrador', 'descartada', 'registrada_finnegans', 'registro_deshecho',
                  'vencimiento_cambiado'));

-- ── 4. Saldos iniciales: comprobantes externos ────────────────────────

create table public.ventas_comprobantes_externos (
  id             bigserial primary key,
  cliente_id     bigint not null references public.ventas_clientes(id),
  tipo           text not null check (tipo in ('FC', 'ND', 'NC')),
  letra          text not null check (letra in ('A', 'B', 'C', 'E', 'M')),
  pto_vta        int  not null check (pto_vta between 0 and 99999),
  numero         bigint not null check (numero between 1 and 99999999),
  fecha          date not null,
  vence_el       date not null,
  total          numeric(14,2) not null check (total > 0),
  -- Lo que se debía (FC/ND) o el crédito sin usar (NC) a la fecha de corte.
  saldo_inicial  numeric(14,2) not null check (saldo_inicial > 0),
  origen         text not null default 'finnegans' check (origen in ('finnegans', 'portal', 'otro')),
  obs            text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id),
  constraint ventas_externos_saldo_chk check (saldo_inicial <= total),
  constraint ventas_externos_vence_chk check (vence_el >= fecha)
);
comment on table public.ventas_comprobantes_externos is
  'Saldos iniciales de Cobranzas: comprobantes emitidos fuera del ERP (Finnegans, portal de ARCA) que siguen abiertos. saldo_inicial = deuda (FC/ND) o crédito sin usar (NC) a la fecha de corte. 20260924k.';

create unique index ventas_externos_numero_uidx on public.ventas_comprobantes_externos (tipo, letra, pto_vta, numero);
create index ventas_externos_cliente_idx on public.ventas_comprobantes_externos (cliente_id, vence_el);

-- Guard de externos: no duplicar una factura del ERP y no romper lo imputado.
create or replace function public.fn_ventas_externo_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_imp   numeric(14,2);
  v_n     int;
  v_id    bigint := case when tg_op = 'INSERT' then null else old.id end;
  v_tipos smallint[];
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
    if v_n > 0 and (new.cliente_id <> old.cliente_id or new.tipo <> old.tipo) then
      raise exception 'EXTERNO_CON_IMPUTACIONES' using errcode = 'P0001',
        detail = json_build_object('externo_id', old.id, 'imputado', v_imp, 'imputaciones', v_n, 'campo',
                                   case when new.cliente_id <> old.cliente_id then 'cliente_id' else 'tipo' end)::text;
    end if;
    if new.saldo_inicial < v_imp then
      raise exception 'EXTERNO_SALDO_MENOR_QUE_IMPUTADO' using errcode = 'P0001',
        detail = json_build_object('externo_id', old.id, 'imputado', v_imp, 'saldo_inicial', new.saldo_inicial)::text;
    end if;
  end if;

  -- Ya existe como comprobante del ERP (autorizado en producción).
  v_tipos := case
    when new.tipo = 'FC' and new.letra = 'A' then array[1, 201]::smallint[]
    when new.tipo = 'FC' and new.letra = 'B' then array[6]::smallint[]
    when new.tipo = 'NC' and new.letra = 'A' then array[3, 203]::smallint[]
    when new.tipo = 'NC' and new.letra = 'B' then array[8]::smallint[]
  end;
  if v_tipos is not null and exists (
       select 1 from public.ventas_facturas f
        where f.ambiente = 'prod' and f.estado = 'autorizada' and f.cbte_tipo = any (v_tipos)
          and f.pto_vta = new.pto_vta and f.numero = new.numero) then
    raise exception 'EXTERNO_DUPLICA_FACTURA_ERP' using errcode = 'P0001',
      detail = json_build_object('externo_id', v_id, 'tipo', new.tipo, 'letra', new.letra,
                                 'pto_vta', new.pto_vta, 'numero', new.numero)::text;
  end if;
  return new;
end $$;
create trigger trg_ventas_externo_guard before insert or update or delete on public.ventas_comprobantes_externos
  for each row execute function public.fn_ventas_externo_guard();
create trigger trg_ventas_externos_touch before update on public.ventas_comprobantes_externos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_comprobantes_externos
  for each row execute function public.audit_cambios('facturacion', 'comprobante externo', 'id');
create trigger trg_audit_borrado after delete on public.ventas_comprobantes_externos
  for each row execute function public.audit_borrado('facturacion', 'comprobante externo', 'id');

-- ── 5. Cobros (recibos) ───────────────────────────────────────────────

create table public.ventas_cobros (
  id                 bigserial primary key,
  ambiente           text not null default 'prod' check (ambiente in ('homo', 'prod')),
  numero             bigint not null check (numero between 1 and 99999999),   -- correlativo por ambiente; se muestra RC 0001-00000001
  fecha              date not null,
  cliente_id         bigint not null references public.ventas_clientes(id),
  total_medios       numeric(14,2) not null default 0 check (total_medios >= 0),
  total_retenciones  numeric(14,2) not null default 0 check (total_retenciones >= 0),
  total              numeric(14,2) not null check (total > 0),
  aplicado           numeric(14,2) not null default 0 check (aplicado >= 0),
  a_cuenta           numeric(14,2) not null check (a_cuenta >= 0),
  estado             text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  anulado_motivo     text,
  anulado_por        uuid references auth.users(id),
  anulado_el         timestamptz,
  obs                text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  updated_by         uuid references auth.users(id),
  constraint ventas_cobros_total_chk    check (total = total_medios + total_retenciones),
  constraint ventas_cobros_cuenta_chk   check (a_cuenta = total - aplicado),
  constraint ventas_cobros_anulado_chk  check ((estado = 'anulado') = (anulado_el is not null)
                                               and (estado <> 'anulado' or length(btrim(coalesce(anulado_motivo, ''))) > 0))
);
comment on table public.ventas_cobros is
  'Recibo de cobranza (RC). total = medios + retenciones; aplicado = Σ imputaciones vigentes; a_cuenta = total − aplicado. Se anula, no se borra. Contenido solo por RPC ventas_*. 20260924k.';

create unique index ventas_cobros_numero_uidx on public.ventas_cobros (ambiente, numero);
create index ventas_cobros_cliente_idx on public.ventas_cobros (cliente_id, fecha desc);
create index ventas_cobros_fecha_idx on public.ventas_cobros (fecha desc, id desc);
create index ventas_cobros_a_cuenta_idx on public.ventas_cobros (cliente_id) where estado = 'vigente' and a_cuenta > 0;

create table public.ventas_cobro_medios (
  id                  bigserial primary key,
  cobro_id            bigint not null references public.ventas_cobros(id),
  orden               smallint not null check (orden >= 1),
  forma               text not null check (forma in ('transferencia', 'cheque', 'echeq', 'efectivo', 'otro')),
  importe             numeric(14,2) not null check (importe > 0),
  cuenta_bancaria_id  bigint references public.ventas_cuentas_bancarias(id),
  cheque_numero       text,
  cheque_banco        text,
  cheque_librador     text,
  cheque_fecha_cobro  date,
  obs                 text not null default '',
  created_at          timestamptz not null default now(),
  constraint ventas_cobro_medios_orden_uidx unique (cobro_id, orden),
  constraint ventas_cobro_medios_transf_chk check (forma <> 'transferencia' or cuenta_bancaria_id is not null),
  constraint ventas_cobro_medios_cheque_chk check (
    forma not in ('cheque', 'echeq')
    or (length(btrim(coalesce(cheque_numero, ''))) > 0 and length(btrim(coalesce(cheque_banco, ''))) > 0
        and length(btrim(coalesce(cheque_librador, ''))) > 0 and cheque_fecha_cobro is not null))
);
create index ventas_cobro_medios_cobro_idx on public.ventas_cobro_medios (cobro_id);
create index ventas_cobro_medios_cheque_idx on public.ventas_cobro_medios (upper(btrim(cheque_numero)))
  where cheque_numero is not null;
comment on table public.ventas_cobro_medios is
  'Medios de pago de un cobro. Transferencia → cuenta de CADINC obligatoria; cheque/echeq → número, banco, librador y fecha de cobro obligatorios. 20260924k.';

create table public.ventas_cobro_retenciones (
  id                  bigserial primary key,
  cobro_id            bigint not null references public.ventas_cobros(id),
  orden               smallint not null check (orden >= 1),
  -- iibb, tem (Tributo Económico Municipal, Tucumán), suss, ganancias, iva, otra.
  tipo                text not null check (tipo in ('iibb', 'tem', 'suss', 'ganancias', 'iva', 'otra')),
  jurisdiccion        text not null default '',
  certificado_numero  text not null default '',
  fecha               date not null,
  importe             numeric(14,2) not null check (importe > 0),
  -- Certificado escaneado en el bucket privado ventas-docs.
  adjunto_path        text,
  adjunto_nombre      text,
  adjunto_hash        text check (adjunto_hash is null or adjunto_hash ~ '^[0-9a-f]{64}$'),
  adjunto_mime        text,
  adjunto_size        bigint check (adjunto_size is null or adjunto_size > 0),
  obs                 text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id),
  constraint ventas_cobro_retenciones_orden_uidx unique (cobro_id, orden),
  constraint ventas_cobro_retenciones_adjunto_chk check ((adjunto_path is null) = (adjunto_hash is null))
);
create index ventas_cobro_retenciones_cobro_idx on public.ventas_cobro_retenciones (cobro_id);
create unique index ventas_cobro_retenciones_hash_uidx on public.ventas_cobro_retenciones (cobro_id, adjunto_hash)
  where adjunto_hash is not null;
create index ventas_cobro_retenciones_hash_idx on public.ventas_cobro_retenciones (adjunto_hash) where adjunto_hash is not null;
create index ventas_cobro_retenciones_cert_idx on public.ventas_cobro_retenciones (tipo, upper(btrim(certificado_numero)))
  where certificado_numero <> '';
comment on table public.ventas_cobro_retenciones is
  'Retenciones sufridas en un cobro (certificados). tipo: iibb | tem (Tributo Económico Municipal) | suss | ganancias | iva | otra. El adjunto (ventas-docs) es lo único editable a mano. 20260924k.';

create table public.ventas_imputaciones (
  id              bigserial primary key,
  -- ORIGEN: exactamente uno.
  cobro_id        bigint references public.ventas_cobros(id),
  nc_factura_id   bigint references public.ventas_facturas(id),              -- NC propia (3/8/203) autorizada
  nc_externo_id   bigint references public.ventas_comprobantes_externos(id), -- NC externa
  -- DESTINO: exactamente uno.
  factura_id      bigint references public.ventas_facturas(id),              -- FA/FB/FCE autorizada, nunca NC
  externo_id      bigint references public.ventas_comprobantes_externos(id), -- FC/ND externa
  importe         numeric(14,2) not null check (importe > 0),
  fecha           date not null,
  anulada         boolean not null default false,
  anulada_por     uuid references auth.users(id),
  anulada_el      timestamptz,
  anulada_motivo  text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  constraint ventas_imputaciones_origen_chk  check (num_nonnulls(cobro_id, nc_factura_id, nc_externo_id) = 1),
  constraint ventas_imputaciones_destino_chk check (num_nonnulls(factura_id, externo_id) = 1),
  constraint ventas_imputaciones_self_chk    check (nc_factura_id is null or factura_id is null or nc_factura_id <> factura_id),
  constraint ventas_imputaciones_anulada_chk check (anulada = (anulada_el is not null))
);
comment on table public.ventas_imputaciones is
  'Aplicación de un crédito (cobro, NC propia o NC externa) a un débito (factura del ERP o FC/ND externa). Una anulada no cuenta. Solo por RPC. 20260924k.';
create index ventas_imputaciones_cobro_idx     on public.ventas_imputaciones (cobro_id)      where cobro_id is not null;
create index ventas_imputaciones_nc_fact_idx   on public.ventas_imputaciones (nc_factura_id) where nc_factura_id is not null;
create index ventas_imputaciones_nc_ext_idx    on public.ventas_imputaciones (nc_externo_id) where nc_externo_id is not null;
create index ventas_imputaciones_factura_idx   on public.ventas_imputaciones (factura_id)    where factura_id is not null;
create index ventas_imputaciones_externo_idx   on public.ventas_imputaciones (externo_id)    where externo_id is not null;

-- OJO: esta versión tiene un bug (lee new.adjunto_hash en tablas que no lo
-- tienen → 42703 en el INSERT de ventas_cobros). Lo corrige 20260924m.
-- Guard común de cobros, medios, retenciones e imputaciones:
--   · INSERT solo desde las RPC (cadinc.ventas_rpc).
--   · UPDATE solo desde las RPC, salvo columnas libres: obs del cobro y el
--     adjunto de la retención (el backend lo registra tras subir el archivo).
--   · DELETE nunca: se anula.
create or replace function public.fn_ventas_cobros_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_rpc    boolean := coalesce(current_setting('cadinc.ventas_rpc', true), '') = 'on';
  v_libres text[] := case tg_table_name
    when 'ventas_cobros' then array['obs', 'updated_at', 'updated_by']
    when 'ventas_cobro_retenciones' then array['adjunto_path', 'adjunto_nombre', 'adjunto_hash', 'adjunto_mime',
                                               'adjunto_size', 'obs', 'updated_at', 'updated_by']
    else array[]::text[] end;
  v_otra   bigint;
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'COBRO_NO_BORRABLE' using errcode = 'P0001',
      detail = json_build_object('tabla', tg_table_name, 'id', old.id)::text;
  end if;
  if tg_op = 'INSERT' and not v_rpc then
    raise exception 'VENTAS_SOLO_RPC' using errcode = 'P0001',
      detail = json_build_object('tabla', tg_table_name, 'operacion', 'insert')::text;
  end if;
  if tg_op = 'UPDATE' and not v_rpc
     and (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'VENTAS_SOLO_RPC' using errcode = 'P0001',
      detail = json_build_object('tabla', tg_table_name, 'id', old.id)::text;
  end if;
  -- Un mismo certificado escaneado no se adjunta a dos retenciones de cobros vigentes.
  if tg_table_name = 'ventas_cobro_retenciones' and new.adjunto_hash is not null
     and (tg_op = 'INSERT' or new.adjunto_hash is distinct from old.adjunto_hash) then
    select r.id into v_otra
      from public.ventas_cobro_retenciones r join public.ventas_cobros c on c.id = r.cobro_id
     where r.adjunto_hash = new.adjunto_hash and r.id <> new.id and c.estado = 'vigente'
     limit 1;
    if v_otra is not null then
      raise exception 'RETENCION_ADJUNTO_DUPLICADO' using errcode = 'P0001',
        detail = json_build_object('retencion_id', new.id, 'otra_retencion_id', v_otra)::text;
    end if;
  end if;
  return new;
end $$;

create trigger trg_ventas_cobros_guard before insert or update or delete on public.ventas_cobros
  for each row execute function public.fn_ventas_cobros_guard();
create trigger trg_ventas_cobro_medios_guard before insert or update or delete on public.ventas_cobro_medios
  for each row execute function public.fn_ventas_cobros_guard();
create trigger trg_ventas_cobro_retenciones_guard before insert or update or delete on public.ventas_cobro_retenciones
  for each row execute function public.fn_ventas_cobros_guard();
create trigger trg_ventas_imputaciones_guard before insert or update or delete on public.ventas_imputaciones
  for each row execute function public.fn_ventas_cobros_guard();

create trigger trg_ventas_cobros_touch before update on public.ventas_cobros
  for each row execute function public.set_updated_at();
create trigger trg_ventas_cobro_retenciones_touch before update on public.ventas_cobro_retenciones
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_cobros
  for each row execute function public.audit_cambios('facturacion', 'cobro', 'id');
create trigger trg_audit_cambios after update on public.ventas_imputaciones
  for each row execute function public.audit_cambios('facturacion', 'imputación', 'id');

-- ── 6. Bucket ventas-docs ─────────────────────────────────────────────
-- Guarda:
--   retenciones/<cobro_id>/<uuid>.<ext>    → ventas_cobro_retenciones.adjunto_path
--   retenciones/pendientes/<uuid>.<ext>    → subido ANTES de que exista el cobro
-- Sin policies en storage.objects: flujo firmado con service_role (como pagos-docs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ventas-docs', 'ventas-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── RLS + grants ──────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['ventas_comprobantes_externos', 'ventas_cobros', 'ventas_cobro_medios',
                           'ventas_cobro_retenciones', 'ventas_imputaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t || '_id_seq');
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['fn_ventas_factura_guard()', 'fn_ventas_factura_vence()', 'fn_ventas_externo_guard()',
                           'fn_ventas_cobros_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
