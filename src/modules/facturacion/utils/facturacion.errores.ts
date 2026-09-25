// Los códigos del backend y de las RPC `ventas_*` (20260924c), en castellano.
//
// En un módulo fiscal importa todavía más que en Pagos: la persona tiene que
// saber si la factura SALIÓ o NO salió. Cada mensaje dice qué pasó y qué hacer.
//
// El `HttpError` del client trae `{ message: code, body: { error, detail } }`:
// se lee `body.error` (el código) y `body.detail` (el dato para el mensaje).

import { fmtFecha, fmtM } from './facturacion.utils'

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

/** « (CC-026, CC-031)» con la obra o las obras del detalle (factura u obras del cliente). */
function obrasDe(d: unknown): string {
  const una = dato(d, 'obra_cod')
  const varias = dato(d, 'obra_cods')
  const cods = Array.isArray(varias) ? varias.map(String) : una ? [String(una)] : []
  return cods.length ? ` (${cods.join(', ')})` : ''
}

/** ISO → "HH:MM" en hora argentina. */
function horaAR(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })
}

/** « (ARCA dice: …)» con los errores textuales del padrón, si vinieron. */
function arcaDice(d: unknown): string {
  const errs = dato(d, 'errores')
  const txt = Array.isArray(errs) ? errs.map(String).filter(x => !x.startsWith('(')).join(' / ') : ''
  return txt ? ` (ARCA dice: ${txt})` : ''
}

const CAMPO_RENGLON: Record<string, string> = {
  descripcion: 'la descripción', cantidad: 'la cantidad', precio_unit: 'el precio', alicuota_id: 'la alícuota',
}

const CAMPO_MEDIO: Record<string, string> = {
  forma: 'la forma', importe: 'el importe', cuenta_bancaria_id: 'la cuenta de CADINC', cheque_numero: 'el número del cheque',
  cheque_banco: 'el banco del cheque', cheque_librador: 'el librador del cheque', cheque_fecha_cobro: 'la fecha de cobro del cheque',
  cheque_librador_cuit: 'el CUIT del librador (11 dígitos)',
}

const CAMPO_GASTO: Record<string, string> = {
  concepto_id: 'el concepto (tiene que estar activo)', importe: 'el importe', obs: 'el detalle (hasta 300 caracteres)',
}

/** Qué dice un aviso de «Cargar liquidación» sobre un comprobante o un cheque (20260930k). */
export const AVISO_LIQUIDACION: Record<string, string> = {
  NO_ENCONTRADO:        'No está cargado en Ventas: importalo de ARCA (Saldos iniciales) o dejá ese importe a cuenta.',
  YA_COBRADO:           'Ya figura cobrado (saldo 0): no se le imputa nada y ese importe queda a cuenta.',
  SALDO_MENOR:          'Tiene menos saldo que lo que liquida: se imputa el saldo y la diferencia queda a cuenta.',
  IMPORTE_DISTINTO:     'El total cargado en Ventas no coincide con el de la liquidación.',
  YA_EN_OTRO_COBRO:     'Ese cheque ya está en otro cobro vigente: el cobro va a rebotar (CHEQUE_DUPLICADO).',
  EN_CARTERA:           'Ya está en la cartera de cheques (lo cargó Logística): no se duplica, se vincula a este cobro.',
  SIN_FECHA:            'No se leyó la fecha de cobro del cheque.',
  LIBRADOR_DESCONOCIDO: 'No se sabe quién libró el cheque: completalo.',
}

const CAMPO_RETENCION: Record<string, string> = {
  tipo: 'el tipo', importe: 'el importe', fecha: 'la fecha (no puede ser futura)', adjunto: 'el certificado adjunto',
  adjunto_hash: 'el certificado adjunto', certificado_numero: 'el número de certificado',
}

