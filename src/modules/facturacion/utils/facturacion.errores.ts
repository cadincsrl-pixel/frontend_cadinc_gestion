// Los códigos del backend y de las RPC `ventas_*` (20260924c), en castellano.
//
// En un módulo fiscal importa todavía más que en Pagos: la persona tiene que
// saber si la factura SALIÓ o NO salió. Cada mensaje dice qué pasó y qué hacer.
//
// El `HttpError` del client trae `{ message: code, body: { error, detail } }`:
// se lee `body.error` (el código) y `body.detail` (el dato para el mensaje).

import { fmtFecha } from './facturacion.utils'

interface CuerpoError {
  error?:  string
  detail?: unknown
  status?: number
  /** Campo del formulario que falló (400 DATOS_INVALIDOS, CUIT_INVALIDO, …). */
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

const money = (n: unknown) =>
  '$ ' + Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function dato(detail: unknown, clave: string): unknown {
  if (detail && typeof detail === 'object' && clave in detail) {
    return (detail as Record<string, unknown>)[clave]
  }
  return undefined
}

/** ISO → "HH:MM" en hora argentina. */
function horaAR(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })
}

const CAMPO_RENGLON: Record<string, string> = {
  descripcion: 'la descripción', cantidad: 'la cantidad', precio_unit: 'el precio', alicuota_id: 'la alícuota',
}

