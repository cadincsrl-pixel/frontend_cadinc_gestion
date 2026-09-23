-- =====================================================================
-- Facturación electrónica de venta contra ARCA, fase 1 — tablas (2026-09-24)
--
-- Decisión del dueño (23/09): dejar de facturar en Finnegans. El ERP emite
-- contra ARCA (WSFE) en un punto de venta propio (00003) y alguien carga cada
-- factura A MANO en Finnegans; la bandeja «pendientes de cargar» sale de acá.
-- Plan: Obsidian › Proyectos › «Facturación electrónica ARCA - plan 2026-09-23».
--
-- Fase 1: Factura A (1) y NC A (3), solo homologación. El schema ya admite
-- 1, 3, 6, 8, 201, 203; el backend rechaza lo que no está habilitado
-- (TIPO_NO_HABILITADO).
--
-- Módulo INDEPENDIENTE como Pagos: padrón de clientes propio
-- (`ventas_clientes`), sin cruce con aridos_clientes ni con la cuenta
-- corriente. Lo único compartido son las obras: `obras.cliente_id` precarga el
-- cliente y `obras.cc` el centro de costo.
--
-- Invariantes que sostienen los triggers de esta migración:
--   * Una factura AUTORIZADA es inmutable: solo se tocan numero_finnegans,
--     registrada_at/por y obs_interna (FACTURA_AUTORIZADA_INMUTABLE). Nunca se
--     borra: se anula con una nota de crédito.
--   * Todo lo demás de una factura (contenido, estado, número, CAE) lo
--     escriben SOLO las RPC `ventas_*` (GUC cadinc.ventas_rpc); un UPDATE
--     suelto rebota con VENTAS_SOLO_RPC. Así los totales siempre son los que
--     calculó el server a partir de los renglones.
--   * Renglones, alícuotas y asociados se tocan solo mientras la factura es
--     borrador (FACTURA_NO_EDITABLE) y solo desde las RPC.
--   * Eventos y log de ARCA son de SOLO AGREGAR.
--   * Escape `set local cadinc.descongelar = 'on'` SOLO desde una migración
--     con motivo escrito (mismo criterio que MCC y Pagos).
--
-- Numeración (ARCA no asigna el número: se manda último + 1):
--   * lock por talonario = índice único parcial (ambiente, pto_vta, cbte_tipo)
--     sobre los estados `emitiendo` / `error_reconciliar`. Un segundo intento
--     en el mismo talonario rebota (la RPC lo traduce a EMISION_EN_CURSO).
--   * `numero_intentado` se persiste ANTES de llamar a ARCA; `numero` recién
--     con resultado A. El riesgo real es «ARCA autorizó y la respuesta no
--     llegó»: queda `error_reconciliar` y se resuelve con FECompConsultar.
--
-- Base cerrada: RLS permisiva como el resto (backend-as-gateway) y NINGÚN
-- privilegio para anon/authenticated, igual que Pagos en vivo (20260918a +
-- 20260914e: la lectura directa ya está cerrada). `arca_tokens` y el log de
-- ARCA tienen además motivo propio: token/sign de WSAA y XML fiscal.
-- =====================================================================

-- ── Tasa de IVA por Id de ARCA ────────────────────────────────────────
-- Ids de FEParamGetTiposIva: 3 = 0 %, 4 = 10,5 %, 5 = 21 %, 6 = 27 %,
-- 8 = 5 %, 9 = 2,5 %. Fase 1 usa 3/4/5 (21 % por defecto).
create or replace function public.ventas_tasa_iva(p_alicuota_id smallint)
returns numeric language sql immutable parallel safe set search_path = public, pg_temp as $$
  select case p_alicuota_id
           when 3 then 0::numeric
           when 4 then 0.105
           when 5 then 0.21
           when 6 then 0.27
           when 8 then 0.05
           when 9 then 0.025
         end
$$;
comment on function public.ventas_tasa_iva(smallint) is
  'Tasa de IVA para el Id de alícuota de ARCA (3=0, 4=10,5, 5=21, 6=27, 8=5, 9=2,5). NULL si el Id no existe.';

