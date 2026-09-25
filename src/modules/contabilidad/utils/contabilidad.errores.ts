// Los códigos del backend y de las RPC `cont_*` (20260926), en castellano.
//
// El `HttpError` del client trae `{ message: code, body: { error, campo?, detail? } }`:
// se lee `body.error` (el código) y `body.detail` (el dato para el mensaje).
// Si el error apunta a una línea del asiento, el backend manda
// `campo: 'lineas.<indice>.<campo>'`.

import { ETIQUETA_CLAVE_MAPEO, etiquetaSubclave, fmtFecha, fmtM } from './contabilidad.utils'
import type { CtbMotivo } from '@/types/contabilidad.types'

interface CuerpoError {
  error?:  string
  detail?: unknown
  status?: number
  /** Campo del formulario que falló (400 DATOS_INVALIDOS, `lineas.N.campo`, …). */
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
  if (detail && typeof detail === 'object' && clave in detail) {
    return (detail as Record<string, unknown>)[clave]
  }
  return undefined
}

/** « (línea 3)» si el detalle trae el índice (0-based en la RPC). */
function linea(d: unknown): string {
  const i = Number(dato(d, 'indice'))
  return Number.isInteger(i) && i >= 0 ? ` (línea ${i + 1})` : ''
}

const MENSAJES: Record<string, (d: unknown) => string> = {
  // ── Permisos ──
  SIN_PERMISO:          () => 'No tenés permiso para esta acción.',
  SIN_TAB:              () => 'No tenés acceso a esta pantalla de Contabilidad.',
  SIN_PERMISO_ASIENTOS: () => 'No tenés permiso para cargar asientos (hace falta «Cargar asientos manuales»).',
  SIN_PERMISO_PLAN:     () => 'No tenés permiso para editar el plan de cuentas (hace falta «Editar plan de cuentas»).',
  SIN_PERMISO_CERRAR:   () => 'No tenés permiso para cerrar ni reabrir períodos (hace falta «Cerrar y reabrir períodos»).',
  USUARIO_REQUERIDO:    () => 'No se pudo identificar al usuario. Volvé a iniciar sesión.',

  // ── No existe ──
  ASIENTO_NO_EXISTE:    () => 'El asiento no existe o ya fue borrado.',
  CUENTA_NO_EXISTE:     d => `La cuenta contable no existe${linea(d)}.`,
  PERIODO_NO_EXISTE:    () => 'El período no existe.',
  TESORERIA_NO_EXISTE:  () => 'La cuenta de tesorería no existe.',

  // ── Datos del asiento ──
  ID_INVALIDO:            () => 'Identificador inválido.',
  FECHA_REQUERIDA:        () => 'Poné la fecha del asiento.',
  FECHA_SIN_PERIODO:      d => `No hay un período contable para el ${fmtFecha(String(dato(d, 'fecha') ?? '')) || 'día elegido'}. Si es del ejercicio que viene, abrilo desde Contabilidad › Períodos («Abrir ejercicio siguiente»).`,
  TIPO_NO_PERMITIDO:      () => 'A mano solo se cargan asientos manuales, de ajuste o de apertura.',
  ESTADO_INVALIDO:        () => 'Estado del asiento inválido.',
  GLOSA_REQUERIDA:        () => 'Escribí la glosa del asiento (al menos 3 caracteres).',
  SIN_LINEAS:             () => 'El asiento necesita al menos una línea.',
  DEMASIADAS_LINEAS:      () => 'Son demasiadas líneas: el máximo es 500 por asiento.',
  MENOS_DE_DOS_LINEAS:    () => 'Para confirmar, el asiento necesita al menos dos líneas (un debe y un haber).',
  LINEA_IMPORTE_INVALIDO: d => `Cada línea lleva un importe en el Debe o en el Haber, no en los dos ni en ninguno${linea(d)}.`,
  CUENTA_INACTIVA:        d => `La cuenta está dada de baja${linea(d)}.`,
  CUENTA_NO_IMPUTABLE:    d => `Esa cuenta es un título, no recibe movimientos: elegí una subcuenta imputable${linea(d)}.`,
  AUXILIAR_REQUERIDO:     d => `La cuenta pide un auxiliar (cliente, proveedor o cuenta de tesorería)${linea(d)}.`,
  AUXILIAR_NO_CORRESPONDE: d => `Esa cuenta no lleva auxiliar${linea(d)}.`,
  AUXILIAR_NO_EXISTE:     d => `El auxiliar elegido no existe${linea(d)}.`,
  OBRA_NO_EXISTE:         d => `La obra no existe${linea(d)}.`,
  APERTURA_FECHA_INVALIDA: () => 'El asiento de apertura va con la fecha de inicio del ejercicio.',
  APERTURA_DUPLICADA:     () => 'Este ejercicio ya tiene un asiento de apertura.',
  MOTIVO_REQUERIDO:       () => 'Escribí el motivo (al menos 3 caracteres).',
  FECHA_ANTERIOR_AL_ORIGINAL: () => 'La fecha del contraasiento no puede ser anterior a la del asiento original.',
  RANGO_INVALIDO:         () => 'La fecha «desde» es posterior a la fecha «hasta».',
  MODO_INVALIDO:          () => 'Modo de libro diario inválido.',
  NIVEL_INVALIDO:         () => 'Nivel inválido (1 a 5).',
  RANGO_EXCEDE_EJERCICIO: () => 'El rango tiene que estar dentro de un mismo ejercicio.',
  ASIENTO_DESBALANCEADO:  d => {
    const dif = dato(d, 'diferencia')
    return `El asiento no cuadra: Debe ${fmtM(dato(d, 'debe') as number)} y Haber ${fmtM(dato(d, 'haber') as number)}${dif !== undefined ? ` (diferencia ${fmtM(Math.abs(Number(dif)))})` : ''}.`
  },
  ASIENTO_TOTAL_CERO:     () => 'El asiento no puede tener total cero.',

  // ── Estado del asiento ──
  PERIODO_CERRADO:        d => {
    const f = dato(d, 'fecha')
    return `El período${f ? ` del ${fmtFecha(String(f))}` : ''} está cerrado: no se puede modificar. Para corregir, anulá el asiento (genera un contraasiento) o reabrí el período.`
  },
  EJERCICIO_CERRADO:      () => 'El ejercicio está cerrado.',
  ASIENTO_NO_EDITABLE:    d => `El asiento está «${String(dato(d, 'estado') ?? 'anulado')}»: no se edita.`,
  ASIENTO_NO_BORRABLE:    d => `Solo se borran borradores (este está «${String(dato(d, 'estado') ?? '')}»). Un confirmado se anula.`,
  ASIENTO_ES_BORRADOR:    () => 'Un borrador no se anula: se borra.',
  ASIENTO_YA_ANULADO:     () => 'El asiento ya estaba anulado.',
  ASIENTO_YA_REVERTIDO:   () => 'El asiento ya tiene un contraasiento: no se toca.',
  ASIENTO_AUTOMATICO:     () => 'El asiento lo generó el sistema: no se edita ni se anula a mano.',
  CONTRAASIENTO_NO_EDITABLE: () => 'Un contraasiento no se edita. Si está mal, anulalo.',

  // ── Períodos ──
  PERIODO_YA_CERRADO:        () => 'El período ya estaba cerrado.',
  EJERCICIO_NO_EXISTE:       () => 'El ejercicio no existe.',
  EJERCICIO_SIGUIENTE_YA_EXISTE: d => `El ejercicio siguiente ya está abierto${dato(d, 'nombre') ? ` (${String(dato(d, 'nombre'))})` : ''}: el próximo se abre cuando ese empiece.`,
  PERIODO_NO_CERRADO:        () => 'El período no está cerrado.',
  PERIODO_ANTERIOR_ABIERTO:  d => `Hay un período anterior abierto${dato(d, 'numero') ? ` (el ${String(dato(d, 'numero'))})` : ''}: los períodos se cierran en orden.`,
  PERIODO_POSTERIOR_CERRADO: () => 'Hay un período posterior cerrado: solo se puede reabrir el último cerrado.',
  HAY_BORRADORES:            d => {
    const n = Number(dato(d, 'cantidad'))
    return `El período tiene ${Number.isFinite(n) && n > 0 ? n : 'algún'} asiento${n === 1 ? '' : 's'} en borrador: confirmalos o borralos antes de cerrar.`
  },

  // ── Plan de cuentas ──
  CODIGO_INVALIDO:         () => 'El código tiene que ser del tipo 1, 1.1, 1.1.01 o 1.1.01.001 (números separados por punto, el primero de 1 a 9).',
  NOMBRE_INVALIDO:         () => 'El nombre tiene que tener al menos 2 caracteres.',
  RUBRO_REQUERIDO:         () => 'Falta el rubro: lo lleva una cuenta de primer nivel, y también una subcuenta de «Resultado» (ingreso o egreso: no se hereda).',
  RESULTADO_SOLO_TITULO:   () => 'El rubro «Resultado» es solo para títulos: una cuenta imputable tiene que ser de ingreso o de egreso.',
  RUBRO_INVALIDO:          () => 'Rubro inválido (activo, pasivo, patrimonio neto, ingreso, egreso o resultado).',
  AUXILIAR_INVALIDO:       () => 'Auxiliar inválido (ninguno, cliente, proveedor o tesorería).',
  PADRE_NO_EXISTE:         d => dato(d, 'motivo') === 'padre_deshabilitado'
    ? `La cuenta madre ${String(dato(d, 'padre_codigo') ?? '')} está deshabilitada en el archivo y no se importa: habilitala en Finnegans o sacá esta fila.`
    : `No existe la cuenta madre${dato(d, 'padre_codigo') ? ` ${String(dato(d, 'padre_codigo'))}` : ''}: cargala primero.`,
  PADRE_IMPUTABLE:         () => 'La cuenta madre es imputable: una cuenta que recibe movimientos no puede tener subcuentas.',
  RUBRO_DISTINTO_AL_PADRE: () => 'El rubro tiene que ser el mismo que el de la cuenta madre (salvo debajo de «Resultado», que admite ingreso, egreso o resultado).',
  AUXILIAR_SOLO_IMPUTABLE: () => 'Solo una cuenta imputable puede llevar auxiliar.',
  IMPUTABLE_CON_HIJAS:     () => 'La cuenta tiene subcuentas: no puede ser imputable.',
  CODIGO_DUPLICADO:        () => 'Ya existe una cuenta con ese código.',
  CUENTA_CON_MOVIMIENTOS:  d => dato(d, 'campo')
    ? `La cuenta ya tiene movimientos: no se le puede cambiar ${String(dato(d, 'campo')) === 'codigo' ? 'el código' : `«${String(dato(d, 'campo'))}»`}.`
    : 'La cuenta ya tiene movimientos: no se puede borrar. Dala de baja.',
  CODIGO_CON_HIJAS:        () => 'La cuenta tiene subcuentas: no se le puede cambiar el código.',
  CUENTA_CON_HIJAS:        () => 'La cuenta tiene subcuentas: borralas primero.',
  CUENTA_CON_HIJAS_ACTIVAS: () => 'La cuenta tiene subcuentas activas: dalas de baja primero.',
  PADRE_INACTIVO:          () => 'La cuenta madre está dada de baja: reactivala primero.',
  CUENTA_EN_USO:           () => 'La cuenta está vinculada a una cuenta de tesorería: desvinculala primero.',
  SIN_FILAS:               d => dato(d, 'motivo') === 'todas_deshabilitadas'
    ? 'Todas las cuentas del archivo están deshabilitadas en Finnegans: no hay nada para importar.'
    : 'El archivo no tiene cuentas para importar.',
  DEMASIADAS_FILAS:        d => `Son demasiadas filas de una vez: el máximo es ${String(dato(d, 'max') ?? 2000)}.`,
  IMPORTACION_CON_ERRORES: d => {
    const errs = dato(d, 'errores')
    const n = Array.isArray(errs) ? errs.length : 0
    return `No se importó nada: ${n || 'hay'} fila${n === 1 ? '' : 's'} con error. Corregilas y volvé a probar.`
  },

  // ── Tesorería ──
  CUENTA_TESORERIA_INVALIDA: () => 'La cuenta contable de una cuenta de tesorería tiene que ser imputable, activa y del Activo (del Pasivo si es una tarjeta de crédito).',
  CBU_INVALIDO:              () => 'El CBU no es válido: 22 dígitos con sus verificadores.',
  ALIAS_INVALIDO:            () => 'El alias tiene que tener de 6 a 20 caracteres: letras, números, punto o guion.',
  TESORERIA_DUPLICADA:       () => 'Ya hay una cuenta de tesorería activa con ese nombre o ese CBU.',

  // ── Asientos automáticos y mapeos (fase 3, 20260927) ──
  SIN_PERMISO_CONTABILIZAR: () => 'No tenés permiso para contabilizar (hace falta «Contabilizar automáticos»).',
  SIN_PERMISO_MAPEOS:       () => 'No tenés permiso para editar los mapeos (hace falta «Editar mapeos contables»).',
  CLAVE_INVALIDA:           () => 'Ese tipo de mapeo no existe.',
  SUBCLAVE_INVALIDA:        d => `«${String(dato(d, 'subclave') ?? '')}» no es una opción válida para ${String(ETIQUETA_CLAVE_MAPEO[String(dato(d, 'clave') ?? '')] ?? dato(d, 'clave') ?? 'ese mapeo')}.`,
  MAPEO_CUENTA_INCOMPATIBLE: d => {
    const perm = dato(d, 'permitidos')
    const lista = perm && typeof perm === 'object' ? Object.values(perm as Record<string, unknown>).flat().map(String).join(', ') : ''
    return `Esa cuenta no sirve para este mapeo${dato(d, 'rubro') ? ` (es del rubro ${String(dato(d, 'rubro'))})` : ''}${lista ? `: se acepta ${lista}` : ''}.`
  },
  CONFIG_INVALIDA:          d => dato(d, 'motivo') === 'hay_amortizaciones'
    ? 'Ya hay amortizaciones generadas en el ejercicio: la frecuencia y la fecha de corte no se cambian. Anulá las corridas primero (Bienes de uso › Corridas).'
    : `Valor inválido en la configuración${dato(d, 'clave') ? ` («${String(dato(d, 'clave'))}»)` : ''}.`,
  ORIGEN_INVALIDO:          () => 'Origen inválido.',
  ORIGEN_NO_EXISTE:         () => 'El comprobante de origen no existe o ya no está.',
  FECHA_FUTURA:             () => 'La fecha no puede ser posterior a hoy.',
  CONTABILIZADOR_OCUPADO:   () => 'Otra persona está contabilizando en este momento. Probá de nuevo en un minuto.',
  HAY_PENDIENTES_AUTOMATICOS: d => {
    const n = Number(dato(d, 'cantidad'))
    return `El mes tiene ${Number.isFinite(n) && n > 0 ? n : 'algunos'} comprobante${n === 1 ? '' : 's'} de Ventas o Compras sin contabilizar o desactualizado${n === 1 ? '' : 's'}.`
  },

  // ── Movimientos de fondos (tanda 5, 20260928l) ──
  SIN_PERMISO_FONDOS:          () => 'No tenés permiso para cargar movimientos de fondos (hace falta «Movimientos de fondos»).',
  MOVIMIENTO_NO_EXISTE:        () => 'El movimiento de fondos no existe.',
  CONCEPTO_NO_EXISTE:          () => 'El concepto no existe.',
  TIPO_INVALIDO:               () => 'Tipo de movimiento inválido (ingreso, egreso o transferencia).',
  IMPORTE_INVALIDO:            () => 'El importe tiene que ser mayor a cero.',
  TESORERIA_INVALIDA:          d => `La cuenta${dato(d, 'campo') === 'tesoreria_destino_id' ? ' de destino' : ''} no existe o está dada de baja.`,
  TESORERIA_IGUALES:           () => 'La cuenta de origen y la de destino tienen que ser distintas.',
  TESORERIA_DESTINO_REQUERIDA: () => 'Una transferencia necesita la cuenta de destino.',
  CONCEPTO_REQUERIDO:          () => 'Elegí el concepto del movimiento.',
  CONCEPTO_NO_CORRESPONDE:     () => 'Una transferencia entre cuentas no lleva concepto ni obra.',
  CONCEPTO_INVALIDO:           () => 'El concepto no existe o está dado de baja.',
  CONCEPTO_SENTIDO_INVALIDO:   () => 'Ese concepto no corresponde a este tipo de movimiento (es solo de ingreso o solo de egreso).',
  COTIZACION_REQUERIDA:        () => 'La cuenta es en dólares: poné la cotización.',
  IMPORTE_DESTINO_REQUERIDO:   () => 'Las cuentas son de monedas distintas: poné el importe que entra en la cuenta de destino.',
  MOVIMIENTO_ANULADO:          () => 'El movimiento está anulado: no se modifica ni se le suman comprobantes.',
  MOVIMIENTO_YA_ANULADO:       () => 'El movimiento ya estaba anulado.',
  MOVIMIENTO_DE_CONCILIACION:  () => 'El movimiento viene de la conciliación bancaria: la fecha, las cuentas y los importes no se editan acá.',
  CONCEPTO_DUPLICADO:          () => 'Ya existe un concepto con ese nombre.',
  CONCEPTO_SENTIDO_EN_USO:     d => {
    const n = Number(dato(d, 'cantidad'))
    return `El concepto ya se usa en ${Number.isFinite(n) && n > 0 ? n : 'algunos'} movimiento${n === 1 ? '' : 's'} del otro sentido: no se le puede cambiar el sentido.`
  },
  ADJUNTO_DUPLICADO:           () => 'Ese archivo ya está adjunto a este movimiento.',
  MIME_NO_PERMITIDO:           () => 'Tipo de archivo no permitido: JPG, PNG, WEBP, HEIC o PDF.',
  TAMANO_INVALIDO:             () => 'El archivo es demasiado grande (máximo 10 MB).',

  // ── Asiento mensual de IVA (tanda 5, 20260928o) ──
  IVA_SIN_MAPEO:           d => {
    const m = dato(d, 'motivos')
    const n = Array.isArray(m) ? m.length : 0
    return `Faltan cuentas para armar el asiento de IVA${n ? ` (${n} mapeo${n === 1 ? '' : 's'})` : ''}: completalas en Mapeos.`
  },
  IVA_SIN_MOVIMIENTOS:     () => 'El mes no tiene IVA en el mayor (débito, crédito y pagos a cuenta en cero): no hay asiento para generar.',
  IVA_DIFIERE_DE_LIBROS:   () => 'Lo contabilizado no coincide con los Libros IVA del mes. Revisá las diferencias; si están explicadas, se puede generar igual.',
  IVA_DDJJ_DESACTUALIZADA: () => 'El asiento de IVA del mes quedó desactualizado (se contabilizó algo después de generarlo): regeneralo antes de cerrar, o cerrá igual.',
  IVA_NO_GENERADO:         () => 'El mes no tiene asiento de IVA generado.',

  // ── Bienes de uso (tanda 5, 20260928p/q) ──
  SIN_PERMISO_BIENES:               () => 'No tenés permiso para bienes de uso (hace falta «Bienes de uso»).',
  BIEN_NO_EXISTE:                   () => 'El bien de uso no existe.',
  CORRIDA_NO_EXISTE:                () => 'La corrida de amortización no existe.',
  DESCRIPCION_REQUERIDA:            () => 'Escribí la descripción del bien (al menos 3 caracteres).',
  VIDA_UTIL_INVALIDA:               () => 'La vida útil tiene que ser mayor a cero (o marcá «No se amortiza»).',
  BU_CUENTA_INVALIDA:               d => {
    const c = String(dato(d, 'campo') ?? '')
    const cual = c === 'cuenta_amort_id' ? 'de amortización acumulada (imputable del Activo)'
      : c === 'cuenta_gasto_id' ? 'de gasto (imputable de Egresos)'
      : 'de origen (imputable del Activo, un «Valores originales»)'
    return `La cuenta ${cual} no es válida.`
  },
  BU_RESIDUAL_INVALIDO:             () => 'El valor residual tiene que ser menor al valor de origen.',
  BU_INICIAL_INVALIDA:              () => 'La amortización acumulada inicial no puede superar el valor de origen menos el residual, y solo la llevan los bienes dados de alta hasta la fecha de corte.',
  BU_SIN_CUENTA_AMORT:              () => 'Falta la cuenta de amortización acumulada (el «.03» del rubro).',
  BU_SIN_CUENTA_GASTO:              () => 'Falta la cuenta de gasto: elegila o mapeala en Mapeos › «Bienes de uso: gasto de amortización».',
  HASTA_INVALIDO:                   () => 'Con frecuencia anual, «hasta» tiene que ser el cierre de un ejercicio.',
  BIEN_DADO_DE_BAJA:                () => 'El bien está dado de baja: revertí la baja para editarlo.',
  BIEN_CON_AMORTIZACIONES_CERRADAS: () => 'El bien ya tiene amortizaciones en períodos cerrados: no se le cambian las cuentas ni la fecha de alta.',
  BAJA_ANTERIOR_A_AMORTIZADO:       () => 'Ya hay amortizaciones de ese bien en períodos cerrados posteriores a la fecha de baja.',
  AMORTIZADOR_OCUPADO:              () => 'Otra persona está generando amortizaciones en este momento. Probá de nuevo en un minuto.',
  BIEN_DUPLICADO:                   () => 'Parece repetido: ya hay un bien con el mismo identificador, o con la misma descripción, fecha y valor.',

  // ── Guardas internas (no deberían llegar) ──
  ASIENTO_SOLO_RPC:            () => 'Error interno: el asiento solo se modifica por el circuito de contabilidad. Avisá al administrador.',
  NUMERO_SOLO_AL_CERRAR:       () => 'Error interno: el número se asigna al cerrar el período. Avisá al administrador.',
  ASIENTO_ANULADO_INMUTABLE:   () => 'El asiento está anulado: no se modifica.',
  ASIENTO_TOTAL_INCONSISTENTE: () => 'Error interno: el total del asiento no coincide con sus líneas. Avisá al administrador.',

  // ── Genéricos ──
  DATOS_INVALIDOS: d => {
    const campo = dato(d, 'campo'), msg = dato(d, 'mensaje')
    return `Dato inválido${campo ? ` en «${String(campo)}»` : ''}${msg ? `: ${String(msg)}` : ''}.`
  },
  VALIDATION_ERROR: () => 'Hay datos inválidos en el formulario.',
  DB_ERROR:         () => 'Error de la base de datos. Probá de nuevo; si sigue, avisá.',
}

