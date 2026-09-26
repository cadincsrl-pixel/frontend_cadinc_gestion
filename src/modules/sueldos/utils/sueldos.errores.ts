// Los códigos del backend de Sueldos (§9 del contrato), en castellano.
//
// El `HttpError` del client trae `{ message: code, body: { error, campo?, detail? } }`:
// se lee `body.error` (el código), `body.campo` (el campo del formulario) y
// `body.detail` (el dato para el mensaje). En errores de una línea del recibo
// el backend manda `detail.indice` (0-based).

import { fmtFecha, fmtM } from './sueldos.utils'

interface CuerpoError {
  error?:  string
  detail?: unknown
  status?: number
  campo?:  string | null
}

export function leerCuerpoError(e: unknown): CuerpoError {
  if (!(e instanceof Error)) return {}
  const status = (e as { status?: unknown }).status
  const body = (e as { body?: unknown }).body
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b.error === 'string') {
      const campoDetail = b.detail && typeof b.detail === 'object' ? (b.detail as Record<string, unknown>).campo : undefined
      const campo = typeof b.campo === 'string' ? b.campo : typeof campoDetail === 'string' ? campoDetail : null
      return { error: b.error, detail: b.detail, status: typeof status === 'number' ? status : undefined, campo }
    }
  }
  return { error: e.message, status: typeof status === 'number' ? status : undefined }
}

function dato(detail: unknown, clave: string): unknown {
  if (detail && typeof detail === 'object' && clave in detail) return (detail as Record<string, unknown>)[clave]
  return undefined
}

function txt(detail: unknown, clave: string, def = ''): string {
  const v = dato(detail, clave)
  return v === undefined || v === null ? def : String(v)
}

function linea(d: unknown): string {
  const i = Number(dato(d, 'indice'))
  return Number.isInteger(i) && i >= 0 ? ` ${i + 1}` : ''
}

const ETIQUETA_PERIODICIDAD: Record<string, string> = { quincenal: 'por quincena', mensual: 'por mes' }
const ETIQUETA_FLAG: Record<string, string> = {
  liquidar: '«Liquidar sueldos»',
  cerrar_liquidaciones: '«Cerrar liquidaciones»',
  configurar: '«Configurar el módulo»',
  ver_pii: '«Ver datos personales»',
}

