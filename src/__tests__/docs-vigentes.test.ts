// Congela la regla de "vigente vs archivado" de los documentos renovables
// (licencia de chofer, RTO/póliza de camión). Bug del 2026-07-30: la regla
// vieja tomaba UN solo archivo (el más nuevo) como vigente, y el dorso de la
// licencia de Acosta mandó al frente a "anteriores".

import { describe, it, expect } from 'vitest'
import { partirVigentesYArchivados } from '@/modules/logistica/utils/docs-vigentes'

describe('partirVigentesYArchivados', () => {
  it('CASO REAL (licencia de Acosta): frente y dorso de la renovación quedan VIGENTES juntos', () => {
    const docs = [
      { id: 10, created_at: '2026-04-27T16:07:25Z', vence_el: '2026-05-24' }, // frente viejo
      { id: 11, created_at: '2026-04-27T16:08:13Z', vence_el: '2026-05-24' }, // dorso viejo
      { id: 19, created_at: '2026-06-01T16:50:16Z', vence_el: '2031-05-23' }, // frente nuevo
      { id: 20, created_at: '2026-06-01T16:53:50Z', vence_el: '2031-05-23' }, // dorso nuevo
    ]
    const { vigentes, archivados } = partirVigentesYArchivados(docs)
    expect(vigentes.map(d => d.id).sort()).toEqual([19, 20])
    expect(archivados.map(d => d.id).sort()).toEqual([10, 11])
  })

  it('una renovación de un solo archivo funciona como antes', () => {
    const docs = [
      { id: 1, created_at: '2026-01-01T00:00:00Z', vence_el: '2026-06-01' },
      { id: 2, created_at: '2026-06-02T00:00:00Z', vence_el: '2027-06-01' },
    ]
    const { vigentes, archivados } = partirVigentesYArchivados(docs)
    expect(vigentes.map(d => d.id)).toEqual([2])
    expect(archivados.map(d => d.id)).toEqual([1])
  })

  it('el más nuevo primero dentro de los vigentes', () => {
    const docs = [
      { id: 19, created_at: '2026-06-01T16:50:16Z', vence_el: '2031-05-23' },
      { id: 20, created_at: '2026-06-01T16:53:50Z', vence_el: '2031-05-23' },
    ]
    const { vigentes } = partirVigentesYArchivados(docs)
    expect(vigentes[0]!.id).toBe(20)
  })

  it('sin vencimiento cargado en el más nuevo, agrupa con los otros sin vencimiento', () => {
    const docs = [
      { id: 1, created_at: '2026-01-01T00:00:00Z', vence_el: '2026-06-01' },
      { id: 2, created_at: '2026-06-02T00:00:00Z', vence_el: null },
      { id: 3, created_at: '2026-06-03T00:00:00Z', vence_el: null },
    ]
    const { vigentes, archivados } = partirVigentesYArchivados(docs)
    expect(vigentes.map(d => d.id).sort()).toEqual([2, 3])
    expect(archivados.map(d => d.id)).toEqual([1])
  })

  it('un solo doc → vigente, sin archivados', () => {
    const { vigentes, archivados } = partirVigentesYArchivados([{ id: 1, vence_el: '2027-01-01' }])
    expect(vigentes).toHaveLength(1)
    expect(archivados).toHaveLength(0)
  })
})
