-- =====================================================================
-- Compras: la factura de proveedor con TODOS los impuestos discriminados,
-- como los pide ARCA (2026-09-24)
--
-- Pedido del dueño: «cuando cargamos una factura, lo ideal sería primero el
-- archivo y que el sistema cargue lo máximo que pueda solo, para que le sirva
-- al contador; tendremos que discriminar todos los impuestos y retenciones».
-- El destino final es el Libro IVA Digital de compras y la posición de IVA.
--
-- Qué cambia:
--   · pagos_facturas suma no_gravado, exento, cae, cae_vto, cbte_tipo_arca
--     (código ARCA del comprobante), lectura_estado y lectura_json (lo que se
--     leyó del archivo, crudo y auditable).
--   · pagos_factura_iva: el IVA por alícuota (alicuota_id ARCA 3/4/5/6/8/9).
--   · pagos_factura_tributos: percepciones de IVA/IIBB/Ganancias/municipales,
--     impuestos internos y otros, cada una con su jurisdicción.
--   · pagos_facturas_lecturas: lo que devolvió «leer comprobante» (QR + IA),
--     guardado del lado del server. La factura toma su lectura de acá y no de
--     lo que mande el navegador: así `lectura_json` y el control del papel no
--     se pueden dibujar desde el cliente.
--
-- Las columnas agregadas de siempre SIGUEN SIENDO LA FUENTE que usa el resto
-- del módulo, y cuando hay detalle se DERIVAN de él (las escribe
-- `_pagos_guardar_desglose`, nunca a mano):
--     iva          = Σ pagos_factura_iva.importe
--     neto         = Σ pagos_factura_iva.base_imp          (neto gravado)
--     percepciones = Σ tributos de tipo percepcion_*
--     otros        = Σ tributos que no son percepción (internos, otros)
-- Así la regla de §5.18 —lo imputable a las obras es total − percepciones—
-- no cambia en nada. Un trigger diferido (`_pagos_chequear_desglose`) frena
-- cualquier escritura que deje las columnas y el detalle desalineados.
--
-- Cierre: neto + no_gravado + exento + iva + percepciones + otros = total
-- (±0,01), mismo criterio que ya tenía `_pagos_validar_desglose`: se valida
-- sólo si hay neto e IVA (el desglose sigue siendo opcional; una factura
-- cargada con el total nomás sigue siendo válida).
--
-- Sin detalle = «sin discriminar». Las 15 facturas cargadas hasta hoy tienen
-- neto/iva/percepciones en NULL: no hay nada que backfillear. El backfill de
-- abajo igual está escrito (por si alguna se completa antes de aplicar) y
-- sólo actúa sobre facturas con neto e IVA cargados.
--
-- Pagada = congelada, igual que antes: el detalle de una factura con pagos no
-- se toca (FACTURA_CON_PAGOS), y no_gravado/exento se suman a la lista.
-- =====================================================================

-- ── 1) Columnas nuevas de la factura ────────────────────────────────────

alter table public.pagos_facturas
  add column if not exists no_gravado     numeric(14,2),
  add column if not exists exento         numeric(14,2),
  add column if not exists cae            text,
  add column if not exists cae_vto        date,
  add column if not exists cbte_tipo_arca smallint,
  add column if not exists lectura_estado text not null default 'manual',
  add column if not exists lectura_json   jsonb,
  add column if not exists desglose_a_revisar boolean not null default false;

alter table public.pagos_facturas drop constraint if exists pagos_facturas_no_gravado_chk;
alter table public.pagos_facturas add constraint pagos_facturas_no_gravado_chk check (no_gravado is null or no_gravado >= 0);
alter table public.pagos_facturas drop constraint if exists pagos_facturas_exento_chk;
alter table public.pagos_facturas add constraint pagos_facturas_exento_chk check (exento is null or exento >= 0);
alter table public.pagos_facturas drop constraint if exists pagos_facturas_cae_chk;
alter table public.pagos_facturas add constraint pagos_facturas_cae_chk check (cae is null or cae ~ '^\d{14}$');
alter table public.pagos_facturas drop constraint if exists pagos_facturas_cbte_tipo_arca_chk;
-- Tabla de comprobantes de ARCA: facturas, ND, NC y recibos A/B/C/M, tiques
-- fiscales y FCE MiPyME. Lo que no esté acá se carga como 'otro' sin código.
alter table public.pagos_facturas add constraint pagos_facturas_cbte_tipo_arca_chk check (
  cbte_tipo_arca is null or cbte_tipo_arca in (1,2,3,4,5,6,7,8,9,10,11,12,13,15,49,51,52,53,54,81,82,83,201,202,203,206,207,208,211,212,213));
alter table public.pagos_facturas drop constraint if exists pagos_facturas_lectura_estado_chk;
alter table public.pagos_facturas add constraint pagos_facturas_lectura_estado_chk check (lectura_estado in ('manual','qr','qr+ia','ia'));