-- ── ventas_clientes — el padrón propio ────────────────────────────────

create table public.ventas_clientes (
  id                bigserial primary key,
  razon_social      text not null check (length(btrim(razon_social)) >= 2),
  razon_social_norm text not null default '',                 -- norm_txt(razon_social); lo mantiene un trigger
  doc_tipo          smallint not null default 80 check (doc_tipo in (80, 86, 96, 99)),   -- 80 CUIT, 86 CUIL, 96 DNI, 99 consumidor final
  doc_nro           text not null check (doc_nro ~ '^[0-9]{1,11}$'),
  condicion_iva_id  smallint not null check (condicion_iva_id between 1 and 16),       -- FEParamGetCondicionIvaReceptor (1 RI, 4 exento, 5 CF, 6 monotributo, …)
  domicilio         text not null default '',
  provincia         text not null default '',
  email             text not null default '',
  activo            boolean not null default true,
  obs               text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  -- CUIT/CUIL: 11 dígitos. El dígito verificador lo valida el backend (cuitValido).
  constraint ventas_clientes_cuit_chk check (doc_tipo not in (80, 86) or doc_nro ~ '^[0-9]{11}$')
);
comment on table public.ventas_clientes is
  'Padrón propio de clientes de Facturación (20260924a). Sin FK ni sincronización con aridos_clientes ni con Pagos.';

-- Un CUIT activo por cliente. Consumidor final (99) no choca: todos van con doc 0.
create unique index ventas_clientes_doc_uidx on public.ventas_clientes (doc_tipo, doc_nro)
  where activo and doc_tipo <> 99;
create index ventas_clientes_norm_trgm_idx on public.ventas_clientes using gin (razon_social_norm gin_trgm_ops);
create index ventas_clientes_activo_idx on public.ventas_clientes (activo, razon_social_norm);

create or replace function public.fn_ventas_cliente_norm() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.razon_social_norm := public.norm_txt(new.razon_social);
  return new;
end $$;
create trigger trg_ventas_cliente_a_norm before insert or update of razon_social on public.ventas_clientes
  for each row execute function public.fn_ventas_cliente_norm();
create trigger trg_ventas_clientes_touch before update on public.ventas_clientes
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_clientes
  for each row execute function public.audit_cambios('facturacion', 'cliente (facturación)', 'id');
create trigger trg_audit_borrado after delete on public.ventas_clientes
  for each row execute function public.audit_borrado('facturacion', 'cliente (facturación)', 'id');

-- ── obras.cliente_id — para precargar el cliente ──────────────────────

alter table public.obras
  add column if not exists cliente_id bigint references public.ventas_clientes(id);
create index if not exists obras_cliente_id_idx on public.obras (cliente_id) where cliente_id is not null;
comment on column public.obras.cliente_id is
  'Cliente de Facturación al que se le factura esta obra (20260924a). Solo precarga el formulario; la factura guarda su propia foto del receptor.';

-- ── ventas_facturas — el comprobante emitido ──────────────────────────

