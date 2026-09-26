-- =====================================================================
-- 20261004a — Sueldos: esquema (2026-09-26)
--
-- Por qué: el dueño pidió liquidar sueldos en el ERP con los convenios
-- UOCRA (CCT 76/75, quincenal por hora), UECARA (CCT 660/13, mensual) y
-- Camioneros (CCT 40/89, mensual). El recibo NO sale de la tarja: el
-- liquidador carga cantidades a criterio, el backend (TS puro) calcula las
-- líneas y la base solo PERSISTE y VALIDA (sumas, estados, asiento).
-- Relevamiento: Obsidian «Liquidación de sueldos en el ERP — relevamiento y
-- convenios (2026-09-26)».
--
-- Todo es aditivo: tablas nuevas `sueldos_*`, sin tocar tablas existentes.
--   · sueldos_convenios / _categorias / _escalas (valor con vigencia por
--     zona: la de mayor vigente_desde <= fecha).
--   · sueldos_conceptos / _concepto_valores (% o monto con vigencia). Un
--     concepto con `parametro_clave` toma su valor de sueldos_parametros
--     (18 %, RIFL, FAL, ART, SCVO): una sola fuente por valor.
--   · sueldos_parametros (clave/valor con vigencia).
--   · sueldos_legajos: la ficha laboral, anexo de personal y/o choferes.
--   · sueldos_liquidaciones (LIQ-0001), _recibos, _recibo_lineas.
--   · `destino` en conceptos y líneas (f931 | sindicato | fondo_cese |
--     prestamo | otros): a qué pasivo va cada descuento/contribución en el
--     asiento. No estaba en la spec; sin él el asiento no sabe separar
--     F.931, sindicato y fondo de cese.
--
-- Lectura y escritura solo del backend (service_role): los datos son
-- sensibles (CUIL, CBU, sueldos). RLS habilitada con policy permisiva igual
-- que el resto; anon/authenticated sin grants (como tesorería, 20260928l).
-- =====================================================================

-- ── 1) Convenios, categorías, escalas ─────────────────────────────────
create table public.sueldos_convenios (
  id             bigserial primary key,
  codigo         text not null unique check (codigo ~ '^[a-z0-9_]{2,30}$'),
  nombre         text not null check (length(btrim(nombre)) >= 2),
  cct            text not null default '',
  periodicidad   text not null check (periodicidad in ('quincenal', 'mensual')),
  unidad_basico  text not null check (unidad_basico in ('hora', 'mes')),
  obs            text not null default '',
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid
);
comment on table public.sueldos_convenios is
  'Convenios colectivos que liquida CADINC (uocra, uecara, camioneros). El código es la subclave de los mapeos contables sueldos.*. 20261004a.';

create table public.sueldos_categorias (
  id             bigserial primary key,
  convenio_id    bigint not null references public.sueldos_convenios(id),
  codigo         text not null check (codigo ~ '^[a-z0-9_]{1,40}$'),
  nombre         text not null check (length(btrim(nombre)) >= 2),
  orden          smallint not null default 0,
  unidad_basico  text check (unidad_basico in ('hora', 'mes')),
  por_defecto    boolean not null default false,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  constraint sueldos_categorias_codigo_key unique (convenio_id, codigo)
);
create unique index sueldos_categorias_default_uidx on public.sueldos_categorias (convenio_id) where por_defecto;
comment on column public.sueldos_categorias.unidad_basico is
  'NULL = la del convenio. Sirve para el Sereno de UOCRA, que es mensual en un convenio por hora.';
comment on column public.sueldos_categorias.por_defecto is
  'Categoría que toma un legajo nuevo del convenio si no se indica otra (una por convenio).';

create table public.sueldos_escalas (
  id             bigserial primary key,
  categoria_id   bigint not null references public.sueldos_categorias(id),
  zona           text not null default 'A' check (zona ~ '^[A-Z0-9]{1,5}$'),
  vigente_desde  date not null,
  valor          numeric(14,2) not null check (valor > 0),
  fuente         text not null default '',
  a_confirmar    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  constraint sueldos_escalas_key unique (categoria_id, zona, vigente_desde)
);
comment on table public.sueldos_escalas is
  'Valor de la categoría ($/hora o $/mes según la unidad) por zona con vigencia: rige la de mayor vigente_desde <= fecha (sueldos_valor_escala).';

