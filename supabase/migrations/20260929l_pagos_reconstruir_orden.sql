-- =====================================================================
-- Compras: registrar el pago de facturas «de meses ya pagados»
-- (2026-09-25, serie 20260929)
--
-- Por qué: las compras importadas con «historica» (20260928b) quedan
-- pago_a_reconstruir hasta que una OP las deja en saldo 0. Pero la OP normal
-- no servía para eso:
--   · exige factura aprobada, y estas no se aprueban (FACTURA_A_RECONSTRUIR);
--   · transferencia / débito exigen CBU o alias del proveedor, y los 60
--     proveedores dados de alta por el importador no tienen;
--   · transferencia / echeq exigen un comprobante adjunto, y el pago viejo no
--     tiene uno suelto: la prueba es la línea del extracto o del listado de
--     echeqs, que va en `referencia`.
--
-- Diseño:
--   · pagos_reconstruir_orden(proveedor, orden, lineas, user): SOLO facturas
--     con el flag EFECTIVO pago_a_reconstruir (v_pagos_facturas), solo líneas
--     `factura`, pide registrar_pagos (o admin). Llama a _pagos_emitir_orden con
--     p_exigir_aprobada = false y la GUC local cadinc.pagos_reconstruir = 'on'.
--   · _pagos_emitir_orden: con esa GUC saltea SOLO los dos controles de arriba
--     (CBU y comprobante). Todo lo demás vale igual: saldo, cheques (Σ, número,
--     fecha de cobro ≥ fecha), cheque único, forma de pago, cuenta origen.
--   · La GUC se apaga al volver, así no alcanza a otra OP de la misma
--     transacción.
--   · No hay doble firma que aplicar: nadie aprobó ni cargó a mano estas
--     facturas (las cargó el importador), y el pago ya ocurrió.
--   · pagos_ordenes.reconstruida: la marca queda en la OP. Su DEFAULT lee la
--     misma GUC, así nace en true solo por esta puerta. El CHECK
--     pagos_ordenes_destino_chk (transferencia con CBU o alias) la acepta.
-- =====================================================================

-- ── 0) Marca en la OP ────────────────────────────────────────────────────
alter table public.pagos_ordenes
  add column reconstruida boolean not null
    default (coalesce(current_setting('cadinc.pagos_reconstruir', true), '') = 'on');

comment on column public.pagos_ordenes.reconstruida is
  'OP de un pago ya ocurrido, registrada después desde el extracto (pagos_reconstruir_orden). Sin comprobante adjunto ni CBU del proveedor: la prueba va en referencia. 20260929l.';

alter table public.pagos_ordenes drop constraint pagos_ordenes_destino_chk;
alter table public.pagos_ordenes add constraint pagos_ordenes_destino_chk
  check (forma_pago <> 'transferencia' or cbu_destino is not null or alias_destino is not null or reconstruida);

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

-- ── 1) _pagos_emitir_orden: los dos controles ceden ante la GUC ─────────
do $m$
declare
  v text := pg_get_functiondef('public._pagos_emitir_orden(bigint,jsonb,jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_cta_origen  bigint;
$a$,
$a$  v_cta_origen  bigint;
  -- Pago reconstruido (20260929l): lo prende SOLO pagos_reconstruir_orden.
  v_reconstruir boolean := coalesce(current_setting('cadinc.pagos_reconstruir', true), '') = 'on';
$a$);
  v := pg_temp._una(v,
$a$  if v_forma in ('transferencia', 'debito_automatico') then
    if v_prov.cbu is null and v_prov.alias_cbu is null then$a$,
$a$  if v_forma in ('transferencia', 'debito_automatico') then
    if v_prov.cbu is null and v_prov.alias_cbu is null and not v_reconstruir then$a$);
  v := pg_temp._una(v,
$a$  if v_forma in ('transferencia', 'echeq')
     and not exists$a$,
$a$  if v_forma in ('transferencia', 'echeq') and not v_reconstruir
     and not exists$a$);
  execute v;
end $m$;

-- ── 2) La puerta ─────────────────────────────────────────────────────────
create or replace function public.pagos_reconstruir_orden(
  p_proveedor_id bigint,
  p_orden        jsonb,
  p_lineas       jsonb,
  p_user_id      uuid
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  l    record;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._pagos_es_admin(p_user_id) and not public._pagos_flag(p_user_id, 'registrar_pagos', false) then
    raise exception 'SIN_PERMISO_REGISTRAR_PAGOS' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'LINEAS_REQUERIDAS' using errcode = 'P0001';
  end if;
  for l in select coalesce(x.tipo, 'factura') as tipo, x.factura_id
             from jsonb_to_recordset(p_lineas) as x(tipo text, factura_id bigint) loop
    if l.tipo <> 'factura' or l.factura_id is null then
      raise exception 'RECONSTRUIR_SOLO_FACTURAS' using errcode = 'P0001',
        detail = json_build_object('tipo', l.tipo, 'factura_id', l.factura_id)::text;
    end if;
    if not exists (select 1 from public.v_pagos_facturas f
                    where f.id = l.factura_id and f.proveedor_id = p_proveedor_id and f.pago_a_reconstruir) then
      raise exception 'FACTURA_NO_A_RECONSTRUIR' using errcode = 'P0001',
        detail = json_build_object('factura_id', l.factura_id)::text;
    end if;
  end loop;

  perform set_config('cadinc.pagos_reconstruir', 'on', true);
  v_id := public._pagos_emitir_orden(p_proveedor_id, p_orden, p_lineas, '[]'::jsonb, p_user_id, false);
  perform set_config('cadinc.pagos_reconstruir', '', true);
  return v_id;
end $$;

comment on function public.pagos_reconstruir_orden(bigint, jsonb, jsonb, uuid) is
  'OP de un pago ya ocurrido sobre facturas pago_a_reconstruir (importadas de meses pagados): sin aprobación, sin CBU del proveedor y sin comprobante adjunto (la prueba va en referencia). El resto de las reglas de la OP valen igual. 20260929l.';

revoke all on function public.pagos_reconstruir_orden(bigint, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pagos_reconstruir_orden(bigint, jsonb, jsonb, uuid) to service_role;
