-- =====================================================================
-- Compras: el concepto entra por las RPC de alta y edición (2026-09-25)
--
-- Por qué: `concepto_id` (20260925j) se carga con la factura y se corrige
-- desde la ficha. Mismas firmas; la clave nueva viaja adentro del jsonb.
--
-- · pagos_crear_factura: `p_factura->>'concepto_id'`. SI VIENE tiene que
--   existir y estar activo (si no → CONCEPTO_INVALIDO). Todavía NO es
--   obligatorio: el backend en producción no lo manda, y exigirlo cortaría
--   las altas hasta el deploy. La obligatoriedad (CONCEPTO_REQUERIDO) la
--   activa 20260925n, que se aplica DESPUÉS del deploy del backend.
--   Vale igual para factura y NC.
-- · pagos_editar_factura: `concepto_id` pasa a la lista de editables y se
--   puede cambiar SIEMPRE (pendiente, aprobada, pagada): es clasificación,
--   no plata. No entra en la lista de congelados por pagos y ningún
--   trigger de desaprobación/congelado mira esa columna, así que no
--   desaprueba. Un concepto igual al guardado no es un cambio (la pantalla
--   manda todo), y el guardado se respeta aunque después lo hayan dado de
--   baja. Cambiarlo a otro exige que exista y esté activo. No se puede
--   vaciar una que ya tiene (CONCEPTO_REQUERIDO).
--   Una anulada sigue cerrada (FACTURA_CERRADA), como hasta hoy.
--
-- Técnica: se parte de la definición VIVA (pg_get_functiondef) y se hacen
-- reemplazos contados (cada ancla tiene que aparecer exactamente una vez;
-- si no, la migración falla sin tocar nada). Así no se re-tipea una función
-- de 300 líneas que cambió tres veces hoy.
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

-- ── 1) pagos_crear_factura ─────────────────────────────────────────────
do $m$
declare
  v text := pg_get_functiondef('public.pagos_crear_factura(jsonb,jsonb,uuid,jsonb)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_cod_nc      smallint[] := array[3, 8, 13, 53, 203, 208, 213];
begin
$a$,
$a$  v_cod_nc      smallint[] := array[3, 8, 13, 53, 203, 208, 213];
  v_concepto_txt text;
  v_concepto    bigint;
begin
$a$);

  v := pg_temp._una(v,
$a$    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;
$a$,
$a$    raise exception 'DESCRIPCION_REQUERIDA' using errcode = 'P0001';
  end if;
  -- Concepto de compra (20260925k): si viene, tiene que existir y estar activo.
  v_concepto_txt := nullif(btrim(coalesce(p_factura ->> 'concepto_id', '')), '');
  if v_concepto_txt is not null then
    if v_concepto_txt !~ '^[0-9]{1,18}$' then
      raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'concepto_id', 'concepto_id', v_concepto_txt)::text;
    end if;
    select c.id into v_concepto from public.pagos_conceptos c where c.id = v_concepto_txt::bigint and c.activo;
    if v_concepto is null then
      raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'concepto_id', 'concepto_id', v_concepto_txt)::text;
    end if;
  end if;
$a$);

  v := pg_temp._una(v,
$a$lectura_estado, lectura_json, clase)
$a$,
$a$lectura_estado, lectura_json, clase, concepto_id)
$a$);

  v := pg_temp._una(v,
$a$            v_clase)
    returning id into v_id;$a$,
$a$            v_clase, v_concepto)
    returning id into v_id;$a$);

  execute v;
end $m$;

-- ── 2) pagos_editar_factura ────────────────────────────────────────────
do $m$
declare
  v text := pg_get_functiondef('public.pagos_editar_factura(bigint,jsonb,jsonb,text,uuid)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_cod_nc      smallint[] := array[3, 8, 13, 53, 203, 208, 213];
  v_permitidos$a$,
$a$  v_cod_nc      smallint[] := array[3, 8, 13, 53, 203, 208, 213];
  v_concepto_txt text;
  v_concepto    bigint;
  v_permitidos$a$);

  v := pg_temp._una(v,
$a$'no_gravado','exento','cae','cae_vto','cbte_tipo_arca'];$a$,
$a$'no_gravado','exento','cae','cae_vto','cbte_tipo_arca','concepto_id'];$a$);

  v := pg_temp._una(v,
$a$  if v_cambios ? 'numero' then
    v_numero :=$a$,
$a$  -- Concepto (20260925k): clasificación, no plata. Se cambia siempre (también
  -- aprobada o pagada), no desaprueba ni cuenta como congelado. Igual al
  -- guardado = sin cambio (aunque ese concepto esté dado de baja).
  if v_cambios ? 'concepto_id' then
    v_concepto_txt := nullif(btrim(coalesce(v_cambios ->> 'concepto_id', '')), '');
    if v_concepto_txt is null then
      if v_f.concepto_id is not null then
        raise exception 'CONCEPTO_REQUERIDO' using errcode = 'P0001',
          detail = json_build_object('campo', 'concepto_id', 'factura_id', p_factura_id)::text;
      end if;
      v_cambios := v_cambios - 'concepto_id';
    else
      if v_concepto_txt !~ '^[0-9]{1,18}$' then
        raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001',
          detail = json_build_object('campo', 'concepto_id', 'concepto_id', v_concepto_txt)::text;
      end if;
      v_concepto := v_concepto_txt::bigint;
      if v_concepto is not distinct from v_f.concepto_id then
        v_cambios := v_cambios - 'concepto_id';
      elsif not exists (select 1 from public.pagos_conceptos c where c.id = v_concepto and c.activo) then
        raise exception 'CONCEPTO_INVALIDO' using errcode = 'P0001',
          detail = json_build_object('campo', 'concepto_id', 'concepto_id', v_concepto_txt)::text;
      else
        v_cambios := v_cambios || jsonb_build_object('concepto_id', v_concepto);
      end if;
    end if;
  end if;
  if v_cambios ? 'numero' then
    v_numero :=$a$);

  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
