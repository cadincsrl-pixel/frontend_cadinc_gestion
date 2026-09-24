// Los códigos del backend, en castellano.
//
// `pagos.service.ts` y las RPC tiran códigos secos (`FACTURA_CON_PAGOS`,
// `NO_PUEDE_PAGAR_PROPIA`). Mostrarlos crudos deja a la persona sin saber qué
// hacer, y peor: en un módulo de plata, sin saber si la operación pasó o no.
//
// Cada mensaje dice QUÉ pasó y QUÉ hacer. Los que dependen de un dato del
// `detail` lo usan (cuánto es el saldo, qué campos están congelados).

import { CONDICIONES_IVA } from '@/lib/utils/arca'

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
    // 400 de zod (`zValidator`): varias reglas de la NC viajan como el
    // `message` de un issue (20260925), no como `{ error: CODE }`.
    const deZod = codigoDeZod(b)
    if (deZod) return deZod
  }
  return { error: e.message }
}

const ES_CODIGO = /^[A-Z][A-Z0-9_]{2,}$/

interface IssueZod { path?: unknown; message?: unknown }

/**
 * Saca el código de negocio de un 400 de validación. Acepta las dos formas
 * que puede tomar: `{ issues: [...] }` o el `{ success: false, error: {
 * name: 'ZodError', message: '<issues en JSON>' } }` que devuelve
 * `@hono/zod-validator` con zod v4. El mensaje del issue puede ser el código
 * pelado (`NC_NO_SE_PAGA`) o `campo:CODIGO`. El campo va en `detail.campo`.
 */
