/**
 * Tipos del módulo "Tarja por Obra" — export XLSX.
 *
 * Dos capas:
 *  - `ExportInput`: data cruda que el caller (modal/componente) ya tiene a mano.
 *  - `ExportData`:  data derivada que producen los builders. La capa
 *    `collectData.ts` consume el input y devuelve el data — los builders solo
 *    consumen `ExportData` (no vuelven a calcular nada).
 */
import type {
  Obra,
  Personal,
  Categoria,
  Hora,
  Tarifa,
  Cierre,
  Certificacion,
  Contratista,
  TarjaHsExtra,
  Prestamo,
} from '@/types/domain.types'
import type { CatObraEntry } from '@/lib/utils/costos'

// ── Inputs ────────────────────────────────────────────────────────

/** Filtro de semanas inclusivo (sem_key viernes). `null` = todo el historial. */
export type FiltroSemanas = { desde: string; hasta: string } | null

/** Input crudo del export — lo arma el caller con la data ya cacheada por React Query. */
export interface ExportInput {
  obra:               Obra
  personalAll:        Personal[]
  categorias:         Categoria[]
  horasAll:           Hora[]
  tarifasAll:         Tarifa[]
  cierres:            Cierre[]
  certificacionesAll: Certificacion[]
  contratistas:       Contratista[]
  catObraAll:         CatObraEntry[]
  hsExtrasAll:        TarjaHsExtra[]
  prestamosAll:       Prestamo[]
  filtroSem:          FiltroSemanas
}

// ── Output derivado: lo que consumen los builders ─────────────────

export interface ExportMeta {
  generadoEn:   Date
  obraCod:      string
  obraNom:      string
  obraCC:       string | null
  /** "Todo el historial" | "Semana del Vie 13/3" | "Vie 13/3 → Jue 19/3" */
  periodoLabel: string
  esRango:      boolean
}

export interface SemanaTotal {
  semKey:            string
  /** "Vie 13/3 → Jue 19/3" */
  periodoCorto:      string
  cobro:             Date
  estado:            'pendiente' | 'cerrado'
  hsRegulares:       number
  hsExtras:          number
  hsTotal:           number
  costoOperarios:    number
  costoContratistas: number
}

export interface OperarioTotal {
  leg:                string
  nom:                string
  dni:                string | null
  catNomActual:       string
  hsRegulares:        number
  hsExtras:           number
  hsTotal:            number
  montoBruto:         number
  prestamosOtorgados: number
  descuentos:         number
  neto:               number
  /** Marcar fila en amarillo si nunca tuvo tarifa vigente en el período. */
  sinTarifaVigente:   boolean
}

export type DetalleTipo = 'operario' | 'contratista' | 'subtotal'

export interface DetalleRow {
  tipo:            DetalleTipo
  semKey:          string
  periodoCorto:    string
  cobro:           Date | null
  nombre:          string
  catEspecialidad: string
  /** `null` para contratistas y subtotales sin horas. */
  horas:           number | null
  monto:           number
  estado:          'pendiente' | 'cerrado' | null
}

export interface PlanillaLongRow {
  semKey:       string
  periodoCorto: string
  leg:          string
  nom:          string
  catNom:       string
  fecha:        Date
  diaSemana:    string
  horas:        number
  tipo:         'Regular' | 'Extra'
}

export interface ContratistaRow {
  semKey:       string
  periodoCorto: string
  cobro:        Date
  nombre:       string
  especialidad: string
  descripcion:  string
  monto:        number
  estado:       'pendiente' | 'cerrado'
}

export interface PrestamoRow {
  leg:            string
  nom:            string
  tipo:           'Otorgado' | 'Descontado'
  monto:          number
  concepto:       string
  semKey:         string
  fecha:          Date | null
  /** Saldo neto acumulado por leg ordenando por fecha ASC. */
  saldoAcumulado: number
}

export interface PersonalRow {
  leg:             string
  nom:             string
  dni:             string | null
  catNomActual:    string
  vh:              number
  tel:             string | null
  dir:             string | null
  fechaNac:        string | null
  /** Primera fecha de horas en esta obra (Date). `null` si nunca cargó horas. */
  antiguedadObra:  Date | null
}

export interface ExportData {
  meta:           ExportMeta
  semanas:        SemanaTotal[]
  operarios:      OperarioTotal[]
  totalesObra: {
    hsRegulares:        number
    hsExtras:           number
    hsTotal:            number
    costoOperarios:     number
    costoContratistas:  number
    prestamosOtorgados: number
    descuentos:         number
    neto:               number
  }
  detalleSemanal:  DetalleRow[]
  planillasLong:   PlanillaLongRow[]
  contratistas:    ContratistaRow[]
  prestamos:       PrestamoRow[]
  personalDeObra:  PersonalRow[]
  flags: {
    hayExtras:        boolean
    hayPrestamos:     boolean
    hayContratistas:  boolean
    sinDatos:         boolean
  }
}
