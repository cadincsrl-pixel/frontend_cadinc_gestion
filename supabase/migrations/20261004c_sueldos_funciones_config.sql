-- =====================================================================
-- 20261004c — Sueldos: funciones de valores, legajos y configuración (2026-09-26)
--
-- Por qué: única puerta de escritura para la configuración del módulo
-- (convenios, categorías, escalas, conceptos, valores, parámetros), los
-- legajos y la «nueva paritaria». Todas security definer, con p_user_id
-- explícito (nunca auth.uid()), permisos leídos de profiles con _perm_flag
-- (admin hace bypass) y errores con código en MAYÚSCULAS + detail json.
--
-- Permisos (permisos.sueldos, todos default false):
--   configurar            → convenios, categorías, escalas, conceptos, valores,
--                           parámetros y nueva paritaria.
--   creacion/actualizacion→ alta / edición de legajos.
--   ver_pii               → cambiar CUIL o CBU de un legajo.
-- Lectura de valores (sueldos_valor_*, sueldos_valores_a_fecha): sin
-- permiso propio, el backend la guarda con requirePermiso('sueldos','lectura').
-- =====================================================================

-- ── 0) Helpers ───────────────────────────────────────────────────────
create or replace function public._sueldos_error(p_codigo text, p_detalle jsonb default null)
returns void language plpgsql volatile set search_path = public, pg_temp as $$
begin
  if p_detalle is null then
    raise exception '%', p_codigo using errcode = 'P0001';
  end if;
  raise exception '%', p_codigo using errcode = 'P0001', detail = p_detalle::text;
end $$;

create or replace function public._sueldos_requiere(p_user_id uuid, p_flag text)
returns void language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_user_id is null then perform public._sueldos_error('USUARIO_REQUERIDO'); end if;
  if not public._perm_flag(p_user_id, 'sueldos', p_flag, false) then
    perform public._sueldos_error('SIN_PERMISO', jsonb_build_object('modulo', 'sueldos', 'permiso', p_flag));
  end if;
end $$;

create or replace function public._sueldos_digitos(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '')
$$;

-- CUIL/CUIT: 11 dígitos, dígito verificador módulo 11 (pesos 5432765432;
-- 11 → 0, 10 → 9, como los validadores usuales).
create or replace function public._sueldos_cuil_valido(p text)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare
  w int[] := array[5,4,3,2,7,6,5,4,3,2];
  s int := 0;
  d int;
begin
  if p is null or p !~ '^[0-9]{11}$' then return false; end if;
  for i in 1..10 loop s := s + substr(p, i, 1)::int * w[i]; end loop;
  d := 11 - (s % 11);
  if d = 11 then d := 0; elsif d = 10 then d := 9; end if;
  return d = substr(p, 11, 1)::int;
end $$;

-- CBU: 22 dígitos; bloque 1 (8) pesos 7139713 → dígito 8; bloque 2 (14)
-- pesos 3971397139713 → dígito 22.
create or replace function public._sueldos_cbu_valido(p text)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare
  w1 int[] := array[7,1,3,9,7,1,3];
  w2 int[] := array[3,9,7,1,3,9,7,1,3,9,7,1,3];
  s int := 0;
begin
  if p is null or p !~ '^[0-9]{22}$' then return false; end if;
  for i in 1..7 loop s := s + substr(p, i, 1)::int * w1[i]; end loop;
  if (10 - s % 10) % 10 <> substr(p, 8, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + substr(p, 8 + i, 1)::int * w2[i]; end loop;
  return (10 - s % 10) % 10 = substr(p, 22, 1)::int;
end $$;

create or replace function public._sueldos_convenio_id(p jsonb)
returns bigint language plpgsql stable set search_path = public, pg_temp as $$
declare v bigint;
begin
  if p ? 'convenio_id' and nullif(p ->> 'convenio_id', '') is not null then
    select id into v from public.sueldos_convenios where id = (p ->> 'convenio_id')::bigint;
  elsif p ? 'convenio_codigo' then
    select id into v from public.sueldos_convenios where codigo = lower(btrim(p ->> 'convenio_codigo'));
  end if;
  return v;
exception when invalid_text_representation then
  return null;
end $$;

-- ── 1) Valores vigentes a una fecha ─────────────────────────────────
create or replace function public.sueldos_valor_escala(p_categoria_id bigint, p_zona text, p_fecha date)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select e.valor from public.sueldos_escalas e
   where e.categoria_id = p_categoria_id and e.zona = coalesce(nullif(btrim(p_zona), ''), 'A')
     and e.vigente_desde <= p_fecha
   order by e.vigente_desde desc limit 1
$$;
comment on function public.sueldos_valor_escala(bigint, text, date) is
  'Valor de la escala vigente a la fecha (la de mayor vigente_desde <= fecha) para la categoría y zona. NULL si no hay. Sin fallback de zona.';

create or replace function public.sueldos_valor_parametro(p_clave text, p_fecha date)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select p.valor from public.sueldos_parametros p
   where p.clave = p_clave and p.vigente_desde <= p_fecha
   order by p.vigente_desde desc limit 1
$$;

