// Los códigos del backend de Pedidos y Stock, en castellano (2026-09-24).
//
// Hasta acá cada pantalla traducía los suyos a mano y el resto caía al código
// crudo: `toast(e.message)` mostraba `NO_APRUEBA_SU_PROPIA_PROPUESTA` o
// `ITEM_CERTIFICADO` (revisión del 23/09). Mismo patrón que `pagos.errores.ts`:
// cada mensaje dice QUÉ pasó y, si hay, QUÉ hacer.

interface CuerpoError {
  error?:  string
  detail?: unknown
}

/**
 * `apiPost`/`apiPatch` tiran `HttpError` con el body JSON en `.body` y el
 * código en `.message`. Se lee de `body` para quedarse con el `detail`.
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

const MENSAJES: Record<string, string> = {
  // Congelados: cobrado o certificado.
  ITEM_COBRADO:           'Ya está cobrado al cliente: su precio y su cantidad están congelados. Para tocarlo, sacalo del pago primero (Cuenta corriente).',
  ITEM_CERTIFICADO:       'Está en un certificado al cliente: su precio y su cantidad están congelados. Para tocarlo hay que anular el certificado.',
  MCC_COBRADO:            'Ya está cobrado al cliente: no se puede cambiar ni borrar. Sacalo del pago primero (Cuenta corriente).',
  MCC_CERTIFICADO:        'Está en un certificado al cliente: no se puede cambiar ni borrar. Hay que anular el certificado primero.',
  SOLICITUD_TIENE_COBROS: 'El pedido tiene materiales ya cobrados al cliente. Eliminá primero ese pago en Cuenta corriente.',
  SOLICITUD_TIENE_CERTIFICADOS: 'El pedido tiene materiales en un certificado al cliente. Anulá el certificado primero.',
  SOLICITUD_TIENE_EN_PROVEEDOR: 'El pedido tiene compras que siguen en el galpón del proveedor. Retiralas o resolvelas antes de eliminarlo.',
  SOLICITUD_TIENE_REMITOS: 'El pedido tiene remitos de envío emitidos: no se puede eliminar.',
  SOLICITUD_TIENE_ENVIOS:  'El pedido tiene renglones ya enviados a la obra. Deshacé el envío en cada renglón o usá Devoluciones.',
  SOLICITUD_TIENE_RETIROS: 'El pedido tiene retiros de stock en proveedor: no se puede eliminar.',
  // Permisos.
  SIN_PERMISO:                'No tenés permiso para hacer esto.',
  SIN_PERMISO_CARGAR_PRECIOS: 'Tocar precios de la cuenta del cliente pide el permiso «cargar precios» (lo tiene el dueño). Podés proponer el precio.',
  SIN_PERMISO_CATALOGO:       'Cambiar el precio del catálogo pide el permiso «cargar precios».',
  OBRA_SIN_ACCESO:            'No tenés esa obra asignada.',
  // Precios propuestos.
  NO_APRUEBA_SU_PROPIA_PROPUESTA: 'No podés aprobar un precio que propusiste vos: lo aprueba otra persona.',
  SIN_PRECIO_PROPUESTO:           'Ese renglón ya no tiene un precio propuesto (lo aprobó o descartó otra persona). Recargá.',
  // Renglones.
  ITEM_NO_EXISTE:        'El renglón ya no existe (lo borró otra persona). Recargá.',
  ITEM_INEXISTENTE:      'El renglón ya no existe (lo borró otra persona). Recargá.',
  ITEM_NO_DISPONIBLE:    'El renglón cambió mientras tanto. Recargá la página.',
  ITEM_YA_PROCESADO:     'El renglón ya se resolvió. Recargá la página.',
  ITEM_YA_REGISTRADO:    'El renglón ya se resolvió. Recargá la página.',
  ITEM_NO_RESUELTO:      'El renglón todavía no se compró ni se despachó.',
  ITEM_PAGO_DIRECTO:     'Lo pagó el cliente directo al proveedor: no es deuda y no se imputa.',
  ITEM_ES_EPP:           'Es EPP: es gasto de CADINC, no se le cobra al cliente.',
  ITEM_INVALIDO:         'Algún renglón ya no se puede imputar (cobrado, certificado, gasto de CADINC o sin precio). Recargá.',
  ITEM_NO_CERTIFICABLE:  'Algún renglón ya no se puede certificar (cambió mientras tanto). Cerrá y volvé a abrir.',
  ES_HERRAMIENTA:        'Es una herramienta: va y vuelve del pañol, no se devuelve ni se cobra.',
  CANTIDAD_INVALIDA:     'La cantidad tiene que ser mayor a cero.',
  CANTIDAD_MAYOR_A_LA_DESPACHADA: 'Querés devolver más de lo que salió (contando lo ya devuelto).',
  PRECIO_INVALIDO:       'El precio no es válido.',
  STOCK_INSUFICIENTE:    'No hay stock suficiente en el depósito.',
  DESPACHO_A_DEPOSITO:   'No se despacha del depósito al mismo depósito.',
  PROVEEDOR_INVALIDO:    'El proveedor no es válido.',
  FACTURA_INVALIDA:      'La factura no es válida.',
  MATERIAL_INEXISTENTE:  'La ficha del catálogo ya no existe.',
  COMPRA_SIN_FICHA:      'Hay compras sin ficha del catálogo: vinculalas antes, o elegí devolverlas al proveedor.',
  ELEGIR_DESTINO_COMPRAS:'Hay compras sin enviar: elegí si quedan en el depósito o vuelven al proveedor.',
  ITEM_DE_OTRA_OBRA:     'Algún renglón es de un pedido de otra obra: cada retiro va a la obra de su pedido.',
  CANTIDAD_EXCEDE_PENDIENTE: 'Querés retirar más de lo que queda en el proveedor.',
  PAGADO_POR_INVALIDO:   'Quién pagó tiene que ser CADINC o el cliente.',
  // Obras y cobros.
  OBRA_ARCHIVADA:          'La obra está archivada.',
  OBRA_ES_DEPOSITO:        'El depósito no tiene cuenta de cliente.',
  OBRA_LLAVE_EN_MANO:      'La obra es llave en mano: los materiales son de CADINC.',
  OBRA_POR_ADMINISTRACION: 'La obra es por administración: no aplica acá.',
  CERTIFICADO_CON_COBROS:  'El certificado tiene pagos imputados: eliminá esos pagos primero.',
  CERTIFICADO_ANULADO:     'El certificado está anulado.',
  MONTO_INSUFICIENTE:      'El monto no alcanza para cubrir lo que se imputa.',
  COMPROBANTE_DUPLICADO:   'Ese comprobante ya se cargó en otro pago.',
  MANO_DE_OBRA_INVALIDA:   'La mano de obra tiene que ser un número mayor o igual a cero.',
  SIN_RENGLONES:           'No hay renglones elegidos.',
  DB_ERROR:                'Error de la base de datos. Si se repite, avisá.',
}

/** El mensaje para mostrar. `fallback` si el código no está en la lista. */
export function mensajeErrorCertificaciones(e: unknown, fallback = 'No se pudo completar la operación'): string {
  const { error } = leerCuerpo(e)
  if (!error) return fallback
  if (MENSAJES[error]) return MENSAJES[error]
  // Un código seco que no conocemos: mejor el fallback que el código crudo.
  if (/^[A-Z0-9_]+$/.test(error)) return `${fallback} (${error})`
  return error
}

/** El código, para las pantallas que deciden algo según cuál fue. */
export function codigoErrorCertificaciones(e: unknown): string | null {
  return leerCuerpo(e).error ?? null
}
