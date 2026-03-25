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