-- ── 2) Conceptos y valores ───────────────────────────────────────────
create table public.sueldos_conceptos (
  id                  bigserial primary key,
  convenio_id         bigint references public.sueldos_convenios(id),
  codigo              text not null check (codigo ~ '^[a-z0-9_]{1,40}$'),
  nombre              text not null check (length(btrim(nombre)) >= 2),
  tipo                text not null check (tipo in ('remunerativo', 'no_remunerativo', 'descuento', 'contribucion')),
  calculo             text not null check (calculo in ('manual', 'cantidad_x_escala', 'porcentaje', 'monto_fijo', 'por_unidad')),
  base                text check (base in ('basico', 'remunerativo', 'bruto_rem_no_rem', 'sereno_zona_a')),
  condicion           text not null default 'siempre'
                      check (condicion in ('siempre', 'afiliado', 'no_afiliado', 'antiguedad_menor_1',
                                           'antiguedad_mayor_igual_1', 'rifl', 'no_rifl')),
  codigo_arca         text check (codigo_arca is null or codigo_arca ~ '^[0-9]{6}$'),
  grupo_contribucion  text check (grupo_contribucion in ('sindical', 'seguridad_social', 'obra_social', 'inssjp',
                                                         'art', 'camaras', 'otros')),
  destino             text check (destino in ('f931', 'sindicato', 'fondo_cese', 'prestamo', 'otros')),
  parametro_clave     text,
  unidad              text check (unidad in ('horas', 'dias', 'km', '%', '$', 'anios', 'unidades')),
  en_recibo           boolean not null default true,
  orden               smallint not null default 0,
  automatico          boolean not null default false,
  activo              boolean not null default true,
  obs                 text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  updated_by          uuid,
  constraint sueldos_conceptos_destino_chk
    check ((tipo in ('descuento', 'contribucion')) = (destino is not null)),
  constraint sueldos_conceptos_grupo_chk
    check (grupo_contribucion is null or tipo = 'contribucion'),
  constraint sueldos_conceptos_base_chk
    check (calculo <> 'porcentaje' or base is not null)
);
create unique index sueldos_conceptos_codigo_uidx on public.sueldos_conceptos (coalesce(convenio_id, 0), codigo);
create index sueldos_conceptos_convenio_idx on public.sueldos_conceptos (convenio_id);
comment on table public.sueldos_conceptos is
  'Conceptos del recibo. convenio_id NULL = común a todos; si un convenio tiene uno propio con el mismo código, manda el propio. El cálculo lo hace el backend; acá solo la definición. 20261004a.';
comment on column public.sueldos_conceptos.destino is
  'Solo descuentos y contribuciones: a qué pasivo va en el asiento (f931 → sueldos.aportes_a_pagar, sindicato → sueldos.sindicato_a_pagar, fondo_cese → sueldos.fondo_cese_a_pagar, prestamo → sueldos.prestamos, otros → sueldos.otros_a_pagar).';
comment on column public.sueldos_conceptos.parametro_clave is
  'Si está, el valor (porcentaje o monto según calculo) sale de sueldos_parametros con esa clave en vez de sueldos_concepto_valores.';

create table public.sueldos_concepto_valores (
  id             bigserial primary key,
  concepto_id    bigint not null references public.sueldos_conceptos(id),
  vigente_desde  date not null,
  porcentaje     numeric(9,4),
  monto          numeric(14,2),
  a_confirmar    boolean not null default false,
  fuente         text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  constraint sueldos_concepto_valores_key unique (concepto_id, vigente_desde),
  constraint sueldos_concepto_valores_chk check (porcentaje is not null or monto is not null)
);

-- ── 3) Parámetros generales ──────────────────────────────────────────
create table public.sueldos_parametros (
  id             bigserial primary key,
  clave          text not null check (clave ~ '^[a-z0-9_]{2,60}$'),
  vigente_desde  date not null,
  valor          numeric(16,4) not null,
  a_confirmar    boolean not null default false,
  fuente         text not null default '',
  descripcion    text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  constraint sueldos_parametros_key unique (clave, vigente_desde)
);