comment on column public.pagos_facturas.no_gravado is 'Importe no gravado (conceptos que no integran el neto gravado). 20260924u.';
comment on column public.pagos_facturas.exento is 'Importe exento de IVA. 20260924u.';
comment on column public.pagos_facturas.cae is 'CAE / CAEA del comprobante (14 dígitos). 20260924u.';
comment on column public.pagos_facturas.cae_vto is 'Vencimiento del CAE. 20260924u.';
comment on column public.pagos_facturas.cbte_tipo_arca is 'Código ARCA del tipo de comprobante (1 = Factura A, 6 = B, 11 = C, 51 = M, 201 = FCE A…). 20260924u.';
comment on column public.pagos_facturas.lectura_estado is 'De dónde salieron los datos: manual | qr (QR de ARCA) | qr+ia | ia. 20260924u.';
comment on column public.pagos_facturas.lectura_json is 'Lo leído del comprobante al cargar (QR, IA, propuesta, avisos, qué cambió la persona). Auditable; no se usa para calcular. 20260924u.';
comment on column public.pagos_facturas.desglose_a_revisar is 'El desglose se dedujo por backfill y no cerró con ninguna alícuota conocida: revisarlo. 20260924u.';

-- Mapeo del tipo de siempre al código ARCA (sólo facturas: NC y ND no se
-- cargan como factura en este módulo).
update public.pagos_facturas
   set cbte_tipo_arca = case tipo_comprobante when 'A' then 1 when 'B' then 6 when 'C' then 11 end
 where cbte_tipo_arca is null and tipo_comprobante in ('A','B','C');

-- ── 2) IVA por alícuota ─────────────────────────────────────────────────

create table if not exists public.pagos_factura_iva (
  id          bigserial primary key,
  factura_id  bigint not null references public.pagos_facturas(id) on delete cascade,
  -- Códigos de alícuota de ARCA: 3 = 0 %, 4 = 10,5 %, 5 = 21 %, 6 = 27 %, 8 = 5 %, 9 = 2,5 %.
  alicuota_id smallint not null check (alicuota_id in (3,4,5,6,8,9)),
  base_imp    numeric(14,2) not null check (base_imp >= 0),
  importe     numeric(14,2) not null check (importe >= 0),
  created_at  timestamptz not null default now(),
  unique (factura_id, alicuota_id)
);
comment on table public.pagos_factura_iva is
  'IVA discriminado por alícuota de una factura de proveedor (Libro IVA Digital compras). pagos_facturas.iva/neto se derivan de acá (20260924u).';

-- ── 3) Percepciones y otros tributos ────────────────────────────────────

