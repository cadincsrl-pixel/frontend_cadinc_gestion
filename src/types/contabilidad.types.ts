// Contabilidad fase 1 (20260926): tipos de las respuestas de /api/contabilidad.
//
// Archivo propio para no pisar domain.types. Los nombres de campo son el
// contrato con el backend (spec §C.4): JSON en snake_case, montos como number.

/**
 * `resultado` (20260927, plan de Finnegans): SOLO para títulos, como la
 * 4000000 «RESULTADO DEL PERIODO», que agrupa hijas de ingreso y de egreso.
 * No tiene naturaleza (null): su saldo es el neto.
 */
export type CtbRubro = 'activo' | 'pasivo' | 'pn' | 'ingreso' | 'egreso' | 'resultado'
export type CtbAuxiliarTipo = 'none' | 'cliente' | 'proveedor' | 'tesoreria'
export type CtbAsientoTipo = 'apertura' | 'manual' | 'automatico' | 'ajuste' | 'cierre'
export type CtbAsientoEstado = 'borrador' | 'confirmado' | 'anulado'
export type CtbPeriodoEstado = 'abierto' | 'cerrado'
export type CtbNaturaleza = 'deudora' | 'acreedora'

export interface CtbPage<T> {
  items:   T[]
  total:   number
  limit:   number
  offset:  number
  hasMore: boolean
}

export interface CtbEjercicio {
  id:     number
  nombre: string
  desde:  string
  hasta:  string
  estado: 'abierto' | 'cerrado'
}

export type CtbBloqueoCerrar = 'PERIODO_YA_CERRADO' | 'PERIODO_ANTERIOR_ABIERTO' | 'HAY_BORRADORES' | 'EJERCICIO_CERRADO'
export type CtbBloqueoReabrir = 'PERIODO_NO_CERRADO' | 'PERIODO_POSTERIOR_CERRADO' | 'EJERCICIO_CERRADO'

export interface CtbPeriodo {
  id:                 number
  ejercicio_id:       number
  ejercicio_nombre:   string
  numero:             number
  desde:              string
  hasta:              string
  estado:             CtbPeriodoEstado
  cerrado_por:        string | null
  cerrado_por_nombre: string | null
  cerrado_at:         string | null
  reabierto_por:      string | null
  reabierto_at:       string | null
  motivo_reapertura:  string | null
  cant_borradores:    number
  cant_confirmados:   number
  cant_anulados:      number
  numero_desde:       number | null
  numero_hasta:       number | null
  total_debe:         number
  puede_cerrar:       boolean
  bloqueo_cerrar:     CtbBloqueoCerrar | null
  puede_reabrir:      boolean
  bloqueo_reabrir:    CtbBloqueoReabrir | null
}

export interface CtbCerrarPeriodoRes {
  periodo:      CtbPeriodo
  numerados:    number
  desde_numero: number | null
  hasta_numero: number | null
}

export interface CtbReabrirPeriodoRes {
  periodo:      CtbPeriodo
  desnumerados: number
}

export interface CtbCuenta {
  id:                number
  codigo:            string
  codigo_orden:      number[]
  nivel:             number
  nombre:            string
  padre_id:          number | null
  padre_codigo:      string | null
  rubro:             CtbRubro
  /** null en los títulos de rubro `resultado`. */
  naturaleza:        CtbNaturaleza | null
  imputable:         boolean
  auxiliar:          CtbAuxiliarTipo
  activo:            boolean
  baja_motivo:       string | null
  obs:               string
  cant_hijas:        number
  tiene_movimientos: boolean
  tesoreria_ids:     number[] | null
  created_at:        string
  updated_at:        string
}

export interface CtbCuentaInput {
  codigo:    string
  nombre:    string
  rubro?:    CtbRubro
  imputable: boolean
  auxiliar:  CtbAuxiliarTipo
  obs?:      string
}

export interface CtbImportarFila {
  indice:       number
  /** `omitida`: deshabilitada en Finnegans, no se importa (20260928). */
  estado:       'nueva' | 'duplicada' | 'error' | 'omitida'
  error:        string | null
  detalle:      Record<string, unknown> | null
  codigo:       string | null
  nombre:       string | null
  rubro:        CtbRubro | null
  imputable:    boolean | null
  auxiliar:     CtbAuxiliarTipo | null
  nivel:        number | null
  padre_codigo: string | null
  cuenta_id:    number | null
  /** El código como vino en el archivo (formato Finnegans: 1110101). */
  codigo_original?: string | null
}

