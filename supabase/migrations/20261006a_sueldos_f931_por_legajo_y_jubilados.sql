-- 20261006a — Sueldos: códigos F.931 por convenio/legajo y jubilados que siguen trabajando.
--
-- Por qué: el F.931 08/2026 de CADINC declara a cada empleado con condición / actividad /
-- modalidad de contratación que dependen del convenio (UOCRA 5/003/24; UECARA y Camioneros
-- 1/049/8) salvo dos jubilados que siguen trabajando (Robles Miguel 2/049/1 y Soria Marcelo
-- 2/049/8). Para armar el LSD (registro 04) hacen falta esos códigos por persona.
-- Además un jubilado NO aporta ni contribuye a obra social ni a INSSJP (Ley 19.032) y la
-- contribución patronal es 10,77 % sobre la remuneración (sin INSSJP, FNE ni asignaciones),
-- en lugar del 18 %. Se modela con dos marcas en el concepto (excluye_jubilados /
-- solo_jubilados) que el motor del backend lee de sueldos_valores_a_fecha (to_jsonb del
-- concepto, así que salen solas) y el nuevo concepto común contrib_ss_jubilado.
--
-- Códigos: texto de 1 a 3 dígitos (el LSD los pide con ceros a la izquierda: '003', '049').
-- null en el legajo = usa el del convenio (v_sueldos_legajos.f931_*_efectiva).
-- Hay 0 liquidaciones y 0 recibos: no hay nada que recalcular.

-- 1. Convenios -----------------------------------------------------------------------------
alter table public.sueldos_convenios
  add column f931_condicion text,
  add column f931_actividad text,
  add column f931_modalidad text,
  add constraint sueldos_convenios_f931_condicion_chk check (f931_condicion ~ '^\d{1,3}$'),
  add constraint sueldos_convenios_f931_actividad_chk check (f931_actividad ~ '^\d{1,3}$'),
  add constraint sueldos_convenios_f931_modalidad_chk check (f931_modalidad ~ '^\d{1,3}$');

comment on column public.sueldos_convenios.f931_condicion is 'Código de condición del F.931 / LSD por defecto del convenio (ej. 5 = construcción). El legajo lo puede pisar.';
comment on column public.sueldos_convenios.f931_actividad is 'Código de actividad del F.931 / LSD por defecto del convenio (ej. 003, 049).';
comment on column public.sueldos_convenios.f931_modalidad is 'Código de modalidad de contratación del F.931 / LSD por defecto del convenio (ej. 8, 24).';

update public.sueldos_convenios set f931_condicion = '5', f931_actividad = '003', f931_modalidad = '24' where codigo = 'uocra';
update public.sueldos_convenios set f931_condicion = '1', f931_actividad = '049', f931_modalidad = '8'  where codigo in ('uecara', 'camioneros');

-- 2. Legajos -------------------------------------------------------------------------------
alter table public.sueldos_legajos
  add column jubilado boolean not null default false,
  add column f931_condicion text,
  add column f931_actividad text,
  add column f931_modalidad text,
  add constraint sueldos_legajos_f931_condicion_chk check (f931_condicion ~ '^\d{1,3}$'),
  add constraint sueldos_legajos_f931_actividad_chk check (f931_actividad ~ '^\d{1,3}$'),
  add constraint sueldos_legajos_f931_modalidad_chk check (f931_modalidad ~ '^\d{1,3}$');

comment on column public.sueldos_legajos.jubilado is 'Jubilado que sigue trabajando: no aporta ni contribuye a obra social / INSSJP y la contribución patronal es la de jubilados (conceptos excluye_jubilados / solo_jubilados).';
comment on column public.sueldos_legajos.f931_condicion is 'Override del código de condición F.931 (null = el del convenio). Jubilado = 2.';
comment on column public.sueldos_legajos.f931_actividad is 'Override del código de actividad F.931 (null = el del convenio).';
comment on column public.sueldos_legajos.f931_modalidad is 'Override del código de modalidad de contratación F.931 (null = el del convenio).';

-- 3. Conceptos -----------------------------------------------------------------------------
alter table public.sueldos_conceptos
  add column excluye_jubilados boolean not null default false,
  add column solo_jubilados boolean not null default false,
  add constraint sueldos_conceptos_jubilados_chk check (not (excluye_jubilados and solo_jubilados));

comment on column public.sueldos_conceptos.excluye_jubilados is 'El concepto NO se aplica a legajos jubilados (aportes y contribuciones de obra social / INSSJP, contribución patronal común).';
comment on column public.sueldos_conceptos.solo_jubilados is 'El concepto se aplica SOLO a legajos jubilados (contribución patronal de jubilados).';

