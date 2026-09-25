-- =====================================================================
-- Tesorería: cartera de cheques recibidos (fase 1)
-- (2026-09-25, serie 20260930)
--
-- Pedido del dueño: «si ya tenemos de quién es el número de cheque porque
-- cargamos el cobro, ¿no se debería cargar solo?». Diseño en Obsidian:
-- Proyectos/Cartera de cheques recibidos — diseño (2026-09-25).
--
-- Hasta hoy los cheques que RECIBE CADINC no eran un dato: en Logística
-- quedaban dentro del PDF de la liquidación (Casilda: «Detalle de Pagos») y
-- en Ventas en ventas_cobro_medios. Al endosarlos a un proveedor el
-- comprobante del Galicia no dice quién los libró, y quedaban «No informado»
-- o como propios (OP-0264, corregida hoy).
--
-- Fase 1:
--   · Tabla cheques_recibidos. Estados: en_cartera → endosado (pagos_cheque_id)
--     / depositado / rechazado → recuperado (fases siguientes). Un cheque es
--     único por (número sin ceros, importe).
--   · Ventas: cada medio cheque/e-cheq de un cobro entra solo (trigger); si el
--     cobro se anula, sale (si seguía en cartera).
--   · Compras: un cheque de tercero en una OP completa librador/banco desde
--     la cartera si venían vacíos o «No informado…» (BEFORE), y la cartera lo
--     marca endosado (AFTER). Si la OP se anula o el cheque se borra, vuelve a
--     en_cartera.
--   · Carga inicial: 104 cheques de las liquidaciones de Casilda adjuntas a
--     los cobros de Logística (leídos del «Detalle de Pagos») + los de Ventas;
--     después se vinculan los endosos ya emitidos y se completa su librador.
-- Logística todavía no carga sola los cheques al adjuntar la liquidación:
-- es la fase 2.
-- =====================================================================

create table public.cheques_recibidos (
  id                    bigserial primary key,
  numero                text not null,
  numero_norm           text generated always as (coalesce(nullif(ltrim(regexp_replace(numero, '\D', '', 'g'), '0'), ''), '0')) stored,
  banco                 text,
  librador              text,
  librador_cuit         text,
  fecha_cobro           date,
  importe               numeric(14,2) not null check (importe > 0),
  es_echeq              boolean,
  origen                text not null check (origen in ('logistica_cobro', 'ventas_cobro', 'manual')),
  cobro_id              integer references public.cobros(id) on delete set null,
  cobro_adjunto_id      bigint  references public.cobros_adjuntos(id) on delete set null,
  ventas_cobro_medio_id bigint  unique references public.ventas_cobro_medios(id) on delete set null,
  estado                text not null default 'en_cartera'
                        check (estado in ('en_cartera', 'endosado', 'depositado', 'rechazado', 'recuperado')),
  pagos_cheque_id       bigint unique references public.pagos_cheques(id) on delete set null,
  obs                   text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);

create unique index cheques_recibidos_numero_importe_uidx on public.cheques_recibidos (numero_norm, importe);
create index cheques_recibidos_estado_idx on public.cheques_recibidos (estado, fecha_cobro);

comment on table public.cheques_recibidos is
  'Cartera de cheques de terceros que recibe CADINC (cobros de Logística y de Ventas) y qué pasó con cada uno: en cartera, endosado a un proveedor (pagos_cheque_id), depositado, rechazado, recuperado. 20260930f.';

alter table public.cheques_recibidos enable row level security;
create policy cheques_recibidos_all on public.cheques_recibidos for all using (true) with check (true);
revoke all on public.cheques_recibidos from anon, authenticated;