create table public.ventas_facturas (
  id                   bigserial primary key,
  ambiente             text not null check (ambiente in ('homo', 'prod')),
  pto_vta              int  not null check (pto_vta between 1 and 99998),
  cbte_tipo            smallint not null check (cbte_tipo in (1, 3, 6, 8, 201, 203)),
  numero               bigint check (numero between 1 and 99999999),              -- solo con resultado A
  numero_intentado     bigint check (numero_intentado between 1 and 99999999),    -- se persiste ANTES de llamar a ARCA
  estado               text not null default 'borrador'
                       check (estado in ('borrador', 'emitiendo', 'autorizada', 'rechazada', 'error_reconciliar', 'descartada')),
  concepto             smallint not null check (concepto in (1, 2, 3)),            -- 1 productos, 2 servicios, 3 productos y servicios
  fecha_cbte           date not null,
  fch_vto_pago         date,                                                        -- conceptos 2/3: = fecha_cbte (el dueño no usa período)
  cliente_id           bigint not null references public.ventas_clientes(id),
  -- Foto del receptor: la copian las RPC del padrón al guardar y al emitir.
  rec_razon_social     text not null,
  rec_doc_tipo         smallint not null,
  rec_doc_nro          text not null,
  rec_condicion_iva_id smallint not null,
  rec_domicilio        text not null default '',
  obra_cod             text references public.obras(cod),
  producto             text not null default 'AVANCE DE OBRA' check (producto in ('AVANCE DE OBRA', 'TRANSPORTE')),
  centro_costo         text,
  provincia_origen     text not null default 'Tucuman',
  provincia_destino    text not null default 'Tucuman',
  condicion_pago       text not null default 'Cc Clientes',
  remitos              text not null default '',
  observaciones        text not null default '',
  moneda               text not null default 'PES' check (moneda ~ '^[A-Z0-9]{3}$'),
  cotizacion           numeric(12,6) not null default 1 check (cotizacion > 0),
  imp_neto             numeric(14,2) not null default 0 check (imp_neto >= 0),
  imp_iva              numeric(14,2) not null default 0 check (imp_iva >= 0),
  imp_trib             numeric(14,2) not null default 0 check (imp_trib >= 0),
  imp_op_ex            numeric(14,2) not null default 0 check (imp_op_ex >= 0),
  imp_tot_conc         numeric(14,2) not null default 0 check (imp_tot_conc >= 0),
  imp_total            numeric(14,2) not null default 0 check (imp_total >= 0),
  cae                  text,
  cae_vto              date,
  resultado            text check (resultado in ('A', 'R', 'P')),
  observaciones_arca   jsonb,
  errores_arca         jsonb,
  intento_at           timestamptz,
  intento_n            int not null default 0 check (intento_n >= 0),
  emitida_por          uuid references auth.users(id),
  emitida_at           timestamptz,
  numero_finnegans     text,
  registrada_at        timestamptz,
  registrada_por       uuid references auth.users(id),
  obs_interna          text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint ventas_facturas_total_chk       check (imp_total = imp_neto + imp_iva + imp_trib + imp_op_ex + imp_tot_conc),
  constraint ventas_facturas_autorizada_chk  check (estado <> 'autorizada'
                                                   or (numero is not null and cae is not null and cae_vto is not null
                                                       and resultado = 'A' and emitida_at is not null)),
  constraint ventas_facturas_numero_chk      check (numero is null or estado = 'autorizada'),
  constraint ventas_facturas_cae_chk         check (cae is null or cae ~ '^[0-9]{14}$'),
  constraint ventas_facturas_cc_chk          check (producto <> 'AVANCE DE OBRA' or length(btrim(coalesce(centro_costo, ''))) > 0),
  constraint ventas_facturas_vto_pago_chk    check (concepto = 1 or (fch_vto_pago is not null and fch_vto_pago >= fecha_cbte)),
  constraint ventas_facturas_registro_chk    check ((numero_finnegans is null and registrada_at is null)
                                                   or (length(btrim(numero_finnegans)) > 0 and registrada_at is not null)),
  constraint ventas_facturas_registro_est_chk check (numero_finnegans is null or estado = 'autorizada')
);
comment on table public.ventas_facturas is
  'Comprobantes de venta emitidos contra ARCA (20260924a). Autorizada = inmutable (se anula con NC). Contenido y estado los escriben solo las RPC ventas_*.';
comment on column public.ventas_facturas.numero_intentado is
  'Número que se mandó (o se va a mandar) a ARCA en el intento en curso. Se persiste ANTES de la llamada para poder reconciliar con FECompConsultar.';
comment on column public.ventas_facturas.numero_finnegans is
  'Número del comprobante en Finnegans, cargado a mano al registrarlo (como pagos_ordenes, 20260923c). NULL = pendiente de cargar.';

-- Un número por talonario.
create unique index ventas_facturas_numero_uidx on public.ventas_facturas (ambiente, pto_vta, cbte_tipo, numero)
  where numero is not null;