-- Datos: legajos jubilados (verificados por id + CUIL + nombre), conceptos y parámetros.
do $d$
declare
  v_n int;
begin
  update public.sueldos_legajos
     set jubilado = true, f931_condicion = '2', f931_actividad = '049', f931_modalidad = '1'
   where id = 52 and cuil = '20134383764' and nombre ilike 'ROBLES MIGUEL%';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'legajo 52 (Robles Miguel, 20134383764) no encontrado: %', v_n; end if;

  update public.sueldos_legajos
     set jubilado = true, f931_condicion = '2', f931_actividad = '049', f931_modalidad = '8'
   where id = 54 and cuil = '20207587657' and nombre ilike 'SORIA MARCELO%';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'legajo 54 (Soria Marcelo, 20207587657) no encontrado: %', v_n; end if;

  -- Aportes/contribuciones de obra social e INSSJP y la contribución patronal común.
  -- Incluye cualquier contribución de grupo obra_social/inssjp (hoy: contrib_os común y
  -- oschoca de Camioneros) y los descuentos 810001 (Ley 19.032) / 810002 (obra social) /
  -- 810003 (por si aparece, ARCA lo usa para el aporte adicional de obra social).
  update public.sueldos_conceptos
     set excluye_jubilados = true
   where (convenio_id is null and codigo in ('ley_19032', 'obra_social', 'contrib_os', 'contrib_ss'))
      or (tipo = 'contribucion' and grupo_contribucion in ('obra_social', 'inssjp'))
      or (tipo = 'descuento' and codigo_arca in ('810001', '810002', '810003'));
  get diagnostics v_n = row_count;
  if v_n < 4 then raise exception 'conceptos excluye_jubilados: se esperaban al menos 4, hubo %', v_n; end if;

  insert into public.sueldos_conceptos (convenio_id, codigo, nombre, tipo, calculo, base, condicion, codigo_arca,
    grupo_contribucion, destino, parametro_clave, unidad, en_recibo, orden, automatico, activo, obs, solo_jubilados)
  select null, 'contrib_ss_jubilado', 'Contribuciones seguridad social (jubilado)', c.tipo, c.calculo, c.base, 'siempre',
         c.codigo_arca, c.grupo_contribucion, c.destino, 'contrib_patronal_jubilado_pct', c.unidad, c.en_recibo, c.orden,
         c.automatico, true, 'F.931 08/2026: jubilados que siguen trabajando, 10,77 % (sin INSSJP, FNE ni asignaciones).', true
    from public.sueldos_conceptos c
   where c.convenio_id is null and c.codigo = 'contrib_ss'
     and not exists (select 1 from public.sueldos_conceptos x where x.convenio_id is null and x.codigo = 'contrib_ss_jubilado');
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'contrib_ss_jubilado: se esperaba 1 alta, hubo %', v_n; end if;

  insert into public.sueldos_parametros (clave, vigente_desde, valor, a_confirmar, fuente, descripcion)
  values ('contrib_patronal_jubilado_pct', date '2026-01-01', 10.77, false,
          'F.931 08/2026: contribución previsional de los jubilados 10,77 % sobre rem. 10 (sin INSSJP, FNE ni asignaciones)',
          'Contribución patronal de seguridad social para jubilados que siguen trabajando, % sobre remunerativo (reemplaza al 18 %: sin INSSJP, FNE ni asignaciones familiares).'),
         ('f931_localidad', date '2026-01-01', 84, false,
          'F.931 08/2026',
          'Código de localidad/zona del F.931 (registro 04 del LSD)');
end $d$;

