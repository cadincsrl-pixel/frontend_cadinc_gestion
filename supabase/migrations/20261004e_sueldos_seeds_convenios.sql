-- =====================================================================
-- 20261004e — Sueldos: seeds de convenios, categorías, escalas, conceptos
-- y parámetros (2026-09-26)
--
-- Por qué: arrancar el módulo con los valores del relevamiento (Obsidian
-- «Liquidación de sueldos en el ERP — relevamiento y convenios
-- (2026-09-26)»). Todo es editable desde Sueldos › Convenios y
-- Configuración. Lo marcado [NC] en la nota va con a_confirmar = true.
-- Idempotente (where not exists / on conflict do nothing).
--
-- Decisiones (el dueño pidió no preguntar):
--   · UOCRA zona A (Tucumán [NC]): todas sus escalas a_confirmar. Sep =
--     valores de la nota; oct = sep × 1,018; nov = los de la nota (7.828 /
--     6.697 / 6.188 / 5.696) y el Sereno sep × 1,018 × 1,017.
--   · UECARA: solo se conoce el básico de Auxiliar administrativo Grupo II
--     ($1.624.878, a_confirmar); oct/nov con 1,8 % y 1,7 %. El resto de la
--     escala (Anexo I) se carga desde la pantalla.
--   · Camioneros: 1ª categoría sep $1.095.276,83 y feb-2027 $1.199.970,09
--     (publicados); 2ª y 3ª = agosto × 1,018 y feb con la misma proporción
--     que la 1ª (a_confirmar). Oct–ene no hay dato: rige el de septiembre.
--   · Conceptos con valor desconocido (IERIC, FOPAR, cuota UECARA, título
--     nivel B) se crean SIN valor: el concepto no se aplica hasta cargarlo.
--   · Códigos ARCA: los de la nota (110000, 120001/120003, 130001/2,
--     160001, 170001, 810001–810003, 810007). Los que no están en la nota
--     quedan NULL con obs «código ARCA a confirmar» (el LSD los necesita).
--   · Los % generales (18 %, RIFL 5 %, ART, FAL) viven en sueldos_parametros
--     y los conceptos los leen por parametro_clave: una sola fuente.
-- =====================================================================

-- ── 1) Convenios ────────────────────────────────────────────────────
insert into public.sueldos_convenios (codigo, nombre, cct, periodicidad, unidad_basico, obs) values
  ('uocra',      'UOCRA — Obreros de la construcción',        '76/75', 'quincenal', 'hora',
   'Liquidación por quincena y por hora. Fondo de cese laboral (Ley 22.250) en vez de indemnización. No aplica FAL.'),
  ('uecara',     'UECARA — Empleados de la construcción',     '660/13', 'mensual',  'mes',
   'Administrativos y técnicos. Escala completa en el Anexo I del acuerdo (a cargar).'),
  ('camioneros', 'Camioneros — Transporte de cargas',         '40/89', 'mensual',   'mes',
   'Choferes propios. Km remunerativo + el mismo importe como viático no remunerativo.')
on conflict (codigo) do nothing;

-- ── 2) Categorías ──────────────────────────────────────────────────
insert into public.sueldos_categorias (convenio_id, codigo, nombre, orden, unidad_basico, por_defecto)
select c.id, x.codigo, x.nombre, x.orden, x.unidad, x.def
  from (values
    ('uocra',      'oficial_especializado', 'Oficial especializado',          1, null::text, false),
    ('uocra',      'oficial',               'Oficial',                        2, null,       false),
    ('uocra',      'medio_oficial',         'Medio oficial',                  3, null,       false),
    ('uocra',      'ayudante',              'Ayudante',                       4, null,       true),
    ('uocra',      'sereno',                'Sereno',                         5, 'mes',      false),
    ('uecara',     'aux_adm_g2',            'Auxiliar administrativo (Grupo II)', 1, null,  true),
    ('camioneros', 'conductor_1',           'Conductor 1ª categoría',         1, null,       false),
    ('camioneros', 'conductor_2',           'Conductor 2ª categoría',         2, null,       false),
    ('camioneros', 'conductor_3',           'Conductor 3ª categoría',         3, null,       true)
  ) as x(conv, codigo, nombre, orden, unidad, def)
  join public.sueldos_convenios c on c.codigo = x.conv
