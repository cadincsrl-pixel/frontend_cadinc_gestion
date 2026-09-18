-- =====================================================================
-- Módulo Pagos, fase 1 — tablas (2026-09-18)
--
-- Facturas de proveedor, aprobación, centro de costo por obra y órdenes de
-- pago. Diseño v3 (Obsidian › Proyectos › Módulo Pagos) más las 12 decisiones
-- del dueño del 18/09:
--
--   * Módulo INDEPENDIENTE: la única tabla compartida es `obras` (centro de
--     costo por FK). Nada referencia facturas_compra, solicitudes, MCC ni caja.
--     Padrón de proveedores propio (`pagos_proveedores`), sin FK ni cruce con
--     el de Compras.
--   * Sin retenciones (decisión 6): no hay columna ni aritmética de retención.
--   * Sin tope de "ya está pagada al cargar" (decisión 3): la restricción por
--     forma (compras solo tarjeta/efectivo) la aplica el backend y la RPC.
--   * La NOTA DE CRÉDITO va como LÍNEA de la orden de pago (decisión 7), no
--     como OP aparte: pagos_orden_lineas.tipo in (factura, a_cuenta,
--     nota_credito). Aritmética:
--       saldo factura  = total − Σ líneas factura vigentes − Σ líneas NC vigentes
--       plata que sale = monto_pagado = Σ factura + Σ a_cuenta  (la NC no suma)
--       monto_nc       = Σ nota_credito
--     Una OP puede ser solo NC: monto_pagado = 0 y forma_pago = 'nota_credito'
--     (CHECK pagos_ordenes_nc_chk lo ata en los dos sentidos).
--   * Todos los importes son FINALES, con IVA (CLAUDE.md §5.14).
--   * Base cerrada a escritura directa: escribe solo service_role (backend).
--     Nada usa auth.uid(); los triggers de auditoría usan usuario_actual().
--
-- Invariantes que sostienen los triggers de esta migración:
--   * Lo que mueve plata de una factura con pagos vigentes es inmutable
--     (fn_pagos_factura_congelada → FACTURA_CON_PAGOS), con el escape
--     `set local cadinc.descongelar = 'on'` SOLO desde una migración con motivo.
--   * Editar algo de CAMPOS_QUE_DESAPRUEBAN, el reparto o la cuenta del
--     proveedor devuelve una `aprobada` a `pendiente` (tres triggers).
--   * `estado` monetario (pagada_parcial / pagada) lo escribe SOLO
--     _pagos_recalcular_estado (GUC cadinc.pagos_recalc), y `aprobada` +
--     aprobada_por/at SOLO pagos_aprobar_factura (GUC cadinc.pagos_aprobar).
--     Un update a mano rebota con ESTADO_SOLO_RECALCULADOR / APROBACION_SOLO_RPC.
--   * Las líneas de una OP y lo financiero de la OP no se tocan nunca
--     (ORDEN_INMUTABLE): se anula y se hace otra.
-- =====================================================================

-- ── Helpers ───────────────────────────────────────────────────────────

-- Hoy en hora argentina (misma expresión que 20260806_fecha_cierre_y_cobro).
create or replace function public.hoy_ar() returns date
language sql stable set search_path = public, pg_temp
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- CBU: 22 dígitos con los DOS verificadores.
-- bloque 1 = 7 dígitos + verificador (pesos 7,1,3,9,7,1,3)
-- bloque 2 = 13 dígitos + verificador (pesos 3,9,7,1,3,9,7,1,3,9,7,1,3)
create or replace function public.cbu_valido(p text) returns boolean
language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  w1 int[] := array[7,1,3,9,7,1,3];
  w2 int[] := array[3,9,7,1,3,9,7,1,3,9,7,1,3];
  s  int := 0;
  i  int;