function codigoDeZod(b: Record<string, unknown>): CuerpoError | null {
  let issues: IssueZod[] | null = null
  if (Array.isArray(b.issues)) issues = b.issues as IssueZod[]
  else if (b.error && typeof b.error === 'object') {
    const err = b.error as Record<string, unknown>
    if (Array.isArray(err.issues)) issues = err.issues as IssueZod[]
    else if (typeof err.message === 'string') {
      try {
        const parsed: unknown = JSON.parse(err.message)
        if (Array.isArray(parsed)) issues = parsed as IssueZod[]
      } catch { /* no era JSON */ }
    }
  }
  if (!issues) return null
  for (const is of issues) {
    if (typeof is.message !== 'string') continue
    const [a, bb] = is.message.includes(':') ? is.message.split(':', 2) : [null, is.message]
    const code = (bb ?? '').trim()
    if (!ES_CODIGO.test(code)) continue
    const campo = a?.trim() || (Array.isArray(is.path) ? is.path.join('.') : undefined)
    return { error: code, detail: campo ? { campo } : undefined }
  }
  return null
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

/** El texto que devolvió ARCA en `detail.errores`, si vino. */
function arcaDice(d: unknown): string {
  const errs = dato(d, 'errores')
  const txt = Array.isArray(errs) ? errs.map(String).filter(x => !x.startsWith('(')).join(' / ') : ''
  return txt ? ` (ARCA dice: ${txt})` : ''
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
    return `El desglose no cuadra con el total${total !== undefined ? ` de ${money(total)}` : ''}. Revisá neto, IVA por alícuota, no gravado, exento y percepciones — o quitá el desglose.`
  },
  DESGLOSE_INCONSISTENTE: () => 'El detalle de IVA y percepciones no coincide con los totales guardados. Volvé a abrir la factura y guardala de nuevo.',
  // ── Completar el desglose de una factura ya cargada (20260924v) ──
  DESGLOSE_CAMBIA_PERCEPCIONES: d => {
    const act = dato(d, 'actuales'), nue = dato(d, 'nuevas')
    const base = `El comprobante trae ${money(nue)} de percepciones y la factura tiene ${money(act)}.`
    return dato(d, 'forzable') === true
      ? `${base} Cambiarlas cambia lo imputado a las obras (total menos percepciones), y la factura ya tiene reparto o pagos: sólo un administrador puede forzarlo.`
      : `${base} Las percepciones cargadas no se cambian desde acá: corregí el detalle para que sumen lo mismo.`
  },
  DESGLOSE_SIN_IVA: () => 'Una factura A tiene que llevar al menos una alícuota de IVA (o el importe exento / no gravado).',
  DESGLOSE_INVALIDO: () => 'Hay un importe inválido en el desglose (negativo, alícuota repetida o tipo de tributo desconocido).',
  DESGLOSE_REQUERIDO: () => 'Falta el detalle de IVA y de percepciones.',
  CAE_INVALIDO: () => 'El CAE tiene que tener 14 dígitos.',
  ADJUNTO_FACTURA_NO_EXISTE: () => 'La factura no tiene el comprobante adjunto (tipo «Factura»): subilo primero o cargá el desglose a mano.',
  LECTURA_NO_EXISTE: () => 'La lectura de la factura ya no está. Volvé a soltar el archivo.',
  LECTURA_YA_USADA: d => {
    const id = dato(d, 'factura_id')
    return `Esa factura ya se cargó${id !== undefined ? ` (#${String(id)})` : ''}: el archivo leído no se puede usar dos veces.`
  },
  // Desde 20260925 `saldo` = saldo_pagable: descuenta lo reservado por NC sin aprobar.
  MONTO_SUPERA_SALDO: d => {
    const saldo = dato(d, 'saldo_pagable') ?? dato(d, 'saldo')
    return saldo !== undefined
      ? `El monto supera lo que se puede pagar de la factura (${money(saldo)}). Si tiene una nota de crédito pendiente de aprobar, esa parte no se paga con plata.`
      : 'El monto supera el saldo de la factura.'
  },
  FACTURA_NO_PAGABLE: d => {
    if (dato(d, 'clase') === 'nota_credito') return 'Una nota de crédito no se paga ni se acredita a otra NC: elegí una factura.'
    if (dato(d, 'paga_cliente') === true) return 'Esa factura la paga el cliente: no entra en el circuito de pagos ni recibe notas de crédito.'
    if (dato(d, 'estado') === 'anulada') return 'Esa factura está anulada.'
    return 'Esa factura no se puede pagar ni acreditar.'
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
  FORMA_PAGO_REQUERIDA:  () => 'Elegí la forma de pago.',
  COMPROBANTE_REQUERIDO: d => {
    const forma = dato(d, 'forma_pago')
    return `Una ${forma === 'echeq' ? 'e-cheq' : 'transferencia'} necesita el comprobante de pago adjunto.`
  },

  // ── Nota de crédito como comprobante (20260925) ──
  NC_TIPO_INVALIDO: d => {
    const campo = dato(d, 'campo')
    const porCampo: Record<string, string> = {
      clase:            'La clase del comprobante no es válida: factura o nota de crédito.',
      tipo_comprobante: 'Una nota de crédito tiene que ser A, B o C.',
      cbte_tipo_arca:   'El código de ARCA no corresponde a la clase: una NC lleva código de NC (3, 8, 13…) y una factura no.',
      paga_cliente:     'Una nota de crédito no puede estar marcada como «la paga el cliente».',
      vence_el:         'Una nota de crédito no lleva vencimiento.',
      plan_cheques:     'Una nota de crédito no lleva plan de cheques: no se paga.',
      aplica_a:         'Solo una nota de crédito acredita facturas.',
      nc_id:            'El comprobante elegido no es una nota de crédito.',
    }
    return porCampo[String(campo ?? '')] ?? 'El comprobante no es una nota de crédito válida.'
  },
  NC_APLICACION_INVALIDA: () => 'Lo que acredita la NC está mal armado: cada factura una sola vez y con un monto mayor a cero.',
  NC_ES_COMPROBANTE: () => 'La nota de crédito ya no va dentro de la orden de pago: cargala como comprobante en Facturas y aplicala desde su ficha.',
  NC_SUPERA_TOTAL: d => {
    const total = dato(d, 'total'), aplicado = dato(d, 'aplicado')
    return total !== undefined
      ? `La nota de crédito es por ${money(total)} y se le quiere aplicar ${money(aplicado)}: no puede acreditar más que su total.`
      : 'La nota de crédito no puede acreditar más que su total.'
  },
  NC_NO_SE_PAGA: () => 'Una nota de crédito no se paga: baja la deuda de las facturas que acredita, o queda como crédito a favor.',
  NC_SUPERA_SALDO: d => {
    const saldo = dato(d, 'saldo_pagable')
    const monto = dato(d, 'monto') ?? dato(d, 'total')
    const id = dato(d, 'factura_id')
    return saldo !== undefined
      ? `A la factura${id !== undefined ? ` #${String(id)}` : ''} le quedan ${money(saldo)} y se le quiere acreditar ${money(monto)}. Bajá el monto (lo que sobra queda como crédito a favor).`
      : 'La nota de crédito acredita más de lo que le queda a la factura.'
  },
  NC_OTRO_PROVEEDOR: () => 'La nota de crédito y la factura tienen que ser del mismo proveedor.',
  NC_APLICACION_CONGELADA: d => {
    const estado = dato(d, 'estado')
    return estado !== undefined
      ? `La nota de crédito ya está ${String(estado) === 'anulada' ? 'anulada' : 'aprobada'}: lo que acredita no se cambia. El crédito que le quede se aplica con «Aplicar crédito».`
      : 'Esa aplicación de la nota de crédito ya está firme: no se cambia ni se borra.'
  },
  NC_NO_APROBADA: () => 'La nota de crédito todavía no está aprobada: el crédito se aplica recién cuando la aprueban.',
  NC_SIN_CREDITO: d => {
    const disp = dato(d, 'nc_disponible')
    return `La nota de crédito no tiene crédito disponible${disp !== undefined ? ` (${money(disp)})` : ''}: ya está aplicada entera.`
  },
  FACTURA_CON_NC: d => {
    const campos = lista(dato(d, 'campos'))
    if (campos) return `La factura tiene notas de crédito aplicadas: no se puede cambiar ${campos.replace('proveedor_id', 'el proveedor').replace('paga_cliente', '«la paga el cliente»')}.`
    return 'La factura tiene notas de crédito aplicadas: anulá esas NC primero.'
  },
  PAGADA_AL_CARGAR_SIN_PERMISO: () => 'Marcar una factura como ya pagada es registrar un pago: lo hace quien tiene permiso para registrar pagos. Cargala pendiente y que la pague quien corresponde.',
  PAGADA_AL_CARGAR_FORMA: () => 'Al cargar solo se puede marcar como ya pagada con tarjeta o efectivo. Para otra forma, cargala pendiente y que la registre quien paga.',

  // ── Órdenes de pago ──
  ORDEN_NO_EXISTE:          () => 'La orden de pago no existe.',
  ORDEN_YA_ANULADA:         () => 'La orden de pago ya estaba anulada.',
  ORDEN_INMUTABLE:          () => 'Una orden de pago no se edita: anulala y registrá una nueva.',
  ORDEN_NO_ES_TUYA_O_VIEJA: () => 'Solo podés anular órdenes que registraste vos y en el mismo día. Pedile a un administrador que la anule.',

  // Lo dispara, por ejemplo, el aviso de pago sobre una OP anulada.
  ORDEN_ANULADA: () => 'La orden está anulada.',

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

  // ── Concepto de compra (20260925) ──
  CONCEPTO_REQUERIDO:  () => 'Elegí el concepto de la compra (combustible, materiales…): es obligatorio.',
  CONCEPTO_INVALIDO:   () => 'Ese concepto no existe o está dado de baja: elegí otro de la lista.',
  CONCEPTO_DUPLICADO:  () => 'Ya hay un concepto con ese nombre (se comparan sin mayúsculas ni acentos).',
  CONCEPTO_ULTIMO_ACTIVO: () => 'Es el único concepto activo: activá otro antes de dar de baja este.',
  CONCEPTO_NO_EXISTE:  () => 'Ese concepto ya no existe: refrescá la lista.',
  CODIGO_NO_EDITABLE:  d => {
    const cod = dato(d, 'codigo')
    return `El código del proveedor${cod ? ` (${String(cod)})` : ''} lo pone el sistema y no se cambia.`
  },

  // ── Padrón de ARCA (20260925o) ──
  PADRON_CUIT_INEXISTENTE: () => 'ARCA no tiene a nadie con ese CUIT. Revisá el número.',
  PADRON_NO_ALCANZADO:     d => `ARCA no da la constancia de inscripción de ese CUIT${arcaDice(d)}. Cargá los datos a mano.`,
  PADRON_CLAVE_INACTIVA:   d => `Ese CUIT figura cancelado, inactivo o dado de baja en ARCA${arcaDice(d)}.`,
  PADRON_SIN_DATOS:        d => `ARCA no da la constancia de ese CUIT${arcaDice(d)}. Cargá los datos a mano.`,
  PADRON_SIN_AUTORIZACION: () => 'El ERP no está autorizado a consultar el padrón de ARCA. Avisá al administrador.',
  ARCA_NO_DISPONIBLE:      () => 'ARCA no está respondiendo. Probá de nuevo en unos minutos o cargá los datos a mano.',
  PROVEEDOR_SIN_CUIT:      () => 'El proveedor no tiene CUIT: cargáselo para poder traer sus datos de ARCA.',

  // ── Cheques (20260925) ──
  CHEQUE_ILEGIBLE: () => 'No se pudo leer el cheque en la foto. Sacala de nuevo con más luz y de frente, o cargá los datos a mano.',

  // ── Obras ──
  OBRA_ARCHIVADA: d => {
    const obra = dato(d, 'obra_cod')
    return `La obra${obra ? ` ${String(obra)}` : ''} está archivada: no se le pueden imputar facturas nuevas.`
  },
  OBRA_NO_EXISTE: () => 'La obra no existe.',

  // ── Varios ──
  MOTIVO_REQUERIDO:  () => 'Escribí el motivo.',
  ADJ_DUPLICADO:     d => {
    const id = dato(d, 'factura_id')
    return id !== undefined ? `Ese mismo archivo ya está cargado en la factura #${String(id)}.` : 'Ese archivo ya está adjunto acá.'
  },
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
  ADJUNTO_NO_GUARDADO:       () => 'La factura se cargó, pero el archivo no quedó adjunto: subilo desde la ficha.',
  LETRA_NO_COINCIDE_CONDICION: d => {
    const letra = d.letra ? ` ${String(d.letra)}` : ''
    // `condicion` puede venir como id de ARCA o ya como texto.
    const c = d.condicion ?? d.condicion_iva_id
    const cond = typeof c === 'number' || (typeof c === 'string' && /^\d+$/.test(c))
      ? (CONDICIONES_IVA[Number(c)] ?? String(c))
      : (c != null ? String(c) : '')
    return `Ojo: la factura${letra} no coincide con la condición frente al IVA del proveedor${cond ? ` («${cond}»)` : ''}. Revisá la letra o la ficha del proveedor.`
  },
}

export function mensajeAvisoPagos(aviso: { code: string; [k: string]: unknown }): string {
  const fn = AVISOS[aviso.code]
  return fn ? fn(aviso) : aviso.code
}

/**
 * Avisos de la LECTURA del comprobante (POST /facturas/leer). El backend ya
 * manda `mensaje` en castellano y con el dato concreto (qué factura, cuánto):
 * se usa ese. El texto local es el respaldo si llegara vacío.
 */
const AVISOS_LECTURA: Record<string, string> = {
  ES_NOTA_DE_CREDITO:        'Es una nota de crédito: se carga como NC y se indica a qué factura(s) acredita, o queda como crédito a favor.',
  NC_SIN_ASOCIADOS:          'La nota de crédito no dice a qué factura corresponde: elegí a cuál acredita o dejala como crédito a favor.',
  NC_ASOCIADO_NO_ENCONTRADO: 'La nota de crédito menciona una factura que no está cargada para este proveedor: cargala primero o dejala como crédito a favor.',
  NC_ASOCIADO_SIN_SALDO:     'La factura que menciona la nota de crédito ya no tiene saldo para acreditar: lo que sobre queda como crédito a favor.',
  NC_SOBRANTE:               'La nota de crédito es por más de lo que les queda a sus facturas: el sobrante queda como crédito a favor del proveedor.',
}

export function mensajeAvisoLectura(a: { codigo?: string; code?: string; mensaje?: string | null }): string {
  const codigo = a.codigo ?? a.code ?? ''
  if (a.mensaje?.trim()) return a.mensaje.trim()
  if (AVISOS_LECTURA[codigo]) return AVISOS_LECTURA[codigo]
  // Los avisos secos (`{ code, … }`) que también viajan en la lectura.
  if (AVISOS[codigo]) return AVISOS[codigo](Object.fromEntries(Object.entries(a)))
  return codigo
}

/** Código del aviso, venga como `codigo` (lectura) o `code` (aviso seco). */
export function codigoAviso(a: { codigo?: string; code?: string }): string {
  return a.codigo ?? a.code ?? ''
}
