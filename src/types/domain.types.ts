// ── Auditoría ──
export interface AuditFields {
  created_at?: string | null
  updated_at?: string | null
  created_by?: string | null
  updated_by?: string | null
}

// ── Obras ──
export interface Obra extends AuditFields {
  cod: string
  nom: string
  cc: string | null
  dir: string | null
  resp: string | null
  obs: string | null
  archivada: boolean
  fecha_archivo: string | null
}

export interface CreateObraDto {
  cod: string
  nom: string
  cc?: string
  dir?: string
  resp?: string
  obs?: string
}

export interface UpdateObraDto {
  nom?: string
  cc?: string
  dir?: string
  resp?: string
  obs?: string
}

// ── Personal ──
export interface CatHistorial {
  cat_id: number
  desde: string
}

export interface Personal extends AuditFields {
  leg: string
  nom: string
  dni: string | null
  cat_id: number
  tel: string | null
  dir: string | null
  obs: string | null
  talle_pantalon:  string | null
  talle_botines:   string | null
  talle_camisa:    string | null
  activo_override: boolean | null
  personal_cat_historial: CatHistorial[]
}

export interface CreatePersonalDto {
  leg: string
  nom: string
  dni?: string
  cat_id: number
  tel?: string
  dir?: string
  obs?: string
  talle_pantalon?: string
  talle_botines?:  string
  talle_camisa?:   string
}

export interface UpdatePersonalDto {
  nom?: string
  dni?: string
  cat_id?: number
  tel?: string
  dir?: string
  obs?: string
  talle_pantalon?:  string
  talle_botines?:   string
  talle_camisa?:    string
  activo_override?: boolean | null
}

// ── Categorías ──
export interface Categoria {
  id: number
  nom: string
  vh: number
}

export interface CreateCategoriaDto {
  nom: string
  vh: number
}

export interface UpdateCategoriaDto {
  nom?: string
  vh?: number
}

// ── Horas ──
export interface Hora extends AuditFields {
  id: number
  obra_cod: string
  fecha: string
  leg: string
  horas: number
}

export interface UpsertHoraDto {
  obra_cod: string
  fecha: string
  leg: string
  horas: number
}

export interface UpsertHorasLoteDto {
  obra_cod: string
  horas: Array<{
    fecha: string
    leg: string
    horas: number
  }>
}

// ── Tarifas ──
export interface Tarifa extends AuditFields {
  id: number
  obra_cod: string
  cat_id: number
  vh: number
  desde: string
}

// ── Cierres ──
export type CierreEstado = 'pendiente' | 'cerrado'

export interface Cierre extends AuditFields {
  id: number
  obra_cod: string
  sem_key: string
  estado: CierreEstado
  cerrado_en: string | null
}

// ── Contratistas ──
export interface Contratista extends AuditFields {
  id: number
  nom: string
  especialidad: string | null
  tel: string | null
  obs: string | null
}

// ── Certificaciones ──
export type CertEstado = 'pendiente' | 'cerrado'

export interface Certificacion extends AuditFields {
  id: number
  obra_cod: string
  contrat_id: number
  sem_key: string
  monto: number
  desc: string
  estado: CertEstado
}

export type ChoferEstado = 'activo' | 'descanso' | 'inactivo'
export type CamionEstado = 'activo' | 'mantenimiento' | 'inactivo'
export type ViajeEstado  = 'en_curso' | 'completado'
export type LiqEstado    = 'borrador' | 'cerrada'

export interface Chofer extends AuditFields {
  id: number
  nombre: string
  dni: string | null
  tel: string | null
  licencia: string | null
  estado: ChoferEstado
  camion_id: number | null
  basico_dia: number
  precio_km: number
  obs: string | null
}

export interface Camion extends AuditFields {
  id: number
  patente: string
  modelo: string | null
  anio: number | null
  estado: CamionEstado
  obs: string | null
}

export interface Cantera {
  id: number
  nombre: string
  localidad: string | null
  obs: string | null
}

export interface Deposito {
  id: number
  nombre: string
  localidad: string | null
  obs: string | null
}

export interface Ruta {
  id: number
  cantera_id: number
  deposito_id: number
  km_ida_vuelta: number
  obs: string | null
  canteras?: { nombre: string }
  depositos?: { nombre: string }
}

export interface Carga {
  id: number
  viaje_id: number
  fecha: string
  cantera_id: number
  toneladas: number | null
  remito_num: string | null
  remito_url: string | null
  obs: string | null
}

export interface Descarga {
  id: number
  viaje_id: number
  fecha: string
  deposito_id: number
  toneladas: number | null
  remito_num: string | null
  remito_url: string | null
  obs: string | null
}

export interface Viaje {
  id: number
  chofer_id: number
  camion_id: number
  estado: ViajeEstado
  obs: string | null
  created_at: string
  cargas: Carga[]
  descargas: Descarga[]
}

export type TramoTipo   = 'cargado' | 'vacio'
export type TramoEstado = 'en_curso' | 'completado'

export interface Tramo {
  id:          number
  chofer_id:   number
  camion_id:   number
  tipo:        TramoTipo
  estado:      TramoEstado
  empresa_id:  number | null
  cantera_id:  number | null   // origen en cargado, destino en vacio
  deposito_id: number | null   // destino en cargado, origen en vacio

  // Carga
  fecha_carga:        string | null
  toneladas_carga:    number | null
  remito_carga:       string | null

