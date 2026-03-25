// ── Obras ──
export interface Obra {
  cod: string
  nom: string
  cc: string | null
  dir: string | null
  resp: string | null
  obs: string | null
  archivada: boolean
  fecha_archivo: string | null
  created_at?: string
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

export interface Personal {
  leg: string
  nom: string
  dni: string | null
  cat_id: number
  tel: string | null
  dir: string | null
  obs: string | null
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
}

export interface UpdatePersonalDto {
  nom?: string
  dni?: string
  cat_id?: number
  tel?: string
  dir?: string
  obs?: string
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
export interface Hora {
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
export interface Tarifa {
  id: number
  obra_cod: string
  cat_id: number
  vh: number
  desde: string
}

// ── Cierres ──
export type CierreEstado = 'pendiente' | 'cerrado'

export interface Cierre {
  id: number
  obra_cod: string
  sem_key: string
  estado: CierreEstado
  cerrado_en: string | null
}

// ── Contratistas ──
export interface Contratista {
  id: number
  nom: string
  especialidad: string | null
  tel: string | null
  obs: string | null
}

// ── Certificaciones ──
export type CertEstado = 'pendiente' | 'cerrado'

export interface Certificacion {
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

export interface Chofer {
  id: number
  nombre: string
  dni: string | null
  tel: string | null
  licencia: string | null
  estado: ChoferEstado
  obs: string | null
}

export interface Camion {
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

export interface Liquidacion {
  id: number
  chofer_id: number
  fecha_desde: string
  fecha_hasta: string
  dias_trabajados: number
  km_totales: number
  precio_km: number
  basico_dia: number
  subtotal_km: number
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

export interface Profile {
  id:      string
  nombre:  string
  rol:     'admin' | 'operador'
  modulos: string[]
  activo:  boolean
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