/** Mensaje para un toast o para abajo del botón. Un código desconocido sale tal cual. */
export function mensajeErrorCtb(e: unknown): string {
  const { error, detail, status } = leerCuerpoError(e)
  if (!error) return 'No se pudo completar la operación.'
  const fn = MENSAJES[error]
  if (fn) return fn(detail)
  if (status === 403) return 'No tenés permiso para esta acción.'
  return error
}

export function codigoErrorCtb(e: unknown): string | null {
  return leerCuerpoError(e).error ?? null
}

export function mensajeCodigoCtb(code: string | null | undefined, detail?: unknown): string {
  if (!code) return ''
  const fn = MENSAJES[code]
  return fn ? fn(detail) : code
}

/**
 * El campo del formulario al que apunta el error (`lineas.2.cuenta_id`,
 * `glosa`, `codigo`…), con el mensaje para ponerle abajo.
 */
export function errorDeCampoCtb(e: unknown): { campo: string; mensaje: string } | null {
  const { campo, detail, error } = leerCuerpoError(e)
  if (!campo) {
    // La RPC trae {indice, campo} en el detail aunque el backend no arme `campo`.
    const i = Number(dato(detail, 'indice'))
    const c = dato(detail, 'campo')
    if (Number.isInteger(i) && i >= 0 && typeof c === 'string') {
      return { campo: `lineas.${i}.${c}`, mensaje: mensajeErrorCtb(e) }
    }
    return null
  }
  const msgDetail = dato(detail, 'mensaje')
  const mensaje = error === 'DATOS_INVALIDOS' && typeof msgDetail === 'string' ? msgDetail : mensajeErrorCtb(e)
  return { campo, mensaje }
}

