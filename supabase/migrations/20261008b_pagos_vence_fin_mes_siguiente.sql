-- Compras: vencimiento «fin del mes siguiente» (grupo Silva, 27/09/2026).
--
-- El grupo Silva (Silva SRL y Pinturería España SRL) avisó: las facturas de
-- agosto se cancelan hasta el 30/09 y las de septiembre hasta el 31/10, y el
-- pago se discrimina por CUIT (una OP por empresa, nunca un pago que mezcle
-- las dos). El modo `cierre_mensual` (fin de mes + N días) no sirve: da 30/10
-- para septiembre. Nuevo modo `fin_mes_siguiente`: vence el último día del mes
-- siguiente al de la factura (sin correr por fin de semana: «hasta el 31/10»).
-- Se elige en Compras › Proveedores › «Cómo vence»; el mismo cálculo vive en
-- el frontend (`vencimientoSugerido`) y acá para el importador de ARCA.

alter table public.pagos_proveedores drop constraint pagos_proveedores_venc_modo_chk;
alter table public.pagos_proveedores add constraint pagos_proveedores_venc_modo_chk
  check (vencimiento_modo = any (array['dias', 'cierre_mensual', 'fin_mes_siguiente']));

create or replace function public._pagos_prevision_pago(p_proveedor_id bigint, p_fecha date, p_clase text, p_tipo text)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
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
    if v_p.vencimiento_modo = 'fin_mes_siguiente' then
      -- Último día del mes siguiente al de la factura (grupo Silva).
      v_vence := (date_trunc('month', p_fecha) + interval '2 month - 1 day')::date;
    elsif v_p.vencimiento_modo = 'cierre_mensual' then
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
end $function$;

-- Grupo Silva: Silva SRL (30-65761193-6) y Pinturería España SRL (30-70805990-7).
update public.pagos_proveedores
   set vencimiento_modo = 'fin_mes_siguiente', cierre_dia = null,
       obs = concat_ws(E'\n', nullif(obs, ''),
             'Grupo Silva (Silva SRL + Pinturería España SRL): las facturas de un mes se pagan hasta el último día del mes siguiente, y el pago se discrimina por CUIT (una OP por empresa). Aviso del proveedor, 27/09/2026.')
 where cuit in ('30657611936', '30708059907');

-- Vencimiento de lo que sigue impago: agosto → 30/09, septiembre → 31/10.
update public.pagos_facturas f
   set vence_el = (date_trunc('month', f.fecha) + interval '2 month - 1 day')::date
  from public.pagos_proveedores p
 where p.id = f.proveedor_id
   and p.cuit in ('30657611936', '30708059907')
   and f.clase = 'factura'
   and f.estado in ('pendiente', 'observada', 'aprobada', 'pagada_parcial')
   and f.fecha is not null;