create table if not exists public.pagos_factura_tributos (
  id           bigserial primary key,
  factura_id   bigint not null references public.pagos_facturas(id) on delete cascade,
  tipo         text not null check (tipo in ('percepcion_iva','percepcion_iibb','percepcion_ganancias',
                                             'percepcion_municipal','impuestos_internos','otro')),
  -- Para IIBB y tasas municipales: la provincia / el municipio que percibe.
  jurisdiccion text,
  descripcion  text not null default '',
  alicuota     numeric(7,4) check (alicuota is null or (alicuota >= 0 and alicuota <= 100)),
  base_imp     numeric(14,2) check (base_imp is null or base_imp >= 0),
  importe      numeric(14,2) not null check (importe >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists pagos_factura_tributos_factura_idx on public.pagos_factura_tributos (factura_id);
comment on table public.pagos_factura_tributos is
  'Percepciones e impuestos de una factura de proveedor. Las percepcion_* suman pagos_facturas.percepciones (no se reparten a las obras); el resto suma pagos_facturas.otros (20260924u).';

-- ── 4) Lecturas del comprobante («archivo primero») ─────────────────────

create table if not exists public.pagos_facturas_lecturas (
  id             bigserial primary key,
  storage_path   text not null unique,
  nombre_archivo text not null,
  mime_type      text not null,
  hash_sha256    text not null,
  qr             jsonb,            -- lo decodificado del QR de ARCA (o null)
  ia             jsonb,            -- lo que devolvió el modelo, crudo (o null)
  propuesta      jsonb not null,   -- la fusión que se le mostró a la persona
  avisos         jsonb not null default '[]'::jsonb,
  fuente_por_campo jsonb not null default '{}'::jsonb,
  estado         text not null check (estado in ('manual','qr','qr+ia','ia')),
  modelo         text,
  factura_id     bigint references public.pagos_facturas(id) on delete set null,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists pagos_facturas_lecturas_factura_idx on public.pagos_facturas_lecturas (factura_id);
comment on table public.pagos_facturas_lecturas is
  'Resultado de POST /api/pagos/facturas/leer: QR + IA + propuesta. La factura copia su lectura de acá al cargarse (nunca del cliente). 20260924u.';

-- Mismo modelo que el resto de pagos: RLS prendida con policy permisiva y
-- SOLO service_role con privilegios (el backend es el único que lee y escribe).
do $$
declare t text;
begin
  foreach t in array array['pagos_factura_iva','pagos_factura_tributos','pagos_facturas_lecturas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence public.pagos_factura_iva_id_seq, public.pagos_factura_tributos_id_seq, public.pagos_facturas_lecturas_id_seq
  from anon, authenticated;
grant usage, select on sequence public.pagos_factura_iva_id_seq, public.pagos_factura_tributos_id_seq, public.pagos_facturas_lecturas_id_seq
  to service_role;

-- ── 5) Cierre del desglose (con no gravado y exento) ────────────────────
-- Se reemplaza la de 5 parámetros por una de 7 con los dos nuevos en 0 por
-- defecto: las llamadas viejas siguen resolviendo a ésta.

drop function if exists public._pagos_validar_desglose(numeric, numeric, numeric, numeric, numeric);
create or replace function public._pagos_validar_desglose(
  p_neto numeric, p_iva numeric, p_percepciones numeric, p_otros numeric, p_total numeric,
  p_no_gravado numeric default 0, p_exento numeric default 0)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_suma numeric(14,2);
begin
  if p_neto is null or p_iva is null then return; end if;
  v_suma := p_neto + p_iva + coalesce(p_percepciones, 0) + coalesce(p_otros, 0)
          + coalesce(p_no_gravado, 0) + coalesce(p_exento, 0);
  if abs(v_suma - p_total) > 0.01 then
    raise exception 'DESGLOSE_NO_CUADRA' using errcode = 'P0001',
      detail = json_build_object('suma', v_suma, 'total', p_total)::text;
  end if;
end $function$;
revoke all on function public._pagos_validar_desglose(numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- ── 6) Guardar el detalle (la única puerta) ─────────────────────────────
-- Reemplaza el detalle que venga (null = no tocar esa parte) y deriva las
-- columnas agregadas. Lo llaman pagos_crear_factura y pagos_editar_factura.

create or replace function public._pagos_guardar_desglose(p_factura_id bigint, p_iva jsonb, p_tributos jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_iva   numeric(14,2);
  v_base  numeric(14,2);
  v_perc  numeric(14,2);
  v_otros numeric(14,2);
  v_n     int;
begin
  if p_iva is not null and jsonb_typeof(p_iva) = 'array' then
    delete from public.pagos_factura_iva where factura_id = p_factura_id;
    insert into public.pagos_factura_iva (factura_id, alicuota_id, base_imp, importe)
    select p_factura_id, (e ->> 'alicuota_id')::smallint, round((e ->> 'base_imp')::numeric, 2), round((e ->> 'importe')::numeric, 2)
      from jsonb_array_elements(p_iva) e;
    select coalesce(sum(importe), 0), coalesce(sum(base_imp), 0), count(*) into v_iva, v_base, v_n
      from public.pagos_factura_iva where factura_id = p_factura_id;
    -- Sin alícuotas (B, C, ticket): IVA 0 y el neto queda como vino.
    update public.pagos_facturas
       set iva = v_iva, neto = case when v_n > 0 then v_base else neto end
     where id = p_factura_id;
  end if;

  if p_tributos is not null and jsonb_typeof(p_tributos) = 'array' then
    delete from public.pagos_factura_tributos where factura_id = p_factura_id;
    insert into public.pagos_factura_tributos (factura_id, tipo, jurisdiccion, descripcion, alicuota, base_imp, importe)
    select p_factura_id, e ->> 'tipo', nullif(btrim(coalesce(e ->> 'jurisdiccion', '')), ''),
           btrim(coalesce(e ->> 'descripcion', '')), (e ->> 'alicuota')::numeric,
           round((e ->> 'base_imp')::numeric, 2), round((e ->> 'importe')::numeric, 2)
      from jsonb_array_elements(p_tributos) e;
    select coalesce(sum(importe) filter (where tipo like 'percepcion\_%'), 0),
           coalesce(sum(importe) filter (where tipo not like 'percepcion\_%'), 0)
      into v_perc, v_otros
      from public.pagos_factura_tributos where factura_id = p_factura_id;
    update public.pagos_facturas
       set percepciones = case when v_perc = 0 and percepciones is null then null else v_perc end,
           otros        = case when v_otros = 0 and otros is null then null else v_otros end
     where id = p_factura_id;
  end if;
end $function$;
revoke all on function public._pagos_guardar_desglose(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._pagos_guardar_desglose(bigint, jsonb, jsonb) to service_role;

-- Forma canónica del detalle (orden estable, importes a centavos), para
-- saber si lo que manda la pantalla es igual a lo guardado.
create or replace function public._pagos_iva_canon(p jsonb)
returns jsonb
language sql immutable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'alicuota_id', (e ->> 'alicuota_id')::int,
           'base_imp', round((e ->> 'base_imp')::numeric, 2),
           'importe', round((e ->> 'importe')::numeric, 2))
         order by (e ->> 'alicuota_id')::int), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e
$function$;

create or replace function public._pagos_trib_canon(p jsonb)
returns jsonb
language sql immutable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb)
    from (select jsonb_build_object(
                   'tipo', e ->> 'tipo',
                   'jurisdiccion', nullif(btrim(coalesce(e ->> 'jurisdiccion', '')), ''),
                   'descripcion', btrim(coalesce(e ->> 'descripcion', '')),
                   'alicuota', round((e ->> 'alicuota')::numeric, 4),
                   'base_imp', round((e ->> 'base_imp')::numeric, 2),
                   'importe', round((e ->> 'importe')::numeric, 2)) x
            from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e) s
$function$;

-- ── 7) Consistencia: columnas = detalle, y detalle congelado con pagos ──