/**
 * Los motivos por los que un origen no se contabiliza (fase 3). No son
 * errores HTTP: viajan en `motivos[]` de los pendientes y de la propuesta.
 * `etiqueta` resuelve el nombre de la clave con el catálogo de mapeos si está
 * a mano; si no, el fijo.
 */
const MOTIVOS: Record<string, (d: Record<string, unknown>, etq: (clave: string) => string) => string> = {
  SIN_MAPEO: (d, etq) => {
    const clave = String(d.clave ?? '')
    const sub = etiquetaSubclave(clave, d.subclave == null ? '' : String(d.subclave))
    return `Falta la cuenta para ${etq(clave) || clave}${sub ? ` · ${sub}` : ''}.`
  },
  AUXILIAR_REQUERIDO:          () => 'La cuenta mapeada pide un auxiliar (cliente, proveedor o tesorería) y el comprobante no lo trae.',
  MAPEO_AUXILIAR_INCOMPATIBLE: () => 'La cuenta mapeada pide un auxiliar de otro tipo: revisá el mapeo.',
  DESGLOSE_A_REVISAR:          () => 'Factura A sin alícuotas de IVA identificadas (desglose a revisar): queda pendiente, igual que en el Libro IVA, hasta completar el desglose en Compras.',
  PAGA_CLIENTE_SIN_CRITERIO:   () => 'La paga el cliente: falta definir cómo se contabiliza (pregunta al contador).',
  // Desde 20260928f la CVLP sin líquido va por su total: este motivo ya no se genera (queda por las filas viejas).
  CVLP_SIN_LIQUIDO:            () => 'Es una CVLP sin líquido cargado: volvé a contabilizar (desde el 28/09 va por el total del comprobante).',
  CVLP_LIQUIDO_INVALIDO:       () => 'El líquido de la CVLP no alcanza a cubrir el IVA: revisalo.',
  TESORERIA_SIN_VINCULO:       () => 'La cuenta bancaria del cobro no está vinculada a una cuenta de tesorería.',
  TESORERIA_SIN_CUENTA:        () => 'La cuenta de tesorería no tiene cuenta contable vinculada (Plan › Cuentas de tesorería).',
  // La base lo manda como texto suelto (sin la cuenta): el mensaje no puede depender del código.
  CUENTA_EN_DOS_ROLES:         d => `${d.codigo ? `La cuenta ${String(d.codigo)} está mapeada` : 'Hay una misma cuenta mapeada'} en dos roles del IVA (débito, crédito o pagos a cuenta): el asiento la toma una sola vez y el desglose puede no coincidir. Revisá los mapeos.`,
  PERIODO_CERRADO:             d => `El período${d.fecha ? ` del ${fmtFecha(String(d.fecha))}` : ''} está cerrado.`,
  FECHA_SIN_PERIODO:           d => `No hay período contable para el ${fmtFecha(String(d.fecha ?? '')) || 'día del comprobante'}.`,
  DESCUADRE_ORIGEN:            d => `El asiento no cuadra${d.diferencia !== undefined ? ` por ${fmtM(Math.abs(Number(d.diferencia)))}` : ''} (y no hay cuenta de redondeo, o la diferencia es grande).`,
  ERROR_INTERNO:               d => `Error al calcularlo${d.mensaje ? `: ${String(d.mensaje)}` : ''}. Avisá al administrador.`,
}

