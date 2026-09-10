'use client'

// Los DATOS de la cuenta por administración de una obra, extraídos de la
// sección para que también los use el modal de exportar: las mismas queries
// (React Query las comparte por queryKey, así montar los dos no duplica
// requests) y el mismo cálculo, un solo resultado posible.
//
// Todo lo que se ve acá ya estaba cargado en el sistema: horas de tarja
// (fórmula canónica §5.11), certificaciones de contratistas y materiales de la
// cuenta corriente. El % vigente se aplica por semana (patas semanales) o por
// fecha del renglón (materiales) — un cambio de porcentaje a mitad de obra
// vale desde su viernes y no re-factura lo anterior.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { usePersonal }   from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useTarifasObra } from '@/modules/tarja/hooks/useTarifas'
import { useHsExtras } from '@/modules/tarja/hooks/useHsExtras'
import { useCertificacionesObra } from '@/modules/tarja/hooks/useContratistas'
import { useCobrosCliente, useNotasCredito } from '../../hooks/useCuentaCliente'
import { useAdminTarifas, useAdminImputaciones, pctVigente } from '../../hooks/useAdministracion'
import { fetchCuentaRenglonesTodos } from '../../hooks/useCuentaCorriente'
import { costoOperariosSemana, type CatObraEntry } from '@/lib/utils/costos'
import { getSemDays, getViernes, toISO } from '@/lib/utils/dates'
import type {
  Obra, Hora, TarjaHsExtra, Personal, Categoria, Tarifa, Certificacion, CuentaRenglon, AdminTarifa, CuentaClienteCobro,
} from '@/types/domain.types'

/** Una semana de la cuenta: las dos patas semanales con su % aplicado. */
export interface SemanaAdmin {
  semKey:          string
  moCosto:         number
  moPct:           number
  moFacturable:    number
  /** La semana ya fue cubierta por un pago: el facturable es el monto congelado. */
  moCobrada:       boolean
  contCosto:       number
  contPct:         number
  contFacturable:  number
  contCobrada:     boolean
}

export interface MesMateriales {
  mes:        string
  costo:      number
  facturable: number
}

export interface CuentaAdministracion {
  semanas:      SemanaAdmin[]
  meses:        MesMateriales[]
  tot:          {
    mo: number; cont: number; mat: number; total: number; cobrado: number; saldo: number
    /** Los costos puros, sin %: la otra columna del panel de costos. */
    moCosto: number; contCosto: number; matCosto: number; totalCosto: number
  }
  cobros:       CuentaClienteCobro[]
  tarifasAdmin: AdminTarifa[]
  vigente:      AdminTarifa | null
  sinPrecio:    number
  cargando:     boolean
}

/**
 * Dos modos sobre el mismo cálculo:
 *  - 'facturacion' (obras por administración): materiales = la cuenta del
 *    cliente (a cobrar + cobrado), el % es lo pactado y el resultado se
 *    factura.
 *  - 'costos' (obras llave en mano): materiales = lo que pagó CADINC (gasto
 *    CADINC + lo cobrable si lo hubiera), el % es un recargo informativo
 *    (p. ej. cargas sociales sobre la mano de obra) y nada se factura.
 */
export type ModoAdministracion = 'facturacion' | 'costos'

