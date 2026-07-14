'use client'

import { useState, useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useObras, useObrasArchivadas } from '@/modules/tarja/hooks/useObras'
import { usePersonal }   from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useHorasSemana } from '@/modules/tarja/hooks/useHoras'
import { useHsExtras, useHsExtrasAll } from '@/modules/tarja/hooks/useHsExtras'
import { useTarifasObra } from '@/modules/tarja/hooks/useTarifas'
import { useCertificacionesObra, useContratistas } from '@/modules/tarja/hooks/useContratistas'
import { Combobox } from '@/components/ui/Combobox'
import { costoLegConCatObra, fmtMonto, type CatObraEntry } from '@/lib/utils/costos'
import { getSemDays, getSemLabel, getViernes, toISO } from '@/lib/utils/dates'
import { horasApi } from '@/lib/api/horas.api'
import { apiGet } from '@/lib/api/client'
import type { Obra, Certificacion, Contratista, Personal, Categoria, Tarifa, Hora, TarjaHsExtra } from '@/types/domain.types'

// Formato canónico de tarja: redondea al millar (igual que el chip "Costo
// semana", el footer de TarjaTable, cierres y el resumen histórico — §5.11).
const fmtM = fmtMonto

// Costo de operarios de la semana con el criterio CANÓNICO (§5.11):
// costoLegConCatObra (respeta overrides de cat_obra) + redondeo per-leg al
// millar, sumado. Igual que TarjaObraPage/CierresSection/ResumenHistorico,
// así los números coinciden en todos lados.
function costoOperariosSemana(
  horas: Hora[], hsExtras: TarjaHsExtra[], personalObra: Personal[],
  categorias: Categoria[], tarifas: Tarifa[], catObra: CatObraEntry[],
  obraCod: string, dias: Date[],
): number {
  return personalObra.reduce((s, p) =>
    s + Math.round(
      costoLegConCatObra(horas, hsExtras, personalObra, categorias, tarifas, catObra, obraCod, p.leg, dias) / 1000,
    ) * 1000, 0)
}