export function mensajeMotivo(m: Pick<CtbMotivo, 'codigo' | 'detalle'>, etiquetaClave?: (clave: string) => string | undefined): string {
  const etq = (c: string) => etiquetaClave?.(c) ?? ETIQUETA_CLAVE_MAPEO[c] ?? c
  const fn = MOTIVOS[m.codigo]
  return fn ? fn(m.detalle ?? {}, etq) : mensajeCodigoCtb(m.codigo, m.detalle)
}

/** Errores que solo aparecen en una fila del importador (formato Finnegans, 20260928). */
const MENSAJES_FILA_PLAN: Record<string, (d: unknown) => string> = {
  CODIGO_FINNEGANS_INVALIDO: d => `El código de Finnegans ${String(dato(d, 'codigo') ?? '')} no se puede convertir${dato(d, 'nivel') ? ` con nivel ${String(dato(d, 'nivel'))}` : ''}: tienen que ser 7 dígitos (1-1-1-2-2) con ceros solo después del nivel.`,
  MADRE_NO_COINCIDE:         d => {
    const madre = dato(d, 'cuenta_madre'), conv = dato(d, 'madre_convertida'), esperada = dato(d, 'padre_codigo')
    return `La cuenta madre del archivo (${madre ? `${String(madre)}${conv ? ` → ${String(conv)}` : ''}` : 'vacía'}) no coincide con la del código (${esperada ? String(esperada) : 'ninguna: es de primer nivel'}).`
  },
  HABILITADA_INVALIDA:       d => `«Habilitada» tiene que ser SI o NO (vino «${String(dato(d, 'valor') ?? '')}»).`,
  IMPUTABLE_INVALIDO:        d => `«Imputable» tiene que ser SI o NO (vino «${String(dato(d, 'valor') ?? '')}»).`,
  CUENTA_DESHABILITADA:      () => 'Deshabilitada en Finnegans: no se importa.',
}