create or replace function public._pagos_chequear_desglose(p_factura_id bigint)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  f      public.pagos_facturas%rowtype;
  v_iva  numeric(14,2); v_base numeric(14,2); v_ni int;
  v_perc numeric(14,2); v_otros numeric(14,2); v_nt int;
begin
  select * into f from public.pagos_facturas where id = p_factura_id;
  if not found then return; end if;
  select coalesce(sum(importe), 0), coalesce(sum(base_imp), 0), count(*) into v_iva, v_base, v_ni
    from public.pagos_factura_iva where factura_id = p_factura_id;
  if v_ni > 0 and (f.iva is distinct from v_iva or f.neto is distinct from v_base) then
    raise exception 'DESGLOSE_INCONSISTENTE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'campo', 'iva', 'iva', f.iva, 'suma_iva', v_iva, 'neto', f.neto, 'suma_base', v_base)::text;
  end if;
  select coalesce(sum(importe) filter (where tipo like 'percepcion\_%'), 0),
         coalesce(sum(importe) filter (where tipo not like 'percepcion\_%'), 0), count(*)
    into v_perc, v_otros, v_nt
    from public.pagos_factura_tributos where factura_id = p_factura_id;
  if v_nt > 0 and (coalesce(f.percepciones, 0) <> v_perc or coalesce(f.otros, 0) <> v_otros) then
    raise exception 'DESGLOSE_INCONSISTENTE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'campo', 'tributos', 'percepciones', f.percepciones, 'suma_percepciones', v_perc, 'otros', f.otros, 'suma_otros', v_otros)::text;
  end if;
end $function$;
revoke all on function public._pagos_chequear_desglose(bigint) from public, anon, authenticated;

create or replace function public.fn_pagos_desglose_consistente()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_table_name = 'pagos_facturas' then
    perform public._pagos_chequear_desglose(new.id);
  else
    perform public._pagos_chequear_desglose(coalesce(new.factura_id, old.factura_id));
  end if;
  return null;
end $function$;

-- Diferidos: la puerta borra, inserta y actualiza en varios pasos; se mira
-- cómo quedó al final de la transacción.
drop trigger if exists trg_pagos_desglose_factura on public.pagos_facturas;
create constraint trigger trg_pagos_desglose_factura
  after insert or update of neto, iva, percepciones, otros on public.pagos_facturas
  deferrable initially deferred for each row execute function public.fn_pagos_desglose_consistente();
drop trigger if exists trg_pagos_desglose_iva on public.pagos_factura_iva;
create constraint trigger trg_pagos_desglose_iva
  after insert or update or delete on public.pagos_factura_iva
  deferrable initially deferred for each row execute function public.fn_pagos_desglose_consistente();
drop trigger if exists trg_pagos_desglose_tributos on public.pagos_factura_tributos;
create constraint trigger trg_pagos_desglose_tributos
  after insert or update or delete on public.pagos_factura_tributos
  deferrable initially deferred for each row execute function public.fn_pagos_desglose_consistente();

-- El detalle de una factura con pagos no se toca (mismo escape que el resto).
create or replace function public.fn_pagos_desglose_congelado()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_estado text;
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return coalesce(new, old); end if;
  select estado into v_estado from public.pagos_facturas where id = coalesce(new.factura_id, old.factura_id);
  if v_estado in ('pagada_parcial', 'pagada') then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', coalesce(new.factura_id, old.factura_id), 'estado', v_estado, 'campos', json_build_array('desglose'))::text;
  end if;
  return coalesce(new, old);
end $function$;

drop trigger if exists trg_pagos_iva_congelado on public.pagos_factura_iva;
create trigger trg_pagos_iva_congelado before insert or update or delete on public.pagos_factura_iva
  for each row execute function public.fn_pagos_desglose_congelado();
drop trigger if exists trg_pagos_tributos_congelado on public.pagos_factura_tributos;
create trigger trg_pagos_tributos_congelado before insert or update or delete on public.pagos_factura_tributos
  for each row execute function public.fn_pagos_desglose_congelado();

