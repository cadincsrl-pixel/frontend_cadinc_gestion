-- =====================================================================
-- Compras: la factura que cubre un pago RECONSTRUIDO queda «pagada»
-- (2026-09-25, serie 20260929)
--
-- Por qué: _pagos_recalcular_estado solo deja «pagada» a una factura
-- aprobada o pagada al cargar (pagos_facturas_aprob_pag_chk). Las compras de
-- meses ya pagados nunca se aprueban (FACTURA_A_RECONSTRUIR), así que al
-- reconstruir su pago quedaban con saldo 0 y estado «pendiente». Al imputarlas
-- aparecían en la bandeja como si hubiera que aprobarlas y pagarlas (13 de ABC
-- el 25/09; 286 en total).
--
-- Ahora: si el saldo lo cubren líneas de OP EMITIDAS y RECONSTRUIDAS y la
-- factura no está aprobada, pasa a «pagada» con la marca
-- pagada_reconstruida = true (el CHECK la acepta como tercer camino). Parcial
-- NO: una factura pagada en parte sigue «pendiente», porque el saldo es deuda
-- (pagos_pasar_a_deuda, 20260929y) y se aprueba y paga por el circuito normal.
-- Si la OP reconstruida se anula, el recálculo la devuelve a «pendiente» y
-- apaga la marca.
-- =====================================================================

alter table public.pagos_facturas
  add column if not exists pagada_reconstruida boolean not null default false;

comment on column public.pagos_facturas.pagada_reconstruida is
  'La factura quedó «pagada» por OP reconstruidas (pagos de meses ya pagados), sin aprobación. La mantiene _pagos_recalcular_estado. 20260929z.';

alter table public.pagos_facturas drop constraint pagos_facturas_aprob_pag_chk;
alter table public.pagos_facturas add constraint pagos_facturas_aprob_pag_chk
  check ((estado <> all (array['aprobada', 'pagada_parcial', 'pagada']))
         or aprobada_at is not null or pagada_al_cargar
         or (pagada_reconstruida and estado = 'pagada'));

-- Una importada sin imputar también puede quedar «pagada» por reconstrucción:
-- sigue en la lista «Sin imputar» (el filtro del frontend incluye «pagada»)
-- para que se impute igual; lo que no puede es estar aprobada ni pagarse a mano.
alter table public.pagos_facturas drop constraint pagos_facturas_sin_imputar_chk;
alter table public.pagos_facturas add constraint pagos_facturas_sin_imputar_chk
  check ((not sin_imputar)
     or ((estado = any (array['pendiente', 'observada', 'anulada'])) and aprobada_at is null and not pagada_al_cargar and not paga_cliente)
     or (estado = 'pagada' and pagada_reconstruida and aprobada_at is null and not pagada_al_cargar and not paga_cliente)
     or ((clase = 'nota_credito') and pago_a_reconstruir and not pagada_al_cargar and not paga_cliente));

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

do $m$
declare
  v text := pg_get_functiondef('public._pagos_recalcular_estado(bigint)'::regprocedure);
begin
  v := pg_temp._una(v,
    '  v_nuevo    text;',
    '  v_nuevo    text;
  v_recon    boolean := false;');
  v := pg_temp._una(v,
    '    v_puede := v_f.aprobada_at is not null or v_f.pagada_al_cargar;',
    '    v_puede := v_f.aprobada_at is not null or v_f.pagada_al_cargar;
    -- 20260929z: sin aprobar, pero cubierta por OP reconstruidas emitidas.
    v_recon := not v_puede and exists (
      select 1 from public.pagos_orden_lineas l
        join public.pagos_ordenes o on o.id = l.orden_id
       where l.factura_id = p_factura_id and o.estado = ''emitida'' and o.reconstruida);');
  v := pg_temp._una(v,
    '      when v_puede and v_aplicado >= v_f.total    then ''pagada''',
    '      when v_puede and v_aplicado >= v_f.total    then ''pagada''
      when v_recon and v_aplicado >= v_f.total    then ''pagada''');
  v := pg_temp._una(v,
    '  if v_nuevo is distinct from v_f.estado then
    perform set_config(''cadinc.pagos_recalc'', ''on'', true);
    update public.pagos_facturas set estado = v_nuevo where id = p_factura_id;',
    '  if v_nuevo is distinct from v_f.estado
     or v_f.pagada_reconstruida is distinct from (v_recon and v_nuevo = ''pagada'') then
    perform set_config(''cadinc.pagos_recalc'', ''on'', true);
    update public.pagos_facturas
       set estado = v_nuevo, pagada_reconstruida = (v_recon and v_nuevo = ''pagada'')
     where id = p_factura_id;');
  execute v;
end $m$;

-- Backfill: todas las facturas con líneas en OP reconstruidas.
do $b$
declare r record;
begin
  for r in select distinct l.factura_id
             from public.pagos_orden_lineas l
             join public.pagos_ordenes o on o.id = l.orden_id and o.reconstruida
            where l.factura_id is not null loop
    perform public._pagos_recalcular_estado(r.factura_id);
  end loop;
end $b$;
