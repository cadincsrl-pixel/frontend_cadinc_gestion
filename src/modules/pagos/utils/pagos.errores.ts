// Los códigos del backend, en castellano.
//
// `pagos.service.ts` y las RPC tiran códigos secos (`FACTURA_CON_PAGOS`,
// `NO_PUEDE_PAGAR_PROPIA`). Mostrarlos crudos deja a la persona sin saber qué
// hacer, y peor: en un módulo de plata, sin saber si la operación pasó o no.
//
// Cada mensaje dice QUÉ pasó y QUÉ hacer. Los que dependen de un dato del
// `detail` lo usan (cuánto es el saldo, qué campos están congelados).

/** Lo que devuelve el backend en el body de un error: `{ error, detail? }`. */
interface CuerpoError {
  error?:  string
  detail?: unknown
}

/**
 * `apiPost`/`apiPatch` tiran `HttpError` con el body JSON entero en `.body` y
 * el código ya extraído en `.message`. Se lee de `body` para quedarse con el
 * `detail` (el saldo, los campos congelados, la obra); el `message` es el
 * fallback cuando el backend respondió algo que no era JSON.
 */
function leerCuerpo(e: unknown): CuerpoError {
  if (!(e instanceof Error)) return {}
  const body = (e as { body?: unknown }).body
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b.error === 'string') return { error: b.error, detail: b.detail }
  }
  return { error: e.message }
}

const money = (n: unknown) => '$' + Math.round(Number(n ?? 0)).toLocaleString('es-AR')

function lista(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  return typeof v === 'string' ? v : ''
}

/**
 * Un objeto `detail` puede venir con cualquier forma; esto lee una clave sin
 * pelear con el tipo.
 */
function dato(detail: unknown, clave: string): unknown {
  if (detail && typeof detail === 'object' && clave in detail) {
    return (detail as Record<string, unknown>)[clave]
  }
  return undefined
}