begin
  if p is null or p !~ '^[0-9]{22}$' then return false; end if;
  for i in 1..7 loop s := s + substr(p, i, 1)::int * w1[i]; end loop;
  if (10 - s % 10) % 10 <> substr(p, 8, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + substr(p, 8 + i, 1)::int * w2[i]; end loop;
  return (10 - s % 10) % 10 = substr(p, 22, 1)::int;
end $$;

-- ── pagos_proveedores — el padrón propio ──────────────────────────────

create table public.pagos_proveedores (
  id                bigserial primary key,
  razon_social      text not null check (length(btrim(razon_social)) >= 3),
  razon_social_norm text not null default '',                      -- norm_txt(razon_social); lo mantiene un trigger
  cuit              text check (cuit is null or cuit ~ '^[0-9]{11}$'),
  alias_cbu         text check (alias_cbu is null or alias_cbu ~ '^[a-z0-9.-]{6,20}$'),
  cbu               text check (cbu is null or public.cbu_valido(cbu)),
  banco             text not null default '',
  plazo_pago_dias   int  not null default 30 check (plazo_pago_dias between 0 and 365),
  contacto          text not null default '',
  telefono          text not null default '',
  email             text not null default '',
  obs               text not null default '',
  activo            boolean not null default true,
  baja_motivo       text,
  baja_por          uuid references auth.users(id),
  baja_at           timestamptz,
  datos_pago_actualizados_at  timestamptz,
  datos_pago_actualizados_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint pagos_proveedores_baja_chk check (activo or baja_motivo is not null)
);
comment on table public.pagos_proveedores is 'Padrón propio del módulo Pagos (CUIT, alias, CBU). Sin FK ni sincronización con proveedores (Compras): decisión del dueño 17/09.';

-- Dedup GLOBAL (no mira activo): un dado de baja no se duplica, se reactiva. NULL no choca.
create unique index pagos_proveedores_cuit_uidx  on public.pagos_proveedores (cuit);
create unique index pagos_proveedores_cbu_uidx   on public.pagos_proveedores (cbu);
create unique index pagos_proveedores_alias_uidx on public.pagos_proveedores (alias_cbu);
create index pagos_proveedores_norm_trgm_idx on public.pagos_proveedores using gin (razon_social_norm gin_trgm_ops);
create index pagos_proveedores_activo_idx on public.pagos_proveedores (activo, razon_social_norm);

create or replace function public.fn_pagos_proveedor_norm() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.razon_social_norm := public.norm_txt(new.razon_social);
  return new;
end $$;
create trigger trg_pagos_proveedor_a_norm before insert or update of razon_social on public.pagos_proveedores
  for each row execute function public.fn_pagos_proveedor_norm();

-- Cambiar la cuenta destino de un proveedor con facturas aprobadas sin pagar
-- las devuelve a pendiente (el aprobador aprobó pagar a ESA cuenta).
create or replace function public.fn_pagos_proveedor_cuenta_cambiada() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.cbu is distinct from old.cbu or new.alias_cbu is distinct from old.alias_cbu then
    new.datos_pago_actualizados_at  := now();
    new.datos_pago_actualizados_por := coalesce(new.updated_by, public.usuario_actual());
    if coalesce(current_setting('cadinc.descongelar', true), '') <> 'on' then
      update public.pagos_facturas
         set estado = 'pendiente', aprobada_por = null, aprobada_at = null,
             obs = rtrim(obs || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — aprobación retirada: cambió la cuenta del proveedor')
       where proveedor_id = new.id and estado = 'aprobada';
    end if;
  end if;
  return new;
end $$;
create trigger trg_pagos_proveedor_cuenta_cambiada before update of cbu, alias_cbu on public.pagos_proveedores
  for each row execute function public.fn_pagos_proveedor_cuenta_cambiada();

create trigger trg_pagos_proveedores_touch before update on public.pagos_proveedores
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_proveedores
  for each row execute function public.audit_cambios('pagos', 'proveedor (pagos)', 'id');
create trigger trg_audit_borrado after delete on public.pagos_proveedores
  for each row execute function public.audit_borrado('pagos', 'proveedor (pagos)', 'id');

-- ── pagos_facturas — el comprobante del proveedor ─────────────────────

create table public.pagos_facturas (
  id                  bigserial primary key,
  proveedor_id        bigint not null references public.pagos_proveedores(id),
  tipo_comprobante    text not null check (tipo_comprobante in ('A','B','C','recibo','ticket','otro')),
  numero              text,                                   -- como se tipeó; NULL permitido (llega después)
  numero_norm         text,                                   -- lo calcula el backend (normNumeroFactura); fallback norm_txt en la RPC
  fecha               date not null,
  vence_el            date,                                   -- opcional (decisión 5)
  neto                numeric(14,2) check (neto is null or neto >= 0),
  iva                 numeric(14,2) check (iva  is null or iva  >= 0),
  percepciones        numeric(14,2) check (percepciones is null or percepciones >= 0),
  otros               numeric(14,2),                          -- con signo
  total               numeric(14,2) not null check (total > 0),   -- FINAL con IVA
  imputable           numeric(14,2) generated always as (total - coalesce(percepciones, 0)) stored,
  forma_pago_prevista text not null default 'transferencia'
                      check (forma_pago_prevista in ('efectivo','transferencia','tarjeta','cheque','echeq','debito_automatico','cta_cte','otro')),
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente','observada','aprobada','pagada_parcial','pagada','anulada')),
  paga_cliente        boolean not null default false,
  pagada_al_cargar    boolean not null default false,
  aprobada_por        uuid references auth.users(id),
  aprobada_at         timestamptz,
  motivo_observacion  text,
  observada_por       uuid references auth.users(id),
  observada_at        timestamptz,
  motivo_anulacion    text,
  anulado_por         uuid references auth.users(id),
  anulado_at          timestamptz,
  descripcion         text not null check (length(btrim(descripcion)) >= 3),
  obs                 text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint pagos_facturas_observada_chk check (estado <> 'observada' or motivo_observacion is not null),
  constraint pagos_facturas_anulada_chk   check (estado <> 'anulada'   or motivo_anulacion   is not null),
  constraint pagos_facturas_vence_chk     check (vence_el is null or vence_el >= fecha),
  constraint pagos_facturas_numero_chk    check ((numero is null) = (numero_norm is null)),
  constraint pagos_facturas_aprob_par_chk check ((aprobada_por is null) = (aprobada_at is null)),
  constraint pagos_facturas_aprob_est_chk check (estado not in ('pendiente','observada') or aprobada_at is null),
  constraint pagos_facturas_aprob_pag_chk check (estado not in ('aprobada','pagada_parcial','pagada') or aprobada_at is not null or pagada_al_cargar)
);
comment on table public.pagos_facturas is 'Facturas de proveedor a pagar. Estado por factura; saldo derivado en v_pagos_facturas (total − pagos − notas de crédito vigentes).';

create unique index pagos_facturas_prov_tipo_numero_uidx on public.pagos_facturas (proveedor_id, tipo_comprobante, numero_norm)
  where numero_norm is not null and tipo_comprobante in ('A','B','C') and estado <> 'anulada';
create index pagos_facturas_proveedor_idx   on public.pagos_facturas (proveedor_id);
create index pagos_facturas_estado_idx      on public.pagos_facturas (estado);
create index pagos_facturas_fecha_idx       on public.pagos_facturas (fecha desc, id desc);
create index pagos_facturas_abiertas_idx    on public.pagos_facturas (vence_el)
  where estado in ('pendiente','observada','aprobada','pagada_parcial') and not paga_cliente;
create index pagos_facturas_sin_revisar_idx on public.pagos_facturas (created_at)
  where pagada_al_cargar and aprobada_at is null and estado <> 'anulada';

-- Congelado de lo que mueve plata (solo si el valor realmente cambia).
create or replace function public.fn_pagos_factura_congelada() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if old.estado in ('pagada_parcial','pagada') and (
       new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
    or new.neto is distinct from old.neto or new.iva is distinct from old.iva
    or new.percepciones is distinct from old.percepciones or new.otros is distinct from old.otros
    or new.total is distinct from old.total) then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', old.id, 'estado', old.estado)::text;
  end if;
  return new;
end $$;
create trigger trg_pagos_factura_congelada before update of proveedor_id, fecha, neto, iva, percepciones, otros, total
  on public.pagos_facturas for each row execute function public.fn_pagos_factura_congelada();

-- CAMPOS_QUE_DESAPRUEBAN (lista cerrada; el backend testea la suya contra esta).
create or replace function public.fn_pagos_factura_desaprobar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if old.estado = 'aprobada' and (
       new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
    or new.total is distinct from old.total or new.neto is distinct from old.neto or new.iva is distinct from old.iva
    or new.percepciones is distinct from old.percepciones or new.otros is distinct from old.otros
    or new.paga_cliente is distinct from old.paga_cliente or new.vence_el is distinct from old.vence_el
    or new.forma_pago_prevista is distinct from old.forma_pago_prevista) then
    new.estado := 'pendiente';
    new.aprobada_por := null;
    new.aprobada_at := null;
  end if;
  return new;
end $$;
create trigger trg_pagos_factura_desaprobar before update of proveedor_id, fecha, total, neto, iva, percepciones, otros, paga_cliente, vence_el, forma_pago_prevista
  on public.pagos_facturas for each row execute function public.fn_pagos_factura_desaprobar();

-- Guards: estado monetario solo del recalculador; aprobación solo de la RPC.
create or replace function public.fn_pagos_factura_estado_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if new.pagada_al_cargar is distinct from old.pagada_al_cargar then
    raise exception 'PAGADA_AL_CARGAR_INMUTABLE' using errcode = 'P0001';
  end if;
  if coalesce(current_setting('cadinc.pagos_recalc', true), '') <> 'on'
     and new.estado is distinct from old.estado
     and (new.estado in ('pagada_parcial','pagada') or old.estado in ('pagada_parcial','pagada')) then
    raise exception 'ESTADO_SOLO_RECALCULADOR' using errcode = 'P0001',
      detail = json_build_object('factura_id', old.id, 'de', old.estado, 'a', new.estado)::text;
  end if;
  if coalesce(current_setting('cadinc.pagos_aprobar', true), '') <> 'on'
     and coalesce(current_setting('cadinc.pagos_recalc', true), '') <> 'on'
     and ((new.estado = 'aprobada' and old.estado <> 'aprobada')
          or (new.aprobada_por is not null and new.aprobada_por is distinct from old.aprobada_por)
          or (new.aprobada_at is not null and new.aprobada_at is distinct from old.aprobada_at)) then
    raise exception 'APROBACION_SOLO_RPC' using errcode = 'P0001',
      detail = json_build_object('factura_id', old.id)::text;
  end if;
  return new;
end $$;
create trigger trg_pagos_factura_estado_guard before update of estado, aprobada_por, aprobada_at, pagada_al_cargar
  on public.pagos_facturas for each row execute function public.fn_pagos_factura_estado_guard();

create trigger trg_pagos_facturas_touch before update on public.pagos_facturas
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_facturas
  for each row execute function public.audit_cambios('pagos', 'factura de proveedor', 'id');
create trigger trg_audit_borrado after delete on public.pagos_facturas
  for each row execute function public.audit_borrado('pagos', 'factura de proveedor', 'id');

-- ── pagos_imputaciones — centro de costo = obra, por monto ────────────

create table public.pagos_imputaciones (
  id          bigserial primary key,
  factura_id  bigint not null references public.pagos_facturas(id) on delete cascade,
  obra_cod    text   not null references public.obras(cod),
  monto       numeric(14,2) not null check (monto > 0),
  obs         text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
comment on table public.pagos_imputaciones is 'Reparto de pagos_facturas.imputable entre obras (centro de costo = obras.cod). El agrupador cliente se deriva de obras.cc al consultar, nunca se copia.';
create unique index pagos_imputaciones_factura_obra_uidx on public.pagos_imputaciones (factura_id, obra_cod);
create index pagos_imputaciones_obra_idx on public.pagos_imputaciones (obra_cod);

-- Tocar el reparto de una APROBADA la desaprueba (sobre pagada/parcial no hace nada).
create or replace function public.fn_pagos_imputacion_desaprobar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return coalesce(new, old); end if;
  update public.pagos_facturas
     set estado = 'pendiente', aprobada_por = null, aprobada_at = null
   where id = coalesce(new.factura_id, old.factura_id) and estado = 'aprobada';
  return coalesce(new, old);
end $$;
create trigger trg_pagos_imputacion_desaprobar after insert or update or delete on public.pagos_imputaciones
  for each row execute function public.fn_pagos_imputacion_desaprobar();

create trigger trg_pagos_imputaciones_touch before update on public.pagos_imputaciones
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_imputaciones
  for each row execute function public.audit_cambios('pagos', 'imputación', 'id');
create trigger trg_audit_borrado after delete on public.pagos_imputaciones
  for each row execute function public.audit_borrado('pagos', 'imputación', 'id');

-- ── pagos_ordenes — la orden de pago ──────────────────────────────────

create table public.pagos_ordenes (
  id               bigserial primary key,
  numero           int  not null unique,                     -- lo asigna la RPC al FINAL (advisory lock); se muestra 'OP-0001'
  proveedor_id     bigint not null references public.pagos_proveedores(id),
  fecha            date not null,
  fecha_cobro      date,                                     -- cheque / e-cheq
  forma_pago       text not null check (forma_pago in
                     ('efectivo','transferencia','cheque','echeq','tarjeta','debito_automatico','nota_credito','otro')),
  referencia       text not null default '',
  cbu_destino      text,                                     -- FOTO del padrón al registrar (la copia la RPC)
  alias_destino    text,
  monto_pagado     numeric(14,2) not null check (monto_pagado >= 0),        -- Σ factura + Σ a_cuenta: lo que sale del banco
  monto_nc         numeric(14,2) not null default 0 check (monto_nc >= 0), -- Σ nota_credito: baja saldo sin plata
  monto_aplicado   numeric(14,2) generated always as (monto_pagado + monto_nc) stored,
  estado           text not null default 'emitida' check (estado in ('emitida','anulada')),
  motivo_anulacion text,
  anulado_por      uuid references auth.users(id),
  anulado_at       timestamptz,
  obs              text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint pagos_ordenes_algo_chk        check (monto_pagado + monto_nc > 0),
  constraint pagos_ordenes_nc_chk          check ((forma_pago = 'nota_credito') = (monto_pagado = 0)),
  constraint pagos_ordenes_anulada_chk     check (estado <> 'anulada' or motivo_anulacion is not null),
  constraint pagos_ordenes_fecha_cobro_chk check (forma_pago not in ('cheque','echeq') or fecha_cobro is not null),
  constraint pagos_ordenes_cobro_orden_chk check (fecha_cobro is null or fecha_cobro >= fecha),
  constraint pagos_ordenes_destino_chk     check (forma_pago <> 'transferencia' or cbu_destino is not null or alias_destino is not null)
);
comment on table public.pagos_ordenes is 'Orden de pago: un proveedor, una forma, una cuenta destino, un comprobante. monto_pagado = plata que sale; monto_nc = notas de crédito aplicadas (no suman plata). Inmutable: se anula y se hace otra.';
create index pagos_ordenes_proveedor_idx on public.pagos_ordenes (proveedor_id);
create index pagos_ordenes_fecha_idx     on public.pagos_ordenes (fecha desc, id desc);
create index pagos_ordenes_cartera_idx   on public.pagos_ordenes (fecha_cobro) where estado = 'emitida' and fecha_cobro is not null;

create or replace function public.fn_pagos_orden_congelada() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
     or new.fecha_cobro is distinct from old.fecha_cobro or new.forma_pago is distinct from old.forma_pago
     or new.monto_pagado is distinct from old.monto_pagado or new.monto_nc is distinct from old.monto_nc
     or new.cbu_destino is distinct from old.cbu_destino or new.alias_destino is distinct from old.alias_destino
     or new.numero is distinct from old.numero then
    raise exception 'ORDEN_INMUTABLE' using errcode = 'P0001',
      detail = json_build_object('orden_id', old.id)::text;
  end if;
  return new;
end $$;
create trigger trg_pagos_orden_congelada before update of proveedor_id, fecha, fecha_cobro, forma_pago, monto_pagado, monto_nc, cbu_destino, alias_destino, numero
  on public.pagos_ordenes for each row execute function public.fn_pagos_orden_congelada();

create trigger trg_pagos_ordenes_touch before update on public.pagos_ordenes
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_ordenes
  for each row execute function public.audit_cambios('pagos', 'orden de pago', 'id');
create trigger trg_audit_borrado after delete on public.pagos_ordenes
  for each row execute function public.audit_borrado('pagos', 'orden de pago', 'id');

-- ── pagos_orden_lineas — factura | a_cuenta | nota_credito ────────────

create table public.pagos_orden_lineas (
  id          bigserial primary key,
  orden_id    bigint not null references public.pagos_ordenes(id) on delete cascade,
  tipo        text   not null default 'factura' check (tipo in ('factura','a_cuenta','nota_credito')),
  factura_id  bigint references public.pagos_facturas(id),
  monto       numeric(14,2) not null check (monto > 0),
  nc_numero   text,                                          -- solo nota_credito: número de la NC del proveedor
  nc_fecha    date,                                          -- solo nota_credito: fecha de la NC
  created_at  timestamptz not null default now(),
  constraint pagos_orden_lineas_factura_chk check ((tipo = 'a_cuenta') = (factura_id is null)),
  constraint pagos_orden_lineas_nc_chk      check (
    (tipo = 'nota_credito' and length(btrim(coalesce(nc_numero, ''))) > 0 and nc_fecha is not null)
    or (tipo <> 'nota_credito' and nc_numero is null and nc_fecha is null))
);
comment on table public.pagos_orden_lineas is 'Líneas de la OP. factura: paga (parte de) una factura; a_cuenta: anticipo sin factura; nota_credito: acredita una factura sin plata (nc_numero/nc_fecha, PDF en pagos_ordenes_adjuntos tipo nota_credito).';
-- Una misma factura puede tener en la misma OP una línea factura Y una línea NC, no dos del mismo tipo.
create unique index pagos_orden_lineas_uidx on public.pagos_orden_lineas (orden_id, factura_id, tipo) where factura_id is not null;
create index pagos_orden_lineas_factura_idx on public.pagos_orden_lineas (factura_id) where factura_id is not null;
create index pagos_orden_lineas_orden_idx   on public.pagos_orden_lineas (orden_id);

create or replace function public.fn_pagos_linea_inmutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return coalesce(new, old); end if;
  raise exception 'ORDEN_INMUTABLE' using errcode = 'P0001',
    detail = json_build_object('orden_id', old.orden_id, 'linea_id', old.id)::text;
end $$;
create trigger trg_pagos_linea_inmutable before update or delete on public.pagos_orden_lineas
  for each row execute function public.fn_pagos_linea_inmutable();

-- ── Recalculador de estado (UNA función, con lock) ────────────────────
-- Único escritor de pagada_parcial / pagada. Al quedar sin aplicaciones
-- restaura `aprobada` SOLO si aprobada_at sigue cargado, si no `pendiente`:
-- nunca fabrica una aprobación.
create or replace function public._pagos_recalcular_estado(p_factura_id bigint) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_f        public.pagos_facturas%rowtype;
  v_aplicado numeric(14,2);
  v_nuevo    text;
begin
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then return; end if;
  select coalesce(sum(l.monto), 0) into v_aplicado
    from public.pagos_orden_lineas l
    join public.pagos_ordenes o on o.id = l.orden_id
   where l.factura_id = p_factura_id and o.estado = 'emitida' and l.tipo in ('factura','nota_credito');
  v_nuevo := case
    when v_f.estado = 'anulada'              then 'anulada'
    when v_aplicado >= v_f.total             then 'pagada'
    when v_aplicado > 0                      then 'pagada_parcial'
    when v_f.motivo_observacion is not null  then 'observada'
    when v_f.aprobada_at is not null         then 'aprobada'
    else 'pendiente' end;
  if v_nuevo is distinct from v_f.estado then
    perform set_config('cadinc.pagos_recalc', 'on', true);
    update public.pagos_facturas set estado = v_nuevo where id = p_factura_id;
    perform set_config('cadinc.pagos_recalc', 'off', true);
  end if;
end $$;

create or replace function public.fn_pagos_linea_recalc() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.factura_id is not null then
    perform public._pagos_recalcular_estado(new.factura_id);
  end if;
  if tg_op in ('UPDATE','DELETE') and old.factura_id is not null
     and (tg_op = 'DELETE' or old.factura_id is distinct from new.factura_id) then
    perform public._pagos_recalcular_estado(old.factura_id);
  end if;
  return null;
end $$;
create trigger trg_pagos_linea_recalc after insert or update or delete on public.pagos_orden_lineas
  for each row execute function public.fn_pagos_linea_recalc();

create or replace function public.fn_pagos_orden_recalc() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_fid bigint;
begin
  for v_fid in
    select distinct l.factura_id from public.pagos_orden_lineas l
     where l.orden_id = new.id and l.factura_id is not null order by 1
  loop
    perform public._pagos_recalcular_estado(v_fid);
  end loop;
  return null;
end $$;
create trigger trg_pagos_orden_recalc after update of estado on public.pagos_ordenes
  for each row execute function public.fn_pagos_orden_recalc();

-- ── Adjuntos ──────────────────────────────────────────────────────────

create table public.pagos_facturas_adjuntos (
  id             bigserial primary key,
  factura_id     bigint not null references public.pagos_facturas(id) on delete cascade,
  tipo           text not null check (tipo in ('factura','remito','orden_compra','otro')),
  storage_path   text not null,            -- 'facturas/<id>/<uuid>.<ext>' en el bucket pagos-docs
  nombre_archivo text not null,
  hash_sha256    text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  obs            text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at     timestamptz
);
create index pagos_facturas_adjuntos_factura_idx on public.pagos_facturas_adjuntos (factura_id) where deleted_at is null;
-- Dedup GLOBAL solo para la factura en sí (el mismo PDF cargado dos veces); un remito compartido es válido.
create unique index pagos_facturas_adjuntos_hash_uidx on public.pagos_facturas_adjuntos (hash_sha256)
  where deleted_at is null and tipo = 'factura';
create unique index pagos_facturas_adjuntos_fact_hash_uidx on public.pagos_facturas_adjuntos (factura_id, hash_sha256)
  where deleted_at is null;
create trigger trg_pagos_facturas_adjuntos_touch before update on public.pagos_facturas_adjuntos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_facturas_adjuntos
  for each row execute function public.audit_cambios('pagos', 'adjunto de factura', 'id');
create trigger trg_audit_borrado after delete on public.pagos_facturas_adjuntos
  for each row execute function public.audit_borrado('pagos', 'adjunto de factura', 'id');

create table public.pagos_ordenes_adjuntos (
  id             bigserial primary key,
  orden_id       bigint not null references public.pagos_ordenes(id) on delete cascade,
  tipo           text not null check (tipo in ('comprobante_pago','nota_credito','otro')),
  storage_path   text not null,            -- 'ordenes/<id>/<uuid>.<ext>' (o 'ordenes/pendientes/<uuid>.<ext>' hasta el move)
  nombre_archivo text not null,
  hash_sha256    text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  obs            text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at     timestamptz
);
create index pagos_ordenes_adjuntos_orden_idx on public.pagos_ordenes_adjuntos (orden_id) where deleted_at is null;
-- Dedup por OP, no global: un extracto respalda legítimamente varias OP.
create unique index pagos_ordenes_adjuntos_orden_hash_uidx on public.pagos_ordenes_adjuntos (orden_id, hash_sha256) where deleted_at is null;
create index pagos_ordenes_adjuntos_hash_idx on public.pagos_ordenes_adjuntos (hash_sha256) where deleted_at is null;
create trigger trg_pagos_ordenes_adjuntos_touch before update on public.pagos_ordenes_adjuntos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.pagos_ordenes_adjuntos
  for each row execute function public.audit_cambios('pagos', 'adjunto de orden de pago', 'id');
create trigger trg_audit_borrado after delete on public.pagos_ordenes_adjuntos
  for each row execute function public.audit_borrado('pagos', 'adjunto de orden de pago', 'id');

-- ── RLS + grants ──────────────────────────────────────────────────────
-- Policy permisiva como el resto (backend-as-gateway); la seguridad real es
-- que anon/authenticated no tienen NINGÚN privilegio: escribe y lee solo
-- service_role (20260906q, 20260914d/e).
do $$
declare
  t text;
begin
  foreach t in array array['pagos_proveedores','pagos_facturas','pagos_imputaciones','pagos_ordenes',
                           'pagos_orden_lineas','pagos_facturas_adjuntos','pagos_ordenes_adjuntos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t || '_id_seq');
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $$;

revoke all on function public._pagos_recalcular_estado(bigint) from public, anon, authenticated;
grant execute on function public._pagos_recalcular_estado(bigint) to service_role;
