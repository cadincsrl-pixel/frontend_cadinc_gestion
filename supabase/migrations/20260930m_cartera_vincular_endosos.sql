-- =====================================================================
-- Cartera de cheques: un cheque que entra YA endosado se vincula solo
-- (2026-09-25, serie 20260930)
--
-- Si el cobro de Ventas se registra DESPUÉS de la OP donde se endosó el
-- cheque (pasa en la reconstrucción de julio–septiembre), el trigger lo
-- cargaba «en_cartera» sin vínculo. La RPC de Logística
-- (cheques_recibidos_registrar) ya vinculaba; ahora las dos puertas usan la
-- misma función: _cartera_vincular_endosos(ids).
--   · Completa el librador de la fila de la OP si decía «No informado…».
--   · Deja el cheque de la cartera `endosado` con su pagos_cheque_id.
-- =====================================================================

create or replace function public._cartera_vincular_endosos(p_ids bigint[]) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update public.pagos_cheques c
     set librador = r.librador || coalesce(' · CUIT ' || r.librador_cuit, ''),
         banco    = coalesce(nullif(btrim(c.banco), ''), r.banco)
    from public.cheques_recibidos r, public.pagos_ordenes o
   where r.id = any(p_ids) and o.id = c.orden_id and o.estado = 'emitida' and not c.es_propio
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
     where r.id = any(p_ids) and r.estado = 'en_cartera'
       and not exists (select 1 from public.cheques_recibidos x where x.pagos_cheque_id = c.id)
     order by r.id, c.id
  )
  update public.cheques_recibidos r set estado = 'endosado', pagos_cheque_id = m.cid, updated_at = now()
    from m where r.id = m.rid;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public._cartera_vincular_endosos(bigint[]) from public, anon, authenticated;

create or replace function public.fn_cheques_recibidos_desde_ventas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
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
           updated_at = now(), updated_by = excluded.updated_by
    returning id into v_id;
    -- Entró ya endosado (el cobro se cargó después de la OP): se vincula.
    perform public._cartera_vincular_endosos(array[v_id]);
  exception when unique_violation then
    null;
  end;
  return new;
end $$;