-- EL LOCK: un solo comprobante en vuelo (o sin reconciliar) por talonario.
create unique index ventas_facturas_emision_lock_uidx on public.ventas_facturas (ambiente, pto_vta, cbte_tipo)
  where estado in ('emitiendo', 'error_reconciliar');
create index ventas_facturas_cliente_fecha_idx on public.ventas_facturas (cliente_id, fecha_cbte desc);
create index ventas_facturas_fecha_idx on public.ventas_facturas (fecha_cbte desc, id desc);
create index ventas_facturas_estado_idx on public.ventas_facturas (estado);
create index ventas_facturas_obra_idx on public.ventas_facturas (obra_cod) where obra_cod is not null;
-- Bandeja de Finnegans: autorizadas sin registrar.
create index ventas_facturas_pend_finnegans_idx on public.ventas_facturas (fecha_cbte, id)
  where estado = 'autorizada' and numero_finnegans is null;
-- UN número de Finnegans, UNA factura (el error típico de copiar y pegar).
create unique index ventas_facturas_numero_finnegans_uidx on public.ventas_facturas (upper(btrim(numero_finnegans)))
  where numero_finnegans is not null;

-- Guardia: autorizada inmutable + contenido/estado solo por RPC.
-- Columnas libres (las toca el registro de Finnegans o una nota interna):
--   numero_finnegans, registrada_at, registrada_por, obs_interna, updated_at, updated_by.
create or replace function public.fn_ventas_factura_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_libres text[] := array['numero_finnegans', 'registrada_at', 'registrada_por', 'obs_interna', 'updated_at', 'updated_by'];
  v_rpc    boolean := coalesce(current_setting('cadinc.ventas_rpc', true), '') = 'on';
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
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
create trigger trg_ventas_factura_guard before insert or update or delete on public.ventas_facturas
  for each row execute function public.fn_ventas_factura_guard();

create trigger trg_ventas_facturas_touch before update on public.ventas_facturas
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_facturas
  for each row execute function public.audit_cambios('facturacion', 'factura de venta', 'id');
create trigger trg_audit_borrado after delete on public.ventas_facturas
  for each row execute function public.audit_borrado('facturacion', 'factura de venta', 'id');

-- ── Satélites del comprobante ─────────────────────────────────────────

create table public.ventas_factura_renglones (
  id            bigserial primary key,
  factura_id    bigint not null references public.ventas_facturas(id) on delete cascade,
  orden         smallint not null check (orden >= 1),
  descripcion   text not null check (length(btrim(descripcion)) >= 1),
  cantidad      numeric(14,4) not null check (cantidad > 0),
  unidad        text not null default 'Unidades',
  precio_unit   numeric(16,3) not null check (precio_unit >= 0),               -- NETO, sin IVA
  alicuota_id   smallint not null default 5 check (public.ventas_tasa_iva(alicuota_id) is not null),
  importe_neto  numeric(14,2) not null check (importe_neto >= 0),             -- round(cantidad × precio_unit, 2)
  created_at    timestamptz not null default now(),
  constraint ventas_factura_renglones_orden_uidx unique (factura_id, orden)
);
comment on table public.ventas_factura_renglones is
  'Renglones de la factura. importe_neto = round(cantidad × precio_unit, 2). El IVA NO es por renglón: va por alícuota en ventas_factura_alicuotas.';

create table public.ventas_factura_alicuotas (
  id           bigserial primary key,
  factura_id   bigint not null references public.ventas_facturas(id) on delete cascade,
  alicuota_id  smallint not null check (public.ventas_tasa_iva(alicuota_id) is not null),
  base_imp     numeric(14,2) not null check (base_imp >= 0),                  -- Σ importe_neto de los renglones con esa alícuota
  importe      numeric(14,2) not null check (importe >= 0),                   -- round(base_imp × tasa, 2)
  created_at   timestamptz not null default now(),
  constraint ventas_factura_alicuotas_uidx unique (factura_id, alicuota_id)
);
comment on table public.ventas_factura_alicuotas is
  'Array Iva de WSFE: una fila por alícuota. importe = round(base_imp × tasa, 2), sobre la base agrupada.';

