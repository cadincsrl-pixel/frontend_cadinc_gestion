-- =====================================================================
-- 20261004f — Sueldos: legajos pre-creados desde Personal y Choferes (2026-09-26)
--
-- Por qué: que Sueldos arranque con la nómina en blanco ya cargada y el
-- liquidador solo complete los datos (CUIL, ingreso, obra social, CBU…).
-- Todos quedan con obs «Creado automáticamente: completar datos» y la UI
-- los marca incompletos (v_sueldos_legajos.faltantes). Idempotente.
--
-- Reglas (spec + decisiones propias, el dueño pidió no preguntar):
--   · personal.condicion = 'blanco' y modalidad 'hora' → UOCRA. La categoría
--     se toma de la de Personal cuando el nombre coincide (Oficial
--     especializado / Oficial albañil → Oficial / Medio oficial / Ayudante);
--     si no, la por defecto (Ayudante). Mejora sobre la spec («la más baja»):
--     la categoría real ya estaba cargada.
--   · personal.condicion = 'blanco' y modalidad 'mes' → UECARA, categoría por
--     defecto, con obs para revisar (dos de «OFICINA» y
--     cuatro «Prestado a otra empresa»: puede que no sean UECARA; el 7º,
--     Zelarayan, es chofer y va a Camioneros).
--   · choferes.es_propio y estado 'activo' → Camioneros (categoría por
--     defecto: Conductor 3ª). Si el chofer es la misma persona que un legajo
--     de Personal (DNI dentro del CUIL o mismo nombre normalizado) va UN solo
--     legajo con leg + chofer_id y convenio Camioneros (Zelarayan Patricio).
--   · CUIL: el de choferes si tiene 11 dígitos y dígito verificador válido;
--     Personal no tiene CUIL (solo DNI). CBU: el de choferes si es válido.
--   · activo: chofer activo → true; si no, personal.activo_override (null =
--     activo).
--
-- Además: los comentarios de los objetos y la obs de los mapeos creados por
-- 20261004a–e decían «20261003x» (la serie se renumeró a 20261004 por otra
-- sesión que usa 20261003): se corrigen acá.
-- =====================================================================

-- ── 1) Legajos ──────────────────────────────────────────────────────
with conv as (
  select codigo, id,
         (select k.id from public.sueldos_categorias k where k.convenio_id = c.id and k.por_defecto) as cat_def
    from public.sueldos_convenios c
),
match_chofer as (
  select ch.id as chofer_id, p.leg
    from public.choferes ch
    join public.personal p
      on (length(public._sueldos_digitos(ch.cuil)) = 11 and p.dni <> '' and p.dni = substr(public._sueldos_digitos(ch.cuil), 3, 8))
      or public.norm_txt(p.nom) = public.norm_txt(ch.nombre)
   where ch.es_propio and ch.estado = 'activo'
),
cand as (
  -- Personal en blanco (con el chofer si es la misma persona).
  select p.leg, m.chofer_id, p.nom as nombre,
         case when m.chofer_id is not null then 'camioneros' when p.modalidad = 'mes' then 'uecara' else 'uocra' end as conv,
         case when m.chofer_id is null and coalesce(p.modalidad, 'hora') <> 'mes' then
                case public.norm_txt(c.nom)
                  when public.norm_txt('Oficial Especializado') then 'oficial_especializado'
                  when public.norm_txt('Oficial Albañil')       then 'oficial'
                  when public.norm_txt('Oficial')               then 'oficial'
                  when public.norm_txt('Medio Oficial')         then 'medio_oficial'
                  when public.norm_txt('Ayudante')              then 'ayudante'
                end
         end as cat_codigo,
         case when m.chofer_id is not null then true else coalesce(p.activo_override, true) end as activo,
         'Creado automáticamente: completar datos.'
         || case when m.chofer_id is not null then ' Es chofer propio de Logística: convenio Camioneros.'
                 when p.modalidad = 'mes' then ' Mensualizado → UECARA por defecto: revisar convenio y categoría (en Personal figura «' || coalesce(btrim(c.nom), 'sin categoría') || '»).'
                 else '' end as obs
    from public.personal p
    left join public.categorias c on c.id = p.cat_id
    left join match_chofer m on m.leg = p.leg
   where p.condicion = 'blanco'
  union all
  -- Choferes propios activos que no están en Personal.
  select null, ch.id, ch.nombre, 'camioneros', null, true,
         'Creado automáticamente desde Logística (chofer propio): completar datos.'
         || case when public._sueldos_digitos(ch.cuil) is not null and not public._sueldos_cuil_valido(public._sueldos_digitos(ch.cuil))
                 then ' El CUIL cargado en Logística está incompleto o es inválido: cargarlo acá.' else '' end
    from public.choferes ch
   where ch.es_propio and ch.estado = 'activo'
     and not exists (select 1 from match_chofer m where m.chofer_id = ch.id)
)
insert into public.sueldos_legajos (leg, chofer_id, nombre, cuil, convenio_id, categoria_id, cbu, activo, obs)
select x.leg, x.chofer_id, x.nombre,
       case when public._sueldos_cuil_valido(public._sueldos_digitos(ch.cuil)) then public._sueldos_digitos(ch.cuil) end,
       cv.id,
       coalesce((select k.id from public.sueldos_categorias k where k.convenio_id = cv.id and k.codigo = x.cat_codigo), cv.cat_def),
       case when public._sueldos_cbu_valido(public._sueldos_digitos(ch.cbu)) then public._sueldos_digitos(ch.cbu) end,
       x.activo, x.obs
  from cand x
  join conv cv on cv.codigo = x.conv
  left join public.choferes ch on ch.id = x.chofer_id
 where not exists (select 1 from public.sueldos_legajos l
                    where (x.leg is not null and l.leg = x.leg) or (x.chofer_id is not null and l.chofer_id = x.chofer_id));

-- ── 2) Comentarios y obs con la numeración vieja ─────────────────────
do $c$
declare
  r   record;
  v   text;
begin
  for r in
    select d.objoid, d.classoid, d.objsubid, d.description
      from pg_description d
     where d.description like '%20261003%'
       and ((d.classoid = 'pg_class'::regclass
             and d.objoid in (select oid from pg_class where relnamespace = 'public'::regnamespace
                                                         and (relname like 'sueldos\_%' or relname = 'v_sueldos_legajos')))
         or (d.classoid = 'pg_proc'::regclass
             and d.objoid in (select oid from pg_proc where pronamespace = 'public'::regnamespace
                                                        and (proname like 'sueldos\_%' or proname like '\_sueldos\_%'))))
  loop
    v := replace(r.description, '20261003', '20261004');
    if r.classoid = 'pg_proc'::regclass then
      execute format('comment on function %s is %L', r.objoid::regprocedure, v);
    elsif r.objsubid = 0 then
      execute format('comment on %s %s is %L',
                     case (select relkind from pg_class where oid = r.objoid) when 'v' then 'view' else 'table' end,
                     r.objoid::regclass, v);
    else
      execute format('comment on column %s.%I is %L', r.objoid::regclass,
                     (select attname from pg_attribute where attrelid = r.objoid and attnum = r.objsubid), v);
    end if;
  end loop;
end $c$;

update public.cont_mapeos
   set obs = replace(obs, '(20261003b)', '(20261004b)')
 where clave like 'sueldos.%' and obs like '%(20261003b)%';