export interface CtbImportarPlanRes {
  confirmado:  boolean
  total_filas: number
  nuevas:      number
  duplicadas:  number
  errores:     number
  /** Filas deshabilitadas en Finnegans (no se importan). */
  omitidas?:   number
  formato?:    'estandar' | 'finnegans'
  filas:       CtbImportarFila[]
}

export interface CtbLinea {
  id:            number
  orden:         number
  cuenta_id:     number
  cuenta_codigo: string
  cuenta_nombre: string
  debe:          number
  haber:         number
  aux_tipo:      CtbAuxiliarTipo
  aux_id:        number | null
  aux_nombre:    string | null
  obra_cod:      string | null
  obra_nom:      string | null
  glosa:         string
}

export interface CtbAsiento {
  id:                    number
  ejercicio_id:          number
  periodo_id:            number
  periodo_estado:        CtbPeriodoEstado
  numero:                number | null
  fecha:                 string
  tipo:                  CtbAsientoTipo
  estado:                CtbAsientoEstado
  glosa:                 string
  total:                 number
  origen_tabla:          string | null
  origen_id:             number | null
  origen_evento:         string | null
  revierte_id:           number | null
  revierte_numero:       number | null
  revertido_por_id:      number | null
  revertido_por_numero:  number | null
  motivo_anulacion:      string | null
  anulado_por:           string | null
  anulado_por_nombre:    string | null
  anulado_at:            string | null
  confirmado_por:        string | null
  confirmado_por_nombre: string | null
  confirmado_at:         string | null
  created_by:            string | null
  created_by_nombre:     string | null
  created_at:            string
  updated_at:            string
  lineas:                CtbLinea[]
}

export interface CtbAsientoFila {
  id:                number
  fecha:             string
  numero:            number | null
  tipo:              CtbAsientoTipo
  estado:            CtbAsientoEstado
  glosa:             string
  total:             number
  cant_lineas:       number
  periodo_id:        number
  periodo_estado:    CtbPeriodoEstado
  revierte_id:       number | null
  revertido_por_id:  number | null
  created_by_nombre: string | null
  created_at:        string
}

export interface CtbLineaInput {
  cuenta_id: number
  debe:      number
  haber:     number
  aux_id?:   number | null
  obra_cod?: string | null
  glosa?:    string
}

export interface CtbAsientoInput {
  fecha:  string
  tipo:   'manual' | 'ajuste' | 'apertura'
  glosa:  string
  estado: 'borrador' | 'confirmado'
  lineas: CtbLineaInput[]
}

export interface CtbAnularRes {
  accion:        'anulado' | 'contraasiento'
  asiento:       CtbAsiento
  contraasiento: CtbAsiento | null
}

export interface CtbDiarioRes {
  /** El backend lo agrega desde la tanda 4 (20260928i); ausente en el viejo. */
  modo?:          'detallado'
  desde:          string
  hasta:          string
  total_asientos: number
  total_debe:     number
  total_haber:    number
  items:          CtbAsiento[]
  limit:          number
  offset:         number
  hasMore:        boolean
}

export interface CtbMayorMov {
  linea_id:      number
  asiento_id:    number
  numero:        number | null
  fecha:         string
  tipo:          CtbAsientoTipo
  glosa_asiento: string
  glosa:         string
  cuenta_id:     number
  cuenta_codigo: string
  debe:          number
  haber:         number
  saldo:         number
  obra_cod:      string | null
  aux_tipo:      CtbAuxiliarTipo
  aux_id:        number | null
  aux_nombre:    string | null
}

export interface CtbMayorRes {
  cuenta: {
    id:         number
    codigo:     string
    nombre:     string
    rubro:      CtbRubro
    naturaleza: CtbNaturaleza | null
    imputable:  boolean
    auxiliar:   CtbAuxiliarTipo
  }
  desde:             string
  hasta:             string
  saldo_anterior:    number
  total_debe:        number
  total_haber:       number
  saldo_final:       number
  total_movimientos: number
  items:             CtbMayorMov[]
  limit:             number
  offset:            number
  hasMore:           boolean
}

