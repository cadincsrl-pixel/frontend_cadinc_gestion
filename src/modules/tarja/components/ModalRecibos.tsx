'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { generarRecibos } from '@/lib/utils/excel'
import { getVHConCatObra } from '@/lib/utils/costos'
import { useToast } from '@/components/ui/Toast'
import { getSemLabel, getViernes, getViernesCobro, toISO } from '@/lib/utils/dates'
import type { Obra, Personal, Categoria, Hora, Tarifa, Cierre, Certificacion, Contratista } from '@/types/domain.types'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { usePrestamos } from '../hooks/usePrestamos'
import { useHsExtrasAll } from '../hooks/useHsExtras'


interface Props {
  open: boolean
  onClose: () => void
  obras: Obra[]
  personal: Personal[]
  categorias: Categoria[]
  horas: Hora[]
  tarifas: Tarifa[]
  cierres: Cierre[]
  certificaciones: Certificacion[]
  contratistas: Contratista[]
  obraActual?: string
  semActual?: Date
}

function fmtM(n: number) { return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-AR') }

function fmtFecha(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

export function ModalRecibos({
  open, onClose, obras, personal, categorias,
  horas, tarifas, cierres, certificaciones, contratistas,
  obraActual, semActual,
}: Props) {
  const toast = useToast()
  const { data: prestamos = [] } = usePrestamos()
  const { data: todasHsExtras = [] } = useHsExtrasAll()
  const [semKey, setSemKey] = useState(semActual ? toISO(semActual) : '')
  const [empresa, setEmpresa] = useState('CADINC SRL')
  const [obrasSelec, setObrasSelec] = useState<string[]>(obras.map(o => o.cod))
  const [incluirOp, setIncluirOp] = useState(true)
  const [incluirCont, setIncluirCont] = useState(true)
  const [incluirPortada, setIncluirPortada] = useState(true)
  const [busquedaObra, setBusquedaObra] = useState('')
  const [legsSelec, setLegsSelec] = useState<string[] | null>(null) // null = todos
  const [busquedaOp, setBusquedaOp] = useState('')

  const todasSems = [...new Set([
    ...horas.map(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00')))),
    ...certificaciones.map(c => c.sem_key),
  ])].sort((a, b) => b.localeCompare(a))

  function toggleObra(cod: string) {
    setObrasSelec(prev =>
      prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]
    )
  }
  const { data: todasCatObra = [] } = useQuery({
    queryKey: ['cat-obra', 'all'],
    queryFn: () => apiGet<Array<{ obra_cod: string; leg: string; cat_id: number; desde: string }>>('/api/cat-obra/all'),
  })
  const obrasFiltradas = useMemo(() => {
    const q = busquedaObra.toLowerCase().trim()
    if (!q) return obras
    return obras.filter(o =>
      o.nom.toLowerCase().includes(q) ||
      o.cod.toLowerCase().includes(q)
    )
  }, [obras, busquedaObra])



  // Wrapper que cierra sobre la data del componente.
  const getVHConCatObraLocal = (obraCod: string, leg: string, fechaRef: string) =>
    getVHConCatObra(todasCatObra, personal, categorias, tarifas, obraCod, leg, fechaRef)


  // Operarios con horas o hs extras en semana+obras seleccionadas
  const operariosDisponibles = useMemo(() => {
    if (!semKey) return []
    const legsSet = new Set<string>()
    horas.forEach(h => {
      const sk = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
      if (sk === semKey && obrasSelec.includes(h.obra_cod)) legsSet.add(h.leg)
    })
    todasHsExtras.forEach(x => {
      if (x.sem_key === semKey && obrasSelec.includes(x.obra_cod) && x.hs > 0) legsSet.add(x.leg)
    })
    return [...legsSet]
      .map(leg => personal.find(p => p.leg === leg))
      .filter(Boolean)
      .sort((a, b) => a!.nom.localeCompare(b!.nom)) as typeof personal
  }, [semKey, obrasSelec, horas, personal, todasHsExtras])

  // Si la semana/obras cambian, resetear selección de operarios
  const legsEfectivos = legsSelec ?? operariosDisponibles.map(p => p.leg)

  const operariosFiltrados = useMemo(() => {
    const q = busquedaOp.toLowerCase().trim()
    if (!q) return operariosDisponibles
    return operariosDisponibles.filter(p => p.nom.toLowerCase().includes(q) || p.leg.toLowerCase().includes(q))
  }, [operariosDisponibles, busquedaOp])

  // ── Preview calculado ──
  const preview = useMemo(() => {
    if (!semKey) return null
    const obrasTarget = obras.filter(o => obrasSelec.includes(o.cod))

    const horasFilt = horas.filter(h => {
      if (!obrasTarget.some(o => o.cod === h.obra_cod)) return false
      const sk = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
      if (sk !== semKey) return false
      return legsSelec === null || legsSelec.includes(h.leg)
    })

    const certsFilt = certificaciones.filter(c =>
      c.sem_key === semKey &&
      obrasTarget.some(o => o.cod === c.obra_cod) &&
      c.monto > 0
    )

    const operarios = new Set(horasFilt.map(h => h.leg)).size
    const contratNum = new Set(certsFilt.map(c => c.contrat_id)).size
    const paginas = Math.ceil((operarios + contratNum) / 5) || 0

    // Hs extras de esta semana × obras seleccionadas (y legs seleccionados si aplica)
    const hsExtrasFilt = todasHsExtras.filter(x => {
      if (x.sem_key !== semKey) return false
      if (!obrasTarget.some(o => o.cod === x.obra_cod)) return false
      if (legsSelec !== null && !legsSelec.includes(x.leg)) return false
      return x.hs > 0
    })

    // Costo operarios — redondeado por leg igual que ResumenHistoricoPage
    const legMap = new Map<string, { obraCod: string; leg: string; totalHs: number; sk: string }>()
    horasFilt.forEach(h => {
      const key = `${h.obra_cod}|${h.leg}`
      const sk = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
      if (!legMap.has(key)) legMap.set(key, { obraCod: h.obra_cod, leg: h.leg, totalHs: 0, sk })
      legMap.get(key)!.totalHs += h.horas
    })
    const costoOpBase = [...legMap.values()].reduce((sum, entry) => {
      const vh = getVHConCatObraLocal(entry.obraCod, entry.leg, entry.sk)
      return sum + Math.round(entry.totalHs * vh / 1000) * 1000
    }, 0)
    const costoOpExtras = hsExtrasFilt.reduce((sum, x) => {
      const vh = getVHConCatObraLocal(x.obra_cod, x.leg, x.sem_key)
      return sum + Math.round(x.hs * vh / 1000) * 1000
    }, 0)
    const costoOp = costoOpBase + costoOpExtras

    const costoContrat = certsFilt.reduce((s, c) => s + c.monto, 0)
    const totalHs = horasFilt.reduce((s, h) => s + h.horas, 0)
      + hsExtrasFilt.reduce((s, x) => s + x.hs, 0)

    const costoOpFinal = incluirOp ? costoOp : 0
    const costoContratFinal = incluirCont ? costoContrat : 0
    const operariosFinal = incluirOp ? operarios : 0
    const contratNumFinal = incluirCont ? contratNum : 0
    const paginasFinal = Math.ceil((operariosFinal + contratNumFinal) / 5) || 0

    // Fecha de cobro
    const s = new Date(semKey + 'T12:00:00')
    const pago = getViernesCobro(s)

    return {
      operarios: operariosFinal,
      contratNum: contratNumFinal,
      paginas: paginasFinal,
      costoOp: costoOpFinal,
      costoContrat: costoContratFinal,
      totalHs: incluirOp ? totalHs : 0,
      pagoStr: fmtFecha(pago),
      tieneData: operariosFinal > 0 || contratNumFinal > 0,
      obrasCount: obrasSelec.length,
    }
  }, [semKey, obrasSelec, legsSelec, horas, certificaciones, personal, categorias, tarifas, obras, todasCatObra, incluirOp, incluirCont, todasHsExtras])

  function handleGenerar() {
    if (!semKey) { toast('Seleccioná una semana', 'err'); return }
    if (!obrasSelec.length) { toast('Seleccioná al menos una obra', 'err'); return }
    if (!incluirOp && !incluirCont) { toast('Seleccioná al menos un tipo de recibo', 'err'); return }

    const obrasTarget = obras.filter(o => obrasSelec.includes(o.cod))

    // Filtrar datos según toggles
    const horasParaRecibo = incluirOp ? horas : []
    const certsParaRecibo = incluirCont ? certificaciones : []
    const contratParaRecibo = incluirCont ? contratistas : []

    const hsExtrasParaRecibo = incluirOp ? todasHsExtras : []

    const result = generarRecibos(
      semKey, empresa, obrasTarget,
      personal, categorias, horasParaRecibo, tarifas,
      certsParaRecibo, contratParaRecibo,
      todasCatObra, prestamos,
      incluirOp ? legsSelec : null,
      hsExtrasParaRecibo,
      incluirPortada,
    )

    if (!result) { toast('No hay datos para esta selección', 'err'); return }

    const partes = []
    if (result.trabajadores > 0) partes.push(`${result.trabajadores} operarios`)
    if (result.contratistas > 0) partes.push(`${result.contratistas} contratistas`)
    toast(`🖨 Recibos listos — ${partes.join(', ')}`, 'ok')
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🖨 EMITIR RECIBOS"
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleGenerar} disabled={!semKey || !obrasSelec.length || (!incluirOp && !incluirCont)}>
            🖨 Generar PDF
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Semana */}
        <Select
          label="Semana"
          placeholder="Seleccioná una semana"
          options={todasSems.map(sk => ({
            value: sk,
            label: getSemLabel(new Date(sk + 'T12:00:00')),
          }))}
          value={semKey}
          onChange={e => setSemKey(e.target.value)}
        />

        {/* Empresa */}
        <Input
          label="Nombre de la empresa (para el recibo)"
          value={empresa}
          onChange={e => setEmpresa(e.target.value)}
          placeholder="Tu Empresa Constructora SRL"
        />

        {/* Tipo de recibos */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            Incluir en los recibos
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIncluirOp(p => !p)}
              className={`
        flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-[1.5px] font-bold text-sm transition-all
        ${incluirOp
                  ? 'border-azul bg-azul-light text-azul'
                  : 'border-gris-mid bg-white text-gris-dark opacity-50'
                }
      `}
            >
              👷 Operarios
            </button>
            <button
              onClick={() => setIncluirCont(p => !p)}
              className={`
        flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-[1.5px] font-bold text-sm transition-all
        ${incluirCont
                  ? 'border-[#5A2D82] bg-[#EEE8FF] text-[#5A2D82]'
                  : 'border-gris-mid bg-white text-gris-dark opacity-50'
                }
      `}
            >
              🔧 Contratistas
            </button>
          </div>
          <label className={`flex items-center gap-2 mt-2 ${!incluirOp && !incluirCont ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={incluirPortada && (incluirOp || incluirCont)}
              onChange={e => setIncluirPortada(e.target.checked)}
              disabled={!incluirOp && !incluirCont}
              className="accent-naranja w-4 h-4"
            />
            <span className="text-xs font-semibold text-gris-dark">
              📋 Incluir portada resumen (primera página)
            </span>
          </label>
        </div>

        {/* Obras */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Obras a incluir ({obrasSelec.length}/{obras.length})
            </div>
          </div>
          <div className="flex gap-1 mb-2">
            <button onClick={() => setObrasSelec(obras.map(o => o.cod))} className="text-xs font-bold text-azul hover:text-naranja transition-colors px-2 py-1 rounded hover:bg-gris">✓ Todas</button>
            <button onClick={() => setObrasSelec([])} className="text-xs font-bold text-gris-dark hover:text-carbon transition-colors px-2 py-1 rounded hover:bg-gris">✕ Ninguna</button>
            {obraActual && (
              <button onClick={() => setObrasSelec([obraActual])} className="text-xs font-bold text-naranja hover:text-naranja-dark transition-colors px-2 py-1 rounded hover:bg-naranja-light">⊙ Obra actual</button>
            )}
          </div>
          {/* Buscador */}
          <div className="relative mb-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm">🔍</span>
            <input
              type="text"
              value={busquedaObra}
              onChange={e => setBusquedaObra(e.target.value)}
              placeholder="Buscar obra por nombre o código..."
              className="w-full pl-9 pr-8 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
            />
            {busquedaObra && (
              <button
                onClick={() => setBusquedaObra('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gris-dark hover:text-carbon text-sm"
              >
                ✕
              </button>
            )}
          </div>
          <div className="bg-gris rounded-xl p-3 max-h-36 overflow-y-auto flex flex-col gap-0.5">
            {obrasFiltradas.map(o => (
              <label key={o.cod} className="flex items-center gap-2 cursor-pointer py-1.5 border-b border-gris-mid/50 last:border-0">
                <input
                  type="checkbox"
                  checked={obrasSelec.includes(o.cod)}
                  onChange={() => toggleObra(o.cod)}
                  className="accent-azul w-4 h-4 flex-shrink-0"
                />
                <span className="font-mono text-[10px] bg-white border border-gris-mid px-1.5 py-0.5 rounded text-azul-mid flex-shrink-0">{o.cod}</span>
                <span className="font-semibold text-sm text-carbon truncate">{o.nom}</span>
              </label>
            ))}
            {obrasFiltradas.length === 0 && (
              <p className="text-sm text-gris-dark text-center py-2">No se encontraron obras</p>
            )}
          </div>
        </div>

        {/* Operarios */}
        {incluirOp && operariosDisponibles.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                Operarios ({legsEfectivos.length}/{operariosDisponibles.length})
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setLegsSelec(null)}
                  className="text-xs font-bold text-azul hover:text-naranja transition-colors px-2 py-1 rounded hover:bg-gris"
                >
                  ✓ Todos
                </button>
                <button
                  onClick={() => setLegsSelec([])}
                  className="text-xs font-bold text-gris-dark hover:text-carbon transition-colors px-2 py-1 rounded hover:bg-gris"
                >
                  ✕ Ninguno
                </button>
              </div>
            </div>
            <div className="relative mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm">🔍</span>
              <input
                type="text"
                value={busquedaOp}
                onChange={e => setBusquedaOp(e.target.value)}
                placeholder="Buscar operario..."
                className="w-full pl-9 pr-8 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
              />
              {busquedaOp && (
                <button onClick={() => setBusquedaOp('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gris-dark hover:text-carbon text-sm">✕</button>
              )}
            </div>
            <div className="bg-gris rounded-xl p-3 max-h-36 overflow-y-auto flex flex-col gap-0.5">
              {operariosFiltrados.map(p => (
                <label key={p.leg} className="flex items-center gap-2 cursor-pointer py-1.5 border-b border-gris-mid/50 last:border-0">
                  <input
                    type="checkbox"
                    checked={legsEfectivos.includes(p.leg)}
                    onChange={() => {
                      const actual = legsEfectivos
                      const nuevo = actual.includes(p.leg)
                        ? actual.filter(l => l !== p.leg)
                        : [...actual, p.leg]
                      setLegsSelec(nuevo.length === operariosDisponibles.length ? null : nuevo)
                    }}
                    className="accent-azul w-4 h-4 flex-shrink-0"
                  />
                  <span className="font-mono text-[10px] bg-white border border-gris-mid px-1.5 py-0.5 rounded text-azul-mid flex-shrink-0">{p.leg}</span>
                  <span className="font-semibold text-sm text-carbon truncate">{p.nom}</span>
                </label>
              ))}
              {operariosFiltrados.length === 0 && (
                <p className="text-sm text-gris-dark text-center py-2">No se encontraron operarios</p>
              )}
            </div>
          </div>
        )}

        {/* ── Preview mejorado ── */}
        {semKey && preview && (
          <div className="border border-gris-mid rounded-xl overflow-hidden">

            {/* Header */}
            <div className="bg-azul px-4 py-2.5 flex items-center justify-between">
              <span className="text-white text-xs font-bold uppercase tracking-wider">
                Vista previa
              </span>
              <span className="text-white/60 text-xs">
                {preview.obrasCount} obra{preview.obrasCount !== 1 ? 's' : ''} · Pago: {preview.pagoStr}
              </span>
            </div>

            {preview.tieneData ? (
              <>
                {/* Stats principales */}
                <div className="grid grid-cols-3 divide-x divide-gris-mid bg-white">
                  <StatCell icon="👷" label="Operarios" value={String(preview.operarios)} color="naranja" />
                  <StatCell icon="🔧" label="Contratistas" value={String(preview.contratNum)} color="purple" />
                  <StatCell icon="📄" label="Páginas" value={`~${preview.paginas}`} color="azul" />
                </div>

                {/* Costos */}
                <div className="grid grid-cols-3 divide-x divide-gris-mid bg-white border-t border-gris-mid">
                  <StatCell icon="⏱" label="Horas totales" value={`${preview.totalHs}hs`} color="azul" />
                  <StatCell icon="💰" label="Costo op." value={fmtM(preview.costoOp)} color="verde" />
                  <StatCell icon="🔧" label="Costo cont." value={fmtM(preview.costoContrat)} color="purple" />
                </div>

                {/* Total destacado */}
                <div className="bg-verde-light border-t border-verde/20 px-4 py-3 flex items-center justify-between">
                  <span className="text-verde text-xs font-bold uppercase tracking-wider">
                    TOTAL A EMITIR
                  </span>
                  <span className="font-mono font-bold text-xl text-verde">
                    {fmtM(preview.costoOp + preview.costoContrat)}
                  </span>
                </div>
              </>
            ) : (
              <div className="bg-white px-4 py-5 text-center">
                <p className="text-sm text-rojo font-semibold">
                  No hay horas ni certificaciones para esta selección.
                </p>
                <p className="text-xs text-gris-dark mt-1">
                  Verificá que la semana y las obras tengan datos cargados.
                </p>
              </div>
            )}
          </div>
        )}

        {!semKey && (
          <div className="bg-azul-light border border-azul/20 rounded-xl px-4 py-3 text-sm text-azul-mid font-semibold">
            Seleccioná una semana para ver el resumen.
          </div>
        )}

      </div>
    </Modal>
  )
}

function StatCell({ icon, label, value, color }: {
  icon: string; label: string; value: string; color: string
}) {
  const colors: Record<string, string> = {
    azul: 'text-azul',
    naranja: 'text-naranja-dark',
    verde: 'text-verde',
    purple: 'text-[#5A2D82]',
  }
  return (
    <div className="flex flex-col items-center py-3 px-2 gap-0.5">
      <span className={`font-mono font-bold text-lg leading-none ${colors[color]}`}>{value}</span>
      <span className="text-[10px] text-gris-dark font-semibold uppercase tracking-wide">{label}</span>
    </div>
  )
}