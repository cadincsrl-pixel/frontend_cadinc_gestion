-- =====================================================================
-- Certificados y cobros: candados antes de empezar a certificar (2026-09-24)
--
-- Revisión completa de Pedidos y Stock del 23/09 (Obsidian: Proyectos/Pedidos
-- y Stock - Revisión completa 2026-09-23). Certificados y notas de crédito
-- todavía no se usaron (las dos tablas vacías), y los caminos que los tocan
-- tenían huecos que mueven plata. Esta migración cierra los de la base:
--
--  1. devolver_material: un renglón congelado (cobrado o certificado) no baja
--     su cantidad al devolver —la devolución va como nota de crédito—, así que
--     el tope `p_cantidad <= cantidad` se podía pasar N veces: cada vuelta otra
--     nota y más stock fantasma. Ahora el tope descuenta lo ya acreditado.
--  2. registrar_cobro_cuenta_cliente: un cobro suelto (sin certificado) podía
--     imputar renglones que ya están en un certificado y dejarlo pagado a
--     medias por fuera de su cobro.
--  3. trg_mcc_no_borrar_congelada: fn_mcc_congelada cubría UPDATE y no DELETE
--     (deuda (d) de CLAUDE.md §9). Revertir un renglón o borrar un pedido
--     borraba filas certificadas en silencio. Ahora la base lo frena igual
--     que el cambio de precio. Respeta el mismo escape `cadinc.descongelar`.
--     Los que borran filas de la cuenta a propósito (devolver, herramientas)
--     lo hacen solo con filas NO congeladas: no los afecta.
--  4. eliminar_solicitud: frena con código propio si algún renglón está
--     cobrado o certificado (antes lo miraba solo el backend, fuera de la
--     transacción y sin certificados), y si hay compras que quedaron en el
--     proveedor (`en_proveedor`): el CASCADE borraba su entrada en
--     stock_proveedor_movimientos y la compra desaparecía con su costo.
-- =====================================================================

create or replace function public.fn_mcc_no_borrar_congelada()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('cadinc.descongelar', true), '') = 'on' then return old; end if;
  if old.cobro_id is not null then
    raise exception 'MCC_COBRADO' using errcode = 'P0001', detail = old.cobro_id::text;
  end if;
  if old.certificado_id is not null then
    raise exception 'MCC_CERTIFICADO' using errcode = 'P0001', detail = old.certificado_id::text;
  end if;
  return old;
end $$;

drop trigger if exists trg_mcc_no_borrar_congelada on public.materiales_a_cuenta_cliente;
create trigger trg_mcc_no_borrar_congelada
  before delete on public.materiales_a_cuenta_cliente
  for each row execute function public.fn_mcc_no_borrar_congelada();

do $$
declare
  d text; n int; cuenta text;
begin
  -- 1) devolver_material: tope contra lo ya acreditado en notas.
  d := pg_get_functiondef('public.devolver_material(integer,numeric,text,uuid)'::regprocedure);
  cuenta := 'v_nota_id integer;';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'devolver (declare): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, 'v_nota_id integer; v_ya_acreditado numeric := 0;');

  cuenta := '  if p_cantidad > v_item.cantidad then';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'devolver (tope): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta,
    '  -- Lo ya devuelto con nota de crédito no bajó la cantidad del renglón' || E'\n' ||
    '  -- (estaba congelado): se descuenta acá para que no se pueda devolver dos veces.' || E'\n' ||
    '  select coalesce(sum(n.cantidad), 0) into v_ya_acreditado' || E'\n' ||
    '    from public.cuenta_cliente_notas_credito n where n.item_id = p_item_id and not n.anulada;' || E'\n' ||
    '  if p_cantidad > v_item.cantidad - v_ya_acreditado then' || E'\n' ||
    '    raise exception ''CANTIDAD_MAYOR_A_LA_DESPACHADA'' using errcode = ''P0001'',' || E'\n' ||
    '      detail = format(''se quiere devolver %s de %s (ya devuelto con nota: %s)'', p_cantidad, v_item.cantidad, v_ya_acreditado);' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if p_cantidad > v_item.cantidad then');
  execute d;

  -- 2) registrar_cobro: un cobro suelto no toma renglones certificados.
  d := pg_get_functiondef('public.registrar_cobro_cuenta_cliente(text,date,numeric,text,text,text,text,integer[],uuid,integer,numeric)'::regprocedure);
  cuenta := 'where m.id is null or m.obra_cod <> p_obra_cod or m.cobro_id is not null';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'cobro: esperaba 1, hay %', n; end if;
  execute replace(d, cuenta, cuenta || E'\n' ||
    '        or (p_certificado_id is null and m.certificado_id is not null)');

  -- 4) eliminar_solicitud: cobrados, certificados y en_proveedor frenan.
  d := pg_get_functiondef('public.eliminar_solicitud(integer,uuid,text)'::regprocedure);
  cuenta := 'raise exception ''SOLICITUD_TIENE_RETIROS'';' || E'\n' || '  end if;';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'eliminar: esperaba 1, hay %', n; end if;
  execute replace(d, cuenta, cuenta || E'\n' ||
    '  -- Lo cobrado o certificado es de la cuenta del cliente: no se borra con el pedido.' || E'\n' ||
    '  perform 1 from materiales_a_cuenta_cliente' || E'\n' ||
    '    where solicitud_id = p_solicitud_id and cobro_id is not null limit 1;' || E'\n' ||
    '  if found then' || E'\n' ||
    '    raise exception ''SOLICITUD_TIENE_COBROS'';' || E'\n' ||
    '  end if;' || E'\n' ||
    '  perform 1 from materiales_a_cuenta_cliente' || E'\n' ||
    '    where solicitud_id = p_solicitud_id and certificado_id is not null limit 1;' || E'\n' ||
    '  if found then' || E'\n' ||
    '    raise exception ''SOLICITUD_TIENE_CERTIFICADOS'';' || E'\n' ||
    '  end if;' || E'\n' ||
    '  -- Comprado y todavía en el galpón del proveedor: borrar el pedido hacía' || E'\n' ||
    '  -- desaparecer la compra (el CASCADE se llevaba su entrada en stock en proveedor).' || E'\n' ||
    '  perform 1 from solicitud_compra_item' || E'\n' ||
    '    where solicitud_id = p_solicitud_id and estado = ''en_proveedor'' limit 1;' || E'\n' ||
    '  if found then' || E'\n' ||
    '    raise exception ''SOLICITUD_TIENE_EN_PROVEEDOR'';' || E'\n' ||
    '  end if;');
end $$;
