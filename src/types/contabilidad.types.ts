// Contabilidad fase 1 (20260926): tipos de las respuestas de /api/contabilidad.
//
// Archivo propio para no pisar domain.types. Los nombres de campo son el
// contrato con el backend (spec §C.4): JSON en snake_case, montos como number.

export type CtbRubro = 'activo' | 'pasivo' | 'pn' | 'ingreso' | 'egreso'
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
  naturaleza:        CtbNaturaleza
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
  estado:       'nueva' | 'duplicada' | 'error'
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
}

export interface CtbImportarPlanRes {
  confirmado:  boolean
  total_filas: number
  nuevas:      number
  duplicadas:  number
  errores:     number
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
    naturaleza: CtbNaturaleza
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

export type TesoreriaTipo = 'banco' | 'caja' | 'valores'

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
