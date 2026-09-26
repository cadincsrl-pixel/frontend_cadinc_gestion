// Módulo Sueldos (20261004a–f). Espejo del contrato de la API
// (`/api/sueldos`, backend `modules/sueldos`). Importes y porcentajes llegan
// como `number` (PostgREST devuelve `numeric` como número JSON).

export type ISODate = string

export type TipoConcepto = 'remunerativo' | 'no_remunerativo' | 'descuento' | 'contribucion'
export type Calculo = 'manual' | 'cantidad_x_escala' | 'porcentaje' | 'monto_fijo' | 'por_unidad'
export type BaseConcepto = 'basico' | 'remunerativo' | 'bruto_rem_no_rem' | 'sereno_zona_a'
export type Condicion = 'siempre' | 'afiliado' | 'no_afiliado' | 'antiguedad_menor_1' | 'antiguedad_mayor_igual_1' | 'rifl' | 'no_rifl'
export type Destino = 'f931' | 'sindicato' | 'fondo_cese' | 'prestamo' | 'otros'
export type GrupoContribucion = 'sindical' | 'seguridad_social' | 'obra_social' | 'inssjp' | 'art' | 'camaras' | 'otros'
export type Unidad = 'horas' | 'dias' | 'km' | '%' | '$' | 'anios' | 'unidades'
export type TipoLiquidacion = 'quincena' | 'mensual' | 'sac' | 'vacaciones' | 'final' | 'ajuste'
export type EstadoLiquidacion = 'borrador' | 'cerrada' | 'anulada'
export type EstadoRecibo = 'borrador' | 'cerrado' | 'anulado'
export type UnidadBasico = 'hora' | 'mes'
export type Periodicidad = 'quincenal' | 'mensual'
export type TabSueldos = 'legajos' | 'liquidaciones' | 'recibos' | 'convenios' | 'configuracion' | 'exportar'

