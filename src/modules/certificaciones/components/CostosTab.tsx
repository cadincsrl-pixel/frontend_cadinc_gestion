'use client'

import { useState, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useObras }      from '@/modules/tarja/hooks/useObras'
import { usePersonal }   from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useHorasSemana } from '@/modules/tarja/hooks/useHoras'
import { useHsExtras, useHsExtrasAll } from '@/modules/tarja/hooks/useHsExtras'
import { useTarifasObra } from '@/modules/tarja/hooks/useTarifas'
import { useCertificacionesObra, useContratistas } from '@/modules/tarja/hooks/useContratistas'
import { Combobox } from '@/components/ui/Combobox'
import { calcularTotalesSemana } from '@/lib/utils/costos'
import { getSemDays, getSemLabel, getViernes, toISO } from '@/lib/utils/dates'
import { horasApi } from '@/lib/api/horas.api'
import type { Obra, Certificacion, Contratista } from '@/types/domain.types'

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
  vie, obraCod, contratSel, contratistaById,
}: {
  vie: Date
  obraCod: string
  contratSel: string
  contratistaById: Map<number, Contratista>
}) {
  const [expanded, setExpanded] = useState(false)
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

  // Certificaciones de la semana, opcionalmente filtradas a un contratista.
  // El desglose por contratista ya está en los datos (cada cert tiene contrat_id).
  const contratFilter = contratSel ? Number(contratSel) : null
  const certsSemana = (certs as Certificacion[])
    .filter(c => c.sem_key === semKey)
    .filter(c => contratFilter == null || c.contrat_id === contratFilter)
    .sort((a, b) => b.monto - a.monto)
  const costoCont = certsSemana.reduce((s, c) => s + c.monto, 0)
  const total = totalCosto + costoCont

  if (total === 0) return null

  const tieneCerts = certsSemana.length > 0

  return (
    <>
      <tr
        className={`border-b border-gris hover:bg-gris/40 transition-colors ${tieneCerts ? 'cursor-pointer' : ''}`}
        onClick={tieneCerts ? () => setExpanded(e => !e) : undefined}
      >
        <td className="px-4 py-3 font-medium text-carbon text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 text-azul text-xs">{tieneCerts ? (expanded ? '▾' : '▸') : ''}</span>
            {getSemLabel(vie)}
          </span>
        </td>
        <td className="px-4 py-3 font-mono text-right text-azul-mid">{fmtM(totalCosto)}</td>
        <td className="px-4 py-3 font-mono text-right text-naranja">
          {costoCont > 0 ? fmtM(costoCont) : <span className="text-gris-mid text-xs">—</span>}
        </td>
        <td className="px-4 py-3 font-mono font-bold text-right text-carbon">{fmtM(total)}</td>
      </tr>
      {expanded && tieneCerts && (
        <tr className="bg-gris/20 border-b border-gris">
          <td colSpan={4} className="px-4 py-2.5">
            <div className="flex flex-col gap-1.5 pl-[18px]">
              {certsSemana.map(c => {
                const ct = contratistaById.get(c.contrat_id)
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-carbon">{ct?.nom ?? `Contratista #${c.contrat_id}`}</span>
                      {ct?.especialidad && <span className="text-xs text-gris-dark">· {ct.especialidad}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${c.estado === 'cerrado' ? 'bg-verde-light text-verde' : 'bg-naranja-light text-naranja'}`}>
                        {c.estado}
                      </span>
                      {c.desc && <span className="text-xs text-gris-dark truncate max-w-[280px]">— {c.desc}</span>}
                    </div>
                    <span className="font-mono text-naranja shrink-0">{fmtM(c.monto)}</span>
                  </div>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function TotalesObra({ obraCod, contratSel }: { obraCod: string; contratSel: string }) {
  const { data: personal   = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas    = [] } = useTarifasObra(obraCod)
  const { data: certs      = [] } = useCertificacionesObra(obraCod)
  // Todas las hs extras (una sola query). Filtramos por obra abajo.
  const { data: hsExtrasAll = [] } = useHsExtrasAll()
  const hsExtrasObra = (hsExtrasAll as any[]).filter(e => e.obra_cod === obraCod)
  const contratFilter = contratSel ? Number(contratSel) : null

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
    const costoCont = (certs as Certificacion[])
      .filter(c => c.sem_key === semKey)
      .filter(c => contratFilter == null || c.contrat_id === contratFilter)
      .reduce((s, c) => s + c.monto, 0)
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
  // Esta pestaña vive bajo /tarja/costos aunque el archivo esté en
  // /modules/certificaciones (legacy). Usa el scope de tarja.
  const { data: obras = [] } = useObras('tarja')
  const [ccSel,      setCcSel]      = useState('')
  const [obraSel,    setObraSel]    = useState('')
  const [contratSel, setContratSel] = useState('')

  const { data: contratistas = [] } = useContratistas()
  const { data: certsObra    = [] } = useCertificacionesObra(obraSel)

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)

  const contratistaById = useMemo(() => {
    const m = new Map<number, Contratista>()
    for (const c of contratistas as Contratista[]) m.set(c.id, c)
    return m
  }, [contratistas])

  // Contratistas con al menos una certificación en la obra elegida (los únicos
  // que aportan costo). Pueblan el filtro.
  const contratistasConCerts = useMemo(() => {
    const ids = new Set<number>()
    for (const c of certsObra as Certificacion[]) ids.add(c.contrat_id)
    return Array.from(ids)
      .map(id => contratistaById.get(id))
      .filter((c): c is Contratista => !!c)
      .sort((a, b) => a.nom.localeCompare(b.nom))
  }, [certsObra, contratistaById])

  const contratNom = contratSel
    ? (contratistaById.get(Number(contratSel))?.nom ?? 'Contratista')
    : 'Contratistas'

  // Centros de costo únicos (excluye null/vacío). Varias obras pueden
  // compartir el mismo CC → útil para acotar la búsqueda de obra.
  const centrosCosto = Array.from(
    new Set(obrasActivas.map(o => o.cc).filter((cc): cc is string => !!cc?.trim()))
  ).sort()

  // Si hay CC seleccionado, mostramos solo las obras de ese CC.
  const obrasFiltradas = ccSel
    ? obrasActivas.filter(o => o.cc === ccSel)
    : obrasActivas

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[200px]">
          <Combobox
            label="Centro de costo"
            placeholder="Todos los CC"
            options={[
              { value: '', label: '— Todos —' },
              ...centrosCosto.map(cc => ({
                value: cc,
                label: cc,
                sub: `${obrasActivas.filter(o => o.cc === cc).length} obra${obrasActivas.filter(o => o.cc === cc).length === 1 ? '' : 's'}`,
              })),
            ]}
            value={ccSel}
            onChange={(v) => {
              setCcSel(v)
              // Si la obra elegida no pertenece al nuevo CC, la limpiamos.
              if (v && obraSel && !obrasActivas.find(o => o.cod === obraSel && o.cc === v)) {
                setObraSel('')
                setContratSel('')
              }
            }}
          />
        </div>
        <div className="flex-1 max-w-md min-w-[260px]">
          <Combobox
            label="Obra"
            placeholder={ccSel ? `Buscar obra de ${ccSel}...` : 'Buscar obra...'}
            options={obrasFiltradas.map(o => ({
              value: o.cod,
              label: `${o.cod} — ${o.nom}`,
              sub: [o.cc, o.resp].filter(Boolean).join(' · ') || undefined,
            }))}
            value={obraSel}
            onChange={(v) => { setObraSel(v); setContratSel('') }}
          />
        </div>
        {obraSel && contratistasConCerts.length > 0 && (
          <div className="min-w-[200px]">
            <Combobox
              label="Contratista"
              placeholder="Todos"
              options={[
                { value: '', label: '— Todos —' },
                ...contratistasConCerts.map(c => ({
                  value: String(c.id),
                  label: c.nom,
                  sub: c.especialidad ?? undefined,
                })),
              ]}
              value={contratSel}
              onChange={setContratSel}
            />
          </div>
        )}
      </div>

      {!obraSel ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          {ccSel
            ? `Mostrando ${obrasFiltradas.length} obra${obrasFiltradas.length === 1 ? '' : 's'} del CC "${ccSel}". Elegí una para ver el detalle semanal.`
            : 'Seleccioná una obra para ver el detalle de costos semana a semana.'}
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris bg-azul-light">
            <div className="font-bold text-azul text-sm">
              {obrasActivas.find(o => o.cod === obraSel)?.nom ?? obraSel}
            </div>
            <div className="text-xs text-gris-dark mt-0.5">
              Últimas 16 semanas · tocá una semana para ver el desglose de contratistas
              {contratSel ? ` · filtrado: ${contratNom}` : ''}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[500px]">
              <thead>
                <tr>
                  {['Semana', 'Operarios', contratNom, 'Total'].map(h => (
                    <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide last:text-right [&:not(:first-child)]:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEMANAS.map(vie => (
                  <FilaSemana key={toISO(vie)} vie={vie} obraCod={obraSel} contratSel={contratSel} contratistaById={contratistaById} />
                ))}
              </tbody>
              <TotalesObra obraCod={obraSel} contratSel={contratSel} />
            </table>
          </div>
        </div>
      )}
    </>
  )
}