export interface CtbSumasFila {
  cuenta_id:      number
  codigo:         string
  nombre:         string
  nivel:          number
  rubro:          CtbRubro
  imputable:      boolean
  padre_id:       number | null
  saldo_anterior: number
  debe:           number
  haber:          number
  saldo:          number
  saldo_deudor:   number
  saldo_acreedor: number
}

export interface CtbSumasSaldosRes {
  desde:  string
  hasta:  string
  cuadra: boolean
  totales: {
    saldo_anterior: number
    debe:           number
    haber:          number
    saldo_deudor:   number
    saldo_acreedor: number
  }
  items: CtbSumasFila[]
}

/**
 * `tarjeta` (20260927h) = tarjeta de crédito de la empresa: es un PASIVO, sin
 * CBU ni alias (`banco` = el emisor, «Visa Galicia»). `billetera` = Mercado
 * Pago u otra: admite CVU (22 dígitos, se valida como CBU) y alias.
 */
export type TesoreriaTipo = 'banco' | 'caja' | 'valores' | 'tarjeta' | 'billetera'

export interface TesoreriaCuenta {
  id:               number
  tipo:             TesoreriaTipo
  nombre:           string
  banco:            string
  cbu:              string | null
  alias:            string | null
  moneda:           'ARS' | 'USD'
  cuenta_id:        number | null
  cuenta_codigo:    string | null
  cuenta_nombre:    string | null
  ventas_cuenta_id: number | null
  activo:           boolean
  obs:              string
  created_at:       string
  updated_at:       string
}

export interface TesoreriaInput {
  tipo:              TesoreriaTipo
  nombre:            string
  banco?:            string
  cbu?:              string | null
  alias?:            string | null
  moneda:            'ARS' | 'USD'
  cuenta_id?:        number | null
  ventas_cuenta_id?: number | null
  obs?:              string
}

export interface CtbAuxiliar {
  id:     number
  nombre: string
  doc:    string | null
  activo: boolean
}

export interface CtbObra {
  cod:       string
  nom:       string
  archivada: boolean
}

// ── Fase 3 (20260927d–f): motor de asientos automáticos y mapeos ────────

export type CtbFuente = 'ventas_facturas' | 'ventas_comprobantes_externos' | 'ventas_cobros' | 'pagos_facturas' | 'pagos_ordenes'
  // Tanda 5 (20260928m): movimientos de fondos sin factura.
  | 'tesoreria_movimientos'
export type CtbPendienteEstado = 'sin_contabilizar' | 'pendiente' | 'desactualizado' | 'a_revertir'

export interface CtbMotivo {
  codigo:  string
  detalle: Record<string, unknown> | null
}

export interface CtbPendiente {
  origen_tabla:           CtbFuente
  origen_id:              number
  fecha:                  string
  fuente:                 string
  descripcion:            string
  importe:                number
  estado:                 CtbPendienteEstado
  motivos:                CtbMotivo[]
  asiento_id:             number | null
  asiento_periodo_estado: CtbPeriodoEstado | null
}

export interface CtbAutomaticosResumen {
  por_estado: Partial<Record<CtbPendienteEstado, number>>
  por_fuente: Partial<Record<CtbFuente, number>>
  por_motivo: { codigo: string; clave: string | null; subclave: string | null; cantidad: number }[]
}

export type CtbPendientesRes = CtbPage<CtbPendiente> & { resumen: CtbAutomaticosResumen }

export interface CtbContabilizarRes {
  procesados:      number
  creados:         number
  regenerados:     number
  anulados:        number
  revertidos:      number
  sin_cambios:     number
  pendientes:      number
  desactualizados: number
  errores:         number
  hay_mas:         boolean
  cursor:          unknown | null
  detalle_errores: { origen_tabla: CtbFuente; origen_id: number; codigo: string; mensaje: string }[]
}

export interface CtbContabilizarInput {
  hasta:              string
  fuentes?:           CtbFuente[]
  revertir_cerrados?: boolean
}

export interface CtbPropuestaLinea {
  cuenta_id:     number
  cuenta_codigo: string
  cuenta_nombre: string
  debe:          number
  haber:         number
  aux_tipo:      CtbAuxiliarTipo
  aux_id:        number | null
  aux_nombre:    string | null
  obra_cod:      string | null
  obra_nom:      string | null
  glosa:         string
}