-- ── Ventas: el medio cheque/e-cheq de un cobro entra a la cartera ───────
create or replace function public.fn_cheques_recibidos_desde_ventas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.forma not in ('cheque', 'echeq') or coalesce(btrim(new.cheque_numero), '') = '' or coalesce(new.importe, 0) <= 0 then
    delete from public.cheques_recibidos where ventas_cobro_medio_id = new.id and estado = 'en_cartera';
    return new;
  end if;
  begin
    insert into public.cheques_recibidos (numero, banco, librador, fecha_cobro, importe, es_echeq, origen, ventas_cobro_medio_id, created_by, updated_by)
    values (btrim(new.cheque_numero), nullif(btrim(new.cheque_banco), ''), nullif(btrim(new.cheque_librador), ''),
            new.cheque_fecha_cobro, new.importe, new.forma = 'echeq', 'ventas_cobro', new.id, public.usuario_actual(), public.usuario_actual())
    on conflict (ventas_cobro_medio_id) do update
       set numero = excluded.numero, banco = excluded.banco, librador = excluded.librador,
           fecha_cobro = excluded.fecha_cobro, importe = excluded.importe, es_echeq = excluded.es_echeq,
           updated_at = now(), updated_by = excluded.updated_by;
  exception when unique_violation then
    -- El mismo cheque ya está en la cartera (p. ej. vino de Logística): no se duplica.
    null;
  end;
  return new;
end $$;

create trigger trg_cheques_recibidos_desde_ventas
  after insert or update of forma, cheque_numero, cheque_banco, cheque_librador, cheque_fecha_cobro, importe
  on public.ventas_cobro_medios for each row execute function public.fn_cheques_recibidos_desde_ventas();

create or replace function public.fn_cheques_recibidos_cobro_anulado() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.estado = 'anulado' and old.estado is distinct from 'anulado' then
    delete from public.cheques_recibidos r
     using public.ventas_cobro_medios m
     where m.cobro_id = new.id and r.ventas_cobro_medio_id = m.id and r.estado = 'en_cartera';
  end if;
  return new;
end $$;

create trigger trg_cheques_recibidos_cobro_anulado
  after update of estado on public.ventas_cobros for each row execute function public.fn_cheques_recibidos_cobro_anulado();

-- ── Compras: el endoso toma el librador de la cartera y la marca ────────
create or replace function public._cheque_recibido_de(p_numero text, p_monto numeric) returns public.cheques_recibidos
language sql stable set search_path = public, pg_temp as $$
  select r.* from public.cheques_recibidos r
   where r.numero_norm = coalesce(nullif(ltrim(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), '0'), ''), '0')
     and r.importe = round(p_monto, 2)
   limit 1
$$;

create or replace function public.fn_pagos_cheque_desde_cartera() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.cheques_recibidos;
begin
  if new.es_propio then return new; end if;
  r := public._cheque_recibido_de(new.numero, new.monto);
  if r.id is null then return new; end if;
  if coalesce(btrim(new.librador), '') in ('', 'No informado en el detalle del endoso') and r.librador is not null then
    new.librador := r.librador || coalesce(' · CUIT ' || r.librador_cuit, '');
  end if;
  if coalesce(btrim(new.banco), '') = '' and r.banco is not null then new.banco := r.banco; end if;
  return new;
end $$;

create trigger trg_pagos_cheque_desde_cartera
  before insert on public.pagos_cheques for each row execute function public.fn_pagos_cheque_desde_cartera();

create or replace function public.fn_cartera_marca_endoso() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.es_propio then return new; end if;
  update public.cheques_recibidos r
     set estado = 'endosado', pagos_cheque_id = new.id, updated_at = now(), updated_by = public.usuario_actual()
   where r.id = (public._cheque_recibido_de(new.numero, new.monto)).id
     and r.estado = 'en_cartera';
  return new;
end $$;

create trigger trg_cartera_marca_endoso
  after insert on public.pagos_cheques for each row execute function public.fn_cartera_marca_endoso();

-- OP anulada o cheque borrado: el cheque vuelve a la cartera.
create or replace function public.fn_cartera_libera_por_op() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    update public.cheques_recibidos r
       set estado = 'en_cartera', pagos_cheque_id = null, updated_at = now(), updated_by = public.usuario_actual()
      from public.pagos_cheques c
     where c.orden_id = new.id and r.pagos_cheque_id = c.id and r.estado = 'endosado';
  end if;
  return new;
end $$;

create trigger trg_cartera_libera_por_op
  after update of estado on public.pagos_ordenes for each row execute function public.fn_cartera_libera_por_op();