const MENSAJES: Record<string, (d: unknown) => string> = {
  // ── Líquido de la CVLP (20260927d) ──
  NO_ES_CVLP:       () => 'El líquido solo se carga en una cuenta de venta y líquido producto (CVLP 060/061).',
  LIQUIDO_INVALIDO: () => 'El líquido tiene que ser mayor a cero y no puede superar el total del comprobante.',
  // ── Permisos ──
  SIN_PERMISO:           () => 'No tenés permiso para esta acción.',
  SIN_TAB:               () => 'No tenés acceso a esta pantalla de Facturación.',
  SIN_PERMISO_EMITIR:    d => dato(d, 'flag') === 'emitir_notas_credito'
    ? 'No tenés permiso para emitir notas de crédito.'
    : 'No tenés permiso para emitir facturas.',
  SIN_PERMISO_REGISTRAR: () => 'No tenés permiso para registrar facturas en Finnegans.',
  FORZAR_SOLO_ADMIN:     () => 'Solo un administrador puede forzar este comprobante.',
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
  TIPO_NO_HABILITADO:     () => 'Ese tipo de comprobante todavía no está habilitado (se emiten Factura A/B, Nota de crédito A/B y FCE MiPyME A).',
  TIPO_INVALIDO:          () => 'Tipo de comprobante inválido.',
  AMBIENTE_INVALIDO:      () => 'Ambiente de ARCA inválido.',
  AMBIENTE_NO_COINCIDE:   () => 'El comprobante es de otro ambiente de ARCA (homologación vs. producción).',
  PTO_VTA_INVALIDO:       () => 'Punto de venta inválido en la configuración del servidor.',
  CLIENTE_REQUERIDO:      () => 'Elegí el cliente.',
  CLIENTE_NO_EXISTE:      () => 'El cliente no existe.',
  CLIENTE_INACTIVO:       () => 'El cliente está dado de baja. Reactivalo en Clientes para facturarle.',
  LETRA_INCOMPATIBLE:     d => {
    const pide = dato(d, 'letra'), cli = dato(d, 'letra_cliente')
    if (d && typeof d === 'object' && 'letra_cliente' in d && cli == null) {
      return 'A este cliente no se le puede hacer ni factura A ni B: un Responsable Inscripto o Monotributista necesita CUIT. Corregí su documento o su condición IVA en Clientes.'
    }
    if (pide === 'A') return `A este cliente le corresponde factura ${String(cli ?? 'B')}: la A es solo para Responsable Inscripto o Monotributista con CUIT.`
    if (pide === 'B') return `A este cliente le corresponde factura ${String(cli ?? 'A')}: la B no es para Responsable Inscripto ni Monotributista.`
    return 'La letra del comprobante no corresponde a la condición IVA del cliente.'
  },
  CF_REQUIERE_IDENTIFICACION: d => `Desde ${fmtM(Number(dato(d, 'tope') ?? 10_000_000))} el consumidor final tiene que estar identificado (RG 5700). Cargale DNI o CUIT al cliente en Clientes.`,
  PRODUCTO_INVALIDO:      d => dato(d, 'mensaje') ? `Producto: ${String(dato(d, 'mensaje'))}.` : 'Ese producto no existe o tiene un dato inválido: revisalo en Ventas › Configuración.',
  PRODUCTO_INACTIVO:      d => `El producto${dato(d, 'producto') ? ` «${String(dato(d, 'producto'))}»` : ''} está dado de baja: elegí otro o reactivalo en Ventas › Configuración.`,
  PRODUCTO_DUPLICADO:     () => 'Ya hay un producto con ese nombre (sin contar mayúsculas ni tildes).',
  PRODUCTO_NO_EXISTE:     () => 'Ese producto no existe (¿lo borraron?). Refrescá la pantalla.',
  ULTIMO_PRODUCTO_ACTIVO: () => 'Es el único producto activo: sin ninguno no se puede facturar. Activá otro primero.',
  // ── Puntos de venta (20260929d) ──
  PTO_VTA_NO_HABILITADO:  d => `El punto de venta ${dato(d, 'pto_vta') != null ? String(dato(d, 'pto_vta')).padStart(5, '0') + ' ' : ''}no está habilitado: elegí otro o activalo en Ventas › Configuración.`,
  PV_INVALIDO:            () => 'Revisá los datos del punto de venta.',
  PV_NO_EXISTE:           () => 'Ese punto de venta no existe. Refrescá la pantalla.',
  PV_DUPLICADO:           () => 'Ese punto de venta ya está cargado (si está dado de baja, reactivalo).',
  PV_NUMERO_NO_EDITABLE:  () => 'El número de un punto de venta no se cambia: cargá uno nuevo y dale de baja a este.',
  PV_POR_DEFECTO:         () => 'Es el punto de venta por defecto: marcá otro como por defecto antes de darlo de baja.',
  PV_INACTIVO:            () => 'Un punto de venta dado de baja no puede ser el por defecto: reactivalo primero.',
  PV_NO_VERIFICADO:       d => `No se pudo confirmar con ARCA que exista${dato(d, 'motivo') ? ` (${String(dato(d, 'motivo'))})` : ''}.`,
  PV_NO_EXISTE_EN_ARCA:   d => {
    const disp = dato(d, 'disponibles')
    return `ARCA no tiene ese punto de venta habilitado para webservice.${Array.isArray(disp) && disp.length ? ` Los que tiene: ${disp.join(', ')}.` : ''}`
  },
  PV_NO_ES_WEBSERVICE:    () => 'En ARCA ese punto de venta no es de «Factura electrónica - webservice» (CAE): no sirve para emitir desde el ERP.',
  PV_BLOQUEADO:           () => 'ARCA tiene ese punto de venta bloqueado.',
  PV_DADO_DE_BAJA:        () => 'ARCA tiene ese punto de venta dado de baja.',
  PARAMETRO_INVALIDO:     d => dato(d, 'mensaje') ? `Monto de ARCA: ${String(dato(d, 'mensaje'))}.` : 'Revisá el valor y la fecha.',
  PARAMETRO_DUPLICADO:    d => `Ya hay un valor vigente desde el ${fmtFecha(String(dato(d, 'vigente_desde') ?? ''))}: elegí otra fecha (si es futuro, borralo y cargalo de nuevo).`,
  PARAMETRO_RETROACTIVO:  d => `Hay ${Number(dato(d, 'facturas') ?? 0)} factura(s) autorizadas desde el ${fmtFecha(String(dato(d, 'vigente_desde') ?? ''))}. Esas no cambian (ya tienen CAE); el valor nuevo rige para los borradores con fecha desde ese día.`,
  PARAMETRO_YA_VIGENTE:   () => 'Esa vigencia ya empezó: no se borra. Para cambiar el valor, cargá uno nuevo desde otra fecha.',
  PARAMETRO_ULTIMO:       () => 'Es el único valor de ese monto: no se puede borrar.',
  PARAMETRO_NO_EXISTE:    () => 'Esa vigencia no existe (¿la borraron?). Refrescá la pantalla.',
  // ── Tipos de retención y configuración (20260929f/g) ──
  RETENCION_TIPO_INVALIDA:    d => {
    const c = dato(d, 'campo'), m = dato(d, 'mensaje')
    const que = c === 'clave' ? 'la clave' : c === 'corto' ? 'el nombre corto' : c === 'nombre' ? 'el nombre'
      : c === 'impuesto' ? 'el impuesto' : c === 'jurisdiccion_default_id' ? 'la jurisdicción' : 'los datos'
    return `Tipo de retención: revisá ${que}${typeof m === 'string' ? ` (${m})` : ''}.`
  },
  RETENCION_TIPO_DUPLICADO:   d => dato(d, 'campo') === 'corto'
    ? 'Ya hay un tipo de retención con ese nombre corto.'
    : 'Ya hay un tipo de retención con esa clave.',
  RETENCION_TIPO_SISTEMA:     () => 'Es uno de los tipos de siempre: su clave y su impuesto no cambian (sí el nombre, la jurisdicción y si está activo).',
  IMPUESTO_IVA_RESERVADO:     () => 'La retención de IVA es una sola (la leen el Libro IVA y el asiento mensual): un tipo nuevo no puede ser de IVA.',
  RETENCION_TIPO_POR_DEFECTO: () => 'Es el tipo que propone el cobro: elegí otro como «por defecto» antes de darlo de baja.',
  RETENCION_TIPO_NO_EXISTE:   () => 'Ese tipo de retención no existe. Refrescá la pantalla.',
  CONFIG_INVALIDA:            d => {
    const clave = dato(d, 'clave')
    const motivo = dato(d, 'motivo')
    if (clave === 'retencion_tipo_default') return 'Ese tipo de retención no existe o está dado de baja.'
    if (clave === 'provincia_default') return 'Elegí una provincia de la lista.'
    if (clave === 'leyenda_fce') return 'La leyenda de la FCE va de 50 a 1000 caracteres (o vacía para usar la de ARCA).'
    if (clave === 'condicion_pago_default') return motivo === 'texto_vacio' || !motivo
      ? 'La condición de pago no puede quedar vacía (hasta 100 caracteres).' : 'La condición de pago va hasta 100 caracteres.'
    if (clave === 'unidad_default') return 'La unidad no puede quedar vacía y va hasta 50 caracteres.'
    return 'Ese valor de configuración no es válido.'
  },
  JURISDICCION_NO_EXISTE:     () => 'La jurisdicción elegida ya no existe: refrescá la pantalla y elegila de nuevo.',
  PERIODO_REQUERIDO:      () => 'Este producto pide el período facturado: completá desde y hasta.',
  PERIODO_INVALIDO:       () => 'El período facturado termina antes de empezar.',
  OBRA_REQUERIDA:         () => 'Este producto necesita la obra: es su centro de costo.',
  OBRA_NO_EXISTE:         d => `No existe la obra${obrasDe(d)}.`,
  OBRA_INTERNA:           d => `No se factura a una obra interna de CADINC${obrasDe(d)}.`,
  OBRA_DEPOSITO:          d => `El depósito no se factura${obrasDe(d)}.`,
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
  NC_TIPO_NO_COINCIDE:      () => 'La nota de crédito tiene que ser del mismo tipo que la factura: una FCE MiPyME se corrige con NC FCE; una Factura A, con NC A.',
  NC_OTRO_CLIENTE:          () => 'La nota de crédito tiene que ser al mismo cliente que la factura.',
  NC_SUPERA_FACTURA:        d => {
    const saldo = dato(d, 'saldo'), total = dato(d, 'total')
    return saldo !== undefined
      ? `La nota de crédito (${money(total)}) supera lo que queda de la factura (${money(saldo)}).`
      : 'La nota de crédito supera lo que queda de la factura.'
  },

  // ── FCE MiPyME (fase 6) ──
  CORRESPONDE_FCE: d => {
    const monto = dato(d, 'monto_desde') ?? dato(d, 'minimo')
    return `A este cliente le corresponde Factura de Crédito MiPyME: ARCA dice que está obligado a recibirla desde ${money(monto)} y este comprobante lo supera. Elegí «Factura de Crédito MiPyME».`
  },
  NO_CORRESPONDE_FCE: d => {
    const motivo = dato(d, 'motivo')
    if (motivo === 'monto_minimo') return `La Factura de Crédito MiPyME es desde ${money(dato(d, 'minimo') ?? 5_549_862)}: por menos va Factura A común.`
    if (motivo === 'no_obligado') return 'Según ARCA este cliente no está obligado a recibir Factura de Crédito MiPyME: va Factura A común.'
    return `Por este importe no corresponde Factura de Crédito MiPyME a este cliente (su monto desde es ${money(dato(d, 'monto_desde'))}): va Factura A común.`
  },
  FCE_SIN_CUENTA:           () => 'Elegí la cuenta bancaria que va en la Factura de Crédito (CBU y alias). Si no hay ninguna, cargala en Clientes › Cuentas para FCE.',
  FCE_TRANSMISION_INVALIDA: () => 'La opción de transferencia tiene que ser SCA o ADC.',
  FCE_VTO_PAGO_INVALIDO:    () => 'El vencimiento del pago no puede ser anterior a la fecha de la factura.',
  NC_ANULACION_INVALIDA:    () => 'Indicá si la nota de crédito anula la factura (S o N).',
  CBU_INVALIDO:             () => 'El CBU no es válido: tiene que tener 22 dígitos y sus dígitos verificadores.',
  ALIAS_INVALIDO:           () => 'El alias tiene que tener de 6 a 20 caracteres: letras, números, punto o guion.',
  CUENTA_INVALIDA:          () => 'Revisá los datos de la cuenta.',
  CUENTA_NO_EXISTE:         () => 'La cuenta bancaria no existe o está dada de baja.',
  CUENTA_DUPLICADA:         () => 'Ya hay una cuenta activa con ese CBU.',
  CUENTA_DEFAULT_DUPLICADA: () => 'Ya hay otra cuenta marcada por defecto. Probá de nuevo.',
  CUENTA_DEFAULT_REQUERIDA: () => 'Esta es la cuenta por defecto: marcá otra como predeterminada antes de sacarle la marca o darla de baja.',
  CUENTA_INACTIVA:          () => 'La cuenta está dada de baja: reactivala antes de marcarla por defecto.',

  // ── Padrón de ARCA (fase 7) ──
  PADRON_CUIT_INEXISTENTE: () => 'ARCA no tiene a nadie con ese CUIT. Revisá el número.',
  PADRON_NO_ALCANZADO:     d => `ARCA no da la constancia de inscripción de ese CUIT${arcaDice(d)}. Cargá los datos a mano.`,
  PADRON_CLAVE_INACTIVA:   d => `Ese CUIT figura cancelado, inactivo o dado de baja en ARCA${arcaDice(d)}.`,
  PADRON_SIN_DATOS:        d => `ARCA no da la constancia de ese CUIT${arcaDice(d)}. Cargá los datos a mano.`,
  PADRON_SIN_AUTORIZACION: () => 'El ERP no está autorizado a consultar el padrón de ARCA. Avisá al administrador.',
  PADRON_SOLO_CUIT:        () => 'Solo se puede traer de ARCA un cliente con CUIT o CUIL.',

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
  CLIENTE_SIN_LETRA:      () => 'Con esa condición IVA hace falta CUIT: un Responsable Inscripto o Monotributista solo puede recibir factura A, y la A exige CUIT.',

  // ── Cobranzas (20260924k…o) ──
  SIN_PERMISO_COBROS:       () => 'No tenés permiso para registrar cobros, imputar ni compensar (hace falta «Registrar cobros»).',
  SIN_PERMISO_ANULAR:       () => 'No tenés permiso para anular cobros ni imputaciones (hace falta «Anular cobros»).',
  FECHA_FUTURA:             d => `La fecha no puede ser posterior a hoy${dato(d, 'hoy') ? ` (${fmtFecha(String(dato(d, 'hoy')))})` : ''}.`,
  COBRO_TOTAL_CERO:         () => 'El cobro tiene que tener al menos un medio o una retención con importe.',
  MEDIO_INVALIDO:           d => {
    const i = Number(dato(d, 'indice'))
    const campo = CAMPO_MEDIO[String(dato(d, 'campo') ?? '')] ?? 'un dato'
    return `Revisá ${campo} del medio de cobro${Number.isFinite(i) ? ` ${i}` : ''}.`
  },
  CHEQUE_DUPLICADO:         d => `El cheque N° ${String(dato(d, 'cheque_numero') ?? '')} de ese banco ya está cargado en otro cobro${dato(d, 'cobro_id') ? ` (#${String(dato(d, 'cobro_id'))})` : ''}.`,
  RETENCION_INVALIDA:       d => {
    const i = Number(dato(d, 'indice'))
    const campo = CAMPO_RETENCION[String(dato(d, 'campo') ?? '')] ?? 'un dato'
    return `Revisá ${campo} de la retención${Number.isFinite(i) ? ` ${i}` : ''}.`
  },
  // ── Gastos descontados y Cargar liquidación (20260930k) ──
  GASTO_INVALIDO:           d => {
    const i = Number(dato(d, 'indice'))
    const campo = CAMPO_GASTO[String(dato(d, 'campo') ?? '')] ?? 'un dato'
    return `Revisá ${campo} del gasto descontado${Number.isFinite(i) && i > 0 ? ` ${i}` : ''}.`
  },
  LIQUIDACION_INVALIDA:     () => 'El número de liquidación solo puede tener letras, números, punto, barra, guion y espacios (hasta 30).',
  LIQUIDACION_DUPLICADA:    d => `La liquidación N° ${String(dato(d, 'liquidacion_numero') ?? '')} de este cliente ya está cargada${dato(d, 'numero_fmt') ? ` en el ${String(dato(d, 'numero_fmt'))}` : dato(d, 'cobro_id') ? ` (cobro #${String(dato(d, 'cobro_id'))})` : ''}. Para cargarla de nuevo, anulá ese cobro.`,
  LIQUIDACION_ILEGIBLE:     d => dato(d, 'motivo') === 'SIN_API_KEY'
    ? 'No se reconoció el formato de la liquidación y la lectura con IA no está configurada en el servidor. Cargá el cobro a mano.'
    : `No se pudo leer la liquidación${dato(d, 'motivo') ? ` (${String(dato(d, 'motivo'))})` : ''}. Probá con el PDF original o cargá el cobro a mano.`,
  // «Soltá acá los comprobantes del cobro» (2026-09-25)
  COMPROBANTE_ILEGIBLE:     d => dato(d, 'motivo') === 'SIN_API_KEY'
    ? 'La lectura de comprobantes con IA no está configurada en el servidor: cargá el cobro a mano.'
    : `No se pudo leer este archivo como comprobante de pago${dato(d, 'motivo') ? ` (${String(dato(d, 'motivo'))})` : ''}. Probá con una foto más nítida o el PDF original.`,
  LIQUIDACION_SIN_CLIENTE:  d => `El CUIT de la liquidación${dato(d, 'cuit') ? ` (${String(dato(d, 'cuit'))})` : ''} no es de ningún cliente de Ventas${dato(d, 'nombre') ? ` (${String(dato(d, 'nombre'))})` : ''}. Elegí el cliente.`,
  GASTO_CONCEPTO_INVALIDO:  d => {
    const c = dato(d, 'campo'), m = dato(d, 'mensaje')
    const que = c === 'nombre' ? 'el nombre' : c === 'alias' ? 'los sinónimos (3 a 60 caracteres cada uno)' : c === 'orden' ? 'el orden' : 'los datos'
    return `Concepto de gasto: revisá ${que}${typeof m === 'string' ? ` (${m})` : ''}.`
  },
  GASTO_CONCEPTO_DUPLICADO: d => dato(d, 'campo') === 'alias'
    ? `Ese sinónimo ya es de otro concepto activo${Array.isArray(dato(d, 'alias')) ? ` («${(dato(d, 'alias') as unknown[]).join('», «')}»)` : ''}: la liquidación no sabría cuál elegir.`
    : 'Ya hay un concepto con ese nombre.',
  GASTO_CONCEPTO_NO_EXISTE: () => 'Ese concepto no existe. Refrescá la pantalla.',
  RETENCION_DUPLICADA:      d => `El certificado ${String(dato(d, 'certificado_numero') ?? '')} ya está cargado en otro cobro${dato(d, 'cobro_id') ? ` (#${String(dato(d, 'cobro_id'))})` : ''}.`,
  RETENCION_ADJUNTO_DUPLICADO: () => 'Ese archivo ya está adjunto a una retención de otro cobro vigente. ¿Es el certificado correcto?',
  SIN_IMPUTACIONES:         () => 'Aplicá algún importe a al menos un comprobante.',
  IMPUTACION_INVALIDA:      () => 'Cada imputación va a UNA factura (o comprobante externo) con importe mayor a cero.',
  ORIGEN_INVALIDO:          () => 'El crédito a aplicar no es válido (un cobro, una NC del sistema o una NC externa).',
  ORIGEN_NO_EXISTE:         () => 'El crédito a aplicar ya no existe.',
  COBRO_NO_EXISTE:          () => 'El cobro no existe.',
  COBRO_ANULADO:            d => dato(d, 'adjunto_id') !== undefined
    ? 'El cobro está anulado: sus adjuntos quedan como respaldo y no se borran.'
    : 'El cobro está anulado: no se le puede aplicar nada.',
  // Documentación del cliente en el cobro (20260924q)
  ADJUNTO_DUPLICADO:        d => dato(d, 'mismo_que_indice') !== undefined
    ? 'Elegiste el mismo archivo dos veces.'
    : 'Ese archivo ya está adjunto a este cobro.',
  ADJUNTO_NO_EXISTE:        () => 'El adjunto ya no existe. Actualizá la ficha.',
  ADJUNTO_INMUTABLE:        () => 'El adjunto no se puede cambiar de cobro ni de archivo: borralo y subilo de nuevo.',
  ARCHIVO_NO_SUBIDO:        () => 'El archivo no llegó a subirse. Volvé a elegirlo.',
  PATH_INVALIDO:            () => 'El archivo no es válido. Volvé a elegirlo.',
  MIME_NO_PERMITIDO:        () => 'Solo PDF o imagen (JPG, PNG, WEBP, HEIC).',
  TAMANO_INVALIDO:          () => 'El archivo supera los 10 MB.',
  COBRO_YA_ANULADO:         () => 'El cobro ya estaba anulado.',
  COBRO_NO_BORRABLE:        () => 'Un cobro no se borra: se anula (queda en el historial).',
  DESTINO_NO_EXISTE:        () => 'Uno de los comprobantes a cancelar ya no existe. Actualizá la lista.',
  DESTINO_INVALIDO:         d => {
    const m = dato(d, 'motivo')
    if (m === 'nc') return 'Una nota de crédito no se cancela con un cobro: se compensa contra una factura.'
    if (m === 'no_autorizada') return 'Solo se cancelan facturas autorizadas por ARCA.'
    return 'Uno de los comprobantes no se puede cancelar.'
  },
  OTRO_CLIENTE:             () => 'Hay un comprobante de otro cliente: todo tiene que ser del mismo.',
  NC_A_SU_FACTURA:          () => 'Esa NC ya baja sola su propia factura: la compensación es para aplicar lo que sobra contra OTRA factura.',
  IMPUTACION_SUPERA_SALDO:  d => {
    const cbte = dato(d, 'comprobante') ?? dato(d, 'destino')
    return `Lo aplicado${cbte ? ` a ${String(cbte)}` : ''} (${money(dato(d, 'importe'))}) supera su saldo (${money(dato(d, 'saldo'))}). Actualizá: alguien pudo haberla cobrado recién.`
  },
  IMPUTACION_SUPERA_COBRO:  d => `Lo aplicado supera lo que queda del cobro${dato(d, 'disponible') !== undefined ? ` (${money(dato(d, 'disponible'))})` : ''}.`,
  IMPUTACION_SUPERA_CREDITO: d => `Lo aplicado supera el crédito libre de la nota de crédito${dato(d, 'disponible') !== undefined ? ` (${money(dato(d, 'disponible'))})` : ''}.`,
  MOTIVO_REQUERIDO:         () => 'Escribí el motivo.',
  IMPUTACION_NO_EXISTE:     () => 'La imputación no existe.',
  IMPUTACION_YA_ANULADA:    () => 'La imputación ya estaba anulada.',
  VENCE_NO_APLICA_A_NC:     () => 'Una nota de crédito no tiene vencimiento de cobro.',
  VENCIMIENTO_NO_EDITABLE:  () => 'El vencimiento de este comprobante no se puede cambiar en su estado.',
  VENCE_ES_EL_DE_LA_FCE:    () => 'En la Factura de Crédito MiPyME el vencimiento es el del pago informado a ARCA: no se cambia acá.',
  VENCE_ANTERIOR_A_FECHA:   () => 'El vencimiento no puede ser anterior a la fecha del comprobante.',
  ACCION_INVALIDA:          () => 'Acción inválida.',
  SIN_IDS:                  () => 'Elegí al menos un comprobante.',
  EXTERNO_NO_EXISTE:        () => 'Uno de los comprobantes ya no existe. Actualizá la lista.',
  EXTERNO_CON_IMPUTACIONES: d => `El comprobante tiene cobros o compensaciones aplicados${dato(d, 'imputado') !== undefined ? ` (${money(dato(d, 'imputado'))})` : ''}: anulalos antes de borrarlo o de cambiarle el cliente o el tipo.`,
  EXTERNO_SALDO_MENOR_QUE_IMPUTADO: d => `El saldo inicial no puede quedar por debajo de lo ya aplicado (${money(dato(d, 'imputado'))}).`,
  EXTERNO_DUPLICA_FACTURA_ERP: () => 'Ese comprobante ya fue emitido por el sistema: no se carga como saldo inicial.',
  EXTERNO_DUPLICADO:        () => 'Ese comprobante (tipo, punto de venta y número) ya está cargado.',
  SIN_FILAS:                () => 'El archivo no tiene comprobantes para importar.',
  DEMASIADAS_FILAS:         d => `Son demasiadas filas de una vez: el máximo es ${String(dato(d, 'max') ?? 2000)}. Partí el archivo.`,
  IMPORTACION_CON_ERRORES:  d => {
    const errs = dato(d, 'errores')
    const n = Array.isArray(errs) ? errs.length : 0
    return `No se importó nada: ${n || 'hay'} fila${n === 1 ? '' : 's'} con error. Corregilas o sacalas del archivo y volvé a probar.`
  },

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

/** Error de UNA fila del importador de ARCA (`ventas_importar_externos`), en castellano. */
export function mensajeErrorFilaImport(code: string | null, detalle?: unknown): string {
  switch (code) {
    case null: case undefined: return ''
    case 'TIPO_INVALIDO':          return `Tipo de comprobante no admitido (${String(dato(detalle, 'cbte_tipo') ?? '')}). Se importan FA, FB, NC, ND, CVLP y FCE.`
    case 'PTO_VTA_INVALIDO':       return 'Punto de venta inválido.'
    case 'NUMERO_INVALIDO':        return 'Número de comprobante inválido.'
    case 'FECHA_INVALIDA':         return `Fecha inválida o futura (${String(dato(detalle, 'fecha') ?? '')}).`
    case 'TOTAL_INVALIDO':         return 'El total tiene que ser mayor a cero.'
    case 'DOC_TIPO_INVALIDO':      return 'Tipo de documento del comprador no admitido (CUIT, CUIL, DNI o sin identificar).'
    case 'DOC_NRO_INVALIDO':       return 'Número de documento del comprador inválido (el CUIT va con 11 dígitos).'
    case 'RAZON_SOCIAL_REQUERIDA': return 'Falta la denominación del comprador para darlo de alta.'
    case 'SALDO_INVALIDO':         return 'El saldo tiene que estar entre 0 y el total.'
    case 'VENCE_ANTERIOR_A_FECHA': return 'El vencimiento es anterior a la fecha.'
    case 'FILA_INVALIDA':          return `Fila inválida${dato(detalle, 'mensaje') ? `: ${String(dato(detalle, 'mensaje'))}` : ''}.`
    default:                       return mensajeCodigoFacturacion(code, detalle)
  }
}

/** Por qué una fila del importador quedó como duplicada. */
export function motivoDuplicada(detalle: unknown): string {
  const m = dato(detalle, 'motivo')
  if (m === 'ya_importada') return 'Ya estaba importado'
  if (m === 'emitida_por_el_erp') return 'Lo emitió el sistema'
  if (m === 'repetida_en_el_archivo') return 'Repetido en el archivo'
  return 'Duplicado'
}