  // Descarga
  fecha_descarga:     string | null
  toneladas_descarga: number | null
  remito_descarga:    string | null

  // Vacío
  fecha_vacio: string | null

  liquidacion_id: number | null
  cobro_id:       number | null
  obs:            string | null
  created_at:  string
  updated_at:  string
  created_by:  string | null
  updated_by:  string | null
}

export interface Liquidacion {
  id: number
  chofer_id: number
  fecha_desde: string
  fecha_hasta: string
  dias_trabajados: number
  basico_dia: number
  subtotal_basico: number
  total_adelantos: number
  total_neto: number
  estado: LiqEstado
  obs: string | null
  created_at: string
}

export interface Adelanto {
  id: number
  chofer_id: number
  fecha: string
  monto: number
  descripcion: string | null
  liquidacion_id: number | null
}

export interface TarifaCantera {
  id: number
  cantera_id: number
  valor_ton: number
  obs: string | null
  updated_at: string | null
  updated_by: string | null
  canteras?: { nombre: string; localidad: string | null }
}

export type EmpresaEstado = 'activa' | 'inactiva'

export interface EmpresaTransportista extends AuditFields {
  id: number
  nombre: string
  cuit: string | null
  tel: string | null
  email: string | null
  obs: string | null
  estado: EmpresaEstado
}

export interface TarifaEmpresaCantera {
  id: number
  empresa_id: number
  cantera_id: number
  valor_ton: number
  vigente_desde: string
  obs: string | null
  updated_at: string | null
  updated_by: string | null
  empresas_transportistas?: { nombre: string }
  canteras?: { nombre: string; localidad: string | null }
}

export type CobroEstado = 'pendiente' | 'cobrado'

export interface Cobro {
  id: number
  empresa_id: number
  fecha_desde: string
  fecha_hasta: string
  toneladas_totales: number
  total: number
  estado: CobroEstado
  obs: string | null
  created_at: string
  empresas_transportistas?: { nombre: string }
}

export type Accion = 'lectura' | 'creacion' | 'actualizacion' | 'eliminacion'
export type ModuloPermisos = { [K in Accion]?: boolean }
export type Permisos = Record<string, ModuloPermisos>

export interface Profile {
  id:       string
  nombre:   string
  rol:      'admin' | 'operador'
  modulos:  string[]
  activo:   boolean
  permisos: Permisos
}

export interface Modulo {
  id:          number
  key:         string
  nombre:      string
  descripcion: string | null
  icono:       string | null
  activo:      boolean
  orden:       number
}

export interface HerrTipo {
  id:     number
  nom:    string
  icono:  string | null
  activo: boolean
  orden:  number
}

export interface HerrEstado {
  key:    string
  nom:    string
  color:  string
  icono:  string | null
  activo: boolean
  orden:  number
}

export interface HerrMovTipo {
  key:         string
  nom:         string
  icono:       string | null
  color:       string
  descripcion: string | null
  activo:      boolean
  orden:       number
}

export interface Herramienta {
  id:            number
  codigo:        string
  nom:           string
  tipo_id:       number | null
  tipo:          HerrTipo | null
  marca:         string | null
  modelo:        string | null
  serie:         string | null
  fecha_ingreso: string | null
  estado_key:    string
  estado:        HerrEstado | null
  obra_cod:      string | null
  obra:          { cod: string; nom: string } | null
  responsable:   string | null
  obs:           string | null
  activo:        boolean
  created_at:    string
  updated_at:    string
  created_by?:   string | null
  updated_by?:   string | null
}

export interface HerrMovimiento {
  id:               number
  herramienta_id:   number
  herramienta:      { id: number; codigo: string; nom: string } | null
  tipo_key:         string
  tipo:             HerrMovTipo | null
  obra_origen_cod:  string | null
  obra_origen:      { cod: string; nom: string } | null
  obra_destino_cod: string | null
  obra_destino:     { cod: string; nom: string } | null
  responsable:      string | null
  obs:              string | null
  fecha:            string
  created_at:       string
}

export interface HerrConfig {
  tipos:    HerrTipo[]
  estados:  HerrEstado[]
  movTipos: HerrMovTipo[]
}

export interface HerrStats {
  total:              number
  disponibles:        number
  enUso:              number
  enRep:              number
  bajas:              number
  enObras:            number
  ultimosMovimientos: HerrMovimiento[]
}

// ── Ropa de trabajo ──
export interface RopaCategoria {
  id:                 number
  nombre:             string
  icono:              string | null
  activo:             boolean
  meses_vencimiento:  number
}

export interface RopaEntrega {
  id:            number
  leg:           string
  categoria_id:  number
  fecha_entrega: string
  obs:           string | null
  created_by:    string | null
  created_at:    string
}

// ── Préstamos ──
export interface Prestamo {
  id:         number
  leg:        string
  sem_key:    string
  tipo:       'otorgado' | 'descontado'
  monto:      number
  concepto:   string | null
  created_by: string | null
  created_at: string
}

// ── Remitos generales ──
export interface RemitoItem {
  id?:          number
  descripcion:  string
  cantidad:     number
  unidad:       string
  obs?:         string | null
}

export interface Remito extends AuditFields {
  id:       number
  numero:   string
  fecha:    string
  origen:   string
  destino:  string
  estado:   'borrador' | 'emitido'
  obs?:     string | null
  items:    RemitoItem[]
}