create or replace function public.sueldos_valor_concepto(p_concepto_id bigint, p_fecha date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.sueldos_conceptos%rowtype;
  p public.sueldos_parametros%rowtype;
  v public.sueldos_concepto_valores%rowtype;
begin
  select * into c from public.sueldos_conceptos where id = p_concepto_id;
  if not found then return null; end if;
  if c.parametro_clave is not null then
    select * into p from public.sueldos_parametros x
     where x.clave = c.parametro_clave and x.vigente_desde <= p_fecha
     order by x.vigente_desde desc limit 1;
    if not found then return null; end if;
    return jsonb_build_object('origen', 'parametro', 'parametro_clave', c.parametro_clave,
      'porcentaje', case when c.calculo = 'porcentaje' then p.valor end,
      'monto', case when c.calculo <> 'porcentaje' then round(p.valor, 2) end,
      'vigente_desde', p.vigente_desde, 'a_confirmar', p.a_confirmar, 'fuente', p.fuente);
  end if;
  select * into v from public.sueldos_concepto_valores x
   where x.concepto_id = p_concepto_id and x.vigente_desde <= p_fecha
   order by x.vigente_desde desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('origen', 'concepto', 'parametro_clave', null,
    'porcentaje', v.porcentaje, 'monto', v.monto, 'vigente_desde', v.vigente_desde,
    'a_confirmar', v.a_confirmar, 'fuente', v.fuente);
end $$;
comment on function public.sueldos_valor_concepto(bigint, date) is
  'Valor vigente del concepto a la fecha: {origen concepto|parametro, parametro_clave, porcentaje, monto, vigente_desde, a_confirmar, fuente}, o NULL si no hay valor cargado (el concepto no se aplica y la UI lo marca).';

-- Todo lo que necesita el motor de cálculo del backend para un convenio a una fecha.
create or replace function public.sueldos_valores_a_fecha(p_convenio_id bigint, p_fecha date, p_zona text default 'A')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cv    public.sueldos_convenios%rowtype;
  v_ser numeric;
  v_ser_id bigint;
begin
  select * into cv from public.sueldos_convenios where id = p_convenio_id;
  if not found then perform public._sueldos_error('CONVENIO_NO_EXISTE', jsonb_build_object('convenio_id', p_convenio_id)); end if;
  if p_fecha is null then perform public._sueldos_error('FECHA_REQUERIDA', jsonb_build_object('campo', 'fecha')); end if;

  select c.id into v_ser_id from public.sueldos_categorias c
    join public.sueldos_convenios k on k.id = c.convenio_id
   where k.codigo = 'uocra' and c.codigo = 'sereno';
  v_ser := public.sueldos_valor_escala(v_ser_id, 'A', p_fecha);

  return jsonb_build_object(
    'fecha', p_fecha, 'zona', coalesce(nullif(btrim(p_zona), ''), 'A'),
    'convenio', to_jsonb(cv),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'codigo', c.codigo, 'nombre', c.nombre, 'orden', c.orden,
               'unidad_basico', coalesce(c.unidad_basico, cv.unidad_basico), 'por_defecto', c.por_defecto,
               'activo', c.activo,
               'valor', e.valor, 'vigente_desde', e.vigente_desde, 'a_confirmar', e.a_confirmar, 'fuente', e.fuente)
             order by c.orden, c.id)
        from public.sueldos_categorias c
        left join lateral (select x.* from public.sueldos_escalas x
                            where x.categoria_id = c.id and x.zona = coalesce(nullif(btrim(p_zona), ''), 'A')
                              and x.vigente_desde <= p_fecha
                            order by x.vigente_desde desc limit 1) e on true
       where c.convenio_id = p_convenio_id), '[]'::jsonb),
    -- Conceptos del convenio + comunes; si hay uno propio con el mismo código, manda el propio.
    'conceptos', coalesce((
      select jsonb_agg(to_jsonb(k) || jsonb_build_object('valor', public.sueldos_valor_concepto(k.id, p_fecha))
                       order by k.orden, k.id)
        from public.sueldos_conceptos k
       where k.activo
         and (k.convenio_id = p_convenio_id
              or (k.convenio_id is null
                  and not exists (select 1 from public.sueldos_conceptos o
                                   where o.convenio_id = p_convenio_id and o.codigo = k.codigo and o.activo)))), '[]'::jsonb),
    'parametros', coalesce((
      select jsonb_object_agg(q.clave, jsonb_build_object('valor', q.valor, 'vigente_desde', q.vigente_desde,
                                                          'a_confirmar', q.a_confirmar, 'fuente', q.fuente))
        from (select distinct on (p.clave) p.* from public.sueldos_parametros p
               where p.vigente_desde <= p_fecha order by p.clave, p.vigente_desde desc) q), '{}'::jsonb),
    'sereno_zona_a', v_ser);
end $$;
comment on function public.sueldos_valores_a_fecha(bigint, date, text) is
  'Paquete para el motor de cálculo: convenio, categorías con la escala vigente (zona), conceptos activos (propios del convenio + comunes no pisados) con su valor vigente, parámetros vigentes y el Sereno zona A de UOCRA.';

-- ── 2) Legajos ──────────────────────────────────────────────────────
create or replace function public.sueldos_guardar_legajo(p_legajo jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_campos text[] := array['leg', 'chofer_id', 'nombre', 'cuil', 'fecha_ingreso', 'fecha_egreso', 'convenio_id',
    'categoria_id', 'zona', 'modalidad_contratacion', 'jornada', 'obra_social', 'obra_social_codigo',
    'afiliado_sindicato', 'cbu', 'banco', 'estado_civil', 'conyuge_a_cargo', 'hijos_a_cargo', 'ieric_numero',
    'fondo_cese_cuenta', 'titulo_nivel', 'carnet_profesional', 'rifl', 'obra_cod_habitual', 'activo', 'obs'];
  v_def jsonb := '{"nombre":"","zona":"A","modalidad_contratacion":"tiempo_indeterminado","jornada":"completa",
    "obra_social":"","obra_social_codigo":"","afiliado_sindicato":false,"banco":"","estado_civil":"",
    "conyuge_a_cargo":false,"hijos_a_cargo":0,"ieric_numero":"","fondo_cese_cuenta":"","carnet_profesional":"",
    "rifl":false,"activo":true,"obs":""}'::jsonb;
  v_in   jsonb := '{}'::jsonb;
  v_id   bigint;
  v_old  public.sueldos_legajos%rowtype;
  r      public.sueldos_legajos%rowtype;
  v_k    text;
  v_conv bigint;
  v_otro bigint;
  v_es_nuevo boolean;
