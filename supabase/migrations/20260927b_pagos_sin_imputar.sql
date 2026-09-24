-- =====================================================================
-- Compras: facturas «sin imputar» (importadas de ARCA) (2026-09-27)
--
-- Por qué: el importador de «Mis Comprobantes Recibidos» (20260927c) da de
-- alta cientos de comprobantes de jul–sep que todavía no tienen concepto ni
-- reparto por obra. Entran igual (cuentan para el Libro IVA, la posición y
-- la contabilidad) pero marcados `sin_imputar`, un FLAG y no un estado: la
-- máquina de estados y las vistas no cambian.
--
-- Reglas (todas en la base; el backend las adelanta para dar errores limpios):
--   · sin_imputar solo lo pone el importador (INSERT). Pasarlo a false solo
--     desde pagos_imputar_factura (GUC cadinc.pagos_imputar).
--   · Una factura sin imputar NO se aprueba (FACTURA_SIN_IMPUTAR) y, como
--     pagar exige aprobada, tampoco se paga (_pagos_validar_pagable lo repite
--     como defensa). Aprobar es validar el costo por obra: sin reparto no hay
--     nada que aprobar.
--   · Se relaja SOLO con sin_imputar: concepto_id null (CHECK) y 0 filas de
--     pagos_imputaciones (pagos_editar_factura deja de exigir el cuadre si no
--     hay reparto). El resto (desglose, cierre, índice único) sigue igual.
--   · tributos_a_revisar: «Otros Tributos» de ARCA mezcla percepciones de IVA,
--     IIBB y otras. Se clasifican con pagos_completar_desglose (que baja el
--     flag). Con el flag prendido no se imputa: lo imputable es
--     total − percepciones.
--
-- RPC nuevas: pagos_imputar_factura y pagos_imputar_lote (todo o nada).
-- Técnica de anclas sobre la definición VIVA (20260925k).
-- =====================================================================

-- ── 1) Registro de importaciones ───────────────────────────────────────
create table public.pagos_importaciones (
  id                 bigserial primary key,
  origen             text not null default 'arca_recibidos' check (origen in ('arca_recibidos')),
  archivo            text not null default '',
  hash_sha256        text,
  fecha_desde        date,
  fecha_hasta        date,
  filas              int not null default 0,
  nuevas             int not null default 0,
  duplicadas         int not null default 0,
  proveedores_nuevos int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id)
);
comment on table public.pagos_importaciones is
  'Cada importación confirmada de «Mis Comprobantes Recibidos» de ARCA (20260927c). Las facturas la referencian por importacion_id.';

-- ── 2) Columnas y constraints en pagos_facturas ────────────────────────
alter table public.pagos_facturas
  add column sin_imputar        boolean not null default false,
  add column tributos_a_revisar boolean not null default false,
  add column origen_carga       text    not null default 'manual' check (origen_carga in ('manual', 'arca_recibidos')),
  add column importacion_id     bigint references public.pagos_importaciones(id),
  add constraint pagos_facturas_concepto_o_sin_imputar_chk check (sin_imputar or concepto_id is not null),
  add constraint pagos_facturas_sin_imputar_chk check (not sin_imputar or (
      estado in ('pendiente', 'observada', 'anulada') and aprobada_at is null and not pagada_al_cargar and not paga_cliente));
create index pagos_facturas_sin_imputar_idx on public.pagos_facturas (fecha) where sin_imputar and estado <> 'anulada';
create index pagos_facturas_importacion_idx on public.pagos_facturas (importacion_id) where importacion_id is not null;

comment on column public.pagos_facturas.sin_imputar is
  'Importada de ARCA sin concepto ni reparto por obra. No se aprueba ni se paga hasta imputarla (pagos_imputar_factura). 20260927b.';
comment on column public.pagos_facturas.tributos_a_revisar is
  '«Otros Tributos» de ARCA sin clasificar (tributo tipo otro). Se baja con pagos_completar_desglose. No se imputa con el flag prendido. 20260927b.';