on conflict (convenio_id, codigo) do nothing;

-- ── 3) Escalas (zona A) ─────────────────────────────────────────────
insert into public.sueldos_escalas (categoria_id, zona, vigente_desde, valor, fuente, a_confirmar)
select k.id, 'A', x.desde::date, x.valor, x.fuente, x.nc
  from (values
    -- UOCRA ($/hora; sereno $/mes). Acuerdo 21/09/2026: +1,9 % sep, +1,8 % oct, +1,7 % nov.
    ('uocra', 'oficial_especializado', '2026-09-01',    7561.00, 'Acuerdo UOCRA 21/09/2026 (sep, +1,9 %) — zona A Tucumán a confirmar', true),
    ('uocra', 'oficial',               '2026-09-01',    6468.00, 'Acuerdo UOCRA 21/09/2026 (sep, +1,9 %) — zona A Tucumán a confirmar', true),
    ('uocra', 'medio_oficial',         '2026-09-01',    5977.00, 'Acuerdo UOCRA 21/09/2026 (sep, +1,9 %) — zona A Tucumán a confirmar', true),
    ('uocra', 'ayudante',              '2026-09-01',    5502.00, 'Acuerdo UOCRA 21/09/2026 (sep, +1,9 %) — zona A Tucumán a confirmar', true),
    ('uocra', 'sereno',                '2026-09-01',  999495.00, 'Acuerdo UOCRA 21/09/2026 (sep, +1,9 %) — mensual — zona A a confirmar', true),
    ('uocra', 'oficial_especializado', '2026-10-01',    7697.10, 'Sep × 1,018 (oct, +1,8 %) — zona A a confirmar', true),
    ('uocra', 'oficial',               '2026-10-01',    6584.42, 'Sep × 1,018 (oct, +1,8 %) — zona A a confirmar', true),
    ('uocra', 'medio_oficial',         '2026-10-01',    6084.59, 'Sep × 1,018 (oct, +1,8 %) — zona A a confirmar', true),
    ('uocra', 'ayudante',              '2026-10-01',    5601.04, 'Sep × 1,018 (oct, +1,8 %) — zona A a confirmar', true),
    ('uocra', 'sereno',                '2026-10-01', 1017485.91, 'Sep × 1,018 (oct, +1,8 %) — zona A a confirmar', true),
    ('uocra', 'oficial_especializado', '2026-11-01',    7828.00, 'Acuerdo UOCRA 21/09/2026 (nov, +1,7 %) — zona A a confirmar', true),
    ('uocra', 'oficial',               '2026-11-01',    6697.00, 'Acuerdo UOCRA 21/09/2026 (nov, +1,7 %) — zona A a confirmar', true),
    ('uocra', 'medio_oficial',         '2026-11-01',    6188.00, 'Acuerdo UOCRA 21/09/2026 (nov, +1,7 %) — zona A a confirmar', true),
    ('uocra', 'ayudante',              '2026-11-01',    5696.00, 'Acuerdo UOCRA 21/09/2026 (nov, +1,7 %) — zona A a confirmar', true),
    ('uocra', 'sereno',                '2026-11-01', 1034783.17, 'Oct × 1,017 (nov, +1,7 %) — zona A a confirmar', true),
    -- UECARA ($/mes).
    ('uecara', 'aux_adm_g2', '2026-09-01', 1624878.00, 'Ejemplo publicado (Aux. adm. Grupo II) — mes y escala a confirmar con el Anexo I', true),
    ('uecara', 'aux_adm_g2', '2026-10-01', 1654125.80, 'Sep × 1,018 (acuerdo 22/09/2026, oct +1,8 %) — a confirmar', true),
    ('uecara', 'aux_adm_g2', '2026-11-01', 1682245.94, 'Oct × 1,017 (acuerdo 22/09/2026, nov +1,7 %) — a confirmar', true),
    -- Camioneros ($/mes).
    ('camioneros', 'conductor_1', '2026-09-01', 1095276.83, 'Básico publicado sep-2026 (acuerdo sep-2026/feb-2027)', false),
    ('camioneros', 'conductor_2', '2026-09-01', 1075758.27, 'Agosto $1.056.737 × 1,018 (misma suba que la 1ª) — a confirmar', true),
    ('camioneros', 'conductor_3', '2026-09-01', 1056220.81, 'Agosto $1.037.545 × 1,018 (misma suba que la 1ª) — a confirmar', true),
    ('camioneros', 'conductor_1', '2027-02-01', 1199970.09, 'Básico publicado feb-2027 (acuerdo sep-2026/feb-2027)', false),
    ('camioneros', 'conductor_2', '2027-02-01', round(1075758.27 * 1199970.09 / 1095276.83, 2), 'Sep × (feb/sep de la 1ª) — a confirmar', true),
    ('camioneros', 'conductor_3', '2027-02-01', round(1056220.81 * 1199970.09 / 1095276.83, 2), 'Sep × (feb/sep de la 1ª) — a confirmar', true)
  ) as x(conv, cat, desde, valor, fuente, nc)
  join public.sueldos_convenios c on c.codigo = x.conv
  join public.sueldos_categorias k on k.convenio_id = c.id and k.codigo = x.cat