-- ── 4) Legajos ──────────────────────────────────────────────────────
create table public.sueldos_legajos (
  id                      bigserial primary key,
  leg                     text references public.personal(leg) on update cascade,
  chofer_id               integer references public.choferes(id),
  nombre                  text not null default '',
  cuil                    text check (cuil ~ '^[0-9]{11}$'),
  fecha_ingreso           date,
  fecha_egreso            date,
  convenio_id             bigint not null references public.sueldos_convenios(id),
  categoria_id            bigint references public.sueldos_categorias(id),
  zona                    text not null default 'A' check (zona ~ '^[A-Z0-9]{1,5}$'),
  modalidad_contratacion  text not null default 'tiempo_indeterminado' check (modalidad_contratacion ~ '^[a-z_]{3,40}$'),
  jornada                 text not null default 'completa' check (jornada in ('completa', 'parcial')),
  obra_social             text not null default '',
  obra_social_codigo      text not null default '',
  afiliado_sindicato      boolean not null default false,
  cbu                     text check (cbu ~ '^[0-9]{22}$'),
  banco                   text not null default '',
  estado_civil            text not null default '',
  conyuge_a_cargo         boolean not null default false,
  hijos_a_cargo           smallint not null default 0 check (hijos_a_cargo between 0 and 30),
  ieric_numero            text not null default '',
  fondo_cese_cuenta       text not null default '',
  titulo_nivel            text check (titulo_nivel in ('A', 'B', 'C')),
  carnet_profesional      text not null default '',
  rifl                    boolean not null default false,
  obra_cod_habitual       text references public.obras(cod) on update cascade,
  activo                  boolean not null default true,
  obs                     text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  updated_by              uuid,
  constraint sueldos_legajos_identidad_chk check (leg is not null or chofer_id is not null or length(btrim(nombre)) >= 3),
  constraint sueldos_legajos_fechas_chk check (fecha_egreso is null or fecha_ingreso is null or fecha_egreso >= fecha_ingreso)
);
create unique index sueldos_legajos_leg_uidx on public.sueldos_legajos (leg) where leg is not null;
create unique index sueldos_legajos_chofer_uidx on public.sueldos_legajos (chofer_id) where chofer_id is not null;
create unique index sueldos_legajos_cuil_uidx on public.sueldos_legajos (cuil) where cuil is not null;
create index sueldos_legajos_convenio_idx on public.sueldos_legajos (convenio_id, activo);
create index sueldos_legajos_categoria_idx on public.sueldos_legajos (categoria_id);
comment on table public.sueldos_legajos is
  'Ficha laboral (anexo de personal y/o choferes; solo la ve Sueldos). nombre es snapshot para cuando no hay personal ni chofer. CUIL con dígito verificador y CBU con sus dígitos se validan en sueldos_guardar_legajo. 20261004a.';

-- ── 5) Liquidaciones, recibos, líneas ────────────────────────────────
create sequence public.sueldos_liquidaciones_numero_seq;

create table public.sueldos_liquidaciones (
  id                bigserial primary key,
  numero            int not null unique default nextval('public.sueldos_liquidaciones_numero_seq'),
  codigo            text generated always as ('LIQ-' || lpad(numero::text, 4, '0')) stored,
  convenio_id       bigint not null references public.sueldos_convenios(id),
  tipo              text not null check (tipo in ('quincena', 'mensual', 'sac', 'vacaciones', 'final', 'ajuste')),
  periodo           date not null check (extract(day from periodo) = 1),
  quincena          smallint check (quincena in (1, 2)),
  fecha_pago        date,
  estado            text not null default 'borrador' check (estado in ('borrador', 'cerrada', 'anulada')),
  asiento_id        bigint references public.cont_asientos(id),
  avisos            jsonb not null default '[]'::jsonb,
  obs               text not null default '',
  motivo_anulacion  text,
  cerrada_por       uuid,
  cerrada_at        timestamptz,
  anulada_por       uuid,
  anulada_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  constraint sueldos_liq_quincena_chk check ((tipo = 'quincena') = (quincena is not null)),
  constraint sueldos_liq_anulada_chk check (estado <> 'anulada' or motivo_anulacion is not null),
  constraint sueldos_liq_cerrada_chk check (estado = 'borrador' or cerrada_at is not null or estado = 'anulada')
);
alter sequence public.sueldos_liquidaciones_numero_seq owned by public.sueldos_liquidaciones.numero;
create unique index sueldos_liquidaciones_periodo_uidx
  on public.sueldos_liquidaciones (convenio_id, tipo, periodo, coalesce(quincena, 0))
  where estado <> 'anulada' and tipo in ('quincena', 'mensual');