export interface CtbPropuesta {
  origen_tabla:   CtbFuente
  origen_id:      number
  vigente:        boolean
  fecha:          string
  glosa:          string
  importe:        number
  lineas:         CtbPropuestaLinea[]
  motivos:        CtbMotivo[]
  hash:           string
  estado:         CtbPendienteEstado | 'al_dia'
  asiento_actual: CtbAsiento | null
  diferente:      boolean
}

export interface CtbMapeoSub {
  subclave:      string
  etiqueta:      string
  mapeo_id:      number | null
  cuenta_id:     number | null
  cuenta_codigo: string | null
  cuenta_nombre: string | null
  en_uso:        number
}

export interface CtbMapeoClave {
  clave:       string
  etiqueta:    string
  descripcion: string
  rubros:      CtbRubro[]
  auxiliares:  CtbAuxiliarTipo[]
  subclaves:   CtbMapeoSub[]
}

export interface CtbMapeosCatalogo { claves: CtbMapeoClave[] }

export interface CtbMapeoInput {
  clave:     string
  subclave:  string
  cuenta_id: number | null
}

export interface CtbConfig {
  automaticos_desde:      string
  cvlp_modo:              'neto_liquidado' | 'bruto'
  compras_fecha_contable: 'fecha' | 'mes_iva'
  paga_cliente_modo:      string | null
  // Tanda 5 (20260928n). Un backend viejo no las manda: leer con `?? default`.
  /** Asiento de IVA: compensar los saldos a favor del mes anterior. Default false. */
  iva_ddjj_arrastre:      boolean
  /** Bienes de uso: amortizar por mes o por ejercicio. */
  bu_frecuencia:          'mensual' | 'anual'
  /** Año de alta: completo (desde el inicio del ejercicio) o proporcional (desde el mes de alta). */
  bu_criterio_alta:       'completo' | 'proporcional'
  /** Fecha de corte de la amortización acumulada inicial (30/06/2026). */
  bu_corte_inicial:       string
}

export type CtbConfigEditable = Pick<CtbConfig,
  'automaticos_desde' | 'cvlp_modo' | 'compras_fecha_contable' | 'iva_ddjj_arrastre' | 'bu_frecuencia' | 'bu_criterio_alta' | 'bu_corte_inicial'>

// ── Tanda 4 (20260928h–k): circuitos, diario resumido y estados contables ──

/** Circuito de Automáticos: agrupa las fuentes (ventas = facturas del ERP + externos). */
export type CtbCircuito = 'ventas' | 'cobros' | 'compras' | 'pagos' | 'fondos'

export type CtbDiarioModo = 'detallado' | 'dia' | 'mes'

export interface CtbDiarioResumenLinea {
  cuenta_id:     number
  cuenta_codigo: string
  cuenta_nombre: string
  debe:          number
  haber:         number
}

/** Un asiento sintético del diario resumido: presentación, no existe en la base. */
export interface CtbDiarioResumen {
  clase:                 'resumen'
  orden:                 number
  clave:                 string
  circuito:              CtbCircuito | 'otros'
  periodo_desde:         string
  periodo_hasta:         string
  fecha:                 string
  glosa:                 string
  cantidad_comprobantes: number
  cantidad_asientos:     number
  cantidad_reversiones:  number
  numero_desde:          number | null
  numero_hasta:          number | null
  sin_numero:            number
  total:                 number
  cuadra:                boolean
  lineas:                CtbDiarioResumenLinea[]
}

export type CtbDiarioItem = (CtbAsiento & { clase: 'asiento'; orden: number }) | CtbDiarioResumen

export interface CtbDiarioResumidoRes {
  desde:          string
  hasta:          string
  modo:           'dia' | 'mes'
  total_items:    number
  total_asientos: number
  total_debe:     number
  total_haber:    number
  cuadra:         boolean
  items:          CtbDiarioItem[]
  limit:          number
  offset:         number
  hasMore:        boolean
}

export type CtbDiarioCualquiera = CtbDiarioRes | CtbDiarioResumidoRes

