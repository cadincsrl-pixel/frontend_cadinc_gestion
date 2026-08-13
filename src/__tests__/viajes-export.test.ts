// Congela el mapeo y los totales del export de viajes (Logística > Viajes >
// 📊 Exportar). Nace del pedido del dueño (2026-07-30): "reporte de los viajes
// de determinado período de los camiones que yo seleccione".

import { describe, it, expect } from 'vitest'
import { filasViajesExport, totalesViajes } from '@/modules/logistica/utils/viajes-export'
import type { Tramo } from '@/types/domain.types'

function mkTramo(over: Partial<Tramo> = {}): Tramo {
  return {
    id: 1, chofer_id: 2, camion_id: 3, tipo: 'cargado', estado: 'completado',
    empresa_id: 7, cantera_id: 10, deposito_id: 13, tarifa_variante: null,
    fecha_carga: '2026-07-09', toneladas_carga: 30.5, remito_carga: 'RC-1',
    remito_carga_img_url: null,
    fecha_descarga: '2026-07-10', toneladas_descarga: 30.2, remito_descarga: 'RD-9',
    remito_descarga_img_url: null,
    fecha_vacio: null, liquidacion_id: 24, cobro_id: 63,
    obs: null, orden_dia: null,
    created_at: '', updated_at: '', created_by: null, updated_by: null,
    ...over,
  }
}

const CATALOGOS = {
  choferes:  [{ id: 2, nombre: 'ACOSTA MARIO' }],
  camiones:  [{ id: 3, patente: 'AH568GJ' }],
  canteras:  [{ id: 10, nombre: 'El Cadillal' }],
  depositos: [{ id: 13, nombre: 'TPR Puerto Rosario' }],
  empresas:  [{ id: 7, nombre: 'Paramerica SA' }],
  rutas:     [{ cantera_id: 10, deposito_id: 13, km_ida_vuelta: 880 }],
}

describe('filasViajesExport', () => {
  it('mapea un viaje cargado completo con nombres resueltos', () => {
    const [f] = filasViajesExport({ tramos: [mkTramo()], ...CATALOGOS })
    expect(f).toEqual({
      fecha: '10/07/2026',            // fecha de DESCARGA, no de carga
      tipo: 'Cargado', estado: 'Completado',
      chofer: 'ACOSTA MARIO', camion: 'AH568GJ',
      origen: 'El Cadillal', destino: 'TPR Puerto Rosario',
      km: 880, ton_carga: 30.5, ton_descarga: 30.2,
      empresa: 'Paramerica SA',
      remito_carga: 'RC-1', remito_descarga: 'RD-9',
      liquidado: 'N° 24', cobrado: 'N° 63',
    })
  })

  it('un tramo vacío usa fecha_vacio y no tiene toneladas ni cobro', () => {
    const [f] = filasViajesExport({
      tramos: [mkTramo({
        tipo: 'vacio', fecha_vacio: '2026-07-11', fecha_descarga: null,
        toneladas_carga: null, toneladas_descarga: null,
        empresa_id: null, liquidacion_id: null, cobro_id: null,
        remito_carga: null, remito_descarga: null,
      })],
      ...CATALOGOS,
    })
    expect(f!.fecha).toBe('11/07/2026')
    expect(f!.tipo).toBe('Vacío')
    expect(f!.ton_descarga).toBeNull()
    expect(f!.empresa).toBe('')
    expect(f!.liquidado).toBe('')
  })

  it('un id sin catálogo cae a #id, nunca revienta', () => {
    const [f] = filasViajesExport({
      tramos: [mkTramo({ chofer_id: 99 })], ...CATALOGOS,
    })
    expect(f!.chofer).toBe('#99')
  })
})

describe('totalesViajes', () => {
  it('toneladas con fallback descarga→carga y km sumados', () => {
    const filas = filasViajesExport({
      tramos: [
        mkTramo(),                                              // 30.2 t (descarga) + 880 km
        mkTramo({ id: 2, toneladas_descarga: null }),           // 30.5 t (fallback carga) + 880 km
        mkTramo({ id: 3, tipo: 'vacio', fecha_vacio: '2026-07-12', toneladas_carga: null, toneladas_descarga: null }), // 0 t + 880 km
      ],
      ...CATALOGOS,
    })
    const t = totalesViajes(filas)
    expect(t.viajes_cargados).toBe(2)
    expect(t.tramos_vacios).toBe(1)
    expect(t.toneladas).toBeCloseTo(60.7, 6)
    expect(t.km).toBe(2640)
  })
})