begin
  if p_user_id is null then perform public._sueldos_error('USUARIO_REQUERIDO'); end if;
  if p_legajo is null or jsonb_typeof(p_legajo) <> 'object' then
    perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('campo', 'legajo'));
  end if;
  v_id := nullif(p_legajo ->> 'id', '')::bigint;
  v_es_nuevo := v_id is null;
  perform public._sueldos_requiere(p_user_id, case when v_es_nuevo then 'creacion' else 'actualizacion' end);

  -- Solo los campos conocidos; strings recortados.
  foreach v_k in array v_campos loop
    if p_legajo ? v_k then
      v_in := v_in || jsonb_build_object(v_k,
        case when jsonb_typeof(p_legajo -> v_k) = 'string' then to_jsonb(btrim(p_legajo ->> v_k)) else p_legajo -> v_k end);
    end if;
  end loop;
  v_conv := public._sueldos_convenio_id(p_legajo);
  if (p_legajo ? 'convenio_id' or p_legajo ? 'convenio_codigo') then
    if v_conv is null then
      perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id'));
    end if;
    v_in := v_in || jsonb_build_object('convenio_id', v_conv);
  end if;
  -- Normalizaciones: '' → null en claves/ids/fechas; CUIL y CBU a dígitos.
  foreach v_k in array array['leg', 'chofer_id', 'categoria_id', 'fecha_ingreso', 'fecha_egreso', 'titulo_nivel', 'obra_cod_habitual'] loop
    if v_in ? v_k and (v_in ->> v_k) = '' then v_in := jsonb_set(v_in, array[v_k], 'null'::jsonb); end if;
  end loop;
  if v_in ? 'cuil' then v_in := jsonb_set(v_in, '{cuil}', coalesce(to_jsonb(public._sueldos_digitos(v_in ->> 'cuil')), 'null'::jsonb)); end if;
  if v_in ? 'cbu'  then v_in := jsonb_set(v_in, '{cbu}',  coalesce(to_jsonb(public._sueldos_digitos(v_in ->> 'cbu')),  'null'::jsonb)); end if;
  if v_in ? 'zona' then v_in := jsonb_set(v_in, '{zona}', to_jsonb(upper(coalesce(nullif(v_in ->> 'zona', ''), 'A')))); end if;
  if v_in ? 'titulo_nivel' and v_in ->> 'titulo_nivel' is not null then
    v_in := jsonb_set(v_in, '{titulo_nivel}', to_jsonb(upper(v_in ->> 'titulo_nivel')));
  end if;

  begin
    if v_es_nuevo then
      r := jsonb_populate_record(null::public.sueldos_legajos, v_def || v_in);
    else
      select * into v_old from public.sueldos_legajos where id = v_id for update;
      if not found then perform public._sueldos_error('LEGAJO_NO_EXISTE', jsonb_build_object('id', v_id)); end if;
      r := jsonb_populate_record(v_old, v_in);
    end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
                 or numeric_value_out_of_range then
    perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
  end;

  -- PII: cambiar CUIL o CBU pide ver_pii.
  if (r.cuil is distinct from v_old.cuil or r.cbu is distinct from v_old.cbu)
     and not public._perm_flag(p_user_id, 'sueldos', 'ver_pii', false) then
    perform public._sueldos_error('SIN_PERMISO_PII', jsonb_build_object('campos', array['cuil', 'cbu']));
  end if;

  -- Identidad.
  if r.leg is not null and not exists (select 1 from public.personal where leg = r.leg) then
    perform public._sueldos_error('PERSONAL_NO_EXISTE', jsonb_build_object('campo', 'leg', 'leg', r.leg));
  end if;
  if r.chofer_id is not null and not exists (select 1 from public.choferes where id = r.chofer_id) then
    perform public._sueldos_error('CHOFER_NO_EXISTE', jsonb_build_object('campo', 'chofer_id', 'chofer_id', r.chofer_id));
  end if;
  if btrim(r.nombre) = '' then
    r.nombre := coalesce((select nom from public.personal where leg = r.leg),
                         (select nombre from public.choferes where id = r.chofer_id), '');
  end if;
  if r.leg is null and r.chofer_id is null and length(btrim(r.nombre)) < 3 then
    perform public._sueldos_error('NOMBRE_REQUERIDO', jsonb_build_object('campo', 'nombre'));
  end if;
  if r.leg is not null then
    select id into v_otro from public.sueldos_legajos where leg = r.leg and id is distinct from v_id;
    if found then perform public._sueldos_error('LEGAJO_DUPLICADO', jsonb_build_object('campo', 'leg', 'legajo_id', v_otro)); end if;
  end if;
  if r.chofer_id is not null then
    select id into v_otro from public.sueldos_legajos where chofer_id = r.chofer_id and id is distinct from v_id;
    if found then perform public._sueldos_error('LEGAJO_DUPLICADO', jsonb_build_object('campo', 'chofer_id', 'legajo_id', v_otro)); end if;
  end if;

  -- CUIL / CBU.
  if r.cuil is not null and not public._sueldos_cuil_valido(r.cuil) then
    perform public._sueldos_error('CUIL_INVALIDO', jsonb_build_object('campo', 'cuil'));
  end if;
  if r.cuil is not null then
    select id into v_otro from public.sueldos_legajos where cuil = r.cuil and id is distinct from v_id;
    if found then perform public._sueldos_error('CUIL_DUPLICADO', jsonb_build_object('campo', 'cuil', 'legajo_id', v_otro)); end if;
  end if;
  if r.cbu is not null and not public._sueldos_cbu_valido(r.cbu) then
    perform public._sueldos_error('CBU_INVALIDO', jsonb_build_object('campo', 'cbu'));
  end if;

  -- Convenio y categoría.
  if r.convenio_id is null then perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id')); end if;
  if (v_es_nuevo or r.convenio_id is distinct from v_old.convenio_id)
     and not exists (select 1 from public.sueldos_convenios where id = r.convenio_id and activo) then
    perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id', 'convenio_id', r.convenio_id));
  end if;
  if r.categoria_id is not null
     and not exists (select 1 from public.sueldos_categorias where id = r.categoria_id and convenio_id = r.convenio_id) then
    if not v_es_nuevo and not (v_in ? 'categoria_id') and r.convenio_id is distinct from v_old.convenio_id then
      r.categoria_id := null;   -- cambió el convenio y la categoría vieja no es de él: toma la por defecto
    else
      perform public._sueldos_error('CATEGORIA_OTRO_CONVENIO', jsonb_build_object('campo', 'categoria_id', 'categoria_id', r.categoria_id));
    end if;
  end if;
  if r.categoria_id is null then
    select id into r.categoria_id from public.sueldos_categorias where convenio_id = r.convenio_id and por_defecto and activo;
  end if;

  -- Resto.
  if r.fecha_egreso is not null and r.fecha_ingreso is not null and r.fecha_egreso < r.fecha_ingreso then
    perform public._sueldos_error('FECHAS_INVALIDAS', jsonb_build_object('campo', 'fecha_egreso'));
  end if;
  if r.titulo_nivel is not null and r.titulo_nivel not in ('A', 'B', 'C') then
    perform public._sueldos_error('TITULO_INVALIDO', jsonb_build_object('campo', 'titulo_nivel'));
  end if;
  if r.jornada not in ('completa', 'parcial') then
    perform public._sueldos_error('JORNADA_INVALIDA', jsonb_build_object('campo', 'jornada'));
  end if;
  if r.zona !~ '^[A-Z0-9]{1,5}$' then
    perform public._sueldos_error('ZONA_INVALIDA', jsonb_build_object('campo', 'zona'));
  end if;
  if r.modalidad_contratacion !~ '^[a-z_]{3,40}$' then
    perform public._sueldos_error('MODALIDAD_INVALIDA', jsonb_build_object('campo', 'modalidad_contratacion'));
  end if;
  if r.hijos_a_cargo is null or r.hijos_a_cargo not between 0 and 30 then
    perform public._sueldos_error('HIJOS_INVALIDO', jsonb_build_object('campo', 'hijos_a_cargo'));
  end if;
  if r.obra_cod_habitual is not null and not exists (select 1 from public.obras where cod = r.obra_cod_habitual) then
    perform public._sueldos_error('OBRA_NO_EXISTE', jsonb_build_object('campo', 'obra_cod_habitual', 'obra_cod', r.obra_cod_habitual));
  end if;

  if v_es_nuevo then
    insert into public.sueldos_legajos (leg, chofer_id, nombre, cuil, fecha_ingreso, fecha_egreso, convenio_id, categoria_id,
      zona, modalidad_contratacion, jornada, obra_social, obra_social_codigo, afiliado_sindicato, cbu, banco, estado_civil,
      conyuge_a_cargo, hijos_a_cargo, ieric_numero, fondo_cese_cuenta, titulo_nivel, carnet_profesional, rifl,
      obra_cod_habitual, activo, obs, created_by, updated_by)
    values (r.leg, r.chofer_id, r.nombre, r.cuil, r.fecha_ingreso, r.fecha_egreso, r.convenio_id, r.categoria_id,
      r.zona, r.modalidad_contratacion, r.jornada, r.obra_social, r.obra_social_codigo, r.afiliado_sindicato, r.cbu, r.banco,
      r.estado_civil, r.conyuge_a_cargo, r.hijos_a_cargo, r.ieric_numero, r.fondo_cese_cuenta, r.titulo_nivel,
      r.carnet_profesional, r.rifl, r.obra_cod_habitual, coalesce(r.activo, true), r.obs, p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.sueldos_legajos set
      leg = r.leg, chofer_id = r.chofer_id, nombre = r.nombre, cuil = r.cuil, fecha_ingreso = r.fecha_ingreso,
      fecha_egreso = r.fecha_egreso, convenio_id = r.convenio_id, categoria_id = r.categoria_id, zona = r.zona,
      modalidad_contratacion = r.modalidad_contratacion, jornada = r.jornada, obra_social = r.obra_social,
      obra_social_codigo = r.obra_social_codigo, afiliado_sindicato = r.afiliado_sindicato, cbu = r.cbu, banco = r.banco,
      estado_civil = r.estado_civil, conyuge_a_cargo = r.conyuge_a_cargo, hijos_a_cargo = r.hijos_a_cargo,
      ieric_numero = r.ieric_numero, fondo_cese_cuenta = r.fondo_cese_cuenta, titulo_nivel = r.titulo_nivel,
      carnet_profesional = r.carnet_profesional, rifl = r.rifl, obra_cod_habitual = r.obra_cod_habitual,
      activo = coalesce(r.activo, true), obs = r.obs, updated_by = p_user_id
     where id = v_id;
  end if;

  return (select to_jsonb(v) from public.v_sueldos_legajos v where v.id = v_id);
end $$;
comment on function public.sueldos_guardar_legajo(jsonb, uuid) is
  'Alta (sin id) o edición parcial (con id: solo pisa las claves presentes) del legajo. convenio_id o convenio_codigo. Sin categoría → la por_defecto del convenio. Devuelve la fila de v_sueldos_legajos. Errores: USUARIO_REQUERIDO, SIN_PERMISO, SIN_PERMISO_PII, DATOS_INVALIDOS, LEGAJO_NO_EXISTE, PERSONAL_NO_EXISTE, CHOFER_NO_EXISTE, NOMBRE_REQUERIDO, LEGAJO_DUPLICADO, CUIL_INVALIDO, CUIL_DUPLICADO, CBU_INVALIDO, CONVENIO_INVALIDO, CATEGORIA_OTRO_CONVENIO, FECHAS_INVALIDAS, TITULO_INVALIDO, JORNADA_INVALIDA, ZONA_INVALIDA, MODALIDAD_INVALIDA, HIJOS_INVALIDO, OBRA_NO_EXISTE.';

-- ── 3) Configuración (flag configurar) ──────────────────────────────
create or replace function public.sueldos_guardar_convenio(p jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  r public.sueldos_convenios%rowtype;
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  if v_id is null then
    r := jsonb_populate_record(null::public.sueldos_convenios,
           '{"cct":"","obs":"","activo":true}'::jsonb || (p - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'));
    if coalesce(r.codigo, '') !~ '^[a-z0-9_]{2,30}$' then perform public._sueldos_error('CODIGO_INVALIDO', jsonb_build_object('campo', 'codigo')); end if;
    if exists (select 1 from public.sueldos_convenios where codigo = r.codigo) then
      perform public._sueldos_error('CODIGO_DUPLICADO', jsonb_build_object('campo', 'codigo'));
    end if;
  else
    select * into r from public.sueldos_convenios where id = v_id for update;
    if not found then perform public._sueldos_error('CONVENIO_NO_EXISTE', jsonb_build_object('id', v_id)); end if;
    if p ? 'codigo' and p ->> 'codigo' is distinct from r.codigo then
      perform public._sueldos_error('CODIGO_NO_EDITABLE', jsonb_build_object('campo', 'codigo'));
    end if;
    r := jsonb_populate_record(r, p - 'id' - 'codigo' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by');
  end if;
  if length(btrim(coalesce(r.nombre, ''))) < 2 then perform public._sueldos_error('NOMBRE_REQUERIDO', jsonb_build_object('campo', 'nombre')); end if;
  if r.periodicidad is null or r.periodicidad not in ('quincenal', 'mensual') then
    perform public._sueldos_error('PERIODICIDAD_INVALIDA', jsonb_build_object('campo', 'periodicidad'));
  end if;
  if r.unidad_basico is null or r.unidad_basico not in ('hora', 'mes') then
    perform public._sueldos_error('UNIDAD_INVALIDA', jsonb_build_object('campo', 'unidad_basico'));
  end if;
  if v_id is null then
    insert into public.sueldos_convenios (codigo, nombre, cct, periodicidad, unidad_basico, obs, activo, created_by, updated_by)
    values (r.codigo, btrim(r.nombre), coalesce(r.cct, ''), r.periodicidad, r.unidad_basico, coalesce(r.obs, ''),
            coalesce(r.activo, true), p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.sueldos_convenios
       set nombre = btrim(r.nombre), cct = coalesce(r.cct, ''), periodicidad = r.periodicidad,
           unidad_basico = r.unidad_basico, obs = coalesce(r.obs, ''), activo = coalesce(r.activo, true), updated_by = p_user_id
     where id = v_id;
  end if;
  return (select to_jsonb(c) from public.sueldos_convenios c where c.id = v_id);
exception when invalid_text_representation then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $$;

create or replace function public.sueldos_guardar_categoria(p jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  r public.sueldos_categorias%rowtype;
  v_conv bigint;
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  if v_id is null then
    v_conv := public._sueldos_convenio_id(p);
    if v_conv is null then perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id')); end if;
    r := jsonb_populate_record(null::public.sueldos_categorias,
           '{"orden":0,"por_defecto":false,"activo":true}'::jsonb
           || (p - 'id' - 'convenio_codigo' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by')
           || jsonb_build_object('convenio_id', v_conv));
    r.codigo := lower(btrim(coalesce(r.codigo, '')));
    if r.codigo !~ '^[a-z0-9_]{1,40}$' then perform public._sueldos_error('CODIGO_INVALIDO', jsonb_build_object('campo', 'codigo')); end if;
    if exists (select 1 from public.sueldos_categorias where convenio_id = v_conv and codigo = r.codigo) then
      perform public._sueldos_error('CODIGO_DUPLICADO', jsonb_build_object('campo', 'codigo'));
    end if;
  else
    select * into r from public.sueldos_categorias where id = v_id for update;
    if not found then perform public._sueldos_error('CATEGORIA_NO_EXISTE', jsonb_build_object('id', v_id)); end if;
    if (p ? 'codigo' and p ->> 'codigo' is distinct from r.codigo)
       or (p ? 'convenio_id' and (p ->> 'convenio_id')::bigint is distinct from r.convenio_id) then
      perform public._sueldos_error('CODIGO_NO_EDITABLE', jsonb_build_object('campo', 'codigo'));
    end if;
    r := jsonb_populate_record(r, p - 'id' - 'codigo' - 'convenio_id' - 'convenio_codigo' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by');
  end if;
  if length(btrim(coalesce(r.nombre, ''))) < 2 then perform public._sueldos_error('NOMBRE_REQUERIDO', jsonb_build_object('campo', 'nombre')); end if;
  if r.unidad_basico is not null and r.unidad_basico not in ('hora', 'mes') then
    perform public._sueldos_error('UNIDAD_INVALIDA', jsonb_build_object('campo', 'unidad_basico'));
  end if;
  if coalesce(r.por_defecto, false) then
    update public.sueldos_categorias set por_defecto = false, updated_by = p_user_id
     where convenio_id = r.convenio_id and por_defecto and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into public.sueldos_categorias (convenio_id, codigo, nombre, orden, unidad_basico, por_defecto, activo, created_by, updated_by)
    values (r.convenio_id, r.codigo, btrim(r.nombre), coalesce(r.orden, 0), r.unidad_basico, coalesce(r.por_defecto, false),
            coalesce(r.activo, true), p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.sueldos_categorias
       set nombre = btrim(r.nombre), orden = coalesce(r.orden, 0), unidad_basico = r.unidad_basico,
           por_defecto = coalesce(r.por_defecto, false), activo = coalesce(r.activo, true), updated_by = p_user_id
     where id = v_id;
  end if;
  return (select to_jsonb(c) from public.sueldos_categorias c where c.id = v_id);
exception when invalid_text_representation then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $$;

-- Escala: upsert por id o por (categoria_id, zona, vigente_desde).
create or replace function public.sueldos_guardar_escala(p jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id    bigint := nullif(p ->> 'id', '')::bigint;
  v_cat   bigint;
  v_zona  text;
  v_desde date;
  v_valor numeric;
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  if v_id is not null then
    select categoria_id, zona, vigente_desde into v_cat, v_zona, v_desde from public.sueldos_escalas where id = v_id for update;
    if not found then perform public._sueldos_error('ESCALA_NO_EXISTE', jsonb_build_object('id', v_id)); end if;
  end if;
  v_cat   := coalesce(nullif(p ->> 'categoria_id', '')::bigint, v_cat);
  v_zona  := upper(coalesce(nullif(btrim(p ->> 'zona'), ''), v_zona, 'A'));
  v_desde := coalesce(nullif(p ->> 'vigente_desde', '')::date, v_desde);
  v_valor := nullif(p ->> 'valor', '')::numeric;
  if v_cat is null or not exists (select 1 from public.sueldos_categorias where id = v_cat) then
    perform public._sueldos_error('CATEGORIA_NO_EXISTE', jsonb_build_object('campo', 'categoria_id'));
  end if;
  if v_zona !~ '^[A-Z0-9]{1,5}$' then perform public._sueldos_error('ZONA_INVALIDA', jsonb_build_object('campo', 'zona')); end if;
  if v_desde is null then perform public._sueldos_error('FECHA_REQUERIDA', jsonb_build_object('campo', 'vigente_desde')); end if;
  if v_valor is null or v_valor <= 0 or v_valor >= 1e12 then
    perform public._sueldos_error('VALOR_INVALIDO', jsonb_build_object('campo', 'valor'));
  end if;
  if v_id is not null then
    if exists (select 1 from public.sueldos_escalas where categoria_id = v_cat and zona = v_zona and vigente_desde = v_desde and id <> v_id) then
      perform public._sueldos_error('ESCALA_DUPLICADA', jsonb_build_object('campo', 'vigente_desde'));
    end if;
    update public.sueldos_escalas
       set categoria_id = v_cat, zona = v_zona, vigente_desde = v_desde, valor = round(v_valor, 2),
           fuente = coalesce(p ->> 'fuente', fuente), a_confirmar = coalesce((p ->> 'a_confirmar')::boolean, a_confirmar),
           updated_by = p_user_id
     where id = v_id;
  else
    insert into public.sueldos_escalas (categoria_id, zona, vigente_desde, valor, fuente, a_confirmar, created_by, updated_by)
    values (v_cat, v_zona, v_desde, round(v_valor, 2), coalesce(p ->> 'fuente', ''), coalesce((p ->> 'a_confirmar')::boolean, false),
            p_user_id, p_user_id)
    on conflict (categoria_id, zona, vigente_desde) do update
      set valor = excluded.valor, fuente = case when p ? 'fuente' then excluded.fuente else sueldos_escalas.fuente end,
          a_confirmar = excluded.a_confirmar, updated_by = p_user_id
    returning id into v_id;
  end if;
  return (select to_jsonb(e) from public.sueldos_escalas e where e.id = v_id);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $$;

create or replace function public.sueldos_borrar_escala(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  delete from public.sueldos_escalas where id = p_id;
  if not found then perform public._sueldos_error('ESCALA_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

create or replace function public.sueldos_guardar_concepto(p jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  r public.sueldos_conceptos%rowtype;
  v_conv bigint;
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  if v_id is null then
    v_conv := public._sueldos_convenio_id(p);
    if (p ? 'convenio_id' and nullif(p ->> 'convenio_id', '') is not null or p ? 'convenio_codigo') and v_conv is null then
      perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id'));
    end if;
    r := jsonb_populate_record(null::public.sueldos_conceptos,
           '{"condicion":"siempre","en_recibo":true,"orden":0,"automatico":false,"activo":true,"obs":""}'::jsonb
           || (p - 'id' - 'convenio_codigo' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by')
           || jsonb_build_object('convenio_id', v_conv));
    r.codigo := lower(btrim(coalesce(r.codigo, '')));
    if r.codigo !~ '^[a-z0-9_]{1,40}$' then perform public._sueldos_error('CODIGO_INVALIDO', jsonb_build_object('campo', 'codigo')); end if;
    if exists (select 1 from public.sueldos_conceptos where coalesce(convenio_id, 0) = coalesce(v_conv, 0) and codigo = r.codigo) then
      perform public._sueldos_error('CODIGO_DUPLICADO', jsonb_build_object('campo', 'codigo'));
    end if;
  else
    select * into r from public.sueldos_conceptos where id = v_id for update;
    if not found then perform public._sueldos_error('CONCEPTO_NO_EXISTE', jsonb_build_object('id', v_id)); end if;
    if (p ? 'codigo' and p ->> 'codigo' is distinct from r.codigo) then
      perform public._sueldos_error('CODIGO_NO_EDITABLE', jsonb_build_object('campo', 'codigo'));
    end if;
    r := jsonb_populate_record(r, p - 'id' - 'codigo' - 'convenio_id' - 'convenio_codigo' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by');
  end if;
  if length(btrim(coalesce(r.nombre, ''))) < 2 then perform public._sueldos_error('NOMBRE_REQUERIDO', jsonb_build_object('campo', 'nombre')); end if;
  if r.tipo is null or r.tipo not in ('remunerativo', 'no_remunerativo', 'descuento', 'contribucion') then
    perform public._sueldos_error('TIPO_INVALIDO', jsonb_build_object('campo', 'tipo'));
  end if;
  if r.calculo is null or r.calculo not in ('manual', 'cantidad_x_escala', 'porcentaje', 'monto_fijo', 'por_unidad') then
    perform public._sueldos_error('CALCULO_INVALIDO', jsonb_build_object('campo', 'calculo'));
  end if;
  if r.base is not null and r.base not in ('basico', 'remunerativo', 'bruto_rem_no_rem', 'sereno_zona_a') then
    perform public._sueldos_error('BASE_INVALIDA', jsonb_build_object('campo', 'base'));
  end if;
  if r.calculo = 'porcentaje' and r.base is null then
    perform public._sueldos_error('BASE_REQUERIDA', jsonb_build_object('campo', 'base'));
  end if;
  if r.condicion not in ('siempre', 'afiliado', 'no_afiliado', 'antiguedad_menor_1', 'antiguedad_mayor_igual_1', 'rifl', 'no_rifl') then
    perform public._sueldos_error('CONDICION_INVALIDA', jsonb_build_object('campo', 'condicion'));
  end if;
  r.codigo_arca := nullif(btrim(coalesce(r.codigo_arca, '')), '');
  if r.codigo_arca is not null and r.codigo_arca !~ '^[0-9]{6}$' then
    perform public._sueldos_error('CODIGO_ARCA_INVALIDO', jsonb_build_object('campo', 'codigo_arca'));
  end if;
  if r.tipo in ('descuento', 'contribucion') then
    r.destino := coalesce(r.destino, 'otros');
    if r.destino not in ('f931', 'sindicato', 'fondo_cese', 'prestamo', 'otros') then
      perform public._sueldos_error('DESTINO_INVALIDO', jsonb_build_object('campo', 'destino'));
    end if;
  else
    r.destino := null;
  end if;
  if r.tipo <> 'contribucion' then r.grupo_contribucion := null; end if;
  if r.grupo_contribucion is not null
     and r.grupo_contribucion not in ('sindical', 'seguridad_social', 'obra_social', 'inssjp', 'art', 'camaras', 'otros') then
    perform public._sueldos_error('GRUPO_INVALIDO', jsonb_build_object('campo', 'grupo_contribucion'));
  end if;
  r.parametro_clave := nullif(btrim(coalesce(r.parametro_clave, '')), '');
  if r.unidad is not null and r.unidad not in ('horas', 'dias', 'km', '%', '$', 'anios', 'unidades') then
    perform public._sueldos_error('UNIDAD_INVALIDA', jsonb_build_object('campo', 'unidad'));
  end if;

  if v_id is null then
    insert into public.sueldos_conceptos (convenio_id, codigo, nombre, tipo, calculo, base, condicion, codigo_arca,
      grupo_contribucion, destino, parametro_clave, unidad, en_recibo, orden, automatico, activo, obs, created_by, updated_by)
    values (r.convenio_id, r.codigo, btrim(r.nombre), r.tipo, r.calculo, r.base, r.condicion, r.codigo_arca,
      r.grupo_contribucion, r.destino, r.parametro_clave, r.unidad, coalesce(r.en_recibo, true), coalesce(r.orden, 0),
      coalesce(r.automatico, false), coalesce(r.activo, true), coalesce(r.obs, ''), p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.sueldos_conceptos
       set nombre = btrim(r.nombre), tipo = r.tipo, calculo = r.calculo, base = r.base, condicion = r.condicion,
           codigo_arca = r.codigo_arca, grupo_contribucion = r.grupo_contribucion, destino = r.destino,
           parametro_clave = r.parametro_clave, unidad = r.unidad, en_recibo = coalesce(r.en_recibo, true),
           orden = coalesce(r.orden, 0), automatico = coalesce(r.automatico, false), activo = coalesce(r.activo, true),
           obs = coalesce(r.obs, ''), updated_by = p_user_id
     where id = v_id;
  end if;
  return (select to_jsonb(c) from public.sueldos_conceptos c where c.id = v_id);
exception when invalid_text_representation then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $$;

-- Valor de concepto: upsert por id o por (concepto_id, vigente_desde).
create or replace function public.sueldos_guardar_concepto_valor(p jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id    bigint := nullif(p ->> 'id', '')::bigint;
  v_con   bigint;
  v_desde date;
  v_pct   numeric;
  v_mto   numeric;
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  if v_id is not null then
    select concepto_id, vigente_desde, porcentaje, monto into v_con, v_desde, v_pct, v_mto
      from public.sueldos_concepto_valores where id = v_id for update;
    if not found then perform public._sueldos_error('VALOR_NO_EXISTE', jsonb_build_object('id', v_id)); end if;
  end if;
  v_con   := coalesce(nullif(p ->> 'concepto_id', '')::bigint, v_con);
  v_desde := coalesce(nullif(p ->> 'vigente_desde', '')::date, v_desde);
  if p ? 'porcentaje' then v_pct := nullif(p ->> 'porcentaje', '')::numeric; end if;
  if p ? 'monto' then v_mto := nullif(p ->> 'monto', '')::numeric; end if;
  if v_con is null or not exists (select 1 from public.sueldos_conceptos where id = v_con) then
    perform public._sueldos_error('CONCEPTO_NO_EXISTE', jsonb_build_object('campo', 'concepto_id'));
  end if;
  if exists (select 1 from public.sueldos_conceptos where id = v_con and parametro_clave is not null) then
    perform public._sueldos_error('CONCEPTO_USA_PARAMETRO', jsonb_build_object('campo', 'concepto_id'));
  end if;
  if v_desde is null then perform public._sueldos_error('FECHA_REQUERIDA', jsonb_build_object('campo', 'vigente_desde')); end if;
  if v_pct is null and v_mto is null then perform public._sueldos_error('VALOR_REQUERIDO', jsonb_build_object('campo', 'porcentaje')); end if;
  if v_pct is not null and (v_pct < -100 or v_pct > 1000) then
    perform public._sueldos_error('VALOR_INVALIDO', jsonb_build_object('campo', 'porcentaje'));
  end if;
  if v_mto is not null and abs(v_mto) >= 1e12 then
    perform public._sueldos_error('VALOR_INVALIDO', jsonb_build_object('campo', 'monto'));
  end if;
  if v_id is not null then
    if exists (select 1 from public.sueldos_concepto_valores where concepto_id = v_con and vigente_desde = v_desde and id <> v_id) then
      perform public._sueldos_error('VALOR_DUPLICADO', jsonb_build_object('campo', 'vigente_desde'));
    end if;
    update public.sueldos_concepto_valores
       set concepto_id = v_con, vigente_desde = v_desde, porcentaje = v_pct, monto = round(v_mto, 2),
           a_confirmar = coalesce((p ->> 'a_confirmar')::boolean, a_confirmar), fuente = coalesce(p ->> 'fuente', fuente),
           updated_by = p_user_id
     where id = v_id;
  else
    insert into public.sueldos_concepto_valores (concepto_id, vigente_desde, porcentaje, monto, a_confirmar, fuente, created_by, updated_by)
    values (v_con, v_desde, v_pct, round(v_mto, 2), coalesce((p ->> 'a_confirmar')::boolean, false), coalesce(p ->> 'fuente', ''),
            p_user_id, p_user_id)
    on conflict (concepto_id, vigente_desde) do update
      set porcentaje = excluded.porcentaje, monto = excluded.monto, a_confirmar = excluded.a_confirmar,
          fuente = case when p ? 'fuente' then excluded.fuente else sueldos_concepto_valores.fuente end, updated_by = p_user_id
    returning id into v_id;
  end if;
  return (select to_jsonb(v) from public.sueldos_concepto_valores v where v.id = v_id);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $$;

create or replace function public.sueldos_borrar_concepto_valor(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  delete from public.sueldos_concepto_valores where id = p_id;
  if not found then perform public._sueldos_error('VALOR_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- Parámetro: upsert por id o por (clave, vigente_desde).
create or replace function public.sueldos_guardar_parametro(p jsonb, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id    bigint := nullif(p ->> 'id', '')::bigint;
  v_clave text;
  v_desde date;
  v_valor numeric;
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  if v_id is not null then
    select clave, vigente_desde, valor into v_clave, v_desde, v_valor from public.sueldos_parametros where id = v_id for update;
    if not found then perform public._sueldos_error('PARAMETRO_NO_EXISTE', jsonb_build_object('id', v_id)); end if;
  end if;
  v_clave := lower(btrim(coalesce(nullif(p ->> 'clave', ''), v_clave, '')));
  v_desde := coalesce(nullif(p ->> 'vigente_desde', '')::date, v_desde);
  if p ? 'valor' then v_valor := nullif(p ->> 'valor', '')::numeric; end if;
  if v_clave !~ '^[a-z0-9_]{2,60}$' then perform public._sueldos_error('CLAVE_INVALIDA', jsonb_build_object('campo', 'clave')); end if;
  if v_desde is null then perform public._sueldos_error('FECHA_REQUERIDA', jsonb_build_object('campo', 'vigente_desde')); end if;
  if v_valor is null or abs(v_valor) >= 1e12 then perform public._sueldos_error('VALOR_INVALIDO', jsonb_build_object('campo', 'valor')); end if;
  if v_id is not null then
    if exists (select 1 from public.sueldos_parametros where clave = v_clave and vigente_desde = v_desde and id <> v_id) then
      perform public._sueldos_error('PARAMETRO_DUPLICADO', jsonb_build_object('campo', 'vigente_desde'));
    end if;
    update public.sueldos_parametros
       set clave = v_clave, vigente_desde = v_desde, valor = v_valor,
           a_confirmar = coalesce((p ->> 'a_confirmar')::boolean, a_confirmar), fuente = coalesce(p ->> 'fuente', fuente),
           descripcion = coalesce(p ->> 'descripcion', descripcion), updated_by = p_user_id
     where id = v_id;
  else
    insert into public.sueldos_parametros (clave, vigente_desde, valor, a_confirmar, fuente, descripcion, created_by, updated_by)
    values (v_clave, v_desde, v_valor, coalesce((p ->> 'a_confirmar')::boolean, false), coalesce(p ->> 'fuente', ''),
            coalesce(p ->> 'descripcion', ''), p_user_id, p_user_id)
    on conflict (clave, vigente_desde) do update
      set valor = excluded.valor, a_confirmar = excluded.a_confirmar,
          fuente = case when p ? 'fuente' then excluded.fuente else sueldos_parametros.fuente end,
          descripcion = case when p ? 'descripcion' then excluded.descripcion else sueldos_parametros.descripcion end,
          updated_by = p_user_id
    returning id into v_id;
  end if;
  return (select to_jsonb(x) from public.sueldos_parametros x where x.id = v_id);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $$;

create or replace function public.sueldos_borrar_parametro(p_id bigint, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  delete from public.sueldos_parametros where id = p_id;
  if not found then perform public._sueldos_error('PARAMETRO_NO_EXISTE', jsonb_build_object('id', p_id)); end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- ── 4) Nueva paritaria ───────────────────────────────────────────────
-- Clona, para cada categoría ACTIVA del convenio y cada zona (o la zona
-- pedida), la escala vigente el día anterior a p_desde aplicando el %.
-- Si alguna ya tiene fila en p_desde: ESCALA_YA_EXISTE (no pisa nada).
create or replace function public.sueldos_nueva_paritaria(
  p_convenio_id bigint, p_desde date, p_porcentaje numeric, p_user_id uuid,
  p_fuente text default '', p_a_confirmar boolean default false, p_zona text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n    int;
  v_ex   jsonb;
  v_rows jsonb;
begin
  perform public._sueldos_requiere(p_user_id, 'configurar');
  if not exists (select 1 from public.sueldos_convenios where id = p_convenio_id) then
    perform public._sueldos_error('CONVENIO_NO_EXISTE', jsonb_build_object('convenio_id', p_convenio_id));
  end if;
  if p_desde is null then perform public._sueldos_error('FECHA_REQUERIDA', jsonb_build_object('campo', 'desde')); end if;
  if p_porcentaje is null or p_porcentaje <= -50 or p_porcentaje > 200 then
    perform public._sueldos_error('PORCENTAJE_INVALIDO', jsonb_build_object('campo', 'porcentaje'));
  end if;

  create temp table if not exists _sueldos_par (categoria_id bigint, zona text, anterior numeric, valor numeric) on commit drop;
  truncate _sueldos_par;
  insert into _sueldos_par
  select distinct on (e.categoria_id, e.zona) e.categoria_id, e.zona, e.valor,
         round(e.valor * (1 + p_porcentaje / 100), 2)
    from public.sueldos_escalas e
    join public.sueldos_categorias c on c.id = e.categoria_id
   where c.convenio_id = p_convenio_id and c.activo and e.vigente_desde < p_desde
     and (p_zona is null or e.zona = upper(btrim(p_zona)))
   order by e.categoria_id, e.zona, e.vigente_desde desc;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    perform public._sueldos_error('SIN_ESCALAS_VIGENTES', jsonb_build_object('convenio_id', p_convenio_id, 'desde', p_desde));
  end if;

  select jsonb_agg(jsonb_build_object('categoria_id', e.categoria_id, 'zona', e.zona)) into v_ex
    from public.sueldos_escalas e join _sueldos_par x on x.categoria_id = e.categoria_id and x.zona = e.zona
   where e.vigente_desde = p_desde;
  if v_ex is not null then
    perform public._sueldos_error('ESCALA_YA_EXISTE', jsonb_build_object('desde', p_desde, 'escalas', v_ex));
  end if;

  with ins as (
    insert into public.sueldos_escalas (categoria_id, zona, vigente_desde, valor, fuente, a_confirmar, created_by, updated_by)
    select x.categoria_id, x.zona, p_desde, x.valor,
           coalesce(nullif(btrim(p_fuente), ''), 'Paritaria ' || p_porcentaje || ' % desde ' || to_char(p_desde, 'DD/MM/YYYY')),
           coalesce(p_a_confirmar, false), p_user_id, p_user_id
      from _sueldos_par x
    returning *)
  select jsonb_agg(jsonb_build_object('id', i.id, 'categoria_id', i.categoria_id, 'zona', i.zona, 'anterior', x.anterior,
                                      'valor', i.valor) order by i.categoria_id, i.zona)
    into v_rows
    from ins i join _sueldos_par x on x.categoria_id = i.categoria_id and x.zona = i.zona;

  return jsonb_build_object('creadas', v_n, 'desde', p_desde, 'porcentaje', p_porcentaje, 'escalas', v_rows);
end $$;

-- ── 5) Grants ─────────────────────────────────────────────────────────
do $g$
declare f text;
begin
  foreach f in array array[
    '_sueldos_error(text,jsonb)', '_sueldos_requiere(uuid,text)', '_sueldos_digitos(text)',
    '_sueldos_cuil_valido(text)', '_sueldos_cbu_valido(text)', '_sueldos_convenio_id(jsonb)',
    'sueldos_valor_escala(bigint,text,date)', 'sueldos_valor_parametro(text,date)', 'sueldos_valor_concepto(bigint,date)',
    'sueldos_valores_a_fecha(bigint,date,text)', 'sueldos_guardar_legajo(jsonb,uuid)',
    'sueldos_guardar_convenio(jsonb,uuid)', 'sueldos_guardar_categoria(jsonb,uuid)',
    'sueldos_guardar_escala(jsonb,uuid)', 'sueldos_borrar_escala(bigint,uuid)',
    'sueldos_guardar_concepto(jsonb,uuid)', 'sueldos_guardar_concepto_valor(jsonb,uuid)',
    'sueldos_borrar_concepto_valor(bigint,uuid)', 'sueldos_guardar_parametro(jsonb,uuid)',
    'sueldos_borrar_parametro(bigint,uuid)',
    'sueldos_nueva_paritaria(bigint,date,numeric,uuid,text,boolean,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;