export interface SueAuditoria {
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Convenio extends SueAuditoria {
  id: number
  codigo: string
  nombre: string
  cct: string
  periodicidad: Periodicidad
  unidad_basico: UnidadBasico
  obs: string
  activo: boolean
}

export interface ConvenioCreate {
  codigo: string; nombre: string; cct?: string; periodicidad: Periodicidad; unidad_basico: UnidadBasico; obs?: string; activo?: boolean
}
export type ConvenioUpdate = Partial<Omit<ConvenioCreate, 'codigo'>>

export interface Categoria extends SueAuditoria {
  id: number
  convenio_id: number
  codigo: string
  nombre: string
  orden: number
  unidad_basico: UnidadBasico | null
  por_defecto: boolean
  activo: boolean
}

export interface CategoriaCreate {
  convenio_id: number; codigo: string; nombre: string; orden?: number; unidad_basico?: UnidadBasico | null; por_defecto?: boolean; activo?: boolean
}
export type CategoriaUpdate = Partial<Omit<CategoriaCreate, 'convenio_id' | 'codigo'>>

export interface Escala extends SueAuditoria {
  id: number
  categoria_id: number
  zona: string
  vigente_desde: ISODate
  valor: number
  fuente: string
  a_confirmar: boolean
}

export interface EscalaListada extends Escala {
  categoria: { id: number; convenio_id: number; codigo: string; nombre: string; orden: number }
  vigente: boolean
}

export interface EscalaCreate { categoria_id: number; zona?: string; vigente_desde: ISODate; valor: number; fuente?: string; a_confirmar?: boolean }
export interface EscalaUpdate { valor?: number; fuente?: string; a_confirmar?: boolean }

export interface Paritaria {
  convenio_id: number; desde: ISODate; porcentaje: number; fuente?: string; a_confirmar?: boolean; zona?: string | null
}
export interface ParitariaResultado {
  creadas: number; desde: ISODate; porcentaje: number
  escalas: { id: number; categoria_id: number; zona: string; anterior: number; valor: number }[]
}

export interface Concepto extends SueAuditoria {
  id: number
  convenio_id: number | null
  codigo: string
  nombre: string
  tipo: TipoConcepto
  calculo: Calculo
  base: BaseConcepto | null
  condicion: Condicion
  codigo_arca: string | null
  grupo_contribucion: GrupoContribucion | null
  destino: Destino | null
  parametro_clave: string | null
  unidad: Unidad | null
  en_recibo: boolean
  orden: number
  automatico: boolean
  activo: boolean
  obs: string
}

export interface ConceptoValor extends SueAuditoria {
  id: number
  concepto_id: number
  vigente_desde: ISODate
  porcentaje: number | null
  monto: number | null
  a_confirmar: boolean
  fuente: string
}

export interface ValorConcepto {
  origen: 'concepto' | 'parametro'
  parametro_clave: string | null
  porcentaje: number | null
  monto: number | null
  vigente_desde: ISODate
  a_confirmar: boolean
  fuente: string
}

export interface ConceptoListado extends Concepto {
  valores: ConceptoValor[]
  valor_vigente: ValorConcepto | null
  pisado_por: number | null
}

export interface ConceptoCreate {
  convenio_id: number | null; codigo: string; nombre: string; tipo: TipoConcepto; calculo: Calculo
  base?: BaseConcepto | null; condicion?: Condicion; codigo_arca?: string | null; grupo_contribucion?: GrupoContribucion | null
  destino?: Destino | null; parametro_clave?: string | null; unidad?: Unidad | null
  en_recibo?: boolean; orden?: number; automatico?: boolean; activo?: boolean; obs?: string
}
export type ConceptoUpdate = Partial<Omit<ConceptoCreate, 'convenio_id' | 'codigo'>>
export interface ConceptoValorCreate { concepto_id: number; vigente_desde: ISODate; porcentaje?: number | null; monto?: number | null; a_confirmar?: boolean; fuente?: string }
export interface ConceptoValorUpdate { porcentaje?: number | null; monto?: number | null; a_confirmar?: boolean; fuente?: string }

export interface Parametro extends SueAuditoria {
  id: number
  clave: string
  vigente_desde: ISODate
  valor: number
  a_confirmar: boolean
  fuente: string
  descripcion: string
}
export interface ParametroListado extends Parametro { vigente: boolean }
export interface ParametroCreate { clave: string; vigente_desde: ISODate; valor: number; a_confirmar?: boolean; fuente?: string; descripcion?: string }
export type ParametroUpdate = Partial<Omit<ParametroCreate, 'clave' | 'vigente_desde'>>

export interface ValoresAFecha {
  fecha: ISODate
  zona: string
  convenio: Convenio
  categorias: {
    id: number; codigo: string; nombre: string; orden: number; unidad_basico: UnidadBasico; por_defecto: boolean; activo: boolean
    valor: number | null; vigente_desde: ISODate | null; a_confirmar: boolean | null; fuente: string | null
  }[]
  conceptos: (Concepto & { valor: ValorConcepto | null })[]
  parametros: Record<string, { valor: number; vigente_desde: ISODate; a_confirmar: boolean; fuente: string }>
  sereno_zona_a: number | null
}

export type Faltante = 'cuil' | 'fecha_ingreso' | 'categoria' | 'obra_social' | 'cbu'

export interface Legajo extends SueAuditoria {
  id: number
  leg: string | null
  chofer_id: number | null
  nombre: string
  cuil: string | null
  fecha_ingreso: ISODate | null
  fecha_egreso: ISODate | null
  convenio_id: number
  categoria_id: number | null
  zona: string
  modalidad_contratacion: string
  jornada: 'completa' | 'parcial'
  obra_social: string
  obra_social_codigo: string
  afiliado_sindicato: boolean
  cbu: string | null
  banco: string
  estado_civil: string
  conyuge_a_cargo: boolean
  hijos_a_cargo: number
  ieric_numero: string
  fondo_cese_cuenta: string
  titulo_nivel: 'A' | 'B' | 'C' | null
  carnet_profesional: string
  rifl: boolean
  obra_cod_habitual: string | null
  activo: boolean
  obs: string
  nombre_mostrar: string
  dni: string | null
  personal_condicion: 'blanco' | 'asegurado' | null
  personal_modalidad: 'hora' | 'mes' | null
  chofer_nombre: string | null
  chofer_estado: 'activo' | 'descanso' | 'inactivo' | null
  chofer_es_propio: boolean | null
  convenio_codigo: string
  convenio_nombre: string
  categoria_codigo: string | null
  categoria_nombre: string | null
  faltantes: Faltante[]
  incompleto: boolean
}

export interface LegajoFicha extends Legajo {
  /** Sin ver_pii no vienen tel, dir ni fecha_nacimiento. */
  personal: {
    leg: string; nom: string; dni: string | null; tel?: string | null; dir?: string | null; condicion: string | null
    modalidad: string | null; fecha_nacimiento?: ISODate | null; cat_id: number | null
  } | null
  /** Sin ver_pii no vienen tel, licencia ni alias. */
  chofer: {
    id: number; nombre: string; cuil: string | null; tel?: string | null; licencia?: string | null; cbu: string | null
    alias?: string | null; estado: string | null; es_propio: boolean | null
  } | null
  recibos: {
    id: number; liquidacion_id: number; estado: EstadoRecibo
    total_remunerativo: number; total_no_remunerativo: number; total_descuentos: number; neto: number
    liquidacion: { id: number; codigo: string; tipo: TipoLiquidacion; periodo: ISODate; quincena: 1 | 2 | null; estado: EstadoLiquidacion } | null
  }[]
}

export interface LegajoCampos {
  nombre?: string; cuil?: string | null; fecha_ingreso?: ISODate | null
  fecha_egreso?: ISODate | null; categoria_id?: number | null; zona?: string; modalidad_contratacion?: string
  jornada?: 'completa' | 'parcial'; obra_social?: string; obra_social_codigo?: string; afiliado_sindicato?: boolean
  cbu?: string | null; banco?: string; estado_civil?: string; conyuge_a_cargo?: boolean
  hijos_a_cargo?: number; ieric_numero?: string; fondo_cese_cuenta?: string; titulo_nivel?: 'A' | 'B' | 'C' | null
  carnet_profesional?: string; rifl?: boolean; obra_cod_habitual?: string | null; activo?: boolean; obs?: string
}
export interface LegajoCreate extends LegajoCampos {
  leg?: string | null
  chofer_id?: number | null
  convenio_id?: number
  convenio_codigo?: string
}
export interface LegajoUpdate extends LegajoCampos { leg?: string | null; chofer_id?: number | null; convenio_id?: number }

export interface CandidatoPersonal {
  leg: string; nombre: string; dni: string | null; condicion: 'blanco' | 'asegurado' | null; modalidad: 'hora' | 'mes' | null
  convenio_sugerido: 'uocra' | 'uecara'
}
export interface CandidatoChofer {
  chofer_id: number; nombre: string; cuil: string | null; cbu: string | null; estado: string | null; es_propio: boolean | null
  convenio_sugerido: 'camioneros'
}
export interface Candidatos { personal: CandidatoPersonal[]; choferes: CandidatoChofer[] }

export interface LegajosFiltro {
  convenio_id?: number | null
  activo?: 'true' | 'false' | 'todos'
  incompleto?: '' | 'true' | 'false'
  q?: string
}

export type CodigoAvisoLiq = 'SIN_MAPEO' | 'PERIODO_CERRADO' | 'FECHA_SIN_PERIODO' | 'DESCUADRE_ORIGEN' | 'SIN_IMPORTES' | 'ERROR_ASIENTO'
export interface AvisoLiquidacion {
  codigo: CodigoAvisoLiq | string
  detalle: Record<string, unknown> | null
}

export interface Liquidacion extends SueAuditoria {
  id: number
  numero: number
  codigo: string
  convenio_id: number
  tipo: TipoLiquidacion
  periodo: ISODate
  quincena: 1 | 2 | null
  fecha_pago: ISODate | null
  estado: EstadoLiquidacion
  asiento_id: number | null
  avisos: AvisoLiquidacion[]
  obs: string
  motivo_anulacion: string | null
  cerrada_por: string | null; cerrada_at: string | null
  anulada_por: string | null; anulada_at: string | null
}

export interface TotalesLiquidacion {
  recibos: number; remunerativo: number; no_remunerativo: number; descuentos: number
  neto: number; contribuciones: number; fondo_cese: number
}

export interface LiquidacionListada extends Liquidacion {
  convenio: { id: number; codigo: string; nombre: string; periodicidad: Periodicidad }
  totales: TotalesLiquidacion
}

export interface ReciboLinea {
  id: number
  recibo_id: number
  concepto_id: number | null
  codigo_arca: string | null
  nombre: string
  tipo: TipoConcepto
  destino: Destino | null
  grupo_contribucion: GrupoContribucion | null
  cantidad: number | null
  unidad: Unidad | null
  base: number | null
  porcentaje: number | null
  importe: number
  manual: boolean
  en_recibo: boolean
  orden: number
  created_at: string
}

export interface ReciboLegajoMin {
  id: number; leg: string | null; chofer_id: number | null; nombre: string; categoria_nombre: string | null; incompleto: boolean
}

export interface ReciboResumen extends SueAuditoria {
  id: number
  liquidacion_id: number
  legajo_id: number
  dias_trabajados: number | null
  horas_trabajadas: number | null
  total_remunerativo: number
  total_no_remunerativo: number
  total_descuentos: number
  neto: number
  total_contribuciones: number
  fondo_cese: number
  estado: EstadoRecibo
  obs: string
  legajo: ReciboLegajoMin
}

export type CodigoAviso = 'CONCEPTO_SIN_VALOR' | 'VALOR_A_CONFIRMAR' | 'ESCALA_A_CONFIRMAR' | 'SIN_FECHA_INGRESO' | 'NETO_NEGATIVO'
  | 'SIN_CODIGO_ARCA' | 'HORAS_MES_POR_DEFECTO' | 'SIN_HISTORIAL' | 'LEGAJO_EGRESADO'
export interface AvisoCalculo { codigo: CodigoAviso | string; detalle?: Record<string, unknown> }

export interface EntradaConcepto {
  codigo: string
  cantidad?: number | null
  importe?: number | null
  porcentaje?: number | null
  nombre?: string | null
}
export interface LineaLibre {
  nombre: string
  tipo: TipoConcepto
  importe: number
  codigo_arca?: string | null
  destino?: Destino | null
  cantidad?: number | null
  unidad?: Unidad | null
}
export interface EntradasRecibo {
  horas_normales?: number | null
  horas_extra_50?: number | null
  horas_extra_100?: number | null
  dias_trabajados?: number | null
  asistencia?: boolean | null
  presentismo?: boolean | null
  km?: number | null
  antiguedad_anios?: number | null
  prestamos?: number | null
  conceptos?: EntradaConcepto[] | null
  lineas_libres?: LineaLibre[] | null
  omitir?: string[] | null
  obs?: string | null
}

export interface Recibo extends Omit<ReciboResumen, 'legajo'> {
  snapshot: {
    legajo: Legajo
    escala: number | null
    calculo?: { fecha_valores: ISODate; unidad_basico: UnidadBasico; valor_hora: number; antiguedad_anios: number; avisos: AvisoCalculo[] }
  }
  entradas: EntradasRecibo
  legajo: ReciboLegajoMin & { categoria_id: number | null; faltantes: Faltante[] }
  lineas: ReciboLinea[]
}

export interface LiquidacionDetalle extends Liquidacion {
  convenio: { id: number; codigo: string; nombre: string; periodicidad: Periodicidad; unidad_basico: UnidadBasico }
  asiento: { id: number; numero: number | null; estado: string; fecha: ISODate; total: number; revertido_por_id: number | null } | null
  totales: TotalesLiquidacion
  recibos: ReciboResumen[]
}
export interface LiquidacionConLineas extends Omit<LiquidacionDetalle, 'recibos'> {
  recibos: Recibo[]
}

export interface LineaCalculada {
  concepto_id: number | null
  codigo: string | null
  nombre: string
  tipo: TipoConcepto
  destino: Destino | null
  grupo_contribucion: GrupoContribucion | null
  codigo_arca: string | null
  cantidad: number | null
  unidad: Unidad | null
  base: number | null
  porcentaje: number | null
  importe: number
  manual: boolean
  en_recibo: boolean
  orden: number
  a_confirmar: boolean
}
export interface TotalesRecibo {
  remunerativo: number; no_remunerativo: number; descuentos: number; neto: number
  contribuciones: number; fondo_cese: number; costo_total: number
}
export interface ResultadoCalculo {
  lineas: LineaCalculada[]
  totales: TotalesRecibo
  dias_trabajados: number | null
  horas_trabajadas: number | null
  antiguedad_anios: number
  valor_escala: number
  unidad_basico: UnidadBasico
  valor_hora: number
  fecha_valores: ISODate
  avisos: AvisoCalculo[]
}

export interface Pagina<T> { items: T[]; total: number; limit: number; offset: number; hasMore: boolean }

export interface LiquidacionesFiltro {
  convenio_id?: number | null
  estado?: EstadoLiquidacion | ''
  tipo?: TipoLiquidacion | ''
  desde?: string
  hasta?: string
}

export interface LiquidacionCreate {
  convenio_id: number; tipo: TipoLiquidacion; periodo: ISODate
  quincena?: 1 | 2 | null; fecha_pago?: ISODate | null; obs?: string
}
export interface ResultadoCierre { liquidacion: LiquidacionDetalle; asiento_id: number | null; avisos: AvisoLiquidacion[] }
export interface ResultadoReabrir { liquidacion: LiquidacionDetalle; asiento: { accion: 'anulado' | 'nada'; asiento_id?: number } }
export interface ResultadoAnular {
  liquidacion: LiquidacionDetalle
  asiento: { accion: 'anulado' | 'contraasiento' | 'nada'; asiento_id?: number; contraasiento_id?: number }
}
export interface AsientoPropuesta {
  origen_tabla: 'sueldos_liquidaciones'; origen_id: number; fecha: ISODate; glosa: string; importe: number; vigente: boolean
  lineas: { cuenta_id: number | null; cuenta_codigo: string | null; cuenta_nombre: string | null; debe: number; haber: number; obra_cod: string | null; glosa: string }[]
  motivos: { codigo: string; detalle: Record<string, unknown> | null }[]
  periodo_abierto: boolean
}
export interface Generar { legajo_ids?: number[]; reemplazar?: boolean; incluir_prestamos?: boolean }
export interface ResultadoGenerar {
  creados: { legajo_id: number; nombre: string; neto: number; avisos: string[] }[]
  omitidos: { legajo_id: number; nombre: string; motivo: 'YA_TIENE_RECIBO' | 'OTRO_CONVENIO' | string }[]
  errores: { legajo_id: number; nombre: string; error: string; detail?: unknown }[]
  liquidacion: LiquidacionDetalle
}

export interface HorasTarja { desde: ISODate; hasta: ISODate; horas: number; dias: { fecha: ISODate; obra_cod: string; horas: number }[] }
export interface SaldoPrestamos {
  saldo: number; otorgado: number; descontado: number; incobrable: number; movimientos: number
  /** Lo ya puesto como descuento en OTRAS liquidaciones todavía en borrador. */
  en_borradores?: number
}
export interface SugerenciaSac {
  anio: number; semestre: 1 | 2; desde: ISODate; hasta: ISODate
  meses: { periodo: ISODate; remunerativo: number }[]
  mejor_periodo: ISODate | null; mejor_remuneracion: number
  dias_semestre: number; dias_computados: number; importe: number; proporcional: boolean
  avisos: AvisoCalculo[]
}
export interface SugerenciaVacaciones {
  anio: number; antiguedad_anios: number
  criterio: 'escala' | 'proporcional'
  dias: number; valor_dia: number
  base_valor: 'jornal' | 'sueldo_25'
  remuneracion_base: number; importe: number; avisos: AvisoCalculo[]
}
export interface SugerenciaFinal {
  fecha_egreso: ISODate
  sac_proporcional: SugerenciaSac
  vacaciones_no_gozadas: { dias_anuales: number; dias_trabajados_anio: number; dias_gozados: number; dias: number; valor_dia: number; importe: number }
  avisos: AvisoCalculo[]
}
export interface SugerenciasRecibo {
  entradas: EntradasRecibo
  horas_tarja: HorasTarja | null
  prestamos: SaldoPrestamos | null
  sac: SugerenciaSac | null
  vacaciones: SugerenciaVacaciones | null
  final: SugerenciaFinal | null
}

export interface AvisoExport { codigo: string; legajo_id?: number; nombre?: string; detalle?: Record<string, unknown> }

export interface ExportBanco {
  archivo: string
  filas: { legajo_id: number; cuil: string; nombre: string; cbu: string; importe: number }[]
  total: number
  avisos: AvisoExport[]
  csv: string
}

export interface LineaExport {
  concepto_id: number | null; codigo_arca: string | null; nombre: string; tipo: TipoConcepto
  destino: string | null; grupo_contribucion: string | null; cantidad: number | null; unidad: string | null; importe: number
}
export interface LiquidacionExport {
  id: number; codigo: string; numero: number; tipo: TipoLiquidacion; periodo: ISODate; quincena: 1 | 2 | null
  fecha_pago: ISODate | null; estado: string; convenio: { codigo: string; nombre: string }
}
export interface ResumenContador {
  liquidacion: LiquidacionExport
  empleados: {
    legajo_id: number; leg: string | null; nombre: string; cuil: string | null; categoria: string | null
    dias_trabajados: number | null; horas_trabajadas: number | null
    total_remunerativo: number; total_no_remunerativo: number; total_descuentos: number; neto: number
    total_contribuciones: number; fondo_cese: number
    lineas: LineaExport[]
  }[]
  conceptos: {
    clave: string; concepto_id: number | null; codigo_arca: string | null; nombre: string; tipo: TipoConcepto
    destino: string | null; grupo_contribucion: string | null; importe: number; cantidad: number; empleados: number
  }[]
  por_destino: Partial<Record<Destino, number>>
  totales: { empleados: number; remunerativo: number; no_remunerativo: number; descuentos: number; neto: number; contribuciones: number; fondo_cese: number }
  avisos: AvisoExport[]
}

export interface ExportLsd {
  archivo: string
  registros: { '01': number; '02': number; '03': number; '04': number }
  avisos: AvisoExport[]
  contenido: string
}

/** GET /exportar/lsd-conceptos: alta masiva de conceptos del empleador en el LSD (se sube UNA vez). */
export interface ExportLsdConceptos {
  archivo: string
  conceptos: number
  avisos: AvisoExport[]
  contenido: string
}