// Todas las categorías por obra (una query cacheada, compartida por todas las
// filas y el total vía la misma queryKey). Mismo endpoint que ResumenHistorico.
function useCatObraAll() {
  return useQuery({
    queryKey: ['cat-obra', 'all'],
    queryFn: () => apiGet<CatObraEntry[]>('/api/cat-obra/all'),
  })
}

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
  const { data: catObra    = [] } = useCatObraAll()

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

  const totalCosto = costoOperariosSemana(
    horas as Hora[], hsExtras as TarjaHsExtra[], personalObra as Personal[],
    categorias as Categoria[], tarifas as Tarifa[], catObra as CatObraEntry[], obraCod, dias,
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

function TotalesObra({ obraCod, contratSel, semanas }: { obraCod: string; contratSel: string; semanas: Date[] }) {
  const { data: personal   = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas    = [] } = useTarifasObra(obraCod)
  const { data: certs      = [] } = useCertificacionesObra(obraCod)
  const { data: catObra    = [] } = useCatObraAll()
  // Todas las hs extras (una sola query). Filtramos por obra abajo.
  const { data: hsExtrasAll = [] } = useHsExtrasAll()
  const hsExtrasObra = (hsExtrasAll as any[]).filter(e => e.obra_cod === obraCod)
  const contratFilter = contratSel ? Number(contratSel) : null

  const horasQueries = useQueries({
    queries: semanas.map(vie => {
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

  semanas.forEach((vie, i) => {
    const horas  = (horasQueries[i]?.data ?? []) as any[]
    const dias   = getSemDays(vie)
    const semKey = toISO(vie)
    // Personal de la obra en la semana: los que tienen horas O hs extras.
    const personalObra = (personal as any[]).filter(p =>
      horas.some((h: any) => h.leg === p.leg)
      || hsExtrasObra.some(e => e.leg === p.leg && e.sem_key === semKey)
    )
    const totalCosto = costoOperariosSemana(
      horas as Hora[], hsExtrasObra as TarjaHsExtra[], personalObra as Personal[],
      categorias as Categoria[], tarifas as Tarifa[], catObra as CatObraEntry[], obraCod, dias,
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
        <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gris-dark">Total acumulado ({semanas.length} semana{semanas.length === 1 ? '' : 's'})</td>
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
  const { data: obras = [] }           = useObras('tarja')
  const { data: obrasArchivadas = [] } = useObrasArchivadas('tarja')
  const [vistaObras, setVistaObras] = useState<'activas' | 'archivadas' | 'todas'>('activas')
  const [ccSel,      setCcSel]      = useState('')
  const [obraSel,    setObraSel]    = useState('')
  const [contratSel, setContratSel] = useState('')

  const { data: contratistas = [] } = useContratistas()
  const { data: certsObra    = [] } = useCertificacionesObra(obraSel)

  // Obras que puede elegir el selector según la vista. Las archivadas
  // (obras terminadas) conservan sus horas/cierres, así que sus costos son
  // consultables — solo estaban ocultas del selector. /api/obras ya excluye
  // archivadas; /api/obras/archivadas las trae aparte.
  const obrasVisibles = useMemo<Obra[]>(() => {
    if (vistaObras === 'archivadas') return obrasArchivadas as Obra[]
    if (vistaObras === 'todas') return [...(obras as Obra[]), ...(obrasArchivadas as Obra[])]
    return obras as Obra[]
  }, [vistaObras, obras, obrasArchivadas])

  // Cambiar la vista limpia la obra elegida si ya no pertenece a la nueva lista.
  function cambiarVista(v: 'activas' | 'archivadas' | 'todas') {
    setVistaObras(v)
    const nuevas =
      v === 'archivadas' ? (obrasArchivadas as Obra[])
      : v === 'todas'    ? [...(obras as Obra[]), ...(obrasArchivadas as Obra[])]
      : (obras as Obra[])
    if (obraSel && !nuevas.some(o => o.cod === obraSel)) { setObraSel(''); setContratSel(''); setCcSel('') }
  }

  // Obra elegida y sus semanas a mostrar. Para una obra ARCHIVADA (terminada)
  // mostramos todas sus semanas con actividad — traemos sus horas (seguro: una
  // obra archivada no supera el cap de 1000 filas) y derivamos los viernes.
  // Para activas, la ventana móvil de las últimas 16 semanas de siempre.
  const obraSelData = useMemo(() => obrasVisibles.find(o => o.cod === obraSel), [obrasVisibles, obraSel])
  const obraSelArchivada = !!obraSelData?.archivada
  const { data: horasObraSel = [], isLoading: cargandoHorasArch } = useQuery({
    queryKey: ['horas', obraSel, 'all'],
    queryFn: () => apiGet<Hora[]>(`/api/horas/${encodeURIComponent(obraSel)}`),
    enabled: obraSelArchivada && !!obraSel,
  })
  const semanas = useMemo<Date[]>(() => {
    if (!obraSelArchivada) return SEMANAS
    const sems = new Set<string>()
    ;(horasObraSel as Hora[]).forEach(h => sems.add(toISO(getViernes(new Date(h.fecha + 'T12:00:00')))))
    return [...sems].sort().reverse().map(s => new Date(s + 'T12:00:00'))
  }, [obraSelArchivada, horasObraSel])

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
    new Set(obrasVisibles.map(o => o.cc).filter((cc): cc is string => !!cc?.trim()))
  ).sort()

  // Si hay CC seleccionado, mostramos solo las obras de ese CC.
  const obrasFiltradas = ccSel
    ? obrasVisibles.filter(o => o.cc === ccSel)
    : obrasVisibles

  return (
    <>
      {/* Vista de obras: activas / archivadas (terminadas) / todas */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {([
          { key: 'activas'    as const, label: `Activas (${obras.length})` },
          { key: 'archivadas' as const, label: `📦 Archivadas (${obrasArchivadas.length})` },
          { key: 'todas'      as const, label: 'Todas' },
        ]).map(opt => {
          const active = vistaObras === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => cambiarVista(opt.key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border-[1.5px] transition-colors ${
                active ? 'bg-azul text-white border-azul' : 'bg-white border-azul text-azul-mid hover:bg-gris/40'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

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
                sub: `${obrasVisibles.filter(o => o.cc === cc).length} obra${obrasVisibles.filter(o => o.cc === cc).length === 1 ? '' : 's'}`,
              })),
            ]}
            value={ccSel}
            onChange={(v) => {
              setCcSel(v)
              // Si la obra elegida no pertenece al nuevo CC, la limpiamos.
              if (v && obraSel && !obrasVisibles.find(o => o.cod === obraSel && o.cc === v)) {
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
              label: `${o.cod} — ${o.nom}${o.archivada ? '  📦' : ''}`,
              sub: [o.archivada ? 'Archivada' : null, o.cc, o.resp].filter(Boolean).join(' · ') || undefined,
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
              {obrasVisibles.find(o => o.cod === obraSel)?.nom ?? obraSel}
            </div>
            <div className="text-xs text-gris-dark mt-0.5">
              {obraSelArchivada
                ? `📦 Obra archivada · ${semanas.length} semana${semanas.length === 1 ? '' : 's'} con actividad`
                : 'Últimas 16 semanas'}
              {' '}· tocá una semana para ver el desglose de contratistas
              {contratSel ? ` · filtrado: ${contratNom}` : ''}
            </div>
          </div>
          {obraSelArchivada && semanas.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gris-dark italic">
              {cargandoHorasArch
                ? 'Cargando semanas de la obra archivada…'
                : 'Esta obra archivada no tiene horas de tarja cargadas.'}
            </div>
          ) : (
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
                {semanas.map(vie => (
                  <FilaSemana key={toISO(vie)} vie={vie} obraCod={obraSel} contratSel={contratSel} contratistaById={contratistaById} />
                ))}
              </tbody>
              <TotalesObra obraCod={obraSel} contratSel={contratSel} semanas={semanas} />
            </table>
          </div>
          )}
        </div>
      )}
    </>
  )
}
