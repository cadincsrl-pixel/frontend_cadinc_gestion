-- =====================================================================
-- El plan de e-cheqs se anota en la factura, al cargarla (2026-09-23)
--
-- Pedido del dueño: «si tengo que pagar con e-cheq, cargar ahí nomás si es al
-- día —el total al día siguiente de la carga— o varios, 6 a 30/60/90, así
-- cuando saque el Excel del Galicia ya está precargado».
--
-- `plan_cheques` = { cantidad, primer_cobro (fecha), cada_dias }. Una sola
-- columna jsonb porque es UN dato (cómo se va a pagar) y viaja entero. No es
-- plata: no congela ni desaprueba nada. Lo leen el Excel del Galicia y el
-- modal de pago para precargar los cheques; lo que se paga de verdad sigue
-- siendo lo que se carga en la OP.
--
-- Se reescriben las definiciones vivas con un reemplazo puntual verificado:
--   · pagos_crear_factura: inserta plan_cheques (lo que venga en p_factura).
--   · pagos_editar_factura: plan_cheques pasa a ser editable.
--   · v_pagos_facturas: la columna va al final (create or replace no deja
--     insertar en el medio, 42P16).
-- =====================================================================

alter table public.pagos_facturas add column if not exists plan_cheques jsonb;

alter table public.pagos_facturas drop constraint if exists pagos_facturas_plan_cheques_chk;
alter table public.pagos_facturas add constraint pagos_facturas_plan_cheques_chk check (
  plan_cheques is null or (
    jsonb_typeof(plan_cheques) = 'object'
    and (plan_cheques ->> 'cantidad')::int between 1 and 24
    and (plan_cheques ->> 'cada_dias')::int between 1 and 365
    and (plan_cheques ->> 'primer_cobro') ~ '^\d{4}-\d{2}-\d{2}$'
  ));

comment on column public.pagos_facturas.plan_cheques is
  'Cómo se piensa pagar con cheques/e-cheqs: {cantidad, primer_cobro, cada_dias} (20260923n). No es plata: precarga el Excel del Galicia y el modal de pago.';

do $$
declare
  d text; n int;
  cuenta text;
begin
  -- 1) crear: la columna y su valor en el insert.
  d := pg_get_functiondef('public.pagos_crear_factura'::regproc);
  cuenta := 'descripcion, obs, created_by, updated_by)';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'crear (columnas): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, 'descripcion, obs, created_by, updated_by, plan_cheques)');
  cuenta := 'coalesce(p_factura ->> ''obs'', ''''), p_user_id, p_user_id)';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'crear (valores): esperaba 1, hay %', n; end if;
  d := replace(d, cuenta, 'coalesce(p_factura ->> ''obs'', ''''), p_user_id, p_user_id, nullif(p_factura -> ''plan_cheques'', ''null''::jsonb))');
  execute d;

  -- 2) editar: plan_cheques entre los permitidos.
  d := pg_get_functiondef('public.pagos_editar_factura'::regproc);
  cuenta := '''paga_cliente'',''descripcion'',''obs''];';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'editar: esperaba 1, hay %', n; end if;
  execute replace(d, cuenta, '''paga_cliente'',''descripcion'',''obs'',''plan_cheques''];');

  -- 3) la vista: la columna al final.
  d := pg_get_viewdef('public.v_pagos_facturas'::regclass, true);
  cuenta := 'ctrl.nota AS control_nota' || E'\n' || '   FROM';
  n := (length(d) - length(replace(d, cuenta, ''))) / length(cuenta);
  if n <> 1 then raise exception 'vista: esperaba 1, hay %', n; end if;
  execute 'create or replace view public.v_pagos_facturas as '
       || replace(d, cuenta, 'ctrl.nota AS control_nota,' || E'\n' || '    f.plan_cheques' || E'\n' || '   FROM');
end $$;