const MENSAJES: Record<string, (d: unknown) => string> = {
  // ── Permisos ──
  SIN_PERMISO:           () => 'No tenés permiso para esta acción.',
  SIN_TAB:               () => 'No tenés acceso a esta pantalla de Facturación.',
  SIN_PERMISO_EMITIR:    d => dato(d, 'flag') === 'emitir_notas_credito'
    ? 'No tenés permiso para emitir notas de crédito.'
    : 'No tenés permiso para emitir facturas.',
  SIN_PERMISO_REGISTRAR: () => 'No tenés permiso para registrar facturas en Finnegans.',
  FORZAR_SOLO_ADMIN:     () => 'Solo un administrador puede forzar una nota de crédito que supera el saldo.',
  USUARIO_REQUERIDO:     () => 'No se pudo identificar al usuario. Volvé a iniciar sesión.',

  // ── ARCA ──
  ARCA_RECHAZO:         () => 'ARCA rechazó el comprobante. Mirá los errores y observaciones, corregí y volvé a emitir.',
  EMISION_INCIERTA:     () => 'ARCA no respondió a tiempo: no se sabe si autorizó el comprobante. Verificalo en ARCA antes de seguir.',
  EMISION_EN_CURSO:     d => {
    const otra = dato(d, 'bloqueada_por')
    const fid = dato(d, 'factura_id')
    return otra && String(otra) !== String(fid)
      ? `Hay otro comprobante del mismo talonario emitiéndose o sin confirmar (#${String(otra)}). Esperá a que termine o verificalo en ARCA.`
      : 'Este comprobante ya se está emitiendo. Esperá unos segundos y actualizá.'
  },
  ARCA_NO_DISPONIBLE:   () => 'ARCA no está respondiendo. El comprobante NO se mandó y sigue en borrador: probá de nuevo en unos minutos.',
  ARCA_COMPROBANTE_INVALIDO: () => 'ARCA devolvió una respuesta que no se pudo leer. Verificá el comprobante en ARCA antes de seguir.',
  ARCA_NO_CONFIGURADO:  () => 'La conexión con ARCA no está configurada en el servidor (certificado o punto de venta). Avisá al administrador.',
  ARCA_TA_PERDIDO:      d => {
    const hora = horaAR(dato(d, 'hasta'))
    return `ARCA no deja conectar${hora ? ` hasta aprox. las ${hora}` : ' por un rato'}. El comprobante NO se mandó: sigue en borrador, probá después.`
  },
  CONFLICTO_NUMERACION: () => 'ARCA tiene ese número con OTRO comprobante (distinto cliente o importe). El talonario quedó trabado: avisá al administrador antes de seguir facturando.',

  // ── Estado del comprobante ──
  FACTURA_NO_EXISTE:            () => 'El comprobante no existe o ya no está disponible.',
  FACTURA_NO_EDITABLE:          d => `El comprobante está «${String(dato(d, 'estado') ?? '')}»: solo se edita un borrador.`,
  FACTURA_NO_BORRABLE:          () => 'No se puede borrar: ya pasó por ARCA. Descartalo (queda en el historial).',
  FACTURA_AUTORIZADA_INMUTABLE: () => 'La factura está autorizada por ARCA: no se modifica. Si hay un error, anulala con una nota de crédito.',
  FACTURA_NO_EMITIBLE:          d => `No se puede emitir un comprobante en estado «${String(dato(d, 'estado') ?? '')}». Solo se emiten borradores.`,
  FACTURA_NO_EMITIENDO:         () => 'El comprobante ya no está emitiéndose. Actualizá la pantalla.',
  FACTURA_NO_REVERTIBLE:        d => `No se puede volver a borrador desde «${String(dato(d, 'estado') ?? '')}».`,
  FACTURA_NO_DESCARTABLE:       d => `No se puede descartar en estado «${String(dato(d, 'estado') ?? '')}». Solo borradores y rechazadas.`,
  FACTURA_NO_AUTORIZADA:        () => 'Solo se registran en Finnegans las facturas autorizadas por ARCA.',
  FACTURA_NACE_BORRADOR:        () => 'Un comprobante nuevo siempre nace como borrador.',
  VENTAS_SOLO_RPC:              () => 'Ese cambio no se puede hacer directo: pasa por el circuito de facturación.',
  SOLO_AGREGAR:                 () => 'El historial no se puede modificar.',

  // ── Datos del comprobante ──
  TIPO_NO_HABILITADO:     () => 'Por ahora solo se emiten Factura A y Nota de crédito A.',
  TIPO_INVALIDO:          () => 'Tipo de comprobante inválido.',
  AMBIENTE_INVALIDO:      () => 'Ambiente de ARCA inválido.',
  AMBIENTE_NO_COINCIDE:   () => 'El comprobante es de otro ambiente de ARCA (homologación vs. producción).',
  PTO_VTA_INVALIDO:       () => 'Punto de venta inválido en la configuración del servidor.',
  CLIENTE_REQUERIDO:      () => 'Elegí el cliente.',
  CLIENTE_NO_EXISTE:      () => 'El cliente no existe.',
  CLIENTE_INACTIVO:       () => 'El cliente está dado de baja. Reactivalo en Clientes para facturarle.',
  LETRA_INCOMPATIBLE:     d => dato(d, 'letra') === 'A'
    ? 'A este cliente no se le puede hacer factura A: tiene que tener CUIT y ser Responsable Inscripto o Monotributista. Revisá su condición IVA en Clientes.'
    : 'La letra del comprobante no corresponde a la condición IVA del cliente.',
  PRODUCTO_INVALIDO:      () => 'El producto tiene que ser «Avance de obra» o «Transporte».',
  CENTRO_COSTO_REQUERIDO: () => 'Una factura de avance de obra necesita centro de costo.',
  CENTRO_COSTO_INVALIDO:  d => `«${String(dato(d, 'centro_costo') ?? '')}» no es un centro de costo de las obras.`,
  OBRA_NO_EXISTE:         () => 'La obra no existe.',
  CONCEPTO_INVALIDO:      () => 'Concepto de ARCA inválido.',
  SIN_RENGLONES:          () => 'Agregá al menos un renglón.',
  RENGLON_INVALIDO:       d => {
    const i = Number(dato(d, 'indice'))
    const campo = CAMPO_RENGLON[String(dato(d, 'campo') ?? '')] ?? 'un dato'
    return `Revisá ${campo} del renglón${Number.isFinite(i) ? ` ${i}` : ''}.`
  },
  TOTAL_CERO:             () => 'El total no puede ser cero.',
  FECHA_FUERA_DE_RANGO:   d => {
    const desde = dato(d, 'desde'), hasta = dato(d, 'hasta')
    return desde && hasta
      ? `ARCA acepta la fecha entre el ${fmtFecha(String(desde))} y el ${fmtFecha(String(hasta))}.`
      : 'La fecha está fuera del rango que acepta ARCA.'
  },
  FECHA_ANTERIOR_AL_ULTIMO: d => {
    const ult = dato(d, 'ultima')
    return `La fecha no puede ser anterior a la del último comprobante autorizado${ult ? ` (${fmtFecha(String(ult))})` : ''}.`
  },

  // ── Nota de crédito ──
  ASOCIADA_SOLO_NC:         () => 'Solo una nota de crédito lleva factura asociada.',
  NC_SIN_FACTURA:           () => 'La nota de crédito necesita la factura que corrige.',
  NC_FACTURA_NO_EXISTE:     () => 'La factura que corrige esta nota de crédito no existe.',
  NC_FACTURA_NO_AUTORIZADA: () => 'Solo se hace nota de crédito sobre una factura autorizada por ARCA.',
  NC_TIPO_NO_COINCIDE:      () => 'La nota de crédito tiene que ser de la misma letra que la factura.',
  NC_OTRO_CLIENTE:          () => 'La nota de crédito tiene que ser al mismo cliente que la factura.',
  NC_SUPERA_FACTURA:        d => {
    const saldo = dato(d, 'saldo'), total = dato(d, 'total')
    return saldo !== undefined
      ? `La nota de crédito (${money(total)}) supera lo que queda de la factura (${money(saldo)}).`
      : 'La nota de crédito supera lo que queda de la factura.'
  },

  // ── Numeración (errores internos de la emisión) ──
  NUMERO_INVALIDO:    () => 'Número de comprobante inválido.',
  NUMERO_DESFASADO:   () => 'La numeración de ARCA no coincide con la local. Verificá en ARCA antes de seguir.',
  NUMERO_REQUERIDO:   () => 'ARCA no devolvió el número del comprobante.',
  NUMERO_NO_COINCIDE: () => 'El número que devolvió ARCA no coincide con el que se intentó. Verificá en ARCA.',
  NUMERO_DUPLICADO:   () => 'Ese número ya está usado por otro comprobante del talonario.',
  CAE_INVALIDO:       () => 'ARCA devolvió un CAE inválido.',
  CAE_VTO_REQUERIDO:  () => 'ARCA no devolvió el vencimiento del CAE.',
  RESULTADO_INVALIDO: () => 'Respuesta de ARCA inválida.',

  // ── Finnegans ──
  NUMERO_FINNEGANS_REQUERIDO:  () => 'Poné el número del comprobante en Finnegans.',
  NUMERO_FINNEGANS_DUPLICADO:  d => {
    const otra = dato(d, 'factura_id') ?? dato(d, 'otra_id')
    return `Ese número de Finnegans ya está en otra factura${otra ? ` (#${String(otra)})` : ''}. Revisá que no lo hayas copiado de otra.`
  },
  YA_REGISTRADA:  () => 'La factura ya estaba registrada en Finnegans.',
  NO_REGISTRADA:  () => 'La factura no estaba registrada en Finnegans.',

  // ── Clientes ──
  CUIT_INVALIDO:     () => 'El CUIT no es válido (revisá el dígito verificador).',
  CLIENTE_DUPLICADO: d => {
    const rs = dato(d, 'razon_social'), id = dato(d, 'cliente_id')
    return `Ya existe un cliente con ese documento${rs ? `: «${String(rs)}»` : ''}${id ? ` (#${String(id)})` : ''}.`
  },

  DOC_INVALIDO:           () => 'El número de documento no es válido.',
  CONDICION_IVA_INVALIDA: () => 'Elegí una condición IVA válida.',
  CLIENTE_INVALIDO:       () => 'El cliente no es válido para este comprobante.',

  // ── Genéricos ──
  DATOS_INVALIDOS:  d => {
    const campo = dato(d, 'campo'), msg = dato(d, 'mensaje')
    return `Dato inválido${campo ? ` en «${String(campo)}»` : ''}${msg ? `: ${String(msg)}` : ''}.`
  },
  ID_INVALIDO:      () => 'Identificador inválido.',
  VALIDATION_ERROR: () => 'Hay datos inválidos en el formulario.',
  DB_ERROR:         () => 'Error de la base de datos. Probá de nuevo; si sigue, avisá.',
}

/** Mensaje para un toast o para abajo del botón. Un código desconocido sale tal cual. */
export function mensajeErrorFacturacion(e: unknown): string {
  const { error, detail, status } = leerCuerpoError(e)
  if (!error) return 'No se pudo completar la operación.'
  const fn = MENSAJES[error]
  if (fn) return fn(detail)
  if (status === 403) return 'No tenés permiso para esta acción.'
  return error
}

export function codigoErrorFacturacion(e: unknown): string | null {
  return leerCuerpoError(e).error ?? null
}

/** Para mensajes que no vienen de una excepción (el 202 de emitir). */
export function mensajeCodigoFacturacion(code: string, detail?: unknown): string {
  const fn = MENSAJES[code]
  return fn ? fn(detail) : code
}

/**
 * El campo del formulario al que apunta un error de validación, con el mensaje
 * para ponerle abajo. El backend manda la ruta del body ("factura.cliente_id",
 * "renglones.0.cantidad", "doc_nro"); se le saca el prefijo `factura.` porque
 * el formulario de la factura es plano.
 */
export function errorDeCampoFacturacion(e: unknown): { campo: string; mensaje: string } | null {
  const { campo, detail, error } = leerCuerpoError(e)
  // RENGLON_INVALIDO (de la RPC) trae índice 1-based y el campo suelto.
  if (error === 'RENGLON_INVALIDO') {
    const i = Number(dato(detail, 'indice'))
    const c = dato(detail, 'campo')
    if (Number.isInteger(i) && i >= 1 && typeof c === 'string') {
      return { campo: `renglones.${i - 1}.${c}`, mensaje: mensajeErrorFacturacion(e) }
    }
  }
  if (!campo) return null
  const msgDetail = dato(detail, 'mensaje')
  const mensaje = error === 'DATOS_INVALIDOS' && typeof msgDetail === 'string' ? msgDetail : mensajeErrorFacturacion(e)
  return { campo: campo.replace(/^factura\./, ''), mensaje }
}
