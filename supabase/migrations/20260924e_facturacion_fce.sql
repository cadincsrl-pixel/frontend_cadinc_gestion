-- =====================================================================
-- 20260924e — Facturación, fase 6: Factura de Crédito Electrónica MiPyMEs
-- A (201) y su Nota de Crédito (203).
--
-- Modelo: la FCE A 00001-00000012 que CADINC le hizo a ARCOR desde el portal
-- de ARCA el 11/09/2026: vencimiento de pago = fecha del comprobante, CBU y
-- alias del emisor (Galicia, CADINC.GALICIA) y transmisión «Sistema de
-- Circulación Abierta» (SCA).
--
-- Qué agrega:
--   1. `ventas_cuentas_bancarias`: las cuentas de CADINC que se informan en la
--      FCE (opcionales 2101 CBU y 2102 alias de WSFE). Una sola por defecto
--      (índice único parcial). Se siembra Galicia.
--   2. `ventas_clientes.cuenta_fce_id`: la cuenta que prefiere el cliente
--      (Banco Macro pide la de Macro). Y el cache de WSFECRED
--      (`fce_obligado`, `fce_monto_desde`, `fce_consultado_at`): si el
--      cliente está obligado a recibir FCE y desde qué monto. Lo escribe el
--      backend; se vuelve a consultar a los 30 días.
--   3. `ventas_facturas`: la FOTO de la cuenta (`fce_cbu`, `fce_alias`,
--      `fce_banco`), `fce_transmision` ('SCA' | 'ADC') y, en la 203,
--      `nc_anulacion` ('S' | 'N', opcional 22 de WSFE: «¿anula la factura
--      completa?»). `fch_vto_pago` ya existía: en la 201 la elige el usuario
--      (default = fecha del comprobante, como el modelo) y ya no se pisa al
--      autorizar.
--   4. Monto mínimo de la FCE: `_ventas_monto_minimo_fce()` = $ 5.549.862
--      (vigente desde el 14/04/2026, Registro de FCE MiPyMEs; consultado el
--      23/09/2026). Espejo de MONTO_MINIMO_FCE del backend y del frontend.
--      Una 201 por menos → NO_CORRESPONDE_FCE, salvo admin con forzar.
--      Si el receptor está obligado lo decide el backend con WSFECRED
--      (consultarMontoObligadoRecepcion), que la base no puede llamar.
--   5. CHECKs de forma: la 201 lleva CBU válido, transmisión y vencimiento
--      ≥ fecha; nadie más lleva CBU ni transmisión; solo la 203 lleva
--      nc_anulacion. La 203 NO lleva CBU (lo dice el manual de WSFE para
--      NC/ND FCE).
-- =====================================================================

-- ── CBU: dígitos verificadores (espejo de cbuValido de pagos.util.ts) ──