export function useAdministracionCuenta(obra: Obra, modo: ModoAdministracion = 'facturacion'): CuentaAdministracion {
  const obraCod = obra.cod
  const { data: tarifasAdmin = [], isLoading: cargandoPct } = useAdminTarifas(obraCod)
  const { data: imputaciones = [] } = useAdminImputaciones(obraCod)

  // ── Las tres patas, con los datos que el sistema ya tiene ──
  const { data: horas = [] } = useQuery({
    queryKey: ['horas', obraCod, 'all'],
    queryFn:  () => apiGet<Hora[]>(`/api/horas/${encodeURIComponent(obraCod)}`),
    enabled:  !!obraCod,
    staleTime: 60_000,
  })
  const rango = useMemo(() => {
    if (!horas.length) return null
    const fechas = horas.map(h => h.fecha).sort()
    return { desde: toISO(getSemDays(getViernes(new Date(fechas[0]! + 'T12:00:00')))[0]!), hasta: toISO(new Date()) }
  }, [horas])
  const { data: hsExtras = [] } = useHsExtras(obraCod, rango?.desde ?? '', rango?.hasta ?? '')
  const { data: personal = [] }   = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas = [] }    = useTarifasObra(obraCod)
  const { data: catObra = [] }    = useQuery({
    queryKey: ['cat-obra', 'all'],
    queryFn: () => apiGet<CatObraEntry[]>('/api/cat-obra/all'),
  })
  const { data: certs = [] } = useCertificacionesObra(obraCod)
  const { data: cobros = [] } = useCobrosCliente(obraCod)
  // Devoluciones ya cobradas: bajan el saldo pero NO son cobranza (20260913k).
  const { data: notasCredito = [] } = useNotasCredito(obraCod)
  const { data: materiales = [], isLoading: cargandoMat } = useQuery({
    queryKey: ['cuenta-corriente', 'admin-materiales', obraCod, modo],
    // Facturación: la cuenta del cliente — lo adeudado y lo ya cobrado.
    // `pago_directo` queda afuera (el cliente ya le pagó al proveedor) y
    // `gasto_cadinc` también (es plata de CADINC, no de esta cuenta).
    // Costos: todo lo que PAGÓ CADINC — el gasto propio más lo cobrable si
    // lo hubiera; afuera queda solo `pago_directo`, que no salió de su caja.
    queryFn: () => fetchCuentaRenglonesTodos({
      obra_cod: obraCod,
      estados: modo === 'costos' ? ['gasto_cadinc', 'a_cobrar', 'cobrado'] : ['a_cobrar', 'cobrado'],
      archivadas: true,
    }),
    enabled: !!obraCod,
    staleTime: 60_000,
  })

  // ── El cálculo ──
  const semanas = useMemo<SemanaAdmin[]>(() => {
    const keys = new Set<string>()
    for (const h of horas as Hora[]) keys.add(toISO(getViernes(new Date(h.fecha + 'T12:00:00'))))
    for (const e of hsExtras as TarjaHsExtra[]) if (e.obra_cod === obraCod) keys.add(e.sem_key)
    for (const c of certs as Certificacion[]) keys.add(c.sem_key)

    return [...keys].sort().reverse().map(semKey => {
      const vie  = new Date(semKey + 'T12:00:00')
      const dias = getSemDays(vie)
      const personalObra = (personal as Personal[]).filter(p =>
        (horas as Hora[]).some(h => h.leg === p.leg)
        || (hsExtras as TarjaHsExtra[]).some(e => e.leg === p.leg && e.obra_cod === obraCod))
      const moCosto = costoOperariosSemana(
        horas as Hora[], hsExtras as TarjaHsExtra[], personalObra,
        categorias as Categoria[], tarifas as Tarifa[], catObra, obraCod, dias)
      const contCosto = (certs as Certificacion[])
        .filter(c => c.sem_key === semKey)
        .reduce((s, c) => s + Number(c.monto ?? 0), 0)
      const pct = pctVigente(tarifasAdmin, semKey)
      const moPct   = Number(pct?.pct_operarios ?? 0)
      const contPct = Number(pct?.pct_contratistas ?? 0)
      // Una semana cubierta por un pago usa el monto CONGELADO al imputar, no
      // el cálculo vivo: lo que el cliente ya pagó no se mueve más, aunque una
      // tarifa cambie retroactivamente. Es el "Cobrado" de las semanas.
      const moCong   = imputaciones.find(i => i.sem_key === semKey && i.pata === 'operarios')
      const contCong = imputaciones.find(i => i.sem_key === semKey && i.pata === 'contratistas')
      // Sin redondear acá: se acumula exacto y fmtM redondea al mostrar. Si se
      // redondeara por fila, con 0% el facturable diferiría del costo por los
      // centavos perdidos — y "al costo" tiene que dar EXACTAMENTE el costo.
      return {
        semKey,
        moCosto,   moPct,
        moFacturable:   moCong ? Number(moCong.monto) : moCosto * (1 + moPct / 100),
        moCobrada:      !!moCong,
        contCosto, contPct,
        contFacturable: contCong ? Number(contCong.monto) : contCosto * (1 + contPct / 100),
        contCobrada:    !!contCong,
      }
    }).filter(s => s.moCosto > 0 || s.contCosto > 0)
  }, [horas, hsExtras, certs, personal, categorias, tarifas, catObra, obraCod, tarifasAdmin, imputaciones])

  const meses = useMemo<MesMateriales[]>(() => {
    const por = new Map<string, MesMateriales>()
    for (const r of materiales as CuentaRenglon[]) {
      const fecha = r.fecha_resolucion ?? toISO(new Date())
      const mes = fecha.slice(0, 7)
      const pct = Number(pctVigente(tarifasAdmin, fecha)?.pct_materiales ?? 0)
      let m = por.get(mes)
      if (!m) { m = { mes, costo: 0, facturable: 0 }; por.set(mes, m) }
      m.costo      += Number(r.precio_total ?? 0)
      m.facturable += Number(r.precio_total ?? 0) * (1 + pct / 100)
    }
    return [...por.values()].sort((a, b) => b.mes.localeCompare(a.mes))
  }, [materiales, tarifasAdmin])

  const tot = useMemo(() => {
    const mo   = semanas.reduce((s, x) => s + x.moFacturable, 0)
    const cont = semanas.reduce((s, x) => s + x.contFacturable, 0)
    const mat  = meses.reduce((s, x) => s + x.facturable, 0)
    const moCosto   = semanas.reduce((s, x) => s + x.moCosto, 0)
    const contCosto = semanas.reduce((s, x) => s + x.contCosto, 0)
    const matCosto  = meses.reduce((s, x) => s + x.costo, 0)
    const cobrado = (cobros as { monto: number }[]).reduce((s, c) => s + Number(c.monto ?? 0), 0)
    // Término aparte, NO dentro de `cobrado`: una nota de crédito no es plata
    // que entró. Sumarla ahí inflaría el KPI "Cobrado" con devoluciones.
    const notas = (notasCredito as { monto: number }[]).reduce((s, n) => s + Number(n.monto ?? 0), 0)
    return {
      mo, cont, mat, total: mo + cont + mat, cobrado, notas,
      saldo: mo + cont + mat - cobrado - notas,
      moCosto, contCosto, matCosto, totalCosto: moCosto + contCosto + matCosto,
    }
  }, [semanas, meses, cobros, notasCredito])

  const vigente = pctVigente(tarifasAdmin, toISO(new Date()))
  const sinPrecio = (materiales as CuentaRenglon[]).filter(r => Number(r.precio_unit) === 0).length
  const cargando = cargandoPct || cargandoMat

  return { semanas, meses, tot, cobros: cobros as CuentaClienteCobro[], tarifasAdmin, vigente, sinPrecio, cargando }
}
