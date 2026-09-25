-- =====================================================================
-- 20260929i — Compras › Configuración: avisos de pago y plazos de cheque
--             (2026-09-25)
--
-- Tanda 6, ítem 8 (spec «configuración del ERP desde la pantalla» §3.8).
-- La spec lo reservaba como 20260929g; esa letra la tomaron los tipos de
-- retención. `pagos_config` ya existe (20260929f) con una sola clave; acá
-- se suman:
--
--   aviso_contador_email    null | email        a quién le llega el aviso del contador
--   aviso_responder_a       null | email        Reply-To del aviso
--   aviso_nombre_remitente  null | texto ≤ 60   nombre del From (null → nombre de fantasía)
--   aviso_pie_texto         null | texto ≤ 500  pie del mail; NUNCA un CBU o un alias
--   plazos_cheque           [0,7,15,30,45,60,90] 1 a 12 enteros 0–365, únicos, ordenados
--
-- Todas se siembran con su default (null o la lista de hoy): así cada cambio
-- desde la pantalla es un UPDATE y lo toma el trigger de auditoría que ya
-- tiene la tabla (`audit_cambios('pagos','configuración','clave')`, solo
-- AFTER UPDATE). NO se carga ningún valor real: el dueño los completa desde
-- la pantalla.
--
-- `pagos_config_json()` y `pagos_guardar_config()` se reemplazan enteras:
-- nacieron en 20260929f y nadie las tocó desde entonces (verificado contra
-- `pg_get_functiondef` el 25/09). Pasan a SECURITY DEFINER (solo
-- service_role las ejecuta, como el resto de las RPC de la tanda).
--
-- El pie se valida en `_pagos_pie_con_cbu(texto)`:
--   · 22 dígitos seguidos (o separados por espacio/guion de a uno) = CBU/CVU;
--   · una palabra con forma de alias: 6–20 caracteres de [a-z0-9.-], con al
--     menos una letra y un punto entre caracteres (norte.distrib). Se dejan
--     pasar los dominios web (www.… o terminados en .com/.ar/.net/.org/…),
--     que es lo que un pie legítimo trae. El backend repite la regla al armar
--     el mail: un pie que igual la violara no se imprime.
-- Errores: CONFIG_INVALIDA { clave, motivo } con motivo ∈ email_invalido,
-- texto_largo, caracteres_invalidos, pie_con_cbu, plazos_invalidos,
-- tipo_invalido, jurisdiccion_inexistente_o_inactiva, clave_desconocida.
-- =====================================================================

-- ── 1) Claves ───────────────────────────────────────────────────────────
alter table public.pagos_config drop constraint if exists pagos_config_clave_check;
alter table public.pagos_config add constraint pagos_config_clave_check check (clave in (
  'tributo_jurisdiccion_default_id',
  'aviso_contador_email',
  'aviso_responder_a',
  'aviso_nombre_remitente',
  'aviso_pie_texto',
  'plazos_cheque'
));

insert into public.pagos_config (clave, valor) values
  ('aviso_contador_email',   'null'::jsonb),
  ('aviso_responder_a',      'null'::jsonb),
  ('aviso_nombre_remitente', 'null'::jsonb),
  ('aviso_pie_texto',        'null'::jsonb),
  ('plazos_cheque',          '[0,7,15,30,45,60,90]'::jsonb)
on conflict (clave) do nothing;