create or replace function public.fn_cartera_libera_por_cheque() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.cheques_recibidos
     set estado = 'en_cartera', pagos_cheque_id = null, updated_at = now(), updated_by = public.usuario_actual()
   where pagos_cheque_id = old.id and estado = 'endosado';
  return old;
end $$;

create trigger trg_cartera_libera_por_cheque
  before delete on public.pagos_cheques for each row execute function public.fn_cartera_libera_por_cheque();

revoke all on function public.fn_cheques_recibidos_desde_ventas(), public.fn_cheques_recibidos_cobro_anulado(),
  public.fn_pagos_cheque_desde_cartera(), public.fn_cartera_marca_endoso(), public.fn_cartera_libera_por_op(),
  public.fn_cartera_libera_por_cheque(), public._cheque_recibido_de(text, numeric) from public, anon, authenticated;

-- ── Carga inicial ─────────────────────────────────────────────────────
-- 1) Casilda: el «Detalle de Pagos» de las liquidaciones adjuntas a los
--    cobros de Logística (empresa 11). 104 cheques, chequera ICBC, CH/PROP.
insert into public.cheques_recibidos (numero, banco, fecha_cobro, importe, cobro_id, cobro_adjunto_id, obs,
                                      librador, librador_cuit, origen)
select v.numero, v.banco, v.fecha, v.importe, v.cobro_id, v.adjunto_id, v.obs || ' de Casilda (carga inicial 20260930f)',
       'CASILDA COMBUSTIBLES S.R.L.', '30715675265', 'logistica_cobro'
  from (values
    ('14173053', 'ICBC', date '2026-08-30', 250000.00, 64, 97, 'LIQ 3083'),
    ('14173054', 'ICBC', date '2026-09-02', 250000.00, 64, 97, 'LIQ 3083'),
    ('14173055', 'ICBC', date '2026-09-04', 255186.92, 64, 97, 'LIQ 3083'),
    ('14259057', 'ICBC', date '2026-09-08', 250000.00, 68, 108, 'LIQ 3100'),
    ('14259058', 'ICBC', date '2026-09-09', 250000.00, 68, 108, 'LIQ 3100'),
    ('14259059', 'ICBC', date '2026-09-10', 250000.00, 68, 108, 'LIQ 3100'),
    ('14259060', 'ICBC', date '2026-09-12', 288313.66, 68, 108, 'LIQ 3100'),
    ('14259071', 'ICBC', date '2026-09-08', 280000.00, 88, 148, 'LIQ 3103'),
    ('14259072', 'ICBC', date '2026-09-09', 280000.00, 88, 148, 'LIQ 3103'),
    ('14259073', 'ICBC', date '2026-09-10', 280000.00, 88, 148, 'LIQ 3103'),
    ('14259074', 'ICBC', date '2026-09-11', 280000.00, 88, 148, 'LIQ 3103'),
    ('14259075', 'ICBC', date '2026-09-13', 280000.00, 88, 148, 'LIQ 3103'),
    ('14259076', 'ICBC', date '2026-09-15', 324540.31, 88, 148, 'LIQ 3103'),
    ('14321863', 'ICBC', date '2026-09-13', 284000.00, 86, 136, 'LIQ 3114'),
    ('14321864', 'ICBC', date '2026-09-15', 284000.00, 86, 136, 'LIQ 3114'),
    ('14321865', 'ICBC', date '2026-09-16', 284000.00, 86, 136, 'LIQ 3114'),
    ('14321866', 'ICBC', date '2026-09-17', 284000.00, 86, 136, 'LIQ 3114'),
    ('14321867', 'ICBC', date '2026-09-18', 284000.00, 86, 136, 'LIQ 3114'),
    ('14321868', 'ICBC', date '2026-09-19', 284000.00, 86, 136, 'LIQ 3114'),
    ('14321869', 'ICBC', date '2026-09-20', 284418.92, 86, 136, 'LIQ 3114'),
    ('14321858', 'ICBC', date '2026-09-12', 250000.00, 87, 138, 'LIQ 3115'),
    ('14321859', 'ICBC', date '2026-09-14', 250000.00, 87, 138, 'LIQ 3115'),
    ('14321860', 'ICBC', date '2026-09-15', 250000.00, 87, 138, 'LIQ 3115'),
    ('14321861', 'ICBC', date '2026-09-17', 250000.00, 87, 138, 'LIQ 3115'),
    ('14321862', 'ICBC', date '2026-09-18', 257949.18, 87, 138, 'LIQ 3115'),
    ('14321905', 'ICBC', date '2026-09-15', 315000.00, 96, 172, 'LIQ 3122'),
    ('14321906', 'ICBC', date '2026-09-16', 315000.00, 96, 172, 'LIQ 3122'),
    ('14321907', 'ICBC', date '2026-09-17', 315000.00, 96, 172, 'LIQ 3122'),
    ('14321908', 'ICBC', date '2026-09-19', 315000.00, 96, 172, 'LIQ 3122'),
    ('14321909', 'ICBC', date '2026-09-21', 315000.00, 96, 172, 'LIQ 3122'),
    ('14321910', 'ICBC', date '2026-09-23', 315000.00, 96, 172, 'LIQ 3122'),
    ('14321911', 'ICBC', date '2026-09-24', 336862.13, 96, 172, 'LIQ 3122'),
    ('14380057', 'ICBC', date '2026-09-22', 250000.00, 89, 151, 'LIQ 3126'),
    ('14380058', 'ICBC', date '2026-09-24', 250000.00, 89, 151, 'LIQ 3126'),
    ('14380059', 'ICBC', date '2026-09-26', 270000.00, 89, 151, 'LIQ 3126'),
    ('14380060', 'ICBC', date '2026-09-27', 286657.99, 89, 151, 'LIQ 3126'),
    ('14380061', 'ICBC', date '2026-09-22', 270000.00, 90, 154, 'LIQ 3127'),
    ('14380062', 'ICBC', date '2026-09-23', 270000.00, 90, 154, 'LIQ 3127'),
    ('14380063', 'ICBC', date '2026-09-25', 270000.00, 90, 154, 'LIQ 3127'),
    ('14380064', 'ICBC', date '2026-09-26', 287508.80, 90, 154, 'LIQ 3127'),
    ('14380083', 'ICBC', date '2026-09-24', 228631.59, 94, 166, 'LIQ 3134'),
    ('14380084', 'ICBC', date '2026-09-25', 240000.00, 94, 166, 'LIQ 3134'),
    ('14380085', 'ICBC', date '2026-09-26', 240000.00, 94, 166, 'LIQ 3134'),
    ('14380086', 'ICBC', date '2026-09-28', 240000.00, 94, 166, 'LIQ 3134'),
    ('14380087', 'ICBC', date '2026-09-29', 240000.00, 94, 166, 'LIQ 3134'),
    ('14380088', 'ICBC', date '2026-09-30', 240000.00, 94, 166, 'LIQ 3134'),
    ('14380089', 'ICBC', date '2026-09-25', 250000.00, 95, 169, 'LIQ 3135'),
    ('14380090', 'ICBC', date '2026-09-27', 250000.00, 95, 169, 'LIQ 3135'),
    ('14380091', 'ICBC', date '2026-09-29', 250000.00, 95, 169, 'LIQ 3135'),
    ('14380092', 'ICBC', date '2026-10-01', 250000.00, 95, 169, 'LIQ 3135'),
    ('14380093', 'ICBC', date '2026-10-03', 271923.04, 95, 169, 'LIQ 3135'),
    ('14380130', 'ICBC', date '2026-09-29', 225000.00, 98, 176, 'LIQ 3145'),
    ('14380131', 'ICBC', date '2026-10-02', 225000.00, 98, 176, 'LIQ 3145'),
    ('14380132', 'ICBC', date '2026-10-04', 225000.00, 98, 176, 'LIQ 3145'),
    ('14380133', 'ICBC', date '2026-10-06', 225000.00, 98, 176, 'LIQ 3145'),
    ('14380134', 'ICBC', date '2026-10-08', 236015.35, 98, 176, 'LIQ 3145'),
    ('14380135', 'ICBC', date '2026-10-01', 280000.00, 101, 185, 'LIQ 3146'),
    ('14380136', 'ICBC', date '2026-10-03', 280000.00, 101, 185, 'LIQ 3146'),
    ('14380137', 'ICBC', date '2026-10-05', 280000.00, 101, 185, 'LIQ 3146'),
    ('14380138', 'ICBC', date '2026-10-07', 280000.00, 101, 185, 'LIQ 3146'),
    ('14380139', 'ICBC', date '2026-10-09', 294525.60, 101, 185, 'LIQ 3146'),
    ('14380140', 'ICBC', date '2026-10-02', 280000.00, 100, 182, 'LIQ 3147'),
    ('14380141', 'ICBC', date '2026-10-04', 280000.00, 100, 182, 'LIQ 3147'),
    ('14380142', 'ICBC', date '2026-10-06', 280000.00, 100, 182, 'LIQ 3147'),
    ('14380143', 'ICBC', date '2026-10-08', 280000.00, 100, 182, 'LIQ 3147'),
    ('14380144', 'ICBC', date '2026-10-10', 294525.60, 100, 182, 'LIQ 3147'),
    ('14471182', 'ICBC', date '2026-10-19', 260000.00, 112, 237, 'LIQ 3164'),
    ('14471183', 'ICBC', date '2026-10-21', 260000.00, 112, 237, 'LIQ 3164'),
    ('14471184', 'ICBC', date '2026-10-23', 260000.00, 112, 237, 'LIQ 3164'),
    ('14471185', 'ICBC', date '2026-10-24', 260000.00, 112, 237, 'LIQ 3164'),
    ('14471186', 'ICBC', date '2026-10-25', 289620.68, 112, 237, 'LIQ 3164'),
    ('14471194', 'ICBC', date '2026-10-15', 260000.00, 113, 240, 'LIQ 3165'),
    ('14471195', 'ICBC', date '2026-10-17', 260000.00, 113, 240, 'LIQ 3165'),
    ('14471196', 'ICBC', date '2026-10-19', 260000.00, 113, 240, 'LIQ 3165'),
    ('14471197', 'ICBC', date '2026-10-21', 260000.00, 113, 240, 'LIQ 3165'),
    ('14471198', 'ICBC', date '2026-10-23', 262005.09, 113, 240, 'LIQ 3165'),
    ('14575819', 'ICBC', date '2026-10-28', 260000.00, 116, 253, 'LIQ 3177'),
    ('14575820', 'ICBC', date '2026-10-30', 260000.00, 116, 253, 'LIQ 3177'),
    ('14575821', 'ICBC', date '2026-10-31', 260000.00, 116, 253, 'LIQ 3177'),
    ('14575822', 'ICBC', date '2026-11-03', 260000.00, 116, 253, 'LIQ 3177'),
    ('14575823', 'ICBC', date '2026-11-05', 260000.00, 116, 253, 'LIQ 3177'),
    ('14575824', 'ICBC', date '2026-11-07', 282339.55, 116, 253, 'LIQ 3177'),
    ('14575825', 'ICBC', date '2026-10-27', 290000.00, 114, 252, 'LIQ 3178'),
    ('14575826', 'ICBC', date '2026-10-29', 290000.00, 114, 252, 'LIQ 3178'),
    ('14575827', 'ICBC', date '2026-10-31', 290000.00, 114, 252, 'LIQ 3178'),
    ('14575828', 'ICBC', date '2026-11-02', 290000.00, 114, 252, 'LIQ 3178'),
    ('14575829', 'ICBC', date '2026-11-04', 290000.00, 114, 252, 'LIQ 3178'),
    ('14575830', 'ICBC', date '2026-11-06', 290000.00, 114, 252, 'LIQ 3178'),
    ('14575831', 'ICBC', date '2026-11-08', 290000.00, 114, 252, 'LIQ 3178'),
    ('14575832', 'ICBC', date '2026-11-10', 307908.06, 114, 252, 'LIQ 3178'),
    ('14575857', 'ICBC', date '2026-11-01', 240000.00, 124, 258, 'LIQ 3179'),
    ('14575858', 'ICBC', date '2026-11-03', 240000.00, 124, 258, 'LIQ 3179'),
    ('14575859', 'ICBC', date '2026-11-04', 240000.00, 124, 258, 'LIQ 3179'),
    ('14575860', 'ICBC', date '2026-11-05', 240000.00, 124, 258, 'LIQ 3179'),
    ('14575861', 'ICBC', date '2026-11-06', 240000.00, 124, 258, 'LIQ 3179'),
    ('14575862', 'ICBC', date '2026-11-08', 284291.30, 124, 258, 'LIQ 3179'),
    ('14575833', 'ICBC', date '2026-10-30', 280000.00, 123, 255, 'LIQ 3181'),
    ('14575834', 'ICBC', date '2026-10-31', 280000.00, 123, 255, 'LIQ 3181'),
    ('14575835', 'ICBC', date '2026-11-02', 300000.00, 123, 255, 'LIQ 3181'),
    ('14575836', 'ICBC', date '2026-11-04', 300000.00, 123, 255, 'LIQ 3181'),
    ('14575837', 'ICBC', date '2026-11-06', 300000.00, 123, 255, 'LIQ 3181'),
    ('14575838', 'ICBC', date '2026-11-07', 300000.00, 123, 255, 'LIQ 3181'),
    ('14575839', 'ICBC', date '2026-11-08', 300000.00, 123, 255, 'LIQ 3181'),
    ('14575840', 'ICBC', date '2026-11-10', 220066.38, 123, 255, 'LIQ 3181')
  ) v(numero, banco, fecha, importe, cobro_id, adjunto_id, obs)