/** Error de UNA fila del importador del plan. */
export function mensajeErrorFilaPlan(code: string | null, detalle?: unknown): string {
  if (!code) return ''
  if (code === 'DUPLICADA') {
    return dato(detalle, 'motivo') === 'repetida_en_el_archivo' ? 'El código está repetido en el archivo.' : 'Ya existe en el plan.'
  }
  const fn = MENSAJES_FILA_PLAN[code]
  return fn ? fn(detalle) : mensajeCodigoCtb(code, detalle)
}

/** Aviso del asiento de IVA (vienen como texto: un código o una frase). */
export function mensajeAvisoIva(a: string): string {
  const fn = MOTIVOS[a]
  if (fn) return fn({}, c => ETIQUETA_CLAVE_MAPEO[c] ?? c)
  return MENSAJES[a]?.(undefined) ?? a
}

/** Error o aviso de UNA fila del importador de bienes de uso. */
const CAMPO_BIEN: Record<string, string> = {
  descripcion: 'descripción', cuenta: 'cuenta', cuenta_origen_id: 'cuenta', fecha_alta: 'fecha de alta',
  valor_origen: 'valor de origen', vida_util_anios: 'vida útil', vida_util: 'vida útil', valor_residual: 'valor residual',
  amort_acum_inicial: 'amortización acumulada', cuenta_amort: 'cuenta de amortización acumulada', cuenta_amort_id: 'cuenta de amortización acumulada',
  cuenta_gasto: 'cuenta de gasto', cuenta_gasto_id: 'cuenta de gasto', obra: 'obra', obra_cod: 'obra',
}