export interface CtbEstadoFila {
  cuenta_id: number | null
  codigo:    string | null
  nombre:    string
  nivel:     number
  rubro:     CtbRubro
  imputable: boolean
  padre_id:  number | null
  virtual:   boolean
  saldo:     number
  importes?: number[]
}

export interface CtbGrupoBalance {
  cuenta_id: number | null
  codigo:    string | null
  nombre:    string
  total:     number
}

export interface CtbEjercicioRef {
  id:     number
  nombre: string
  desde:  string
  hasta:  string
}

export interface CtbBalanceRes {
  fecha:         string
  ejercicio:     CtbEjercicioRef
  nivel:         number
  sin_apertura:  boolean
  activo:        { total: number; grupos: CtbGrupoBalance[]; filas: CtbEstadoFila[] }
  pasivo:        { total: number; grupos: CtbGrupoBalance[]; filas: CtbEstadoFila[] }
  pn:            { total: number; resultado_ejercicio: number; filas: CtbEstadoFila[] }
  pasivo_mas_pn: number
  diferencia:    number
  cuadra:        boolean
}

export interface CtbColumnaMes {
  clave:    string
  desde:    string
  hasta:    string
  etiqueta: string
}

export interface CtbSeccionResultados {
  total:       number
  totales_col: number[]
  filas:       CtbEstadoFila[]
}

export interface CtbResultadosRes {
  desde:       string
  hasta:       string
  ejercicio:   CtbEjercicioRef
  nivel:       number
  comparativo: boolean
  columnas:    CtbColumnaMes[]
  ingresos:    CtbSeccionResultados
  gastos:      CtbSeccionResultados
  resultado:   { total: number; totales_col: number[] }
}

// ── Tanda 5 (20260928l–q): movimientos de fondos, asiento de IVA y bienes de uso ──

export type TesMovTipo = 'ingreso' | 'egreso' | 'transferencia'
export type TesConceptoSentido = 'ingreso' | 'egreso' | 'ambos'
export type TesMoneda = 'ARS' | 'USD'

export interface TesConcepto {
  id:            number
  nombre:        string
  sentido:       TesConceptoSentido
  orden:         number
  activo:        boolean
  obs:           string
  /** Movimientos vigentes que lo usan. */
  en_uso:        number
  /** Cuenta del mapeo `fondos.concepto` (null = sin mapear). */
  cuenta_id:     number | null
  cuenta_codigo: string | null
  cuenta_nombre: string | null
}

export interface TesConceptoInput {
  nombre:  string
  sentido: TesConceptoSentido
  orden?:  number
  activo?: boolean
  obs?:    string
}

export type TesAdjuntoTipo = 'comprobante' | 'vep' | 'extracto' | 'otro'

export interface TesAdjunto {
  id:             number
  tipo:           TesAdjuntoTipo
  nombre_archivo: string
  mime_type:      string
  size_bytes:     number
  created_at:     string
  obs?:           string
}

/**
 * Respuesta de `upload-url`. La spec dice `{path, token, signedUrl}`; el
 * servicio de Pagos (del que es clon) devuelve `{storage_path, signed_url}`.
 * Se aceptan los dos para no repetir el bug de shapes del 2026-05-19.
 */
export interface TesUploadUrlRes {
  path?:         string
  storage_path?: string
  token?:        string
  signedUrl?:    string
  signed_url?:   string
}

export interface TesMovimiento {
  id:                   number
  /** Se muestra «MF-000123». */
  numero:               number
  fecha:                string
  tipo:                 TesMovTipo
  tesoreria_id:         number
  tesoreria_nombre:     string
  tesoreria_tipo:       TesoreriaTipo
  tesoreria_moneda:     TesMoneda
  tesoreria_destino_id: number | null
  destino_nombre:       string | null
  destino_moneda:       TesMoneda | null
  concepto_id:          number | null
  concepto_nombre:      string | null
  /** En la moneda de la cuenta de origen. */
  importe:              number
  importe_destino:      number | null
  cotizacion:           number | null
  /** Lo calcula la base; es lo que va al asiento. */
  importe_ars:          number
  obra_cod:             string | null
  obra_nom:             string | null
  referencia:           string
  obs:                  string
  origen:               'manual' | 'conciliacion'
  extracto_linea_id:    number | null
  estado:               'vigente' | 'anulado'
  motivo_anulacion:     string | null
  anulado_por_nombre:   string | null
  anulado_at:           string | null
  cant_adjuntos:        number
  asiento_id:           number | null
  asiento_numero:       number | null
  created_by_nombre:    string | null
  created_at:           string
  adjuntos?:            TesAdjunto[]
}