on conflict (categoria_id, zona, vigente_desde) do nothing;

-- ── 4) Parámetros ─────────────────────────────────────────────────
insert into public.sueldos_parametros (clave, vigente_desde, valor, a_confirmar, fuente, descripcion) values
  ('detraccion_por_empleado', '2026-01-01',    7003.68, false, 'Relevamiento 26/09/2026', 'Detracción mensual de la base de contribuciones por empleado (se prorratea en la quincena).'),
  ('contrib_patronal_pct',    '2026-01-01',      18,    false, 'Relevamiento 26/09/2026', 'Contribuciones patronales de seguridad social (PyME), % sobre remunerativo.'),
  ('rifl_pct',                '2026-01-01',       5,    false, 'Ley 27.802 / Dto. 315/2026', 'Contribución reducida RIFL (altas nuevas, 48 meses), % sobre remunerativo.'),
  ('art_pct',                 '2026-01-01',       0,    true,  'A confirmar con el contador', 'ART: alícuota variable de CADINC, % sobre remunerativo.'),
  ('art_fijo',                '2026-01-01',       0,    true,  'A confirmar con el contador', 'ART: suma fija mensual por trabajador.'),
  ('scvo_monto',              '2026-01-01',     424.62, false, 'Relevamiento 26/09/2026', 'Seguro colectivo de vida obligatorio, $ por trabajador por mes.'),
  ('fal_pct',                 '2026-11-01',       2.5,  true,  'Ley 27.802 (FAL MiPyME) — cómo se detrae a confirmar', 'Fondo de asistencia laboral, % sobre remunerativo. UECARA y Camioneros (no UOCRA).'),
  ('horas_mes_uocra',         '2026-01-01',     190.67, false, 'Spec del módulo', 'Horas mensuales de referencia UOCRA (para pasar $/hora a mensual).'),
  ('horas_dia_uocra',         '2026-01-01',       9,    true,  'A confirmar (jornada 44 h/semana)', 'Horas por jornal UOCRA (vacaciones = días × horas_dia × valor hora).'),
  ('divisor_vacaciones',      '2026-01-01',      25,    false, 'LCT art. 155', 'Mensualizados: valor del día de vacaciones = sueldo / 25.'),
  ('dias_mes',                '2026-01-01',      30,    false, 'Convención', 'Días del mes para el proporcional del básico mensual.')