-- 4. Vista de legajos: mismas columnas + las nuevas al final (create or replace conserva
--    security_invoker, grants y comentario).
create or replace view public.v_sueldos_legajos
with (security_invoker = true) as
 SELECT l.id,
    l.leg,
    l.chofer_id,
    l.nombre,
    l.cuil,
    l.fecha_ingreso,
    l.fecha_egreso,
    l.convenio_id,
    l.categoria_id,
    l.zona,
    l.modalidad_contratacion,
    l.jornada,
    l.obra_social,
    l.obra_social_codigo,
    l.afiliado_sindicato,
    l.cbu,
    l.banco,
    l.estado_civil,
    l.conyuge_a_cargo,
    l.hijos_a_cargo,
    l.ieric_numero,
    l.fondo_cese_cuenta,
    l.titulo_nivel,
    l.carnet_profesional,
    l.rifl,
    l.obra_cod_habitual,
    l.activo,
    l.obs,
    l.created_at,
    l.updated_at,
    l.created_by,
    l.updated_by,
    COALESCE(p.nom, ch.nombre, NULLIF(l.nombre, ''::text)) AS nombre_mostrar,
    p.dni,
    p.condicion AS personal_condicion,
    p.modalidad AS personal_modalidad,
    ch.nombre AS chofer_nombre,
    ch.estado AS chofer_estado,
    ch.es_propio AS chofer_es_propio,
    cv.codigo AS convenio_codigo,
    cv.nombre AS convenio_nombre,
    ca.codigo AS categoria_codigo,
    ca.nombre AS categoria_nombre,
    array_remove(ARRAY[
        CASE WHEN l.cuil IS NULL THEN 'cuil'::text ELSE NULL::text END,
        CASE WHEN l.fecha_ingreso IS NULL THEN 'fecha_ingreso'::text ELSE NULL::text END,
        CASE WHEN l.categoria_id IS NULL THEN 'categoria'::text ELSE NULL::text END,
        CASE WHEN btrim(l.obra_social) = ''::text THEN 'obra_social'::text ELSE NULL::text END,
        CASE WHEN l.cbu IS NULL THEN 'cbu'::text ELSE NULL::text END], NULL::text) AS faltantes,
    l.cuil IS NULL OR l.fecha_ingreso IS NULL OR l.categoria_id IS NULL OR btrim(l.obra_social) = ''::text OR l.cbu IS NULL AS incompleto,
    l.jubilado,
    l.f931_condicion,
    l.f931_actividad,
    l.f931_modalidad,
    COALESCE(l.f931_condicion, cv.f931_condicion) AS f931_condicion_efectiva,
    COALESCE(l.f931_actividad, cv.f931_actividad) AS f931_actividad_efectiva,
    COALESCE(l.f931_modalidad, cv.f931_modalidad) AS f931_modalidad_efectiva
   FROM sueldos_legajos l
     JOIN sueldos_convenios cv ON cv.id = l.convenio_id
     LEFT JOIN sueldos_categorias ca ON ca.id = l.categoria_id
     LEFT JOIN personal p ON p.leg = l.leg
     LEFT JOIN choferes ch ON ch.id = l.chofer_id;

comment on view public.v_sueldos_legajos is 'Legajos con nombre (personal › chofer › snapshot), convenio, categoría y completitud (faltantes: cuil, fecha_ingreso, categoria, obra_social, cbu). Códigos F.931 efectivos = legajo › convenio. Tiene CUIL y CBU: el backend los enmascara sin ver_pii.';