export interface TesMovimientoInput {
  fecha:                 string
  tipo:                  TesMovTipo
  tesoreria_id:          number
  tesoreria_destino_id?: number | null
  concepto_id?:          number | null
  importe:               number
  importe_destino?:      number | null
  cotizacion?:           number | null
  obra_cod?:             string | null
  referencia?:           string
  obs?:                  string
}

export type TesMovimientosRes = CtbPage<TesMovimiento> & {
  totales: { ingresos: number; egresos: number; transferencias: number }
}

// ── Asiento mensual de IVA (DDJJ) ──

export type CtbIvaEstado = 'sin_generar' | 'al_dia' | 'desactualizado' | 'sin_movimientos'

export interface CtbIvaCuenta {
  cuenta_id: number
  codigo:    string
  nombre:    string
  rol:       'debito' | 'credito' | 'pagos_a_cuenta'
  debe:      number
  haber:     number
  saldo:     number
}

export interface CtbIvaContable {
  periodo_id:           number
  desde:                string
  hasta:                string
  fecha:                string
  cuentas:              CtbIvaCuenta[]
  debito_fiscal:        number
  credito_fiscal:       number
  pagos_a_cuenta:       number
  determinado:          number
  arrastre_tecnico:     number
  arrastre_libre:       number
  a_pagar:              number
  saldo_tecnico:        number
  libre_disponibilidad: number
  lineas:               CtbPropuestaLinea[]
  motivos:              CtbMotivo[]
  avisos:               string[]
  hash:                 string
  estado:               CtbIvaEstado
  periodo_estado:       CtbPeriodoEstado
  registro:             { id: number; forzado: boolean; created_at: string; created_by_nombre: string | null } | null
  asiento:              CtbAsiento | null
}

export interface CtbPosicionIvaFiscal {
  periodo:                string
  debito_fiscal:          number
  credito_fiscal:         number
  impuesto_determinado:   number
  saldo_tecnico_a_favor:  number
  percepciones_iva:       number
  retenciones_iva:        number
  a_pagar:                number
  libre_disponibilidad:   number
  excluidos_ventas:       number
  excluidos_compras:      number
  avisos:                 string[]
}

export interface CtbIvaDiferencia {
  componente: 'debito' | 'credito' | 'pagos_a_cuenta' | 'excluidos'
  contable:   number
  fiscal:     number
  diferencia: number
}

export interface CtbIvaPosicion {
  contable:    CtbIvaContable
  fiscal:      CtbPosicionIvaFiscal
  diferencias: CtbIvaDiferencia[]
}

export interface CtbIvaEstadoMes {
  periodo_id:           number
  desde:                string
  estado:               CtbIvaEstado
  a_pagar:              number
  saldo_tecnico:        number
  libre_disponibilidad: number
  asiento_id:           number | null
  asiento_numero:       number | null
}

export interface CtbIvaGenerarRes {
  accion:   'creado' | 'regenerado' | 'sin_cambios'
  posicion: CtbIvaPosicion
}

// ── Bienes de uso ──

export type CtbCriterioAlta = 'completo' | 'proporcional'

export interface CtbBienUso {
  id:                           number
  /** «BU-0001», no editable. */
  codigo:                       string
  descripcion:                  string
  identificador:                string
  cuenta_origen_id:             number
  cuenta_origen_codigo:         string
  cuenta_origen_nombre:         string
  rubro_codigo:                 string
  rubro_nombre:                 string
  cuenta_amort_id:              number | null
  cuenta_amort_codigo:          string | null
  cuenta_gasto_id:              number | null
  cuenta_gasto_codigo:          string | null
  fecha_alta:                   string
  valor_origen:                 number
  /** null = no se amortiza (terrenos). */
  vida_util_anios:              number | null
  valor_residual:               number
  amort_acum_inicial:           number
  metodo:                       'lineal'
  /** null = el de la configuración. */
  criterio_alta:                CtbCriterioAlta | null
  obra_cod:                     string | null
  obra_nom:                     string | null
  pagos_factura_id:             number | null
  fecha_baja:                   string | null
  motivo_baja:                  string | null
  obs:                          string
  amort_acum_hoy:               number
  valor_neto_hoy:               number
  tiene_amortizaciones_cerradas: boolean
}