-- ── 3) Guarda del flag ─────────────────────────────────────────────────
create or replace function public.fn_pagos_sin_imputar_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return new; end if;
  if new.sin_imputar and not old.sin_imputar then
    raise exception 'SIN_IMPUTAR_SOLO_IMPORTADOR' using errcode = 'P0001', detail = json_build_object('factura_id', old.id)::text;
  end if;
  if old.sin_imputar and not new.sin_imputar
     and coalesce(current_setting('cadinc.pagos_imputar', true), '') <> 'on' then
    raise exception 'IMPUTAR_SOLO_RPC' using errcode = 'P0001', detail = json_build_object('factura_id', old.id)::text;
  end if;
  return new;
end $$;

create trigger trg_pagos_sin_imputar_guard before update of sin_imputar on public.pagos_facturas
  for each row execute function public.fn_pagos_sin_imputar_guard();

-- ── 4) Parches por ancla ───────────────────────────────────────────────
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

-- 4.a) pagos_aprobar_factura: no se aprueba sin imputar (el lote la llama).
do $m$
declare
  v text := pg_get_functiondef('public.pagos_aprobar_factura(bigint,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  if v_f.paga_cliente then
    raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  select activo into v_activo$a$,
$a$  -- 20260927b: sin concepto ni reparto no hay costo que validar.
  if v_f.sin_imputar then
    raise exception 'FACTURA_SIN_IMPUTAR' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.paga_cliente then
    raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  select activo into v_activo$a$);
  execute v;
end $m$;

-- 4.b) _pagos_validar_pagable: defensa (pagar exige aprobada, que ya exige imputada).
do $m$
declare
  v text := pg_get_functiondef('public._pagos_validar_pagable(bigint,bigint)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  if v_f.paga_cliente then$a$,
$a$  if v_f.sin_imputar then
    raise exception 'FACTURA_SIN_IMPUTAR' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.paga_cliente then$a$);
  execute v;
end $m$;

-- 4.c) pagos_editar_factura: el reparto de una sin imputar va por
--      pagos_imputar_factura; y sin reparto no se exige cuadre.
do $m$
declare
  v text := pg_get_functiondef('public.pagos_editar_factura(bigint,jsonb,jsonb,text,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then$a$,
$a$  if v_f.sin_imputar and p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then
    raise exception 'FACTURA_SIN_IMPUTAR' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'usar', 'imputar')::text;
  end if;
  if p_imputaciones is not null and jsonb_typeof(p_imputaciones) = 'array' then$a$);
  v := pg_temp._una(v,
$a$    if abs(v_suma - v_new.imputable) > 0.01 then$a$,
$a$    if v_n > 0 and abs(v_suma - v_new.imputable) > 0.01 then$a$);
  execute v;
end $m$;

-- 4.d) pagos_completar_desglose: clasificar los tributos baja el flag.
do $m$
declare
  v text := pg_get_functiondef('public.pagos_completar_desglose(bigint,jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$         desglose_a_revisar = false,$a$,
$a$         desglose_a_revisar = false,
         tributos_a_revisar = false,$a$);
  execute v;
end $m$;

-- ── 5) v_pagos_facturas: columnas al final ─────────────────────────────
do $m$
declare
  v text := rtrim(pg_get_viewdef('public.v_pagos_facturas'::regclass), ';');
begin
  v := pg_temp._una(v,
$a$ AS periodo_iva_distinto
   FROM $a$,
$a$ AS periodo_iva_distinto,
    f.sin_imputar,
    f.tributos_a_revisar,
    f.origen_carga,
    f.importacion_id
   FROM $a$);
  execute 'create or replace view public.v_pagos_facturas as ' || v;
end $m$;

drop function pg_temp._una(text, text, text);