const MENSAJES_FILA_BIEN: Record<string, (campo: string | undefined, d: unknown) => string> = {
  FECHA_REQUERIDA:       () => 'Falta la fecha de alta.',
  FECHA_INVALIDA:        () => 'La fecha de alta no se entiende (dd/mm/aaaa).',
  IMPORTE_INVALIDO:      c => `El ${CAMPO_BIEN[c ?? ''] ?? 'importe'} no es un número válido mayor a cero.`,
  CUENTA_REQUERIDA:      () => 'Falta la cuenta o el rubro.',
  CUENTA_NO_EXISTE:      (_c, d) => `No se encontró la cuenta${dato(d, 'valor') ? ` «${String(dato(d, 'valor'))}»` : ''} en el plan.`,
  CUENTA_NO_ENCONTRADA:  (_c, d) => `No se encontró la cuenta${dato(d, 'valor') ? ` «${String(dato(d, 'valor'))}»` : ''} en el plan.`,
  OBRA_NO_EXISTE:        () => 'La obra no existe (código o nombre exacto).',
  NETO_NO_COINCIDE:      () => 'El neto del archivo no coincide con valor de origen − amortización acumulada.',
}

export function mensajeFilaBien(codigo: string, campo?: string, detalle?: unknown): string {
  const f = MENSAJES_FILA_BIEN[codigo]
  if (f) return f(campo, detalle)
  const base = mensajeCodigoCtb(codigo, detalle ?? (campo ? { campo } : undefined))
  return campo && base === codigo ? `${codigo} (${CAMPO_BIEN[campo] ?? campo})` : base
}
