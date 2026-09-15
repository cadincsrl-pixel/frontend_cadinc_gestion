// ─────────────────────────────────────────────────────────────────────────────
// JORNALES en el export de tarja (src/modules/tarja/export/collectData.ts)
//
// Pedido del dueño (2026-09-14): el Excel detallado de una obra decía las
// horas de cada operario pero no cuántos DÍAS trabajó. Un jornal es un día
// con horas regulares cargadas (> 0). Reglas que congela este test:
//   - una fila de horas en 0 NO es un jornal;
//   - las hs extras van por semana, sin fecha: no suman jornales;
//   - otra obra y otro legajo no cuentan;
//   - el filtro de semanas acota los jornales igual que las horas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { collectData } from '@/modules/tarja/export/collectData'
import type { ExportInput } from '@/modules/tarja/export/types'
import type { Hora, Personal, Categoria, TarjaHsExtra, Obra } from '@/types/domain.types'

let seqId = 0
function mkPersonal(leg: string, nom: string, cat_id: number): Personal {
  return {
    leg, nom, cat_id,
    dni: null, condicion: 'blanco', modalidad: 'hora',
    tel: null, dir: null, obs: null,
    talle_pantalon: null, talle_botines: null, talle_camisa: null,
    activo_override: null, fecha_nacimiento: null, padron_externo: null,
    personal_cat_historial: [],
  }
}
function mkHora(obra_cod: string, leg: string, fecha: string, horas: number): Hora {
  return { id: ++seqId, obra_cod, leg, fecha, horas }
}
function mkExtra(obra_cod: string, leg: string, sem_key: string, hs: number): TarjaHsExtra {
  return { id: ++seqId, obra_cod, leg, sem_key, hs }
}

const OBRA_COD = 'OB-124'
const OBRA = { cod: OBRA_COD, nom: 'Obra de prueba', cc: null, archivada: false, es_deposito: false } as unknown as Obra
const CAT_OFICIAL: Categoria = {
  id: 1, nom: 'Oficial', vh: 7200,
  categoria_tarifas: [{ id: 11, vh: 7200, desde: '2026-03-06' }],
}
const PEREZ = mkPersonal('1042', 'PÉREZ JUAN', 1)
const GOMEZ = mkPersonal('2087', 'GÓMEZ LUIS', 1)

// Semana 1: vie 2026-05-15 → jue 2026-05-21. Semana 2: vie 2026-05-22 → jue 2026-05-28.
// PÉREZ: sem 1 → vie, sáb, lun, mar, mié, jue (6 días, 49 hs); sem 2 → vie, lun (2 días).
// GÓMEZ: sem 1 → vie, lun, mar, mié, jue (5 días) + una fila en 0 el sábado.
const HORAS: Hora[] = [
  mkHora(OBRA_COD, '1042', '2026-05-15', 9),
  mkHora(OBRA_COD, '1042', '2026-05-16', 4),
  mkHora(OBRA_COD, '1042', '2026-05-18', 9),
  mkHora(OBRA_COD, '1042', '2026-05-19', 9),
  mkHora(OBRA_COD, '1042', '2026-05-20', 9),
  mkHora(OBRA_COD, '1042', '2026-05-21', 9),
  mkHora(OBRA_COD, '1042', '2026-05-22', 9),
  mkHora(OBRA_COD, '1042', '2026-05-25', 9),
  mkHora(OBRA_COD, '2087', '2026-05-15', 9),
  mkHora(OBRA_COD, '2087', '2026-05-16', 0), // cargada en cero: no es un día trabajado
  mkHora(OBRA_COD, '2087', '2026-05-18', 9),
  mkHora(OBRA_COD, '2087', '2026-05-19', 9),
  mkHora(OBRA_COD, '2087', '2026-05-20', 9),
  mkHora(OBRA_COD, '2087', '2026-05-21', 9),
  // Ruido: otra obra, mismo legajo y fecha. No suma.
  mkHora('OB-999', '1042', '2026-05-18', 8),
]

function input(filtroSem: ExportInput['filtroSem'] = null): ExportInput {
  return {
    obra:               OBRA,
    personalAll:        [PEREZ, GOMEZ],
    categorias:         [CAT_OFICIAL],
    horasAll:           HORAS,
    tarifasAll:         [],
    cierres:            [],
    certificacionesAll: [],
    contratistas:       [],
    catObraAll:         [],
    // 4 hs extras de PÉREZ en la semana 1: suman horas, no días.
    hsExtrasAll:        [mkExtra(OBRA_COD, '1042', '2026-05-15', 4)],
    prestamosAll:       [],
    filtroSem,
  }
}

describe('collectData — jornales (días con horas)', () => {
  const data = collectData(input())

  it('cuenta un jornal por día con horas > 0, por operario, en todo el período', () => {
    const perez = data.operarios.find(o => o.leg === '1042')!
    const gomez = data.operarios.find(o => o.leg === '2087')!
    expect(perez.jornales).toBe(8)   // 6 (sem 1) + 2 (sem 2)
    expect(gomez.jornales).toBe(5)   // el sábado en 0 no cuenta
    // Las hs extras entran en las horas pero no en los días.
    expect(perez.hsExtras).toBe(4)
    expect(perez.hsRegulares).toBe(49 + 18)
  })

  it('suma los jornales de la semana (días-persona) y de la obra', () => {
    const sem1 = data.semanas.find(s => s.semKey === '2026-05-15')!
    const sem2 = data.semanas.find(s => s.semKey === '2026-05-22')!
    expect(sem1.jornales).toBe(11)   // 6 + 5
    expect(sem2.jornales).toBe(2)
    expect(data.totalesObra.jornales).toBe(13)
  })

  it('los lleva al detalle semanal: fila del operario y subtotal de la semana', () => {
    const filaPerez = data.detalleSemanal.find(r => r.tipo === 'operario' && r.leg === '1042' && r.semKey === '2026-05-15')!
    const filaGomez = data.detalleSemanal.find(r => r.tipo === 'operario' && r.leg === '2087' && r.semKey === '2026-05-15')!
    const subtotal1 = data.detalleSemanal.find(r => r.tipo === 'subtotal' && r.semKey === '2026-05-15')!
    const subtotal2 = data.detalleSemanal.find(r => r.tipo === 'subtotal' && r.semKey === '2026-05-22')!
    expect(filaPerez.jornales).toBe(6)
    expect(filaGomez.jornales).toBe(5)
    expect(subtotal1.jornales).toBe(11)
    expect(subtotal2.jornales).toBe(2)
  })

  it('en la planilla de la semana coincide con los días que tienen horas', () => {
    const planilla1 = data.planillas.find(p => p.sem.semKey === '2026-05-15')!
    const perez = planilla1.operarios.find(o => o.leg === '1042')!
    const gomez = planilla1.operarios.find(o => o.leg === '2087')!
    expect(perez.jornales).toBe(6)
    expect(perez.jornales).toBe(Object.keys(perez.horasPorDia).length)
    expect(gomez.jornales).toBe(5)
    expect(gomez.horasPorDia['2026-05-16']).toBeUndefined()
  })

  it('respeta el filtro de semanas: solo cuenta los días del rango', () => {
    const soloSem2 = collectData(input({ desde: '2026-05-22', hasta: '2026-05-22' }))
    const perez = soloSem2.operarios.find(o => o.leg === '1042')!
    expect(perez.jornales).toBe(2)
    // GÓMEZ no tarjó esa semana: no aparece.
    expect(soloSem2.operarios.find(o => o.leg === '2087')).toBeUndefined()
    expect(soloSem2.totalesObra.jornales).toBe(2)
  })
})