create index sueldos_liquidaciones_periodo_idx on public.sueldos_liquidaciones (periodo desc, id desc);
comment on table public.sueldos_liquidaciones is
  'Una liquidación por convenio/tipo/período (quincena y mensual: una vigente por período). Numeradas LIQ-NNNN. Al cerrar genera el asiento (origen_tabla sueldos_liquidaciones, origen_evento liquidacion); avisos guarda SIN_MAPEO y afines. 20261004a.';
comment on column public.sueldos_liquidaciones.avisos is
  'Motivos por los que el asiento no se generó al cerrar ([{codigo, detalle}]): SIN_MAPEO, PERIODO_CERRADO, FECHA_SIN_PERIODO, DESCUADRE_ORIGEN, ERROR_ASIENTO.';

create table public.sueldos_recibos (
  id                     bigserial primary key,
  liquidacion_id         bigint not null references public.sueldos_liquidaciones(id),
  legajo_id              bigint not null references public.sueldos_legajos(id),
  snapshot               jsonb not null default '{}'::jsonb,
  entradas               jsonb not null default '{}'::jsonb,
  dias_trabajados        numeric(6,2),
  horas_trabajadas       numeric(8,2),
  total_remunerativo     numeric(14,2) not null default 0,
  total_no_remunerativo  numeric(14,2) not null default 0,
  total_descuentos       numeric(14,2) not null default 0,
  neto                   numeric(14,2) not null default 0,
  total_contribuciones   numeric(14,2) not null default 0,
  fondo_cese             numeric(14,2) not null default 0,
  estado                 text not null default 'borrador' check (estado in ('borrador', 'cerrado', 'anulado')),
  obs                    text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  updated_by             uuid,
  constraint sueldos_recibos_key unique (liquidacion_id, legajo_id),
  constraint sueldos_recibos_neto_chk
    check (abs(neto - (total_remunerativo + total_no_remunerativo - total_descuentos)) <= 0.01)
);
create index sueldos_recibos_legajo_idx on public.sueldos_recibos (legajo_id);
comment on column public.sueldos_recibos.entradas is
  'Lo que cargó el liquidador (horas, extras, días, km, viáticos, adicionales, préstamos…) tal cual lo manda el backend, para reabrir el editor y recalcular.';
comment on column public.sueldos_recibos.total_contribuciones is
  'Contribuciones patronales SIN el fondo de cese (va aparte en fondo_cese). Ninguna de las dos resta del neto.';

create table public.sueldos_recibo_lineas (
  id                  bigserial primary key,
  recibo_id           bigint not null references public.sueldos_recibos(id) on delete cascade,
  concepto_id         bigint references public.sueldos_conceptos(id),
  codigo_arca         text check (codigo_arca is null or codigo_arca ~ '^[0-9]{6}$'),
  nombre              text not null check (length(btrim(nombre)) >= 1),
  tipo                text not null check (tipo in ('remunerativo', 'no_remunerativo', 'descuento', 'contribucion')),
  destino             text check (destino in ('f931', 'sindicato', 'fondo_cese', 'prestamo', 'otros')),
  grupo_contribucion  text check (grupo_contribucion in ('sindical', 'seguridad_social', 'obra_social', 'inssjp',
                                                         'art', 'camaras', 'otros')),
  cantidad            numeric(12,4),
  unidad              text check (unidad in ('horas', 'dias', 'km', '%', '$', 'anios', 'unidades')),
  base                numeric(14,2),
  porcentaje          numeric(9,4),
  importe             numeric(14,2) not null,
  manual              boolean not null default false,
  en_recibo           boolean not null default true,
  orden               smallint not null default 0,
  created_at          timestamptz not null default now(),
  constraint sueldos_recibo_lineas_destino_chk check ((tipo in ('descuento', 'contribucion')) = (destino is not null))
);
create index sueldos_recibo_lineas_recibo_idx on public.sueldos_recibo_lineas (recibo_id, orden);
create index sueldos_recibo_lineas_concepto_idx on public.sueldos_recibo_lineas (concepto_id) where concepto_id is not null;
comment on table public.sueldos_recibo_lineas is
  'Líneas del recibo. Se reemplazan enteras en cada sueldos_guardar_recibo (por eso sin trigger de auditoría: el cambio queda en el recibo).';

