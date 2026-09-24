-- =====================================================================
-- Compras: «marcar pagadas en lote» solo para facturas NO aprobadas
-- (2026-09-27)
--
-- Por qué (revisión de código de la fase 3): pagos_marcar_pagadas
-- (20260927h) pide solo pagos.creacion y emite la OP con
-- p_exigir_aprobada = false, así que NO_PUEDE_PAGAR_PROPIA y
-- NO_PUEDE_PAGAR_LO_QUE_APROBO no se evalúan. Dejaba marcar pagada
-- cualquier factura, incluso una aprobada por otro que está esperando que
-- tesorería (registrar_pagos) la pague: un atajo alrededor de la doble firma
-- (§5.18) mucho más ancho que el «hecho consumado» que justificaba la RPC.
--
-- Regla nueva (salvo admin, que puede todo):
--   · solo facturas en estado 'pendiente' u 'observada' (las que todavía no
--     se aprobaron; pagos_facturas_aprob_est_chk garantiza aprobada_at null);
--   · una con aprobada_at → FACTURA_YA_APROBADA {factura_id, estado};
--   · cualquier otro estado (pagada_parcial pagada al cargar sin aprobar,
--     pagada) → FACTURA_NO_PAGABLE {factura_id, estado}, el código que ya
--     usaba la RPC para las anuladas.
-- El error se lanza dentro del loop: la transacción entera se deshace y no
-- queda ninguna OP de las facturas anteriores del lote (todo o nada).
-- Sigue admitiendo sin_imputar (que por CHECK es siempre pendiente/observada).
-- Parche por anclas sobre la definición viva de 20260927h.
-- =====================================================================

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
  v text := pg_get_functiondef('public.pagos_marcar_pagadas(bigint[], bigint, text, date, uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_ref    text;
begin$a$,
$a$  v_ref    text;
  v_admin  boolean;
begin$a$);
  v := pg_temp._una(v,
$a$  if not (public._pagos_es_admin(p_user_id) or public._pagos_flag(p_user_id, 'creacion', false)) then$a$,
$a$  v_admin := coalesce(public._pagos_es_admin(p_user_id), false);
  if not (v_admin or public._pagos_flag(p_user_id, 'creacion', false)) then$a$);
  v := pg_temp._una(v,
$a$    v_saldo := public._pagos_saldo_factura(v_id, true);$a$,
$a$    -- Solo lo que todavía no se aprobó (20260927l): lo aprobado se paga por
    -- el circuito normal, con registrar_pagos y la doble firma. Admin, todo.
    if not v_admin and f.estado not in ('pendiente', 'observada') then
      if f.aprobada_at is not null then
        raise exception 'FACTURA_YA_APROBADA' using errcode = 'P0001',
          detail = json_build_object('factura_id', v_id, 'estado', f.estado)::text;
      end if;
      raise exception 'FACTURA_NO_PAGABLE' using errcode = 'P0001',
        detail = json_build_object('factura_id', v_id, 'estado', f.estado)::text;
    end if;
    v_saldo := public._pagos_saldo_factura(v_id, true);$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);

comment on function public.pagos_marcar_pagadas(bigint[], bigint, text, date, uuid) is
  'Marca pagadas (una OP por factura) compras hechas con la tarjeta de la empresa o con saldo de billetera. Hecho consumado: excepción acotada a la doble firma, solo para facturas NO aprobadas (pendiente/observada) salvo admin (20260927l). 20260927h.';