-- ── 2) Guard del pie ────────────────────────────────────────────────────
create or replace function public._pagos_pie_con_cbu(p_txt text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(p_txt, '') ~ '(\d[ -]?){21}\d'
      or exists (
        select 1
          from regexp_split_to_table(lower(coalesce(p_txt, '')), '[^a-z0-9.-]+') as w(tok),
               lateral (select btrim(w.tok, '.-') as t) x
         where x.t ~ '^[a-z0-9.-]{6,20}$'
           and x.t ~ '[a-z]'
           and x.t ~ '[a-z0-9]\.[a-z0-9]'
           and x.t !~ '^www\.'
           and x.t !~ '\.(com|ar|net|org|gob|gov|edu|io|info)$')
$$;

create or replace function public._pagos_email_valido(p_txt text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  -- Espejo de esEmailValido() de cadincsrl/src/lib/mail.ts.
  select length(p_txt) between 5 and 254
     and p_txt ~ '^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$'
$$;

-- ── 3) Lectura ──────────────────────────────────────────────────────────
create or replace function public.pagos_config_json()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with c as (select clave, valor from public.pagos_config)
  select jsonb_build_object(
    'tributo_jurisdiccion_default_id',
      (select case when jsonb_typeof(valor) = 'number' then (valor #>> '{}')::bigint end
         from c where clave = 'tributo_jurisdiccion_default_id'),
    'aviso_contador_email',
      (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' end from c where clave = 'aviso_contador_email'),
    'aviso_responder_a',
      (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' end from c where clave = 'aviso_responder_a'),
    'aviso_nombre_remitente',
      (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' end from c where clave = 'aviso_nombre_remitente'),
    'aviso_pie_texto',
      (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' end from c where clave = 'aviso_pie_texto'),
    'plazos_cheque',
      coalesce((select valor from c where clave = 'plazos_cheque' and jsonb_typeof(valor) = 'array'),
               '[0,7,15,30,45,60,90]'::jsonb))
$$;

-- ── 4) Escritura ────────────────────────────────────────────────────────
create or replace function public.pagos_guardar_config(p_cambios jsonb, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_k   text;
  v_v   jsonb;
  v_txt text;
  v_n   int;
  v_bad boolean;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._pagos_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', null)::text;
  end if;

  for v_k, v_v in select key, value from jsonb_each(p_cambios) loop
    case v_k
      when 'tributo_jurisdiccion_default_id' then
        if jsonb_typeof(v_v) <> 'null' and (
             jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,18}$'
             or not exists (select 1 from public.jurisdicciones j where j.id = (v_v #>> '{}')::bigint and j.activo)) then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'jurisdiccion_inexistente_o_inactiva')::text;
        end if;

      when 'aviso_contador_email', 'aviso_responder_a', 'aviso_nombre_remitente', 'aviso_pie_texto' then
        if jsonb_typeof(v_v) not in ('null', 'string') then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'tipo_invalido')::text;
        end if;
        v_txt := nullif(btrim(v_v #>> '{}'), '');
        if v_txt is not null then
          if v_k in ('aviso_contador_email', 'aviso_responder_a') then
            v_txt := lower(v_txt);
            if not public._pagos_email_valido(v_txt) then
              raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
                detail = json_build_object('clave', v_k, 'motivo', 'email_invalido')::text;
            end if;
          elsif v_k = 'aviso_nombre_remitente' then
            if length(v_txt) > 60 then
              raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
                detail = json_build_object('clave', v_k, 'motivo', 'texto_largo', 'max', 60)::text;
            end if;
            if v_txt ~ '[<>"[:cntrl:]]' then
              raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
                detail = json_build_object('clave', v_k, 'motivo', 'caracteres_invalidos')::text;
            end if;
          else -- aviso_pie_texto
            if length(v_txt) > 500 then
              raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
                detail = json_build_object('clave', v_k, 'motivo', 'texto_largo', 'max', 500)::text;
            end if;
            if public._pagos_pie_con_cbu(v_txt) then
              raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
                detail = json_build_object('clave', v_k, 'motivo', 'pie_con_cbu')::text;
            end if;
          end if;
        end if;
        v_v := coalesce(to_jsonb(v_txt), 'null'::jsonb);

      when 'plazos_cheque' then
        v_bad := jsonb_typeof(v_v) <> 'array';
        if not v_bad then
          v_n := jsonb_array_length(v_v);
          v_bad := v_n < 1 or v_n > 12
            or exists (select 1 from jsonb_array_elements(v_v) e
                        where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-9]{1,3}$'
                           or (e #>> '{}')::int > 365)
            or (select count(distinct (e #>> '{}')::numeric) from jsonb_array_elements(v_v) e) <> v_n;
        end if;
        if v_bad then
          raise exception 'CONFIG_INVALIDA' using errcode = 'P0001',
            detail = json_build_object('clave', v_k, 'motivo', 'plazos_invalidos')::text;
        end if;
        select jsonb_agg(x order by x) into v_v
          from (select (e #>> '{}')::int as x from jsonb_array_elements(v_v) e) s;

      else
        raise exception 'CONFIG_INVALIDA' using errcode = 'P0001', detail = json_build_object('clave', v_k, 'motivo', 'clave_desconocida')::text;
    end case;

    insert into public.pagos_config (clave, valor, updated_by) values (v_k, v_v, p_user_id)
    on conflict (clave) do update set valor = excluded.valor, updated_by = excluded.updated_by;
  end loop;
  return public.pagos_config_json();
end $$;

-- ── 5) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    '_pagos_pie_con_cbu(text)',
    '_pagos_email_valido(text)',
    'pagos_config_json()',
    'pagos_guardar_config(jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