-- no_gravado y exento son plata: congelados con pagos y desaprueban, como neto e IVA.
create or replace function public.fn_pagos_factura_congelada()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if old.estado in ('pagada_parcial','pagada') and (
       new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
    or new.neto is distinct from old.neto or new.iva is distinct from old.iva
    or new.percepciones is distinct from old.percepciones or new.otros is distinct from old.otros
    or new.no_gravado is distinct from old.no_gravado or new.exento is distinct from old.exento
    or new.total is distinct from old.total) then
    raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
      detail = json_build_object('factura_id', old.id, 'estado', old.estado)::text;
  end if;
  return new;
end $function$;

create or replace function public.fn_pagos_factura_desaprobar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if old.estado = 'aprobada' and (
       new.proveedor_id is distinct from old.proveedor_id or new.fecha is distinct from old.fecha
    or new.total is distinct from old.total or new.neto is distinct from old.neto or new.iva is distinct from old.iva
    or new.percepciones is distinct from old.percepciones or new.otros is distinct from old.otros
    or new.no_gravado is distinct from old.no_gravado or new.exento is distinct from old.exento
    or new.paga_cliente is distinct from old.paga_cliente or new.vence_el is distinct from old.vence_el
    or new.forma_pago_prevista is distinct from old.forma_pago_prevista) then
    new.estado := 'pendiente';
    new.aprobada_por := null;
    new.aprobada_at := null;
  end if;
  return new;
end $function$;

-- ── 8) RPC: crear ───────────────────────────────────────────────────────
-- Igual que la viva (20260923n) más: columnas nuevas en el insert, detalle
-- vía `_pagos_guardar_desglose` y el cierre con no gravado y exento. El
-- desglose viaja ADENTRO de p_factura (`iva_detalle`, `tributos`), como los
-- cheques en p_orden: sin cambiar la firma.

create or replace function public.pagos_crear_factura(p_factura jsonb, p_imputaciones jsonb, p_user_id uuid, p_orden jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prov        public.pagos_proveedores%rowtype;
  v_f           public.pagos_facturas%rowtype;
  v_id          bigint;
  v_orden_id    bigint;
  v_numero      text;
  v_numero_norm text;
  v_fecha       date;
  v_vence       date;
  v_total       numeric(14,2);
  v_paga_cli    boolean;
  v_pac         boolean := false;
  v_forma       text;
  v_constraint  text;
  v_existente   bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_prov from public.pagos_proveedores where id = (p_factura ->> 'proveedor_id')::bigint;
  if not found then
    raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', p_factura ->> 'proveedor_id')::text;
  end if;
  if not v_prov.activo then
    raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_prov.id)::text;
  end if;
  v_numero := nullif(btrim(coalesce(p_factura ->> 'numero', '')), '');
  v_numero_norm := case when v_numero is null then null
                        else coalesce(nullif(btrim(coalesce(p_factura ->> 'numero_norm', '')), ''), public.norm_txt(v_numero)) end;
  v_fecha := (p_factura ->> 'fecha')::date;
  if v_fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'hoy', public.hoy_ar())::text;
  end if;
  v_total := (p_factura ->> 'total')::numeric;
  if v_total is null or v_total <= 0 then
    raise exception 'TOTAL_INVALIDO' using errcode = 'P0001', detail = json_build_object('total', p_factura ->> 'total')::text;
  end if;
  v_vence := (p_factura ->> 'vence_el')::date;
  if v_vence is not null and v_vence < v_fecha then
    raise exception 'VENCIMIENTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('fecha', v_fecha, 'vence_el', v_vence)::text;
  end if;
  if length(btrim(coalesce(p_factura ->> 'descripcion', ''))) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;
  v_paga_cli := coalesce((p_factura ->> 'paga_cliente')::boolean, false);
  if p_orden is not null and jsonb_typeof(p_orden) = 'object' then
    if v_paga_cli then
      raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001';
    end if;
    v_forma := nullif(btrim(p_orden ->> 'forma_pago'), '');
    if not public._pagos_es_admin(p_user_id) and coalesce(v_forma, '') not in ('tarjeta', 'efectivo') then
      raise exception 'PAGADA_AL_CARGAR_FORMA' using errcode = 'P0001', detail = json_build_object('forma_pago', v_forma)::text;
    end if;
    v_pac := true;
    v_vence := null;          -- una pagada no vence
  end if;

  begin
    insert into public.pagos_facturas (proveedor_id, tipo_comprobante, numero, numero_norm, fecha, vence_el, neto, iva, percepciones, otros, total,
                                       forma_pago_prevista, paga_cliente, pagada_al_cargar, descripcion, obs, created_by, updated_by, plan_cheques,
                                       no_gravado, exento, cae, cae_vto, cbte_tipo_arca, lectura_estado, lectura_json)
    values (v_prov.id, p_factura ->> 'tipo_comprobante', v_numero, v_numero_norm, v_fecha, v_vence,
            (p_factura ->> 'neto')::numeric, (p_factura ->> 'iva')::numeric, (p_factura ->> 'percepciones')::numeric, (p_factura ->> 'otros')::numeric, v_total,
            coalesce(nullif(p_factura ->> 'forma_pago_prevista', ''), 'transferencia'), v_paga_cli, v_pac,
            btrim(p_factura ->> 'descripcion'), coalesce(p_factura ->> 'obs', ''), p_user_id, p_user_id, nullif(p_factura -> 'plan_cheques', 'null'::jsonb),
            (p_factura ->> 'no_gravado')::numeric, (p_factura ->> 'exento')::numeric,
            nullif(btrim(coalesce(p_factura ->> 'cae', '')), ''), (p_factura ->> 'cae_vto')::date,
            (p_factura ->> 'cbte_tipo_arca')::smallint,
            coalesce(nullif(p_factura ->> 'lectura_estado', ''), 'manual'),
            nullif(p_factura -> 'lectura_json', 'null'::jsonb))
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pagos_facturas_prov_tipo_numero_uidx' then
      select id into v_existente from public.pagos_facturas
       where proveedor_id = v_prov.id and tipo_comprobante = p_factura ->> 'tipo_comprobante'
         and numero_norm = v_numero_norm and estado <> 'anulada' limit 1;
      raise exception 'FACTURA_DUPLICADA' using errcode = 'P0001', detail = json_build_object('factura_id_existente', v_existente)::text;
    end if;
    raise;
  end;

  -- El detalle ANTES de la OP: con la OP la factura queda pagada y congelada.
  perform public._pagos_guardar_desglose(v_id, nullif(p_factura -> 'iva_detalle', 'null'::jsonb), nullif(p_factura -> 'tributos', 'null'::jsonb));
  select * into v_f from public.pagos_facturas where id = v_id;
  perform public._pagos_validar_desglose(v_f.neto, v_f.iva, v_f.percepciones, v_f.otros, v_f.total, v_f.no_gravado, v_f.exento);

  perform public._pagos_reemplazar_imputaciones(v_id, p_imputaciones, p_user_id);

  if v_pac then
    v_orden_id := public._pagos_emitir_orden(
      v_prov.id, p_orden,
      jsonb_build_array(jsonb_build_object('tipo', 'factura', 'factura_id', v_id, 'monto', v_total)),
      coalesce(p_orden -> 'adjuntos', p_orden -> 'comprobante'),
      p_user_id, false);
  end if;

  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = v_id),
    'orden',   case when v_orden_id is null then null else (select to_jsonb(o) from public.v_pagos_ordenes o where o.id = v_orden_id) end);