on conflict (numero_norm, importe) do nothing;

-- 2) Ventas: los medios cheque/e-cheq de cobros vigentes.
insert into public.cheques_recibidos (numero, banco, librador, fecha_cobro, importe, es_echeq, origen, ventas_cobro_medio_id, obs)
select btrim(m.cheque_numero), nullif(btrim(m.cheque_banco), ''), nullif(btrim(m.cheque_librador), ''),
       m.cheque_fecha_cobro, m.importe, m.forma = 'echeq', 'ventas_cobro', m.id, 'Carga inicial 20260930f'
  from public.ventas_cobro_medios m
  join public.ventas_cobros c on c.id = m.cobro_id and c.estado <> 'anulado'
 where m.forma in ('cheque', 'echeq') and coalesce(btrim(m.cheque_numero), '') <> '' and m.importe > 0
on conflict do nothing;

-- 3) Los endosos ya emitidos: completar librador/banco desde la cartera y
--    marcarla endosada. Sólo OPs emitidas; un cheque de la cartera se
--    vincula a una sola fila (la primera por id).
update public.pagos_cheques c
   set librador = r.librador || coalesce(' · CUIT ' || r.librador_cuit, ''),
       banco    = coalesce(nullif(btrim(c.banco), ''), r.banco)
  from public.cheques_recibidos r, public.pagos_ordenes o
 where o.id = c.orden_id and o.estado = 'emitida' and not c.es_propio
   and r.numero_norm = coalesce(nullif(ltrim(regexp_replace(c.numero, '\D', '', 'g'), '0'), ''), '0')
   and r.importe = round(c.monto, 2)
   and coalesce(btrim(c.librador), '') in ('', 'No informado en el detalle del endoso')
   and r.librador is not null;

with m as (
  select distinct on (r.id) r.id rid, c.id cid
    from public.cheques_recibidos r
    join public.pagos_cheques c on not c.es_propio
     and r.numero_norm = coalesce(nullif(ltrim(regexp_replace(c.numero, '\D', '', 'g'), '0'), ''), '0')
     and r.importe = round(c.monto, 2)
    join public.pagos_ordenes o on o.id = c.orden_id and o.estado = 'emitida'
   where r.estado = 'en_cartera'
   order by r.id, c.id
)
update public.cheques_recibidos r set estado = 'endosado', pagos_cheque_id = m.cid, updated_at = now()
  from m where r.id = m.rid;