-- ── 6) Imputar una factura importada ───────────────────────────────────
create or replace function public.pagos_imputar_factura(p_factura_id bigint, p_concepto_id bigint, p_imputaciones jsonb,
                                                        p_descripcion text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_f public.pagos_facturas%rowtype;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'FACTURA_CERRADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if not v_f.sin_imputar then
    raise exception 'FACTURA_YA_IMPUTADA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.tributos_a_revisar then
    raise exception 'TRIBUTOS_A_REVISAR' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if p_concepto_id is null then
    raise exception 'CONCEPTO_REQUERIDO' using errcode = 'P0001', detail = json_build_object('campo', 'concepto_id')::text;
  end if;
  if not exists (select 1 from public.pagos_conceptos c where c.id = p_concepto_id and c.activo) then
    raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'concepto_id', 'concepto_id', p_concepto_id)::text;
  end if;
  if p_descripcion is not null and length(btrim(p_descripcion)) < 3 then
    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001', detail = json_build_object('campo', 'descripcion')::text;
  end if;

  -- IMPUTACION_REQUERIDA / _INVALIDA / OBRA_INEXISTENTE / OBRA_ARCHIVADA / IMPUTACION_DUPLICADA / IMPUTACION_NO_CUADRA
  perform public._pagos_reemplazar_imputaciones(p_factura_id, p_imputaciones, p_user_id);

  perform set_config('cadinc.pagos_imputar', 'on', true);
  update public.pagos_facturas
     set concepto_id = p_concepto_id,
         sin_imputar = false,
         descripcion = coalesce(btrim(p_descripcion), descripcion),
         obs         = ltrim(rtrim(coalesce(obs, '') || E'\n' || to_char(public.hoy_ar(), 'DD/MM') || ' — imputada'), E'\n'),
         updated_by  = p_user_id
   where id = p_factura_id;
  perform set_config('cadinc.pagos_imputar', '', true);

  return jsonb_build_object('factura', (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id));
end $$;

comment on function public.pagos_imputar_factura(bigint, bigint, jsonb, text, uuid) is
  'Imputa una factura importada de ARCA (sin_imputar): concepto + reparto por obra. Única puerta que baja sin_imputar. 20260927b.';

-- ── 7) Imputar en lote (100 % a una obra) ──────────────────────────────
create or replace function public.pagos_imputar_lote(p_ids bigint[], p_concepto_id bigint, p_obra_cod text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids   bigint[];
  v_id    bigint;
  v_imp   numeric(14,2);
  v_n     int := 0;
  v_msg   text;
  v_det   text;
  v_state text;
  v_detj  jsonb;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_ids) x where x is not null;
  if v_ids is null then raise exception 'SIN_FILAS' using errcode = 'P0001'; end if;
  if array_length(v_ids, 1) > 200 then
    raise exception 'DEMASIADAS_FILAS' using errcode = 'P0001', detail = json_build_object('max', 200)::text;
  end if;

  -- Locks en orden de id (mismo orden que el resto de las RPC de Pagos).
  perform 1 from public.pagos_facturas where id = any(v_ids) order by id for update;

  foreach v_id in array v_ids loop
    begin
      select imputable into v_imp from public.pagos_facturas where id = v_id;
      perform public.pagos_imputar_factura(v_id, p_concepto_id,
        jsonb_build_array(jsonb_build_object('obra_cod', p_obra_cod, 'monto', v_imp)), null, p_user_id);
    exception when others then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail, v_state = returned_sqlstate;
      begin
        v_detj := nullif(v_det, '')::jsonb;
      exception when others then
        v_detj := jsonb_build_object('detalle', v_det);
      end;
      if v_detj is null or jsonb_typeof(v_detj) <> 'object' then v_detj := '{}'::jsonb; end if;
      raise exception '%', v_msg using errcode = v_state, detail = (v_detj || jsonb_build_object('factura_id', v_id))::text;
    end;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('imputadas', v_n, 'ids', to_jsonb(v_ids));
end $$;

comment on function public.pagos_imputar_lote(bigint[], bigint, text, uuid) is
  'Imputa hasta 200 facturas sin imputar a UNA obra (100 %) con un concepto. Todo o nada; el error lleva detail.factura_id. 20260927b.';

-- ── 8) Auditoría, RLS y grants ─────────────────────────────────────────
create trigger trg_pagos_importaciones_touch before update on public.pagos_importaciones
  for each row execute function public.set_updated_at();
create trigger trg_audit_borrado after delete on public.pagos_importaciones
  for each row execute function public.audit_borrado('pagos', 'importación ARCA', 'id');

alter table public.pagos_importaciones enable row level security;
create policy pagos_importaciones_all on public.pagos_importaciones for all using (true) with check (true);
revoke all on table public.pagos_importaciones from public, anon, authenticated;
grant all on table public.pagos_importaciones to service_role;
revoke all on sequence public.pagos_importaciones_id_seq from public, anon, authenticated;
grant usage, select on sequence public.pagos_importaciones_id_seq to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'fn_pagos_sin_imputar_guard()',
    'pagos_imputar_factura(bigint, bigint, jsonb, text, uuid)',
    'pagos_imputar_lote(bigint[], bigint, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