end $function$;

-- ── 9) RPC: editar ──────────────────────────────────────────────────────
-- Igual que la viva más: no_gravado/exento/cae/cae_vto/cbte_tipo_arca
-- editables; `iva_detalle`/`tributos` en p_cambios van por la puerta del
-- detalle (no son columnas); con pagos, un detalle distinto rebota
-- FACTURA_CON_PAGOS { campos: ['desglose'] }.

create or replace function public.pagos_editar_factura(p_factura_id bigint, p_cambios jsonb, p_imputaciones jsonb, p_motivo text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_f           public.pagos_facturas%rowtype;
  v_new         public.pagos_facturas%rowtype;
  v_cambios     jsonb := coalesce(p_cambios, '{}'::jsonb);
  v_iva_det     jsonb;
  v_trib_det    jsonb;
  v_estado_antes text;
  v_tiene_pagos boolean;
  v_k           text;
  v_sets        text[] := '{}';
  v_congelados  text[] := '{}';
  v_numero      text;
  v_constraint  text;
  v_existente   bigint;
  v_suma        numeric(14,2);
  v_n           int;
  v_permitidos  text[] := array['proveedor_id','tipo_comprobante','numero','numero_norm','fecha','vence_el','neto','iva',
                                'percepciones','otros','total','forma_pago_prevista','paga_cliente','descripcion','obs','plan_cheques',
                                'no_gravado','exento','cae','cae_vto','cbte_tipo_arca'];
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  v_estado_antes := v_f.estado;
  select exists (select 1 from public.pagos_orden_lineas l join public.pagos_ordenes o on o.id = l.orden_id
                  where l.factura_id = p_factura_id and o.estado = 'emitida') into v_tiene_pagos;

  -- El detalle no es columna: se saca de los cambios y va por su puerta.
  v_iva_det  := nullif(v_cambios -> 'iva_detalle', 'null'::jsonb);
  v_trib_det := nullif(v_cambios -> 'tributos', 'null'::jsonb);
  v_cambios  := v_cambios - 'iva_detalle' - 'tributos';

  for v_k in select jsonb_object_keys(v_cambios) loop
    if v_k <> all(v_permitidos) then
      raise exception 'CAMPO_NO_EDITABLE' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;
  -- numero_norm solo acompaña a numero (fallback norm_txt si el backend no lo mandó).
  if v_cambios ? 'numero' then
    v_numero := nullif(btrim(coalesce(v_cambios ->> 'numero', '')), '');
    v_cambios := v_cambios || jsonb_build_object(
      'numero', v_numero,
      'numero_norm', case when v_numero is null then null
                          else coalesce(nullif(btrim(coalesce(v_cambios ->> 'numero_norm', '')), ''), public.norm_txt(v_numero)) end);
  else
    v_cambios := v_cambios - 'numero_norm';
  end if;

  v_new := jsonb_populate_record(v_f, v_cambios);   -- fila fusionada (lo ausente queda como estaba)

  if v_cambios ? 'proveedor_id' and v_new.proveedor_id is distinct from v_f.proveedor_id then
    if not exists (select 1 from public.pagos_proveedores where id = v_new.proveedor_id) then
      raise exception 'PROVEEDOR_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_new.proveedor_id)::text;
    end if;
    if not (select activo from public.pagos_proveedores where id = v_new.proveedor_id) then
      raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_new.proveedor_id)::text;
    end if;
  end if;
  if v_tiene_pagos then
    if v_new.proveedor_id is distinct from v_f.proveedor_id then v_congelados := array_append(v_congelados, 'proveedor_id'); end if;
    if v_new.fecha is distinct from v_f.fecha then v_congelados := array_append(v_congelados, 'fecha'); end if;
    if v_new.neto is distinct from v_f.neto then v_congelados := array_append(v_congelados, 'neto'); end if;
    if v_new.iva is distinct from v_f.iva then v_congelados := array_append(v_congelados, 'iva'); end if;
    if v_new.percepciones is distinct from v_f.percepciones then v_congelados := array_append(v_congelados, 'percepciones'); end if;
    if v_new.otros is distinct from v_f.otros then v_congelados := array_append(v_congelados, 'otros'); end if;
    if v_new.no_gravado is distinct from v_f.no_gravado then v_congelados := array_append(v_congelados, 'no_gravado'); end if;
    if v_new.exento is distinct from v_f.exento then v_congelados := array_append(v_congelados, 'exento'); end if;
    if v_new.total is distinct from v_f.total then v_congelados := array_append(v_congelados, 'total'); end if;
    if v_new.paga_cliente is distinct from v_f.paga_cliente then v_congelados := array_append(v_congelados, 'paga_cliente'); end if;
    -- El detalle igual al guardado no es un cambio (la pantalla manda todo):
    -- se descarta para no tocar filas de una factura congelada.
    if v_iva_det is not null and public._pagos_iva_canon(v_iva_det) = public._pagos_iva_canon(
         (select jsonb_agg(to_jsonb(x)) from public.pagos_factura_iva x where x.factura_id = p_factura_id)) then
      v_iva_det := null;
    end if;
    if v_trib_det is not null and public._pagos_trib_canon(v_trib_det) = public._pagos_trib_canon(
         (select jsonb_agg(to_jsonb(x)) from public.pagos_factura_tributos x where x.factura_id = p_factura_id)) then
      v_trib_det := null;
    end if;
    if v_iva_det is not null or v_trib_det is not null then
      v_congelados := array_append(v_congelados, 'desglose');
    end if;
    if array_length(v_congelados, 1) > 0 then
      raise exception 'FACTURA_CON_PAGOS' using errcode = 'P0001',
        detail = json_build_object('factura_id', p_factura_id, 'campos', to_json(v_congelados))::text;
    end if;
  end if;
  if v_new.fecha is null then raise exception 'FECHA_REQUERIDA' using errcode = 'P0001'; end if;
  if v_new.fecha > public.hoy_ar() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001', detail = json_build_object('fecha', v_new.fecha, 'hoy', public.hoy_ar())::text;
  end if;
  if v_new.total is null or v_new.total <= 0 then
    raise exception 'TOTAL_INVALIDO' using errcode = 'P0001', detail = json_build_object('total', v_new.total)::text;
  end if;
  if v_new.vence_el is not null and v_new.vence_el < v_new.fecha then
    raise exception 'VENCIMIENTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('fecha', v_new.fecha, 'vence_el', v_new.vence_el)::text;
  end if;
  if length(btrim(coalesce(v_new.descripcion, ''))) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_cambios) = 'object' and (select count(*) from jsonb_object_keys(v_cambios)) > 0 then
    for v_k in select jsonb_object_keys(v_cambios) loop
      v_sets := v_sets || format('%I = ($2).%I', v_k, v_k);
    end loop;
    begin
      execute format('update public.pagos_facturas set %s, updated_by = $3 where id = $1', array_to_string(v_sets, ', '))
        using p_factura_id, v_new, p_user_id;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'pagos_facturas_prov_tipo_numero_uidx' then
        select id into v_existente from public.pagos_facturas
         where proveedor_id = v_new.proveedor_id and tipo_comprobante = v_new.tipo_comprobante
           and numero_norm = v_new.numero_norm and estado <> 'anulada' and id <> p_factura_id limit 1;
        raise exception 'FACTURA_DUPLICADA' using errcode = 'P0001', detail = json_build_object('factura_id_existente', v_existente)::text;
      end if;
      raise;
    end;
  end if;

  -- El detalle, y el cierre sobre cómo quedó la fila (las columnas derivadas
  -- pueden haber cambiado recién acá).
  if v_iva_det is not null or v_trib_det is not null then
    perform public._pagos_guardar_desglose(p_factura_id, v_iva_det, v_trib_det);
  end if;
  select * into v_new from public.pagos_facturas where id = p_factura_id;
  perform public._pagos_validar_desglose(v_new.neto, v_new.iva, v_new.percepciones, v_new.otros, v_new.total, v_new.no_gravado, v_new.exento);

  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then
    if v_estado_antes in ('pagada', 'pagada_parcial') and length(btrim(coalesce(p_motivo, ''))) < 3 then
      raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'motivo')::text;
    end if;
    perform public._pagos_reemplazar_imputaciones(p_factura_id, p_imputaciones, p_user_id);
    if length(btrim(coalesce(p_motivo, ''))) >= 3 then
      update public.pagos_facturas
         set obs = rtrim(obs || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — reimputada: ' || btrim(p_motivo)), updated_by = p_user_id
       where id = p_factura_id;
    end if;
  else
    -- Cambió imputable y no vino reparto: una sola obra se ajusta sola; varias → hay que reimputar.
    select coalesce(sum(monto), 0), count(*) into v_suma, v_n from public.pagos_imputaciones where factura_id = p_factura_id;
    select imputable into v_new.imputable from public.pagos_facturas where id = p_factura_id;
    if abs(v_suma - v_new.imputable) > 0.01 then
      if v_n = 1 then
        update public.pagos_imputaciones set monto = v_new.imputable, updated_by = p_user_id where factura_id = p_factura_id;
      else
        raise exception 'IMPUTACION_NO_CUADRA' using errcode = 'P0001',
          detail = json_build_object('suma', v_suma, 'imputable', v_new.imputable)::text;
      end if;
    end if;
  end if;

  select * into v_f from public.pagos_facturas where id = p_factura_id;
  return jsonb_build_object(
    'factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id),
    'aprobacion_retirada', (v_estado_antes = 'aprobada' and v_f.estado = 'pendiente'));
end $function$;

-- ── 10) La vista: columnas nuevas al final ──────────────────────────────

