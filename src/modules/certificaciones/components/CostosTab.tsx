'use client'

import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useObras }      from '@/modules/tarja/hooks/useObras'
import { usePersonal }   from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useHorasSemana } from '@/modules/tarja/hooks/useHoras'
import { useHsExtras, useHsExtrasAll } from '@/modules/tarja/hooks/useHsExtras'
import { useTarifasObra } from '@/modules/tarja/hooks/useTarifas'
import { useCertificacionesObra } from '@/modules/tarja/hooks/useContratistas'
import { Combobox } from '@/components/ui/Combobox'
import { calcularTotalesSemana } from '@/lib/utils/costos'
import { getSemDays, getSemLabel, getViernes, toISO } from '@/lib/utils/dates'
import { horasApi } from '@/lib/api/horas.api'
import type { Obra, Certificacion } from '@/types/domain.types'

function fmtM(n: number) { return '$' + Math.round(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }) }

// Genera las últimas N viernes
function ultimasSemanas(n: number): Date[] {
  const semanas: Date[] = []
  let vie = getViernes(new Date())
  for (let i = 0; i < n; i++) {
    semanas.push(new Date(vie))
    vie = new Date(vie.getTime() - 7 * 86400000)
  }
  return semanas
}

const SEMANAS = ultimasSemanas(16)

function FilaSemana({
  vie, obraCod,
}: {
  vie: Date
  obraCod: string
}) {
  const { data: personal   = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas    = [] } = useTarifasObra(obraCod)
  const { data: certs      = [] } = useCertificacionesObra(obraCod)

  const dias   = getSemDays(vie)
  const desde  = toISO(dias[0]!)
  const hasta  = toISO(dias[dias.length - 1]!)
  const semKey = toISO(vie)

  const { data: horas    = [] } = useHorasSemana(obraCod, desde, hasta)
  const { data: hsExtras = [] } = useHsExtras(obraCod, desde, hasta)

  const personalObra = personal.filter(p =>
    (horas as any[]).some((h: any) => h.leg === p.leg)
    || (hsExtras as any[]).some((e: any) => e.leg === p.leg)
  )

  const { totalCosto } = calcularTotalesSemana(
    horas as any[], personalObra as any[], categorias as any[], tarifas as any[], obraCod, dias, hsExtras as any[]
  )
  const costoCont = (certs as Certificacion[])
    .filter(c => c.sem_key === semKey)
    .reduce((s, c) => s + c.monto, 0)
  const total = totalCosto + costoCont

  if (total === 0) return null

  return (
    <tr className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
      <td className="px-4 py-3 font-medium text-carbon text-sm">{getSemLabel(vie)}</td>
      <td className="px-4 py-3 font-mono text-right text-azul-mid">{fmtM(totalCosto)}</td>
      <td className="px-4 py-3 font-mono text-right text-naranja">
        {costoCont > 0 ? fmtM(costoCont) : <span className="text-gris-mid text-xs">—</span>}
      </td>
      <td className="px-4 py-3 font-mono font-bold text-right text-carbon">{fmtM(total)}</td>
    </tr>
  )
}

function TotalesObra({ obraCod }: { obraCod: string }) {
  const { data: personal   = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas    = [] } = useTarifasObra(obraCod)
  const { data: certs      = [] } = useCertificacionesObra(obraCod)
  // Todas las hs extras (una sola query). Filtramos por obra abajo.
  const { data: hsExtrasAll = [] } = useHsExtrasAll()
  const hsExtrasObra = (hsExtrasAll as any[]).filter(e => e.obra_cod === obraCod)

  const horasQueries = useQueries({
    queries: SEMANAS.map(vie => {
      const dias  = getSemDays(vie)
      const desde = toISO(dias[0]!)
      const hasta = toISO(dias[dias.length - 1]!)
      return {
        queryKey: ['horas', obraCod, desde, hasta],
        queryFn: () => horasApi.getBySemana(obraCod, desde, hasta),
        enabled: !!obraCod,
      }
    }),
  })

  let totalOperarios    = 0
  let totalContratistas = 0

  SEMANAS.forEach((vie, i) => {
    const horas  = (horasQueries[i]?.data ?? []) as any[]
    const dias   = getSemDays(vie)
    const semKey = toISO(vie)
    // Personal de la obra en la semana: los que tienen horas O hs extras.
    const personalObra = (personal as any[]).filter(p =>
      horas.some((h: any) => h.leg === p.leg)
      || hsExtrasObra.some(e => e.leg === p.leg && e.sem_key === semKey)
    )
    const { totalCosto } = calcularTotalesSemana(
      horas, personalObra, categorias as any[], tarifas as any[], obraCod, dias, hsExtrasObra,
    )
    const costoCont = (certs as Certificacion[]).filter(c => c.sem_key === semKey).reduce((s, c) => s + c.monto, 0)
    totalOperarios    += totalCosto
    totalContratistas += costoCont
  })

  const total = totalOperarios + totalContratistas
  if (total === 0) return null

  return (
    <tfoot>
      <tr className="border-t-2 border-azul bg-azul-light">
        <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gris-dark">Total acumulado (16 semanas)</td>
        <td className="px-4 py-3 font-mono font-bold text-right text-azul-mid">{fmtM(totalOperarios)}</td>
        <td className="px-4 py-3 font-mono font-bold text-right text-naranja">{fmtM(totalContratistas)}</td>
        <td className="px-4 py-3 font-mono font-bold text-right text-lg text-carbon">{fmtM(total)}</td>
      </tr>
    </tfoot>
  )
}

export function CostosTab() {
  const { data: obras = [] } = useObras()
  const [obraSel, setObraSel] = useState('')

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)

  return (
    <>
      <div className="max-w-xs">
        <Combobox
          placeholder="Buscar obra..."
          options={obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.resp ?? undefined }))}
          value={obraSel}
          onChange={setObraSel}
        />
      </div>

      {!obraSel ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          Seleccioná una obra para ver el detalle de costos semana a semana.
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris bg-azul-light">
            <div className="font-bold text-azul text-sm">
              {obrasActivas.find(o => o.cod === obraSel)?.nom ?? obraSel}
            </div>
            <div className="text-xs text-gris-dark mt-0.5">Últimas 16 semanas · Operarios + Contratistas</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[500px]">
              <thead>
                <tr>
                  {['Semana', 'Operarios', 'Contratistas', 'Total'].map(h => (
                    <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide last:text-right [&:not(:first-child)]:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEMANAS.map(vie => (
                  <FilaSemana key={toISO(vie)} vie={vie} obraCod={obraSel} />
                ))}
              </tbody>
              <TotalesObra obraCod={obraSel} />
            </table>
          </div>
        </div>
      )}
    </>
  )
}
