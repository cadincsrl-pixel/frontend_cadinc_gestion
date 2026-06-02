// Cálculo de horas de un parte a partir de los pares entrada/salida.
//
// Reglas (decididas con el user):
// - Cada tramo (mañana, tarde) aporta salida − entrada en horas decimales.
// - Si falta entrada o salida del tramo → ese tramo aporta 0 (no se asume nada).
// - Si la salida es <= entrada (typo o turno cruzado no contemplado en Fase 1)
//   → el tramo aporta 0. No restamos horas negativas.
// - El total se redondea a 2 decimales para evitar ruido de punto flotante.

/** Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche. null si no parsea. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null
  const parts = t.split(':')
  if (parts.length < 2) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/** Horas decimales de un tramo (entrada→salida). 0 si falta un extremo o salida<=entrada. */
export function horasTramo(entrada: string | null | undefined, salida: string | null | undefined): number {
  const e = timeToMinutes(entrada)
  const s = timeToMinutes(salida)
  if (e == null || s == null) return 0
  const diff = s - e
  if (diff <= 0) return 0
  return diff / 60
}

export interface TramosParte {
  manana_entrada: string | null
  manana_salida:  string | null
  tarde_entrada:  string | null
  tarde_salida:   string | null
}

/** Horas totales del parte (mañana + tarde), redondeadas a 2 decimales. */
export function calcularHorasParte(p: TramosParte): number {
  const total = horasTramo(p.manana_entrada, p.manana_salida) + horasTramo(p.tarde_entrada, p.tarde_salida)
  return Math.round(total * 100) / 100
}

/** Formatea horas decimales para mostrar: "8" o "7,5" (coma decimal AR). */
export function fmtHoras(h: number): string {
  if (!Number.isFinite(h) || h === 0) return '0'
  // Hasta 2 decimales, sin ceros sobrantes, con coma decimal.
  const s = (Math.round(h * 100) / 100).toString()
  return s.replace('.', ',')
}