create table public.ventas_factura_asociados (
  id           bigserial primary key,
  factura_id   bigint not null references public.ventas_facturas(id) on delete cascade,   -- la NC
  asociada_id  bigint not null references public.ventas_facturas(id),                      -- la factura que corrige
  -- Foto para CbtesAsoc (la copia la RPC de la factura asociada).
  cbte_tipo    smallint not null,
  pto_vta      int not null,
  numero       bigint not null,
  cuit         text not null check (cuit ~ '^[0-9]{11}$'),                                -- CUIT del EMISOR (CADINC)
  fecha_cbte   date not null,
  created_at   timestamptz not null default now(),
  constraint ventas_factura_asociados_uidx unique (factura_id, asociada_id),
  constraint ventas_factura_asociados_self_chk check (factura_id <> asociada_id)
);
create index ventas_factura_asociados_asociada_idx on public.ventas_factura_asociados (asociada_id);
comment on table public.ventas_factura_asociados is
  'CbtesAsoc de una nota de crédito: la factura autorizada que corrige, con la foto de tipo, PV, número, CUIT emisor y fecha.';

-- Satélites: solo desde las RPC y solo mientras la factura es borrador.
create or replace function public.fn_ventas_satelite_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_fid    bigint := case when tg_op = 'DELETE' then old.factura_id else new.factura_id end;
  v_estado text;
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select estado into v_estado from public.ventas_facturas where id = v_fid;
  if not found and tg_op = 'DELETE' then
    return old;   -- cascada del borrado de un borrador (el guard de la factura ya lo permitió)
  end if;
  if v_estado is distinct from 'borrador' then
    raise exception 'FACTURA_NO_EDITABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', v_fid, 'estado', v_estado)::text;
  end if;
  if coalesce(current_setting('cadinc.ventas_rpc', true), '') <> 'on' then
    raise exception 'VENTAS_SOLO_RPC' using errcode = 'P0001',
      detail = json_build_object('factura_id', v_fid, 'tabla', tg_table_name)::text;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_ventas_renglones_guard before insert or update or delete on public.ventas_factura_renglones
  for each row execute function public.fn_ventas_satelite_guard();
create trigger trg_ventas_alicuotas_guard before insert or update or delete on public.ventas_factura_alicuotas
  for each row execute function public.fn_ventas_satelite_guard();
create trigger trg_ventas_asociados_guard before insert or update or delete on public.ventas_factura_asociados
  for each row execute function public.fn_ventas_satelite_guard();

-- ── Eventos (solo agregar) ────────────────────────────────────────────

