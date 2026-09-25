-- =====================================================================
-- Compras: la forma de pago habitual del proveedor
-- (2026-09-25, serie 20260930)
--
-- Pedido del dueño: «esas 8 facturas de ABC que me figuran para pagar con
-- transferencia las pagaré con e-cheq; ABC se paga a 30 días con e-cheq desde
-- fecha factura». El proveedor ya tenía el plazo (plazo_pago_dias = 30,
-- vencimiento_modo 'dias'), pero:
--   · no tenía una forma de pago habitual, y
--   · el importador de «Mis Comprobantes» (pagos_importar_recibidos) cargaba
--     TODAS las facturas con 'transferencia', sin vencimiento y sin plan de
--     cheques: ni el plazo del proveedor usaba.
--
-- 1. pagos_proveedores.forma_pago_habitual (null = sin preferencia, que es
--    'transferencia' como hasta hoy). Se edita en la ficha del proveedor.
-- 2. _pagos_prevision_pago(proveedor, fecha, clase, tipo) → { forma, vence_el,
--    plan_cheques }: lo que se prevé para una factura nueva de ese proveedor.
--    Vencimiento = espejo SQL de `vencimientoSugerido` (pagos.utils.ts): a N
--    días de la factura, o por cierre mensual (último día hábil del cierre + N).
--    Sólo facturas A/B/C (una NC no vence ni se paga). Con cheque/e-cheq, el
--    plan es UN cheque al vencimiento.
-- 3. El importador usa la previsión.
-- 4. Datos: ABC S.A. pasa a e-cheq, y sus facturas abiertas que estaban por
--    transferencia sin plan toman forma, vencimiento y plan.
-- =====================================================================

alter table public.pagos_proveedores
  add column forma_pago_habitual text
  check (forma_pago_habitual in ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'echeq', 'debito_automatico', 'cta_cte', 'otro'));

comment on column public.pagos_proveedores.forma_pago_habitual is
  'Cómo se le paga normalmente: la forma prevista con que nacen sus facturas (al cargarlas y al importarlas de ARCA). Null = transferencia. 20260930a.';