-- 5. sueldos_guardar_legajo: + jubilado, f931_condicion, f931_actividad, f931_modalidad.
CREATE OR REPLACE FUNCTION public.sueldos_guardar_legajo(p_legajo jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_campos text[] := array['leg', 'chofer_id', 'nombre', 'cuil', 'fecha_ingreso', 'fecha_egreso', 'convenio_id',
    'categoria_id', 'zona', 'modalidad_contratacion', 'jornada', 'obra_social', 'obra_social_codigo',
    'afiliado_sindicato', 'cbu', 'banco', 'estado_civil', 'conyuge_a_cargo', 'hijos_a_cargo', 'ieric_numero',
    'fondo_cese_cuenta', 'titulo_nivel', 'carnet_profesional', 'rifl', 'obra_cod_habitual', 'activo', 'obs',
    'jubilado', 'f931_condicion', 'f931_actividad', 'f931_modalidad'];
  v_def jsonb := '{"nombre":"","zona":"A","modalidad_contratacion":"tiempo_indeterminado","jornada":"completa",
    "obra_social":"","obra_social_codigo":"","afiliado_sindicato":false,"banco":"","estado_civil":"",
    "conyuge_a_cargo":false,"hijos_a_cargo":0,"ieric_numero":"","fondo_cese_cuenta":"","carnet_profesional":"",
    "rifl":false,"activo":true,"obs":"","jubilado":false}'::jsonb;
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
  foreach v_k in array array['leg', 'chofer_id', 'categoria_id', 'fecha_ingreso', 'fecha_egreso', 'titulo_nivel', 'obra_cod_habitual',
                             'f931_condicion', 'f931_actividad', 'f931_modalidad'] loop
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

  if (r.cuil is distinct from v_old.cuil or r.cbu is distinct from v_old.cbu)
     and not public._perm_flag(p_user_id, 'sueldos', 'ver_pii', false) then
    perform public._sueldos_error('SIN_PERMISO_PII', jsonb_build_object('campos', array['cuil', 'cbu']));
  end if;

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

  if r.convenio_id is null then perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id')); end if;
  if (v_es_nuevo or r.convenio_id is distinct from v_old.convenio_id)
     and not exists (select 1 from public.sueldos_convenios where id = r.convenio_id and activo) then
    perform public._sueldos_error('CONVENIO_INVALIDO', jsonb_build_object('campo', 'convenio_id', 'convenio_id', r.convenio_id));
  end if;
  if r.categoria_id is not null
     and not exists (select 1 from public.sueldos_categorias where id = r.categoria_id and convenio_id = r.convenio_id) then
    if not v_es_nuevo and not (v_in ? 'categoria_id') and r.convenio_id is distinct from v_old.convenio_id then
      r.categoria_id := null;
    else
      perform public._sueldos_error('CATEGORIA_OTRO_CONVENIO', jsonb_build_object('campo', 'categoria_id', 'categoria_id', r.categoria_id));
    end if;
  end if;
  if r.categoria_id is null then
    select id into r.categoria_id from public.sueldos_categorias where convenio_id = r.convenio_id and por_defecto and activo;
  end if;

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
  if r.f931_condicion is not null and r.f931_condicion !~ '^\d{1,3}$' then
    perform public._sueldos_error('F931_CODIGO_INVALIDO', jsonb_build_object('campo', 'f931_condicion'));
  end if;
  if r.f931_actividad is not null and r.f931_actividad !~ '^\d{1,3}$' then
    perform public._sueldos_error('F931_CODIGO_INVALIDO', jsonb_build_object('campo', 'f931_actividad'));
  end if;
  if r.f931_modalidad is not null and r.f931_modalidad !~ '^\d{1,3}$' then
    perform public._sueldos_error('F931_CODIGO_INVALIDO', jsonb_build_object('campo', 'f931_modalidad'));
  end if;

  if v_es_nuevo then
    insert into public.sueldos_legajos (leg, chofer_id, nombre, cuil, fecha_ingreso, fecha_egreso, convenio_id, categoria_id,
      zona, modalidad_contratacion, jornada, obra_social, obra_social_codigo, afiliado_sindicato, cbu, banco, estado_civil,
      conyuge_a_cargo, hijos_a_cargo, ieric_numero, fondo_cese_cuenta, titulo_nivel, carnet_profesional, rifl,
      obra_cod_habitual, activo, obs, jubilado, f931_condicion, f931_actividad, f931_modalidad, created_by, updated_by)
    values (r.leg, r.chofer_id, r.nombre, r.cuil, r.fecha_ingreso, r.fecha_egreso, r.convenio_id, r.categoria_id,
      r.zona, r.modalidad_contratacion, r.jornada, r.obra_social, r.obra_social_codigo, r.afiliado_sindicato, r.cbu, r.banco,
      r.estado_civil, r.conyuge_a_cargo, r.hijos_a_cargo, r.ieric_numero, r.fondo_cese_cuenta, r.titulo_nivel,
      r.carnet_profesional, r.rifl, r.obra_cod_habitual, coalesce(r.activo, true), r.obs,
      coalesce(r.jubilado, false), r.f931_condicion, r.f931_actividad, r.f931_modalidad, p_user_id, p_user_id)
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
      activo = coalesce(r.activo, true), obs = r.obs,
      jubilado = coalesce(r.jubilado, false), f931_condicion = r.f931_condicion, f931_actividad = r.f931_actividad,
      f931_modalidad = r.f931_modalidad, updated_by = p_user_id
     where id = v_id;
  end if;

  return (select to_jsonb(v) from public.v_sueldos_legajos v where v.id = v_id);
end $function$;