export interface CtbBienInput {
  descripcion:         string
  identificador?:      string
  cuenta_origen_id:    number
  cuenta_amort_id?:    number | null
  cuenta_gasto_id?:    number | null
  fecha_alta:          string
  valor_origen:        number
  vida_util_anios?:    number | null
  valor_residual?:     number
  amort_acum_inicial?: number
  criterio_alta?:      CtbCriterioAlta | null
  obra_cod?:           string | null
  pagos_factura_id?:   number | null
  obs?:                string
}

/** Una línea de amortización de un bien (ficha del bien). */
export interface CtbAmortizacionFila {
  id:                  number
  corrida_id:          number
  hasta:               string
  meses:               number
  importe:             number
  acumulada_al_cierre: number
  corrida_estado?:     'vigente' | 'anulada'
  asiento_id?:         number | null
  asiento_numero?:     number | null
}

export type CtbBienDetalle = CtbBienUso & { amortizaciones: CtbAmortizacionFila[] }

/** Una corrida de amortización (una por período o por ejercicio). */
export interface CtbAmortizacionCorrida {
  id:                 number
  desde:              string
  hasta:              string
  frecuencia:         'mensual' | 'anual'
  estado:             'vigente' | 'anulada'
  asiento_id:         number | null
  asiento_numero?:    number | null
  total:              number
  bienes?:            number
  periodo_estado?:    CtbPeriodoEstado | null
  motivo_anulacion:   string | null
  anulado_at:         string | null
  anulado_por_nombre?: string | null
  created_at:         string
  created_by_nombre?: string | null
}

export interface CtbCuadroFila {
  bien_id:                 number
  codigo:                  string
  descripcion:             string
  identificador:           string
  rubro_codigo:            string
  rubro_nombre:            string
  fecha_alta:              string
  fecha_baja:              string | null
  valor_origen:            number
  valor_residual:          number
  vida_util_anios:         number | null
  amort_acum_inicio:       number
  amort_ejercicio:         number
  amort_acum_cierre:       number
  valor_neto:              number
  falta_amortizar_teorico: number
  obra_cod:                string | null
}

export type CtbCuadroRubro = Omit<CtbCuadroFila,
  'bien_id' | 'codigo' | 'descripcion' | 'identificador' | 'fecha_alta' | 'fecha_baja' | 'vida_util_anios' | 'obra_cod'> & { cantidad: number }

export interface CtbControlMayorBienes {
  cuenta_id:  number
  codigo:     string
  nombre:     string
  inventario: number
  mayor:      number
  diferencia: number
}

export interface CtbCuadroBienes {
  ejercicio:     CtbEjercicioRef
  hasta:         string
  filas:         CtbCuadroFila[]
  rubros:        CtbCuadroRubro[]
  control_mayor: CtbControlMayorBienes[]
}

export interface CtbAmortizarTramo {
  desde:      string
  hasta:      string
  accion:     'creado' | 'regenerado' | 'sin_cambios' | 'periodo_cerrado' | 'desactualizado' | 'sin_bienes'
  corrida_id: number | null
  asiento_id: number | null
  total:      number
  bienes:     number
}

export interface CtbAmortizarRes {
  frecuencia: 'mensual' | 'anual'
  tramos:     CtbAmortizarTramo[]
  total:      number
}

export interface CtbImportarBienesFila {
  indice:   number
  estado:   'ok' | 'error' | 'aviso'
  errores:  { codigo: string; campo?: string }[]
  avisos:   { codigo: string; detalle?: unknown }[]
  resuelto: Partial<CtbBienInput> & { cuenta_origen_codigo?: string; cuenta_amort_codigo?: string; cuenta_gasto_codigo?: string }
}

export interface CtbImportarBienesRes {
  confirmado: boolean
  resumen: {
    total:              number
    ok:                 number
    con_error:          number
    con_aviso:          number
    valor_origen:       number
    amort_acum_inicial: number
  }
  filas: CtbImportarBienesFila[]
}
