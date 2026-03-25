
export const DIAS = ['Vie', 'Sáb', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue'] as const
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
] as const

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getViernes(d: Date): Date {
  const dt = new Date(d)
  dt.setHours(12, 0, 0, 0)
  const dw = dt.getDay() // 0=Dom
  const diff = dw >= 5 ? dw - 5 : dw + 2
  dt.setDate(dt.getDate() - diff)
  return dt
}

export function getSemDays(vie: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(vie)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function getSemLabel(vie: Date): string {
  const days = getSemDays(vie)
  const inicio = days[0]!
  const fin = days[6]!
  const mi = MESES[inicio.getMonth()]!.slice(0, 3)
  const mf = MESES[fin.getMonth()]!.slice(0, 3)
  return `${inicio.getDate()} ${mi} → ${fin.getDate()} ${mf} ${fin.getFullYear()}`
}

export function getViernesCobro(vie: Date): Date {
  const v = new Date(vie)
  v.setDate(v.getDate() + 7)
  return v
}

export function esFinde(d: Date): boolean {
  const dw = d.getDay()
  return dw === 0 || dw === 6
}

export function esJueves(d: Date): boolean {
  return d.getDay() === 4
}

export function esHoy(d: Date): boolean {
  return toISO(d) === toISO(new Date())
}

export function getSemKey(vie: Date): string {
  return toISO(vie)
}