on conflict (clave, vigente_desde) do nothing;

-- ── 5) Conceptos ────────────────────────────────────────────────────
create temp table _sc (
  conv text, codigo text, nombre text, tipo text, calculo text, base text, condicion text, codigo_arca text,
  grupo text, destino text, param text, unidad text, orden int, automatico boolean, obs text
) on commit drop;

insert into _sc values
  -- Comunes
  (null, 'basico',            'Básico',                                  'remunerativo',    'cantidad_x_escala', null,           'siempre',     '110000', null, null, null, null,   10, true,  'UOCRA: horas × valor hora; mensuales: básico de la escala (proporcional a los días si son menos de 30).'),
  (null, 'horas_extra_50',    'Horas extras 50 %',                       'remunerativo',    'cantidad_x_escala', null,           'siempre',     '130001', null, null, null, 'horas', 20, false, 'Horas × valor hora × porcentaje/100 (150). Mensuales: valor hora = básico / horas del mes.'),
  (null, 'horas_extra_100',   'Horas extras 100 %',                      'remunerativo',    'cantidad_x_escala', null,           'siempre',     '130002', null, null, null, 'horas', 21, false, 'Horas × valor hora × porcentaje/100 (200).'),
  (null, 'sac',               'SAC (aguinaldo)',                         'remunerativo',    'manual',            null,           'siempre',     '120001', null, null, null, null,   40, false, '50 % de la mejor remuneración mensual del semestre (sueldos_historial_remuneraciones).'),
  (null, 'sac_proporcional',  'SAC proporcional',                        'remunerativo',    'manual',            null,           'siempre',     '120003', null, null, null, null,   41, false, 'Liquidación final.'),
  (null, 'vacaciones',        'Vacaciones',                              'remunerativo',    'manual',            null,           'siempre',     null,     null, null, null, 'dias', 42, false, 'Código ARCA a confirmar. Días por antigüedad 14/21/28/35; mensuales sueldo/25, UOCRA jornal.'),
  (null, 'vacaciones_no_gozadas', 'Vacaciones no gozadas',               'remunerativo',    'manual',            null,           'siempre',     null,     null, null, null, 'dias', 43, false, 'Liquidación final. Código ARCA y tratamiento (rem/no rem) a confirmar con el contador.'),
  (null, 'indemnizacion',     'Indemnización (manual)',                  'no_remunerativo', 'manual',            null,           'siempre',     null,     null, null, null, null,   44, false, 'Liquidación final, importe manual. Código ARCA a confirmar.'),
  (null, 'adicional_manual',  'Adicional (manual)',                      'remunerativo',    'manual',            null,           'siempre',     null,     null, null, null, null,   50, false, 'Código ARCA a confirmar según el adicional.'),
  (null, 'no_rem_manual',     'No remunerativo (manual)',                'no_remunerativo', 'manual',            null,           'siempre',     null,     null, null, null, null,   51, false, 'Código ARCA a confirmar según el concepto.'),
  (null, 'jubilacion',        'Jubilación (SIPA) 11 %',                  'descuento',       'porcentaje',        'remunerativo', 'siempre',     '810001', null, 'f931', null, '%',  60, true,  ''),
  (null, 'ley_19032',         'Ley 19.032 (INSSJP) 3 %',                 'descuento',       'porcentaje',        'remunerativo', 'siempre',     '810002', null, 'f931', null, '%',  61, true,  ''),
  (null, 'obra_social',       'Obra social 3 %',                         'descuento',       'porcentaje',        'remunerativo', 'siempre',     '810003', null, 'f931', null, '%',  62, true,  'UOCRA: OSPeCon.'),
  (null, 'prestamo',          'Préstamo / anticipo',                     'descuento',       'manual',            null,           'siempre',     '810007', null, 'prestamo', null, null, 70, false, 'Préstamos pendientes del legajo como descuento sugerido.'),
  (null, 'otro_descuento',    'Otro descuento (manual)',                 'descuento',       'manual',            null,           'siempre',     null,     null, 'otros', null, null, 71, false, 'Embargos, etc. Código ARCA a confirmar.'),
  (null, 'contrib_ss',        'Contribuciones seguridad social',         'contribucion',    'porcentaje',        'remunerativo', 'no_rifl',     null, 'seguridad_social', 'f931', 'contrib_patronal_pct', '%', 80, true, 'Base = remunerativo − detracción (detraccion_por_empleado, prorrateada en la quincena).'),
  (null, 'contrib_rifl',      'Contribuciones seguridad social (RIFL)',  'contribucion',    'porcentaje',        'remunerativo', 'rifl',        null, 'seguridad_social', 'f931', 'rifl_pct', '%', 81, true, 'Altas por RIFL durante 48 meses (Dto. 315/2026).'),
  (null, 'contrib_os',        'Contribución obra social 6 %',            'contribucion',    'porcentaje',        'remunerativo', 'siempre',     null, 'obra_social', 'f931', null, '%', 82, true, ''),
  (null, 'art',               'ART (alícuota)',                          'contribucion',    'porcentaje',        'remunerativo', 'siempre',     null, 'art', 'f931', 'art_pct', '%', 83, true, 'Valor en parámetros (a confirmar).'),
  (null, 'art_fijo',          'ART (suma fija)',                         'contribucion',    'monto_fijo',        null,           'siempre',     null, 'art', 'f931', 'art_fijo', '$', 84, true, 'Valor en parámetros (a confirmar).'),
  (null, 'scvo',              'Seguro colectivo de vida obligatorio',    'contribucion',    'monto_fijo',        null,           'siempre',     null, 'otros', 'f931', 'scvo_monto', '$', 85, true, 'Mensual: en la quincena el motor decide si lo aplica una sola vez.'),
  -- UOCRA
  ('uocra', 'asistencia',        'Asistencia 20 %',                      'remunerativo',    'porcentaje',        'basico',       'siempre',     '170001', null, null, null, '%',  30, true,  'Solo si el liquidador marca asistencia en la quincena. Convenio: 20 % sobre lo liquidado por horas.'),
  ('uocra', 'adicional_tarea',   'Adicional por tarea',                  'remunerativo',    'porcentaje',        'basico',       'siempre',     null,     null, null, null, '%',  31, false, '10 % a 25 % según tarea [NC]. Código ARCA a confirmar.'),
  ('uocra', 'cuota_sindical',    'Cuota sindical UOCRA',                 'descuento',       'porcentaje',        'remunerativo', 'afiliado',    null,     null, 'sindicato', null, '%', 63, true, 'Afiliados. Algunas fuentes dicen 2 %. Código ARCA a confirmar.'),
  ('uocra', 'aporte_solidario',  'Aporte solidario UOCRA',               'descuento',       'porcentaje',        'remunerativo', 'no_afiliado', null,     null, 'sindicato', null, '%', 64, true, 'No afiliados. Código ARCA a confirmar.'),
  ('uocra', 'seguro_vida',       'Seguro de vida UOCRA',                 'descuento',       'porcentaje',        'sereno_zona_a','siempre',     null,     null, 'sindicato', null, '%', 65, true, '2 % del Sereno zona A (dato 2023, a confirmar). Código ARCA a confirmar.'),
  ('uocra', 'contrib_especial',  'Contribución especial UOCRA 2 %',      'contribucion',    'porcentaje',        'remunerativo', 'siempre',     null, 'sindical', 'sindicato', null, '%', 86, true, 'Desde 06/2026.'),
  ('uocra', 'ieric',             'IERIC',                                'contribucion',    'porcentaje',        'remunerativo', 'siempre',     null, 'otros', 'otros', null, '%', 87, true, 'Sin valor cargado: a confirmar.'),
  ('uocra', 'fopar',             'FOPAR',                                'contribucion',    'porcentaje',        'remunerativo', 'siempre',     null, 'camaras', 'otros', null, '%', 88, true, 'Sin valor cargado: a confirmar.'),
  ('uocra', 'fondo_cese_1',      'Fondo de cese laboral (1er año) 12 %', 'contribucion',    'porcentaje',        'remunerativo', 'antiguedad_menor_1',       null, 'otros', 'fondo_cese', null, '%', 90, true, 'Ley 22.250. No descuenta del neto: se deposita en la cuenta del trabajador.'),
  ('uocra', 'fondo_cese_2',      'Fondo de cese laboral 8 %',            'contribucion',    'porcentaje',        'remunerativo', 'antiguedad_mayor_igual_1', null, 'otros', 'fondo_cese', null, '%', 91, true, 'Ley 22.250, desde el 2º año.'),
  -- UECARA
  ('uecara', 'antiguedad',       'Antigüedad',                           'remunerativo',    'por_unidad',        null,           'siempre',     '160001', null, null, null, 'anios', 32, true, 'Monto por año de antigüedad.'),
  ('uecara', 'titulo_a',         'Adicional por título (nivel A)',       'remunerativo',    'monto_fijo',        null,           'siempre',     null,     null, null, null, '$', 33, true, 'Se aplica si legajo.titulo_nivel = A. Qué nivel lleva cada monto: a confirmar. Código ARCA a confirmar.'),
  ('uecara', 'titulo_b',         'Adicional por título (nivel B)',       'remunerativo',    'monto_fijo',        null,           'siempre',     null,     null, null, null, '$', 33, true, 'Sin valor cargado: a confirmar.'),
  ('uecara', 'titulo_c',         'Adicional por título (nivel C)',       'remunerativo',    'monto_fijo',        null,           'siempre',     null,     null, null, null, '$', 33, true, 'Se aplica si legajo.titulo_nivel = C. A confirmar.'),
  ('uecara', 'falla_caja',       'Falla de caja',                        'remunerativo',    'monto_fijo',        null,           'siempre',     null,     null, null, null, '$', 34, false, 'Solo a quien maneja caja (se agrega a mano). Código ARCA a confirmar.'),
  ('uecara', 'presentismo',      'Presentismo',                          'remunerativo',    'porcentaje',        'basico',       'siempre',     '170001', null, null, null, '%', 35, true, '≈10 % del básico según el ejemplo publicado (a confirmar).'),
  ('uecara', 'cuota_sindical',   'Cuota sindical UECARA',                'descuento',       'porcentaje',        'remunerativo', 'afiliado',    null,     null, 'sindicato', null, '%', 63, true, 'Sin valor cargado: a confirmar.'),
  ('uecara', 'fal',              'FAL MiPyME',                           'contribucion',    'porcentaje',        'remunerativo', 'siempre',     null, 'otros', 'otros', 'fal_pct', '%', 89, true, 'Ley 27.802, desde 01/11/2026 (parámetro fal_pct).'),
  -- Camioneros
  ('camioneros', 'antiguedad',   'Antigüedad (1 % por año)',             'remunerativo',    'porcentaje',        'basico',       'siempre',     '160001', null, null, null, 'anios', 32, true, 'Porcentaje × años de antigüedad sobre el básico. Base y tope a confirmar.'),
  ('camioneros', 'km_remunerativo', 'Km recorridos',                     'remunerativo',    'por_unidad',        null,           'siempre',     null,     null, null, null, 'km', 36, false, 'Valor mar–may 2026 (a confirmar el de septiembre). Código ARCA a confirmar.'),
  ('camioneros', 'viatico_km',   'Viático por km',                       'no_remunerativo', 'por_unidad',        null,           'siempre',     null,     null, null, null, 'km', 37, false, 'Mismo importe que el km remunerativo. Código ARCA a confirmar.'),
  ('camioneros', 'viatico_comida', 'Viático comida',                     'no_remunerativo', 'por_unidad',        null,           'siempre',     null,     null, null, null, 'unidades', 38, false, 'Valor de agosto (a confirmar septiembre). Código ARCA a confirmar.'),
  ('camioneros', 'viatico_especial', 'Viático especial',                 'no_remunerativo', 'por_unidad',        null,           'siempre',     null,     null, null, null, 'unidades', 39, false, 'Valor de agosto (a confirmar septiembre). Código ARCA a confirmar.'),
  ('camioneros', 'pernocte',     'Pernocte',                             'no_remunerativo', 'por_unidad',        null,           'siempre',     null,     null, null, null, 'unidades', 39, false, 'Valor de agosto (a confirmar septiembre). Código ARCA a confirmar.'),
  ('camioneros', 'suma_acuerdo', 'Suma no remunerativa acuerdo 2026/27', 'no_remunerativo', 'monto_fijo',        null,           'siempre',     null,     null, null, null, '$', 45, true, '$18.000 en sep-2026; $1.200.000 en 4 cuotas desde ene-2027 (cuotas iguales, a confirmar). Valor 0 = no se aplica.'),
  ('camioneros', 'cuota_sindical', 'Cuota sindical Camioneros 3 %',      'descuento',       'porcentaje',        'remunerativo', 'siempre',     null,     null, 'sindicato', null, '%', 63, true, 'A todos (afiliados o no). Código ARCA a confirmar.'),
  ('camioneros', 'sepelio',      'Seguro de sepelio',                    'descuento',       'porcentaje',        'remunerativo', 'siempre',     null,     null, 'sindicato', null, '%', 66, true, '1,5 % a confirmar. Código ARCA a confirmar.'),
  ('camioneros', 'oschoca',      'OSCHOCA (contribución)',               'contribucion',    'monto_fijo',        null,           'siempre',     null, 'obra_social', 'sindicato', null, '$', 92, true, 'Acuerdo sep-2026: $29.000 por trabajador por mes.'),
  ('camioneros', 'fal',          'FAL MiPyME',                           'contribucion',    'porcentaje',        'remunerativo', 'siempre',     null, 'otros', 'otros', 'fal_pct', '%', 89, true, 'Ley 27.802, desde 01/11/2026 (parámetro fal_pct).');