create or replace function public._ventas_cbu_valido(p text) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  w1 int[] := array[7, 1, 3, 9, 7, 1, 3];
  w2 int[] := array[3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
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
comment on function public._ventas_cbu_valido(text) is
  'CBU de 22 dígitos con sus dos dígitos verificadores válidos. Espejo de cbuValido (backend pagos.util.ts). 20260924e.';

-- Monto mínimo de la FCE MiPyME. Fuente: Registro de Facturas de Crédito
-- Electrónica MiPyMEs (ARCA), vigente desde el 14/04/2026; consultado el
-- 23/09/2026. Si ARCA lo cambia: acá, MONTO_MINIMO_FCE del backend
-- (reglas.ts) y del frontend (facturacion.utils.ts).
create or replace function public._ventas_monto_minimo_fce() returns numeric
language sql immutable set search_path = public, pg_temp as $$ select 5549862::numeric $$;
comment on function public._ventas_monto_minimo_fce() is
  'Monto mínimo de la FCE MiPyME: $ 5.549.862 desde el 14/04/2026 (consultado 23/09/2026). 20260924e.';

-- ── 1. Cuentas bancarias de CADINC para la FCE ────────────────────────

create table public.ventas_cuentas_bancarias (
  id          bigserial primary key,
  banco       text not null check (length(btrim(banco)) >= 2),
  cbu         text not null check (public._ventas_cbu_valido(cbu)),
  alias       text not null default '' check (alias = '' or alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  es_default  boolean not null default false,
  activo      boolean not null default true,
  obs         text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_by  uuid references auth.users(id),
  constraint ventas_cuentas_default_activa_chk check (not es_default or activo)
);
comment on table public.ventas_cuentas_bancarias is
  'Cuentas de CADINC que se informan en la FCE MiPyME (CBU = opcional 2101, alias = 2102). Una sola por defecto. 20260924e.';

create unique index ventas_cuentas_default_uidx on public.ventas_cuentas_bancarias ((true)) where es_default;
create unique index ventas_cuentas_cbu_uidx on public.ventas_cuentas_bancarias (cbu) where activo;

create trigger trg_ventas_cuentas_touch before update on public.ventas_cuentas_bancarias
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_cuentas_bancarias
  for each row execute function public.audit_cambios('facturacion', 'cuenta bancaria (FCE)', 'id');
create trigger trg_audit_borrado after delete on public.ventas_cuentas_bancarias
  for each row execute function public.audit_borrado('facturacion', 'cuenta bancaria (FCE)', 'id');

alter table public.ventas_cuentas_bancarias enable row level security;
create policy ventas_cuentas_bancarias_all on public.ventas_cuentas_bancarias for all using (true) with check (true);
revoke all on table public.ventas_cuentas_bancarias from public, anon, authenticated;
grant all on table public.ventas_cuentas_bancarias to service_role;
revoke all on sequence public.ventas_cuentas_bancarias_id_seq from public, anon, authenticated;
grant usage, select on sequence public.ventas_cuentas_bancarias_id_seq to service_role;

insert into public.ventas_cuentas_bancarias (banco, cbu, alias, es_default, obs)
values ('Banco Galicia', '0070397820000000473657', 'CADINC.GALICIA', true,
        'La de la FCE a ARCOR del 11/09/2026 (portal de ARCA).');

-- ── 2. Clientes: cuenta preferida y cache de WSFECRED ─────────────────

alter table public.ventas_clientes
  add column cuenta_fce_id     bigint references public.ventas_cuentas_bancarias(id),
  add column fce_obligado      boolean,
  add column fce_monto_desde   numeric(14,2),
  add column fce_consultado_at timestamptz;
comment on column public.ventas_clientes.cuenta_fce_id is
  'Cuenta de CADINC que este cliente quiere ver en la FCE (NULL = la de por defecto). 20260924e.';
comment on column public.ventas_clientes.fce_obligado is
  'Cache de WSFECRED consultarMontoObligadoRecepcion: ¿el cliente está obligado a recibir FCE? NULL = nunca se consultó. Se renueva a los 30 días.';
comment on column public.ventas_clientes.fce_monto_desde is
  'Cache de WSFECRED: desde qué total la factura a este cliente tiene que ser FCE.';

-- ── 3. Facturas: foto de la cuenta, transmisión y anulación ───────────

alter table public.ventas_facturas
  add column fce_cuenta_id   bigint references public.ventas_cuentas_bancarias(id),
  add column fce_cbu         text,
  add column fce_alias       text,
  add column fce_banco       text,
  add column fce_transmision text check (fce_transmision in ('SCA', 'ADC')),
  add column nc_anulacion    text check (nc_anulacion in ('S', 'N')),
  add constraint ventas_facturas_fce_chk check (
    case when cbte_tipo = 201
         then public._ventas_cbu_valido(fce_cbu) and fce_transmision is not null
              and fch_vto_pago is not null and fch_vto_pago >= fecha_cbte
         else fce_cbu is null and fce_alias is null and fce_transmision is null and fce_cuenta_id is null
    end),
  add constraint ventas_facturas_nc_anulacion_chk check ((cbte_tipo = 203) = (nc_anulacion is not null));
comment on column public.ventas_facturas.fce_cbu is
  'FCE 201: CBU del emisor informado a ARCA (opcional 2101). Foto de ventas_cuentas_bancarias al guardar.';
comment on column public.ventas_facturas.fce_transmision is
  'FCE 201: opción de transferencia (opcional 27): SCA = Sistema de Circulación Abierta, ADC = Agente de Depósito Colectivo.';
comment on column public.ventas_facturas.nc_anulacion is
  'NC FCE 203: opcional 22 de WSFE. S = anula la factura completa, N = no.';

-- ── 4. Vista: las columnas nuevas, al final ───────────────────────────

create or replace view public.v_ventas_facturas with (security_invoker = true) as
select f.id, f.ambiente, f.pto_vta, f.cbte_tipo, f.numero, f.numero_intentado, f.estado, f.concepto,
       f.fecha_cbte, f.fch_vto_pago, f.cliente_id,
       f.rec_razon_social, f.rec_doc_tipo, f.rec_doc_nro, f.rec_condicion_iva_id, f.rec_domicilio,
       f.obra_cod, f.producto, f.centro_costo, f.provincia_origen, f.provincia_destino, f.condicion_pago,
       f.remitos, f.observaciones, f.moneda, f.cotizacion,
       f.imp_neto, f.imp_iva, f.imp_trib, f.imp_op_ex, f.imp_tot_conc, f.imp_total,
       f.cae, f.cae_vto, f.resultado, f.observaciones_arca, f.errores_arca, f.intento_at, f.intento_n,
       f.emitida_por, f.emitida_at, f.numero_finnegans, f.registrada_at, f.registrada_por, f.obs_interna,
       f.created_at, f.updated_at, f.created_by, f.updated_by,
       -- derivadas
       case when f.cbte_tipo in (1, 3, 201, 203) then 'A' else 'B' end                         as letra,
       case f.cbte_tipo when 1 then 'Factura A' when 3 then 'Nota de Crédito A'
                        when 6 then 'Factura B' when 8 then 'Nota de Crédito B'
                        when 201 then 'Factura de Crédito Electrónica MiPyMEs A'
                        when 203 then 'Nota de Crédito Electrónica MiPyMEs A' end              as tipo_nombre,
       lpad(f.cbte_tipo::text, 3, '0')                                                          as cod_cbte,
       (f.cbte_tipo in (3, 8, 203))                                                             as es_nc,
       case when f.numero is not null
            then lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0') end       as numero_fmt,
       case when f.numero_intentado is not null
            then lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero_intentado::text, 8, '0') end as numero_intentado_fmt,
       (f.ambiente = 'homo')                                                                    as es_homologacion,
       (f.estado = 'autorizada' and f.numero_finnegans is null)                                 as pendiente_finnegans,
       to_char(f.fecha_cbte, 'YYYY-MM')                                                         as mes,
       c.razon_social as cliente_razon_social, c.activo as cliente_activo, c.email as cliente_email,
       o.nom as obra_nom,
       pc.nombre as created_by_nombre, pe.nombre as emitida_por_nombre, pr.nombre as registrada_por_nombre,
       coalesce(nc.total_nc, 0)::numeric(14,2)                                                  as nc_autorizadas,
       case when f.cbte_tipo not in (3, 8, 203) and f.estado = 'autorizada'
            then (f.imp_total - coalesce(nc.total_nc, 0))::numeric(14,2) end                     as saldo_nc,
       asoc.asociada_id,
       case when asoc.asociada_id is not null
            then lpad(asoc.pto_vta::text, 5, '0') || '-' || lpad(asoc.numero::text, 8, '0') end  as asociada_numero_fmt,
       asoc.cbte_tipo as asociada_cbte_tipo,
       public.norm_txt(coalesce(lpad(f.pto_vta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0'), '') || ' '
                       || coalesce(f.numero::text, '') || ' ' || f.rec_razon_social || ' ' || f.rec_doc_nro || ' '
                       || f.producto || ' ' || coalesce(f.centro_costo, '') || ' ' || coalesce(f.obra_cod, '') || ' '
                       || coalesce(o.nom, '') || ' ' || f.observaciones || ' ' || f.remitos || ' '
                       || coalesce(f.numero_finnegans, '') || ' ' || coalesce(f.cae, ''))       as busq,
       -- 20260924e: FCE
       f.fce_cuenta_id, f.fce_cbu, f.fce_alias, f.fce_banco, f.fce_transmision, f.nc_anulacion,
       (f.cbte_tipo in (201, 202, 203))                                                         as es_fce,
       asoc.fecha_cbte                                                                          as asociada_fecha_cbte
from public.ventas_facturas f
join public.ventas_clientes c on c.id = f.cliente_id
left join public.obras o on o.cod = f.obra_cod
left join public.profiles pc on pc.id = f.created_by
left join public.profiles pe on pe.id = f.emitida_por
left join public.profiles pr on pr.id = f.registrada_por
left join lateral (
  select sum(n.imp_total) as total_nc
    from public.ventas_factura_asociados a join public.ventas_facturas n on n.id = a.factura_id
   where a.asociada_id = f.id and n.estado = 'autorizada') nc on true
left join lateral (
  select a.asociada_id, a.pto_vta, a.numero, a.cbte_tipo, a.fecha_cbte
    from public.ventas_factura_asociados a where a.factura_id = f.id order by a.id limit 1) asoc on true;

revoke all on table public.v_ventas_facturas from public, anon, authenticated;
grant select on table public.v_ventas_facturas to service_role;

-- ── Grants de las funciones nuevas (solo service_role) ──────────────
do $$
declare f text;
begin
  foreach f in array array['_ventas_cbu_valido(text)', '_ventas_monto_minimo_fce()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