create table public.ventas_factura_eventos (
  id             bigserial primary key,
  factura_id     bigint not null references public.ventas_facturas(id) on delete cascade,
  tipo           text not null check (tipo in ('creada', 'editada', 'emision_iniciada', 'intento', 'autorizada',
                                               'rechazada', 'error_reconciliar', 'vuelta_a_borrador', 'descartada',
                                               'registrada_finnegans', 'registro_deshecho')),
  estado_antes   text,
  estado_despues text,
  detalle        jsonb not null default '{}'::jsonb,
  user_id        uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index ventas_factura_eventos_factura_idx on public.ventas_factura_eventos (factura_id, created_at);
comment on table public.ventas_factura_eventos is 'Historia de cada comprobante (solo agregar). La escriben las RPC ventas_*.';

-- Solo agregar. El borrado en cascada de un borrador sí pasa (la factura ya no existe).
create or replace function public.fn_ventas_solo_agregar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' and tg_table_name = 'ventas_factura_eventos'
     and not exists (select 1 from public.ventas_facturas where id = old.factura_id) then
    return old;
  end if;
  raise exception 'SOLO_AGREGAR' using errcode = 'P0001', detail = json_build_object('tabla', tg_table_name)::text;
end $$;
create trigger trg_ventas_eventos_solo_agregar before update or delete on public.ventas_factura_eventos
  for each row execute function public.fn_ventas_solo_agregar();

-- ── Log de ARCA (privado) ─────────────────────────────────────────────
-- Request/response XML de cada llamada a WSFE, para poder reconstruir qué se
-- mandó y qué contestó ARCA. NUNCA el token ni el sign de WSAA: el backend los
-- redacta antes de insertar, y el CHECK rechaza una fila que los traiga.

create table public.ventas_facturas_arca_log (
  id            bigserial primary key,
  factura_id    bigint references public.ventas_facturas(id),
  ambiente      text not null check (ambiente in ('homo', 'prod')),
  metodo        text not null,                  -- FECAESolicitar, FECompConsultar, FECompUltimoAutorizado, …
  request_xml   text,
  response_xml  text,
  http_status   int,
  duracion_ms   int,
  error         text,
  created_at    timestamptz not null default now(),
  constraint ventas_arca_log_sin_credenciales_chk check (
    coalesce(request_xml, '') !~* '<([a-z0-9]+:)?(token|sign)>[^<]{20,}</'
    and coalesce(response_xml, '') !~* '<([a-z0-9]+:)?(token|sign)>[^<]{20,}</')
);
create index ventas_facturas_arca_log_factura_idx on public.ventas_facturas_arca_log (factura_id, created_at) where factura_id is not null;
create index ventas_facturas_arca_log_fecha_idx on public.ventas_facturas_arca_log (created_at desc);
comment on table public.ventas_facturas_arca_log is
  'Log de llamadas a WSFE (privado: sin grants a anon/authenticated). Sin token ni sign (CHECK ventas_arca_log_sin_credenciales_chk).';
create trigger trg_ventas_arca_log_solo_agregar before update or delete on public.ventas_facturas_arca_log
  for each row execute function public.fn_ventas_solo_agregar();

-- ── arca_tokens — el TA de WSAA, persistido (privado) ─────────────────
-- WSAA rechaza pedir otro TA mientras haya uno vigente (coe.alreadyAuthenticated)
-- y Render reinicia: el TA vive en la base. La renovación se reclama con un
-- UPDATE atómico de renovando_hasta (arca_reclamar_renovacion).

create table public.arca_tokens (
  id               bigserial primary key,
  ambiente         text not null check (ambiente in ('homo', 'prod')),
  servicio         text not null check (length(btrim(servicio)) > 0),     -- wsfe, ws_sr_constancia_inscripcion, wsfecred
  token            text,
  sign             text,
  generado_at      timestamptz,
  expira_at        timestamptz,
  renovando_hasta  timestamptz,                                          -- reclamo de renovación en curso (lease)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint arca_tokens_uidx unique (ambiente, servicio),
  constraint arca_tokens_par_chk check ((token is null) = (sign is null) and (token is null) = (expira_at is null))
);
comment on table public.arca_tokens is
  'Ticket de acceso (TA) de WSAA por ambiente y servicio. PRIVADA: sin ningún grant a anon/authenticated. No se audita (el token no va a audit_log).';
create trigger trg_arca_tokens_touch before update on public.arca_tokens
  for each row execute function public.set_updated_at();

-- ── RLS + grants ──────────────────────────────────────────────────────
-- Policy permisiva como el resto; la seguridad real es que anon/authenticated
-- no tienen NINGÚN privilegio (mismo estado vivo que las tablas de Pagos).
do $$
declare t text;
begin
  foreach t in array array['ventas_clientes', 'ventas_facturas', 'ventas_factura_renglones', 'ventas_factura_alicuotas',
                           'ventas_factura_asociados', 'ventas_factura_eventos', 'ventas_facturas_arca_log', 'arca_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t || '_id_seq');
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $$;

-- Funciones sueltas cerradas desde el arranque (lección de 20260918e).
do $$
declare f text;
begin
  foreach f in array array['ventas_tasa_iva(smallint)', 'fn_ventas_cliente_norm()', 'fn_ventas_factura_guard()',
                           'fn_ventas_satelite_guard()', 'fn_ventas_solo_agregar()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