-- 6a. sueldos_guardar_convenio: + f931_condicion, f931_actividad, f931_modalidad ('' → null).
CREATE OR REPLACE FUNCTION public.sueldos_guardar_convenio(p jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  r.f931_condicion := nullif(btrim(coalesce(r.f931_condicion, '')), '');
  r.f931_actividad := nullif(btrim(coalesce(r.f931_actividad, '')), '');
  r.f931_modalidad := nullif(btrim(coalesce(r.f931_modalidad, '')), '');
  if r.f931_condicion is not null and r.f931_condicion !~ '^\d{1,3}$' then
    perform public._sueldos_error('F931_CODIGO_INVALIDO', jsonb_build_object('campo', 'f931_condicion'));
  end if;
  if r.f931_actividad is not null and r.f931_actividad !~ '^\d{1,3}$' then
    perform public._sueldos_error('F931_CODIGO_INVALIDO', jsonb_build_object('campo', 'f931_actividad'));
  end if;
  if r.f931_modalidad is not null and r.f931_modalidad !~ '^\d{1,3}$' then
    perform public._sueldos_error('F931_CODIGO_INVALIDO', jsonb_build_object('campo', 'f931_modalidad'));
  end if;
  if v_id is null then
    insert into public.sueldos_convenios (codigo, nombre, cct, periodicidad, unidad_basico, obs, activo,
      f931_condicion, f931_actividad, f931_modalidad, created_by, updated_by)
    values (r.codigo, btrim(r.nombre), coalesce(r.cct, ''), r.periodicidad, r.unidad_basico, coalesce(r.obs, ''),
            coalesce(r.activo, true), r.f931_condicion, r.f931_actividad, r.f931_modalidad, p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.sueldos_convenios
       set nombre = btrim(r.nombre), cct = coalesce(r.cct, ''), periodicidad = r.periodicidad,
           unidad_basico = r.unidad_basico, obs = coalesce(r.obs, ''), activo = coalesce(r.activo, true),
           f931_condicion = r.f931_condicion, f931_actividad = r.f931_actividad, f931_modalidad = r.f931_modalidad,
           updated_by = p_user_id
     where id = v_id;
  end if;
  return (select to_jsonb(c) from public.sueldos_convenios c where c.id = v_id);
exception when invalid_text_representation then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $function$;

-- 6b. sueldos_guardar_concepto: + excluye_jubilados, solo_jubilados (no los dos).
CREATE OR REPLACE FUNCTION public.sueldos_guardar_concepto(p jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
           '{"condicion":"siempre","en_recibo":true,"orden":0,"automatico":false,"activo":true,"obs":"","excluye_jubilados":false,"solo_jubilados":false}'::jsonb
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
  r.excluye_jubilados := coalesce(r.excluye_jubilados, false);
  r.solo_jubilados := coalesce(r.solo_jubilados, false);
  if r.excluye_jubilados and r.solo_jubilados then
    perform public._sueldos_error('CONCEPTO_JUBILADOS_INVALIDO',
      jsonb_build_object('campo', 'solo_jubilados', 'campos', array['excluye_jubilados', 'solo_jubilados']));
  end if;

  if v_id is null then
    insert into public.sueldos_conceptos (convenio_id, codigo, nombre, tipo, calculo, base, condicion, codigo_arca,
      grupo_contribucion, destino, parametro_clave, unidad, en_recibo, orden, automatico, activo, obs,
      excluye_jubilados, solo_jubilados, created_by, updated_by)
    values (r.convenio_id, r.codigo, btrim(r.nombre), r.tipo, r.calculo, r.base, r.condicion, r.codigo_arca,
      r.grupo_contribucion, r.destino, r.parametro_clave, r.unidad, coalesce(r.en_recibo, true), coalesce(r.orden, 0),
      coalesce(r.automatico, false), coalesce(r.activo, true), coalesce(r.obs, ''),
      r.excluye_jubilados, r.solo_jubilados, p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.sueldos_conceptos
       set nombre = btrim(r.nombre), tipo = r.tipo, calculo = r.calculo, base = r.base, condicion = r.condicion,
           codigo_arca = r.codigo_arca, grupo_contribucion = r.grupo_contribucion, destino = r.destino,
           parametro_clave = r.parametro_clave, unidad = r.unidad, en_recibo = coalesce(r.en_recibo, true),
           orden = coalesce(r.orden, 0), automatico = coalesce(r.automatico, false), activo = coalesce(r.activo, true),
           obs = coalesce(r.obs, ''), excluye_jubilados = r.excluye_jubilados, solo_jubilados = r.solo_jubilados,
           updated_by = p_user_id
     where id = v_id;
  end if;
  return (select to_jsonb(c) from public.sueldos_conceptos c where c.id = v_id);
exception when invalid_text_representation then
  perform public._sueldos_error('DATOS_INVALIDOS', jsonb_build_object('mensaje', sqlerrm));
end $function$;

-- 7. sueldos_valores_a_fecha no cambia: arma cada concepto con to_jsonb(k) y el convenio con
--    to_jsonb(cv), así que ya devuelve excluye_jubilados / solo_jubilados y los f931_* del
--    convenio. El snapshot del recibo (sueldos_guardar_recibo) usa to_jsonb(v_sueldos_legajos):
--    trae jubilado y los f931_* (propios y efectivos) sin tocarlo.
-- Grants: create or replace conserva los EXECUTE (solo service_role) y la vista sus grants.

-- Agregado después de aplicar (27/09, ya ejecutado en prod): la contribución RIFL tampoco va a jubilados.
update sueldos_conceptos set excluye_jubilados = true where codigo = 'contrib_rifl' and convenio_id is null;