insert into public.sueldos_conceptos (convenio_id, codigo, nombre, tipo, calculo, base, condicion, codigo_arca,
  grupo_contribucion, destino, parametro_clave, unidad, orden, automatico, obs)
select c.id, s.codigo, s.nombre, s.tipo, s.calculo, s.base, s.condicion, s.codigo_arca,
       s.grupo, s.destino, s.param, s.unidad, s.orden, s.automatico, s.obs
  from _sc s
  left join public.sueldos_convenios c on c.codigo = s.conv
 where not exists (select 1 from public.sueldos_conceptos k
                    where coalesce(k.convenio_id, 0) = coalesce(c.id, 0) and k.codigo = s.codigo);

-- ── 6) Valores de conceptos ──────────────────────────────────────────
insert into public.sueldos_concepto_valores (concepto_id, vigente_desde, porcentaje, monto, a_confirmar, fuente)
select k.id, x.desde::date, x.pct, x.monto, x.nc, x.fuente
  from (values
    (null::text, 'horas_extra_50',   '2026-01-01', 150::numeric, null::numeric, false, 'LCT art. 201'),
    (null,       'horas_extra_100',  '2026-01-01', 200,   null,       false, 'LCT art. 201'),
    (null,       'jubilacion',       '2026-01-01',  11,   null,       false, 'Ley 24.241'),
    (null,       'ley_19032',        '2026-01-01',   3,   null,       false, 'Ley 19.032'),
    (null,       'obra_social',      '2026-01-01',   3,   null,       false, 'Ley 23.660'),
    (null,       'contrib_os',       '2026-01-01',   6,   null,       false, 'Ley 23.660'),
    ('uocra',    'asistencia',       '2026-01-01',  20,   null,       false, 'CCT 76/75'),
    ('uocra',    'adicional_tarea',  '2026-01-01',  10,   null,       true,  'CCT 76/75: 10 % a 25 % según tarea'),
    ('uocra',    'cuota_sindical',   '2026-01-01',   2.5, null,       true,  'Relevamiento (hay fuentes que dicen 2 %)'),
    ('uocra',    'aporte_solidario', '2026-01-01',   2,   null,       false, 'Relevamiento 26/09/2026'),
    ('uocra',    'seguro_vida',      '2026-01-01',   2,   null,       true,  'Dato 2023 (2 % del Sereno zona A)'),
    ('uocra',    'contrib_especial', '2026-06-01',   2,   null,       false, 'Acuerdo UOCRA, desde 06/2026'),
    ('uocra',    'fondo_cese_1',     '2026-01-01',  12,   null,       false, 'Ley 22.250'),
    ('uocra',    'fondo_cese_2',     '2026-01-01',   8,   null,       false, 'Ley 22.250'),
    ('uecara',   'antiguedad',       '2026-09-01', null,    13844.00, false, 'Acuerdo UECARA 22/09/2026'),
    ('uecara',   'titulo_a',         '2026-09-01', null,    75742.00, true,  'Acuerdo UECARA 22/09/2026 (rango $51.732–75.742)'),
    ('uecara',   'titulo_c',         '2026-09-01', null,    51732.00, true,  'Acuerdo UECARA 22/09/2026 (rango $51.732–75.742)'),
    ('uecara',   'falla_caja',       '2026-09-01', null,    73143.00, false, 'Acuerdo UECARA 22/09/2026'),
    ('uecara',   'presentismo',      '2026-09-01',  10,   null,       true,  'Ejemplo publicado (≈10 % del básico)'),
    ('camioneros', 'antiguedad',     '2026-01-01',   1,   null,       true,  'CCT 40/89 (base y tope a confirmar)'),
    ('camioneros', 'km_remunerativo','2026-03-01', null,       80.09, true,  'Valor mar–may 2026'),
    ('camioneros', 'viatico_km',     '2026-03-01', null,       80.09, true,  'Valor mar–may 2026'),
    ('camioneros', 'viatico_comida', '2026-08-01', null,    16463.00, true,  'Valor agosto 2026'),
    ('camioneros', 'viatico_especial','2026-08-01', null,    8261.00, true,  'Valor agosto 2026'),
    ('camioneros', 'pernocte',       '2026-08-01', null,    19175.00, true,  'Valor agosto 2026'),
    ('camioneros', 'suma_acuerdo',   '2026-09-01', null,    18000.00, false, 'Acuerdo sep-2026/feb-2027: $18.000 en septiembre'),
    ('camioneros', 'suma_acuerdo',   '2026-10-01', null,        0.00, false, 'Fin de la suma de septiembre'),
    ('camioneros', 'suma_acuerdo',   '2027-01-01', null,   300000.00, true,  '$1.200.000 en 4 cuotas desde ene-2027 (iguales, a confirmar)'),
    ('camioneros', 'suma_acuerdo',   '2027-05-01', null,        0.00, true,  'Fin de las 4 cuotas'),
    ('camioneros', 'cuota_sindical', '2026-01-01',   3,   null,       false, 'CCT 40/89 (a todos)'),
    ('camioneros', 'sepelio',        '2026-01-01',   1.5, null,       true,  'Relevamiento 26/09/2026'),
    ('camioneros', 'oschoca',        '2026-09-01', null,    29000.00, false, 'Acuerdo sep-2026')
  ) as x(conv, codigo, desde, pct, monto, nc, fuente)
  left join public.sueldos_convenios c on c.codigo = x.conv
  join public.sueldos_conceptos k on coalesce(k.convenio_id, 0) = coalesce(c.id, 0) and k.codigo = x.codigo
on conflict (concepto_id, vigente_desde) do nothing;