do $$
declare d text; n int; cuenta text;
begin
  d := pg_get_viewdef('public.v_pagos_facturas'::regclass, true);
  cuenta := 'f.plan_cheques' || E'\n' || '   FROM';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'vista: esperaba 1, hay %', n; end if;
  execute 'create or replace view public.v_pagos_facturas as '
       || replace(d, cuenta, 'f.plan_cheques,' || E'\n'
                          || '    f.no_gravado,' || E'\n'
                          || '    f.exento,' || E'\n'
                          || '    f.cae,' || E'\n'
                          || '    f.cae_vto,' || E'\n'
                          || '    f.cbte_tipo_arca,' || E'\n'
                          || '    f.lectura_estado,' || E'\n'
                          || '    f.desglose_a_revisar' || E'\n'
                          || '   FROM');
end $$;

-- ── 11) Backfill mínimo ─────────────────────────────────────────────────
-- Facturas con neto e IVA cargados y sin detalle: una fila de IVA con la
-- alícuota que cierra (21 / 10,5 / 27 % con tolerancia de $1). Si ninguna
-- cierra, se marca `desglose_a_revisar` y no se inventa nada. Las pagadas se
-- tocan con el escape documentado: el detalle deriva exactamente los mismos
-- neto e IVA que ya tenían, no cambia plata.
-- Las percepciones viejas NO se pasan a tributos: sin detalle de tributos el
-- número de `percepciones` queda como está («sin discriminar»), que es
-- justamente lo que dice la regla de consistencia.
do $$
declare r record; v_alic smallint;
begin
  perform set_config('cadinc.descongelar', 'on', true);
  for r in select f.id, f.neto, f.iva from public.pagos_facturas f
            where f.neto is not null and f.iva is not null and f.neto > 0
              and not exists (select 1 from public.pagos_factura_iva i where i.factura_id = f.id) loop
    v_alic := case
      when abs(r.neto * 0.21  - r.iva) <= 1 then 5
      when abs(r.neto * 0.105 - r.iva) <= 1 then 4
      when abs(r.neto * 0.27  - r.iva) <= 1 then 6
      when r.iva = 0 then 3
      else null end;
    if v_alic is null then
      update public.pagos_facturas set desglose_a_revisar = true where id = r.id;
    else
      insert into public.pagos_factura_iva (factura_id, alicuota_id, base_imp, importe) values (r.id, v_alic, r.neto, r.iva);
    end if;
  end loop;
  perform set_config('cadinc.descongelar', '', true);
end $$;