const MENSAJES: Record<string, (d: unknown) => string> = {
  // ── Permisos / sesión ──
  ID_INVALIDO:        () => 'El identificador no es válido.',
  DATOS_INVALIDOS:    d => `Revisá los datos${dato(d, 'mensaje') ? `: ${txt(d, 'mensaje')}` : dato(d, 'campo') ? ` (${txt(d, 'campo')})` : ''}.`,
  USUARIO_REQUERIDO:  () => 'Falta el usuario de la sesión. Volvé a iniciar sesión.',
  SIN_PERMISO:        d => {
    const f = txt(d, 'flag') || txt(d, 'permiso')
    return `No tenés permiso para esta acción de Sueldos${f ? ` (hace falta ${ETIQUETA_FLAG[f] ?? f})` : ''}.`
  },
  SIN_TAB:            () => 'No tenés acceso a esta pestaña de Sueldos.',
  SIN_PERMISO_PII:    () => 'Para ver o cambiar CUIL y CBU necesitás el permiso «Ver datos personales».',

  // ── Legajos ──
  LEGAJO_NO_EXISTE:   () => 'El legajo no existe.',
  PERSONAL_NO_EXISTE: () => 'No existe ese legajo en Personal.',
  CHOFER_NO_EXISTE:   () => 'No existe ese chofer.',
  NOMBRE_REQUERIDO:   () => 'Indicá el nombre (o elegí una persona o un chofer).',
  LEGAJO_DUPLICADO:   d => `Esa persona o chofer ya tiene legajo${dato(d, 'legajo_id') ? ` (#${txt(d, 'legajo_id')})` : ''}.`,
  CUIL_INVALIDO:      () => 'El CUIL no es válido (revisá el dígito verificador).',
  CUIL_DUPLICADO:     d => `Ese CUIL ya está en otro legajo${dato(d, 'legajo_id') ? ` (#${txt(d, 'legajo_id')})` : ''}.`,
  CBU_INVALIDO:       () => 'El CBU no es válido (22 dígitos con sus verificadores).',
  CONVENIO_INVALIDO:  () => 'Elegí un convenio activo.',
  CONVENIO_NO_EXISTE: () => 'El convenio no existe.',
  CATEGORIA_OTRO_CONVENIO: () => 'La categoría no es de ese convenio.',
  CATEGORIA_NO_EXISTE: () => 'La categoría no existe.',
  FECHAS_INVALIDAS:   () => 'La fecha de egreso no puede ser anterior al ingreso.',
  TITULO_INVALIDO:    () => 'El nivel de título es A, B o C.',
  F931_CODIGO_INVALIDO: () => 'El código del F.931 es un número de hasta 3 dígitos.',
  CONCEPTO_JUBILADOS_INVALIDO: () => 'Un concepto no puede ser «solo jubilados» y «no a jubilados» a la vez.',
  JORNADA_INVALIDA:   () => 'La jornada es completa o parcial.',
  ZONA_INVALIDA:      () => 'Zona inválida (letras o números, hasta 5).',
  MODALIDAD_INVALIDA: () => 'Modalidad de contratación inválida.',
  HIJOS_INVALIDO:     () => 'Hijos a cargo: de 0 a 30.',
  OBRA_NO_EXISTE:     () => 'La obra habitual no existe.',

  // ── Configuración ──
  CODIGO_INVALIDO:       () => 'Código inválido: minúsculas, números y guion bajo.',
  CODIGO_DUPLICADO:      () => 'Ya existe otro con ese código.',
  CODIGO_NO_EDITABLE:    () => 'El código no se puede cambiar.',
  PERIODICIDAD_INVALIDA: () => 'La periodicidad es quincenal o mensual.',
  UNIDAD_INVALIDA:       () => 'Unidad inválida.',
  FECHA_REQUERIDA:       () => 'Indicá la fecha de vigencia.',
  VALOR_INVALIDO:        () => 'El valor tiene que ser mayor a cero.',
  VALOR_REQUERIDO:       () => 'Indicá un porcentaje o un monto.',
  VALOR_NO_EXISTE:       () => 'Ese valor ya no existe.',
  VALOR_DUPLICADO:       () => 'Ya hay un valor con esa vigencia.',
  ESCALA_NO_EXISTE:      () => 'La escala no existe.',
  ESCALA_DUPLICADA:      () => 'Ya hay una escala para esa categoría, zona y fecha.',
  ESCALA_YA_EXISTE:      d => `Ya hay escalas cargadas desde el ${fmtFecha(txt(d, 'desde')) || 'día elegido'}: no se pisó nada.`,
  SIN_ESCALAS_VIGENTES:  () => 'No hay escalas anteriores a esa fecha para aplicar la paritaria.',
  PORCENTAJE_INVALIDO:   () => 'El porcentaje tiene que estar entre −50 y 200.',
  CONCEPTO_NO_EXISTE:    () => 'El concepto no existe.',
  CONCEPTO_USA_PARAMETRO: () => 'Este concepto toma su valor de Parámetros: editalo en Configuración.',
  TIPO_INVALIDO:         () => 'Tipo inválido.',
  CALCULO_INVALIDO:      () => 'Forma de cálculo inválida.',
  BASE_INVALIDA:         () => 'Elegí sobre qué base se aplica el porcentaje.',
  BASE_REQUERIDA:        () => 'Elegí sobre qué base se aplica el porcentaje.',
  CONDICION_INVALIDA:    () => 'Condición inválida.',
  CODIGO_ARCA_INVALIDO:  () => 'El código ARCA son 6 dígitos.',
  DESTINO_INVALIDO:      () => 'Destino inválido.',
  GRUPO_INVALIDO:        () => 'Grupo de contribución inválido.',
  CLAVE_INVALIDA:        () => 'Clave inválida: minúsculas, números y guion bajo.',
  PARAMETRO_NO_EXISTE:   () => 'El parámetro no existe.',
  PARAMETRO_DUPLICADO:   () => 'Ya hay un valor de ese parámetro con esa vigencia.',

  // ── Liquidaciones ──
  LIQUIDACION_NO_EXISTE: () => 'La liquidación no existe.',
  PERIODO_REQUERIDO:     () => 'Indicá el período.',
  QUINCENA_INVALIDA:     () => 'Elegí la 1ª o la 2ª quincena.',
  TIPO_NO_CORRESPONDE_CONVENIO: d => `Ese convenio se liquida ${ETIQUETA_PERIODICIDAD[txt(d, 'periodicidad')] ?? txt(d, 'periodicidad')}: elegí el tipo que corresponde.`,
  LIQUIDACION_DUPLICADA: d => `Ya existe ${txt(d, 'codigo', 'una liquidación')} para ese período${dato(d, 'estado') ? ` (${txt(d, 'estado')})` : ''}.`,
  LIQUIDACION_ANULADA:   () => 'La liquidación está anulada.',
  LIQUIDACION_NO_BORRADOR: d => `La liquidación ya está ${txt(d, 'estado', 'cerrada')}: reabrila para modificarla.`,
  LIQUIDACION_NO_CERRADA: () => 'La liquidación no está cerrada.',
  SIN_RECIBOS:           () => 'No hay recibos para cerrar.',
  ASIENTO_YA_GENERADO:   () => 'La liquidación ya tiene su asiento.',
  PERIODO_CERRADO:       d => `El período contable del asiento está cerrado${dato(d, 'fecha') ? ` (${fmtFecha(txt(d, 'fecha'))})` : ''}.`,
  MOTIVO_REQUERIDO:      () => 'Escribí el motivo (al menos 3 letras).',

  // ── Recibos ──
  RECIBO_NO_EXISTE:      () => 'Ese legajo no tiene recibo en esta liquidación.',
  LEGAJO_OTRO_CONVENIO:  () => 'El legajo es de otro convenio.',
  LEGAJO_SIN_CATEGORIA:  () => 'El legajo no tiene categoría: completala en la ficha.',
  SIN_ESCALA:            d => `${txt(d, 'categoria', 'La categoría')} no tiene escala vigente al ${fmtFecha(txt(d, 'fecha')) || 'período'}${dato(d, 'zona') ? ` (zona ${txt(d, 'zona')})` : ''}: cargala en Convenios.`,
  CONCEPTO_DESCONOCIDO:  d => `El concepto «${txt(d, 'codigo')}» no existe o no está activo en el convenio.`,
  IMPORTE_REQUERIDO:     d => `«${txt(d, 'codigo')}» se carga a mano: indicá el importe.`,
  LEGAJO_SIN_FECHA_EGRESO: () => 'Cargá la fecha de egreso del legajo para la liquidación final.',
  LEGAJOS_REQUERIDOS:    d => `Para ${txt(d, 'tipo', 'este tipo de liquidación')} elegí a quiénes liquidar.`,
  LINEAS_INVALIDAS:      () => 'Las líneas del recibo no son válidas (máx. 200).',
  DEMASIADAS_LINEAS:     () => 'Las líneas del recibo no son válidas (máx. 200).',
  CONCEPTO_OTRO_CONVENIO: d => `Un concepto es de otro convenio (línea${linea(d)}).`,
  LINEA_TIPO_INVALIDO:   d => `Tipo inválido en la línea${linea(d)}.`,
  LINEA_TIPO_NO_COINCIDE: d => `Tipo inválido en la línea${linea(d)}.`,
  LINEA_NOMBRE_REQUERIDO: d => `Falta el nombre de la línea${linea(d)}.`,
  LINEA_IMPORTE_INVALIDO: d => `Importe inválido en la línea${linea(d)}.`,
  LINEA_DESTINO_INVALIDO: d => `Destino inválido en la línea${linea(d)}.`,
  LINEA_CODIGO_ARCA_INVALIDO: d => `Código ARCA inválido en la línea${linea(d)}.`,
  LINEA_UNIDAD_INVALIDA: d => `Unidad inválida en la línea${linea(d)}.`,
  NETO_NEGATIVO:         d => dato(d, 'legajo_id') !== undefined
    ? `Un recibo da neto negativo${dato(d, 'neto') !== undefined ? ` (${fmtM(Number(dato(d, 'neto')))})` : ''}: bajá el préstamo o los descuentos de ese empleado antes de cerrar.`
    : `El neto da negativo${dato(d, 'neto') !== undefined ? ` (${fmtM(Number(dato(d, 'neto')))})` : ''}: bajá el préstamo o los descuentos.`,
  LEGAJOS_SIN_FECHA_INGRESO: d => {
    const l = dato(d, 'legajos')
    const nombres = Array.isArray(l) ? l.map(x => (x && typeof x === 'object' ? String((x as Record<string, unknown>).nombre ?? '') : '')).filter(Boolean) : []
    return `Falta la fecha de ingreso en la ficha de: ${nombres.length ? nombres.join(', ') : 'algunos empleados'}. Completala en Legajos y volvé a cerrar.`
  },
  FECHA_PAGO_REQUERIDA:  () => 'Poné la fecha de pago de la liquidación antes de cerrarla.',
  TOTALES_NO_CUADRAN:    d => `Los totales no cuadran${dato(d, 'campo') ? ` (${txt(d, 'campo')})` : ''}: recalculá el recibo.`,
  NETO_NO_CUADRA:        () => 'El neto no cuadra: recalculá el recibo.',

  // ── Genéricos ──
  DUPLICADO:             () => 'Ya existe un registro igual.',
  DB_ERROR:              d => `Error de la base${dato(d, 'dbMessage') ? `: ${txt(d, 'dbMessage')}` : ''}.`,
}

/** Mensaje en castellano para cualquier error de una llamada a /api/sueldos. */
export function mensajeErrorSueldos(e: unknown): string {
  const { error, detail, status } = leerCuerpoError(e)
  if (!error) return 'Error inesperado. Probá de nuevo.'
  const f = MENSAJES[error]
  if (f) return f(detail)
  if (status === 401) return 'Tu sesión expiró. Volvé a iniciar sesión.'
  // 403 del middleware común: viene en texto ("Sin permiso para creacion en módulo sueldos").
  if (status === 403) return error.startsWith('Sin permiso') ? `${error}.` : error
  return error
}

/** Error de un campo del formulario (para setError). Null si no apunta a un campo. */
export function errorDeCampoSueldos(e: unknown): { campo: string; mensaje: string } | null {
  const { campo } = leerCuerpoError(e)
  if (!campo) return null
  return { campo, mensaje: mensajeErrorSueldos(e) }
}

/** Código del error (para ramas específicas: ESCALA_YA_EXISTE, RECIBO_NO_EXISTE…). */
export function codigoError(e: unknown): string | undefined {
  return leerCuerpoError(e).error
}

/** Mensaje para un código suelto (p. ej. los `errores[]` de «Generar recibos»). */
export function mensajeCodigo(codigo: string, detail?: unknown): string {
  const f = MENSAJES[codigo]
  return f ? f(detail) : codigo
}