-- ── 6) Vista de legajos (datos de personal/chofer + completitud) ──────
create view public.v_sueldos_legajos with (security_invoker = true) as
select l.*,
       coalesce(p.nom, ch.nombre, nullif(l.nombre, '')) as nombre_mostrar,
       p.dni, p.condicion as personal_condicion, p.modalidad as personal_modalidad,
       ch.nombre as chofer_nombre, ch.estado as chofer_estado, ch.es_propio as chofer_es_propio,
       cv.codigo as convenio_codigo, cv.nombre as convenio_nombre,
       ca.codigo as categoria_codigo, ca.nombre as categoria_nombre,
       array_remove(array[
         case when l.cuil is null then 'cuil' end,
         case when l.fecha_ingreso is null then 'fecha_ingreso' end,
         case when l.categoria_id is null then 'categoria' end,
         case when btrim(l.obra_social) = '' then 'obra_social' end,
         case when l.cbu is null then 'cbu' end
       ], null) as faltantes,
       (l.cuil is null or l.fecha_ingreso is null or l.categoria_id is null
        or btrim(l.obra_social) = '' or l.cbu is null) as incompleto
  from public.sueldos_legajos l
  join public.sueldos_convenios cv on cv.id = l.convenio_id
  left join public.sueldos_categorias ca on ca.id = l.categoria_id
  left join public.personal p on p.leg = l.leg
  left join public.choferes ch on ch.id = l.chofer_id;
comment on view public.v_sueldos_legajos is
  'Legajos con nombre (personal › chofer › snapshot), convenio, categoría y completitud (faltantes: cuil, fecha_ingreso, categoria, obra_social, cbu). Tiene CUIL y CBU: el backend los enmascara sin ver_pii.';

-- ── 7) updated_at, auditoría, RLS y grants ──────────────────────────
do $g$
declare
  t   text;
  ent text;
begin
  for t, ent in values
    ('sueldos_convenios', 'convenio'), ('sueldos_categorias', 'categoría de convenio'),
    ('sueldos_escalas', 'escala salarial'), ('sueldos_conceptos', 'concepto de sueldo'),
    ('sueldos_concepto_valores', 'valor de concepto de sueldo'), ('sueldos_parametros', 'parámetro de sueldos'),
    ('sueldos_legajos', 'legajo'), ('sueldos_liquidaciones', 'liquidación de sueldos'),
    ('sueldos_recibos', 'recibo de sueldo')
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   'trg_' || t || '_touch', t);
    execute format('create trigger trg_audit_cambios after update on public.%I for each row execute function public.audit_cambios(%L, %L, %L)',
                   t, 'sueldos', ent, 'id');
    execute format('create trigger trg_audit_borrado after delete on public.%I for each row execute function public.audit_borrado(%L, %L, %L)',
                   t, 'sueldos', ent, 'id');
  end loop;

  foreach t in array array['sueldos_convenios', 'sueldos_categorias', 'sueldos_escalas', 'sueldos_conceptos',
                           'sueldos_concepto_valores', 'sueldos_parametros', 'sueldos_legajos',
                           'sueldos_liquidaciones', 'sueldos_recibos', 'sueldos_recibo_lineas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t || '_id_seq');
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $g$;

revoke all on sequence public.sueldos_liquidaciones_numero_seq from public, anon, authenticated;
grant usage, select on sequence public.sueldos_liquidaciones_numero_seq to service_role;
revoke all on table public.v_sueldos_legajos from public, anon, authenticated;
grant select on table public.v_sueldos_legajos to service_role;