const MENSAJES: Record<string, (d: unknown) => string> = {
  // ── Permisos y separación de funciones ──
  SIN_PERMISO:                  () => 'No tenés permiso para esta acción.',
  NO_PUEDE_APROBAR_PROPIA:      () => 'No podés aprobar una factura que cargaste vos. La tiene que aprobar otra persona.',
  NO_PUEDE_PAGAR_PROPIA:        () => 'No podés pagar una factura que cargaste vos. La tiene que pagar otra persona.',
  NO_PUEDE_PAGAR_LO_QUE_APROBO: () => 'No podés pagar una factura que aprobaste vos. La tiene que pagar otra persona.',

  // ── Estado de la factura ──
  FACTURA_NO_APROBADA: () => 'La factura todavía no está aprobada: solo se pagan las aprobadas.',
  FACTURA_NO_APROBABLE: d => `No se puede aprobar en estado «${String(dato(d, 'estado') ?? '')}».`,
  FACTURA_CON_PAGOS: d => {
    const campos = lista(dato(d, 'campos'))
    return campos
      ? `La factura ya tiene pagos: no se puede cambiar ${campos}. Anulá la orden de pago primero.`
      : 'La factura ya tiene pagos registrados. Anulá la orden de pago primero.'
  },
  FACTURA_CERRADA:      () => 'La factura está anulada: no admite cambios.',
  FACTURA_PAGA_CLIENTE: () => 'Esta factura la paga el cliente: no entra en el circuito de pagos de CADINC.',
  FACTURA_NO_EXISTE:    () => 'La factura no existe o ya no está disponible.',
  FACTURA_OTRO_PROVEEDOR: () => 'Todas las facturas de una orden de pago tienen que ser del mismo proveedor.',
  FACTURA_DUPLICADA: d => {
    const id = dato(d, 'factura_id')
    return `Ya existe una factura de ese proveedor con el mismo tipo y número${id ? ` (#${String(id)})` : ''}.`
  },

  // ── Importes e imputaciones ──
  IMPUTACION_NO_CUADRA: d => {
    const esperado = dato(d, 'esperado') ?? dato(d, 'imputable')
    const suma = dato(d, 'suma') ?? dato(d, 'recibido')
    return esperado !== undefined
      ? `El reparto por obra tiene que sumar ${money(esperado)} (total menos percepciones) y suma ${money(suma)}.`
      : 'El reparto por obra no cuadra con el total menos las percepciones.'
  },
  IMPUTACION_OBRA_REPETIDA: d => {
    const obra = dato(d, 'obra_cod')
    return `La obra${obra ? ` ${String(obra)}` : ''} aparece dos veces en el reparto: dejá una sola fila.`
  },
  DESGLOSE_NO_CUADRA: d => {
    const total = dato(d, 'total')
    return `El desglose no cuadra con el total${total !== undefined ? ` de ${money(total)}` : ''}. Revisá neto, IVA, percepciones y otros — o dejalos vacíos.`
  },
  MONTO_SUPERA_SALDO: d => {
    const saldo = dato(d, 'saldo')
    return saldo !== undefined
      ? `El monto supera el saldo de la factura (${money(saldo)}).`
      : 'El monto supera el saldo de la factura.'
  },
  LINEA_DUPLICADA: () => 'La misma factura aparece dos veces con el mismo tipo de línea.',
  ORDEN_SIN_LINEAS: () => 'La orden de pago no tiene ninguna línea.',

  // ── Fechas ──
  FECHA_FUTURA:          () => 'La fecha no puede ser posterior a hoy.',
  VENCIMIENTO_INVALIDO:  () => 'El vencimiento no puede ser anterior a la fecha de la factura.',
  FECHA_COBRO_REQUERIDA: () => 'Un cheque o e-cheq necesita la fecha en que se cobra.',
  FECHA_COBRO_INVALIDA:  d => {
    const num = dato(d, 'numero')
    return num !== undefined
      ? `El cheque ${num} se cobraría antes de la fecha del pago.`
      : 'La fecha de cobro no puede ser anterior a la del pago.'
  },

  // ── Cheques ──
  CHEQUES_REQUERIDOS:  () => 'Pagar con cheque o e-cheq pide el detalle: número, fecha de cobro e importe de cada uno.',
  CHEQUES_INESPERADOS: d => `No se cargan cheques en un pago por ${lista(dato(d, 'forma_pago')) || 'esta forma'}.`,
  CHEQUE_INVALIDO:     d =>
    `El cheque ${lista(dato(d, 'numero')) || 'cargado'} está incompleto: necesita número, fecha de cobro e importe.`,
  CHEQUE_SIN_LIBRADOR: d =>
    `El cheque ${lista(dato(d, 'numero')) || 'de tercero'} es endosado: falta de quién es. Si rebota, hay que saber a quién reclamarle.`,
  CHEQUE_DUPLICADO:    d => {
    const num   = lista(dato(d, 'numero'))
    const banco = lista(dato(d, 'banco'))
    const op    = dato(d, 'orden_numero')
    return op !== undefined
      ? `El cheque ${num}${banco ? ` del ${banco}` : ''} ya se entregó en la OP-${String(op).padStart(4, '0')}.`
      : `El cheque ${num} ya está entregado en otra orden de pago.`
  },
  SUMA_CHEQUES_DISTINTA: d =>
    `Los cheques suman ${money(dato(d, 'suma_cheques'))} y el pago es de ${money(dato(d, 'monto_pagado'))}. Tienen que dar igual.`,

  // ── Forma de pago y comprobantes ──
  FORMA_PAGO_REQUERIDA:  () => 'Elegí la forma de pago: solo una orden de únicamente notas de crédito puede ir sin forma.',
  COMPROBANTE_REQUERIDO: d => {
    const forma = dato(d, 'forma_pago')
    const tipo  = dato(d, 'tipo')
    if (tipo === 'nota_credito') return 'Cada nota de crédito necesita su PDF adjunto.'
    return `Una ${forma === 'echeq' ? 'e-cheq' : 'transferencia'} necesita el comprobante de pago adjunto.`
  },
  NC_DATOS_REQUERIDOS: () => 'Cada nota de crédito necesita su número y su fecha.',
  PAGADA_AL_CARGAR_FORMA: () => 'Al cargar solo se puede marcar como ya pagada con tarjeta o efectivo. Para otra forma, cargala pendiente y que la registre quien paga.',

  // ── Órdenes de pago ──
  ORDEN_NO_EXISTE:          () => 'La orden de pago no existe.',
  ORDEN_YA_ANULADA:         () => 'La orden de pago ya estaba anulada.',
  ORDEN_INMUTABLE:          () => 'Una orden de pago no se edita: anulala y registrá una nueva.',
  ORDEN_NO_ES_TUYA_O_VIEJA: () => 'Solo podés anular órdenes que registraste vos y en el mismo día. Pedile a un administrador que la anule.',

  // ── Proveedores ──
  PROVEEDOR_NO_EXISTE:  () => 'El proveedor no existe.',
  PROVEEDOR_INACTIVO:   () => 'El proveedor está dado de baja: reactivalo para usarlo.',
  PROVEEDOR_INVALIDO:   () => 'Elegí un proveedor válido.',
  PROVEEDOR_CON_SALDO: d => {
    const saldo = dato(d, 'saldo')
    return `No se puede dar de baja un proveedor con saldo${saldo !== undefined ? ` (${money(saldo)})` : ''}. Pagá o anulá sus facturas primero.`
  },
  PROVEEDOR_DUPLICADO: d => {
    const campo = dato(d, 'campo')
    const quien = dato(d, 'razon_social')
    const cual  = campo === 'cbu' ? 'ese CBU' : campo === 'alias_cbu' ? 'ese alias' : 'ese CUIT'
    return `Ya hay un proveedor con ${cual}${quien ? `: ${String(quien)}` : ''}.`
  },
  PROVEEDOR_SIN_DATOS_PAGO: () => 'El proveedor no tiene CBU ni alias cargado: no se le puede transferir. Cargá los datos de pago primero.',
  CUIT_INVALIDO:  () => 'El CUIT no es válido (revisá el dígito verificador).',
  CBU_INVALIDO:   () => 'El CBU no es válido: son 22 dígitos y no pasan los verificadores.',
  ALIAS_INVALIDO: () => 'El alias no es válido: entre 6 y 20 caracteres, letras, números, punto o guion.',

  // ── Obras ──
  OBRA_ARCHIVADA: d => {
    const obra = dato(d, 'obra_cod')
    return `La obra${obra ? ` ${String(obra)}` : ''} está archivada: no se le pueden imputar facturas nuevas.`
  },
  OBRA_NO_EXISTE: () => 'La obra no existe.',

  // ── Varios ──
  MOTIVO_REQUERIDO:  () => 'Escribí el motivo.',
  ADJ_DUPLICADO:     () => 'Ese archivo ya está adjunto acá.',
  ADJ_NO_EXISTE:     () => 'El adjunto no existe o ya se borró.',
  ARCHIVO_MUY_GRANDE: () => 'El archivo supera los 10 MB.',
  MIME_NO_PERMITIDO: () => 'Solo se aceptan PDF e imágenes.',
  DB_ERROR:          () => 'Error de la base de datos. Probá de nuevo; si sigue, avisá.',
}

/**
 * Mensaje para mostrar en un toast o bajo el input. Si el código no está en la
 * lista, se devuelve tal cual: es mejor un código raro que un «error genérico»
 * que obliga a abrir la consola.
 */
export function mensajeErrorPagos(e: unknown): string {
  const { error, detail } = leerCuerpo(e)
  if (!error) return 'No se pudo completar la operación.'
  const fn = MENSAJES[error]
  return fn ? fn(detail) : error
}

/** El código pelado, para decidir a qué input apuntar. */
export function codigoErrorPagos(e: unknown): string | null {
  return leerCuerpo(e).error ?? null
}

/**
 * Avisos que NO bloquean y vuelven en el body de una mutación exitosa. Se
 * muestran como advertencia después del toast de éxito.
 */
const AVISOS: Record<string, (d: Record<string, unknown>) => string> = {
  APROBACION_RETIRADA:       () => 'Ojo: el cambio le quitó la aprobación. Hay que aprobarla de nuevo para poder pagarla.',
  FACTURA_POSIBLE_DUPLICADA: d => `Ojo: ya hay una factura parecida de este proveedor${d.factura_id ? ` (#${String(d.factura_id)})` : ''} por el mismo importe.`,
  PROVEEDOR_PARECIDO:        d => `Ojo: ya existe «${String(d.razon_social ?? '')}», que se parece. Fijate de no duplicarlo.`,
  COMPROBANTE_YA_USADO:      () => 'Ojo: ese mismo comprobante ya está adjunto en otra orden de pago.',
  NC_POSIBLE_DUPLICADA:      () => 'Ojo: ya se aplicó una nota de crédito con ese número a este proveedor.',
  CUENTA_CAMBIO_TRAS_APROBAR: () => 'Ojo: el CBU del proveedor cambió después de que se aprobó la factura.',
}

export function mensajeAvisoPagos(aviso: { code: string; [k: string]: unknown }): string {
  const fn = AVISOS[aviso.code]
  return fn ? fn(aviso) : aviso.code
}
