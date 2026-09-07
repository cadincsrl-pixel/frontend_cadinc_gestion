// Actividad por legajo (RPC personal_actividad → hook) y mensajes de error de
// la grilla. Antes "activo" y "última obra" se calculaban bajando 19k horas.
import { describe, it, expect } from 'vitest'
import { legsActivosDe, ultimasObrasDe } from '../modules/tarja/hooks/useActividadPersonal'
import { motivoErrorGuardado } from '../lib/utils/cierres'

const FILAS = [
  { leg: '001', ultima_fecha: '2026-09-03', obras_ultima_semana: ['CC NORTE', 'ALTOS'], filas_desde: 12 },
  { leg: '002', ultima_fecha: '2026-06-10', obras_ultima_semana: ['CC BRADEL'], filas_desde: 0 },
  { leg: '085', ultima_fecha: null, obras_ultima_semana: null, filas_desde: 0 },
]

describe('legsActivosDe / ultimasObrasDe', () => {
  it('activo = alguna fila desde el corte (la RPC ya cuenta placeholders en 0)', () => {
    expect([...legsActivosDe(FILAS)]).toEqual(['001'])
    // PostgREST puede mandar el count como string
    expect([...legsActivosDe([{ ...FILAS[1]!, filas_desde: '3' as unknown as number }])]).toEqual(['002'])
  })
  it('última obra: fecha y obras ordenadas; sin horas reales no aparece', () => {
    const m = ultimasObrasDe(FILAS)
    expect(m.get('001')).toEqual({ fecha: '2026-09-03', obras: ['ALTOS', 'CC NORTE'] })
    expect(m.get('002')).toEqual({ fecha: '2026-06-10', obras: ['CC BRADEL'] })
    expect(m.has('085')).toBe(false)
  })
})

describe('motivoErrorGuardado', () => {
  const G = 'No se guardó'
  it('traduce los códigos del backend', () => {
    expect(motivoErrorGuardado({ status: 409, body: { error: 'SEMANA_CERRADA: 2026-08-28' } }, G)).toMatch(/cerrada/)
    expect(motivoErrorGuardado({ status: 400, body: { error: 'FECHA_FUERA_DE_RANGO', detail: 'Solo hoy.' } }, G)).toBe('Solo hoy.')
    expect(motivoErrorGuardado({ status: 409, body: { error: 'AFECTA_SEMANAS_CERRADAS: recalcula 2 semanas' } }, G)).toBe('recalcula 2 semanas')
    expect(motivoErrorGuardado({ status: 403, body: { error: 'SIN_PERMISO' } }, G)).toMatch(/permiso/)
    expect(motivoErrorGuardado({ status: 401 }, G)).toMatch(/sesión/)
  })
  it('sin status es un problema de red; 5xx es del servidor; otro código se muestra', () => {
    expect(motivoErrorGuardado(new Error('Failed to fetch'), G)).toBe('No se guardó (sin conexión con el servidor)')
    expect(motivoErrorGuardado({ status: 500, body: { error: 'boom' } }, G)).toBe('No se guardó (error del servidor)')
    expect(motivoErrorGuardado({ status: 422, body: { error: 'HORAS_INVALIDAS' } }, G)).toBe('No se guardó (HORAS_INVALIDAS)')
    expect(motivoErrorGuardado({ status: 400 }, G)).toBe(G)
  })
})