create or replace function public._pagos_prevision_pago(
  p_proveedor_id bigint, p_fecha date, p_clase text, p_tipo text
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_p      public.pagos_proveedores%rowtype;
  v_forma  text;
  v_vence  date;
  v_cierre date;
  v_ult    date;
begin
  select * into v_p from public.pagos_proveedores where id = p_proveedor_id;
  if p_clase = 'nota_credito' or not found then
    return jsonb_build_object('forma', 'transferencia', 'vence_el', null, 'plan_cheques', null);
  end if;
  v_forma := coalesce(v_p.forma_pago_habitual, 'transferencia');
  if p_fecha is not null and p_tipo in ('A', 'B', 'C') then
    if v_p.vencimiento_modo = 'cierre_mensual' then
      -- fechaDeCierre: sin día, fin de mes; con día, ese día (o el del mes
      -- siguiente si la factura salió después), topeado al fin de ese mes.
      if coalesce(v_p.cierre_dia, 0) <= 0 then
        v_cierre := (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date;
      else
        v_cierre := case when extract(day from p_fecha) <= v_p.cierre_dia
                         then date_trunc('month', p_fecha)::date
                         else (date_trunc('month', p_fecha) + interval '1 month')::date end;
        v_ult := (v_cierre + interval '1 month - 1 day')::date;
        v_cierre := v_cierre + (least(v_p.cierre_dia, extract(day from v_ult)::int) - 1);
      end if;
      -- ultimoDiaHabil: hacia atrás mientras sea sábado o domingo.
      while extract(isodow from v_cierre) in (6, 7) loop v_cierre := v_cierre - 1; end loop;
      v_vence := v_cierre + coalesce(v_p.plazo_pago_dias, 30);
    else
      v_vence := p_fecha + coalesce(v_p.plazo_pago_dias, 30);
    end if;
  end if;
  return jsonb_build_object(
    'forma', v_forma,
    'vence_el', v_vence,
    'plan_cheques', case when v_forma in ('cheque', 'echeq') and v_vence is not null
                         then jsonb_build_object('cantidad', 1, 'primer_cobro', to_char(v_vence, 'YYYY-MM-DD'), 'cada_dias', 30) end);
end $$;

comment on function public._pagos_prevision_pago(bigint, date, text, text) is
  'Forma, vencimiento y plan de cheques previstos para una factura nueva del proveedor (forma_pago_habitual + plazo). Espejo de vencimientoSugerido. 20260930a.';

revoke all on function public._pagos_prevision_pago(bigint, date, text, text) from public, anon, authenticated;
grant execute on function public._pagos_prevision_pago(bigint, date, text, text) to service_role;

-- ── El importador usa la previsión ────────────────────────────────────
do $patch$
declare
  v_def text := pg_get_functiondef('public.pagos_importar_recibidos'::regproc);
  v_new text := v_def;
begin
  -- 1) columna plan_cheques en el insert
  if (length(v_new) - length(replace(v_new, E'pago_a_reconstruir)\n        values (', ''))) / length(E'pago_a_reconstruir)\n        values (') <> 1 then
    raise exception 'ANCLA_1_NO_UNICA';
  end if;
  v_new := replace(v_new, E'pago_a_reconstruir)\n        values (', E'pago_a_reconstruir, plan_cheques)\n        values (');
  -- 2) vencimiento
  if (length(v_new) - length(replace(v_new, 'v_prov, v_tipo, v_numero, v_nn, v_fecha, null, v_neto,', ''))) / length('v_prov, v_tipo, v_numero, v_nn, v_fecha, null, v_neto,') <> 1 then
    raise exception 'ANCLA_2_NO_UNICA';
  end if;
  v_new := replace(v_new, 'v_prov, v_tipo, v_numero, v_nn, v_fecha, null, v_neto,',
    E'v_prov, v_tipo, v_numero, v_nn, v_fecha,\n          (public._pagos_prevision_pago(v_prov, v_fecha, v_clase, v_tipo) ->> ''vence_el'')::date, v_neto,');
  -- 3) forma prevista
  if (length(v_new) - length(replace(v_new, E'v_tot,\n          ''transferencia'', ''Importada de ARCA', ''))) / length(E'v_tot,\n          ''transferencia'', ''Importada de ARCA') <> 1 then
    raise exception 'ANCLA_3_NO_UNICA';
  end if;
  v_new := replace(v_new, E'v_tot,\n          ''transferencia'', ''Importada de ARCA',
    E'v_tot,\n          public._pagos_prevision_pago(v_prov, v_fecha, v_clase, v_tipo) ->> ''forma'', ''Importada de ARCA');
  -- 4) plan de cheques
  if (length(v_new) - length(replace(v_new, E'coalesce(p_historica, false))\n        returning id into v_fid;', ''))) / length(E'coalesce(p_historica, false))\n        returning id into v_fid;') <> 1 then
    raise exception 'ANCLA_4_NO_UNICA';
  end if;
  v_new := replace(v_new, E'coalesce(p_historica, false))\n        returning id into v_fid;',
    E'coalesce(p_historica, false),\n          public._pagos_prevision_pago(v_prov, v_fecha, v_clase, v_tipo) -> ''plan_cheques'')\n        returning id into v_fid;');
  execute v_new;
end $patch$;

-- ── Datos: ABC S.A. ───────────────────────────────────────────────────
update public.pagos_proveedores set forma_pago_habitual = 'echeq'
 where id = 10 and razon_social = 'ABC S.A.';

-- Sus facturas abiertas que nacieron «transferencia» sin plan (las 8 del
-- pedido): forma, vencimiento y plan según la previsión. No toca las que ya
-- tienen pago ni las que alguien cambió a mano.
update public.pagos_facturas f
   set forma_pago_prevista = x.p ->> 'forma',
       vence_el            = coalesce(f.vence_el, (x.p ->> 'vence_el')::date),
       plan_cheques        = x.p -> 'plan_cheques'
  from (select id, public._pagos_prevision_pago(proveedor_id, fecha, clase, tipo_comprobante) p
          from public.pagos_facturas where proveedor_id = 10) x
 where x.id = f.id
   and f.proveedor_id = 10
   and f.clase = 'factura'
   and f.estado in ('pendiente', 'observada', 'aprobada')
   and f.forma_pago_prevista = 'transferencia'
   and f.plan_cheques is null;
