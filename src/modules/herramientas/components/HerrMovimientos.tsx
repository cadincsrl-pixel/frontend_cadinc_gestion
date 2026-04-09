'use client'

import { useState, useMemo } from 'react'
import {
  useHerramientas,
  useHerrConfig,
  useHerrMovimientosAll,
  useRegistrarMovimiento,
} from '../hooks/useHerramientas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'

function fmtFecha(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const ESTADO_COLORS: Record<string, string> = {
  disponible: 'bg-verde-light text-verde',
  uso: 'bg-naranja-light text-naranja-dark',
  reparacion: 'bg-rojo-light text-rojo',
  baja: 'bg-gris text-gris-dark',
}

const MOV_COLORS: Record<string, string> = {
  verde: 'bg-verde-light text-verde',
  naranja: 'bg-naranja-light text-naranja-dark',
  rojo: 'bg-rojo-light text-rojo',
  azul: 'bg-azul-light text-azul-mid',
  gris: 'bg-gris text-gris-dark',
}

interface RemitoData {
  numero:      string
  fecha:       string
  tipoNom:     string
  tipoIcono:   string
  herramienta: { codigo: string; nom: string; marca?: string; modelo?: string; tipo?: string }
  obraOrigen:  string
  obraDestino: string
  responsable: string
  obs:         string
}

// Qué campos muestra cada tipo de movimiento
const MOV_CAMPOS: Record<string, { origen: boolean; destino: boolean }> = {
  alta: { origen: false, destino: false },
  asignacion: { origen: true, destino: true },
  traslado: { origen: true, destino: true },
  devolucion: { origen: true, destino: true },
  reparacion: { origen: true, destino: false },
  retorno_rep: { origen: true, destino: true },
  baja: { origen: true, destino: false },
}

export function HerrMovimientos() {
  const toast = useToast()

  const { data: herramientas = [] } = useHerramientas()
  const { data: config } = useHerrConfig()
  const { data: movimientos = [], isLoading: loadingMov } = useHerrMovimientosAll()
  const { data: obras = [] } = useObras()
  const { mutate: registrar, isPending: registrando } = useRegistrarMovimiento()

  // Formulario
  const [herrSel, setHerrSel] = useState('')
  const [tipoMov, setTipoMov] = useState('asignacion')
  const [obraOrigen, setObraOrigen] = useState('')
  const [obraDestino, setObraDestino] = useState('')
  const [responsable, setResponsable] = useState('')
  const [obs, setObs] = useState('')
  const [fechaManual, setFechaManual] = useState('')
  const [ultimoRemito, setUltimoRemito] = useState<RemitoData | null>(null)

  // Filtros historial
  const [filtroHerr, setFiltroHerr] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroObra, setFiltroObra] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const herramientaActual = herramientas.find(h => String(h.id) === herrSel) ?? null
  const campos = MOV_CAMPOS[tipoMov] ?? { origen: true, destino: true }

  function onHerrChange(id: string) {
    setHerrSel(id)
    const h = herramientas.find(x => String(x.id) === id)
    // Pre-llenar origen con la obra actual de la herramienta
    setObraOrigen(h?.obra_cod ?? '')
    setObraDestino('')
    // Auto-seleccionar tipo según estado
    if (h) {
      if (h.estado_key === 'disponible') setTipoMov('asignacion')
      if (h.estado_key === 'uso') setTipoMov('traslado')
      if (h.estado_key === 'reparacion') setTipoMov('retorno_rep')
    }
  }

  function handleRegistrar() {
    if (!herrSel) { toast('Seleccioná una herramienta', 'err'); return }
    if (!tipoMov) { toast('Seleccioná el tipo de movimiento', 'err'); return }
    if (campos.origen && !obraOrigen && tipoMov !== 'retorno_rep') { toast('Seleccioná la obra origen', 'err'); return }
    if (campos.destino && !obraDestino) { toast('Seleccioná la obra destino', 'err'); return }

    registrar(
      {
        herramienta_id: Number(herrSel),
        tipo_key: tipoMov,
        obra_origen_cod: campos.origen ? obraOrigen : null,
        obra_destino_cod: campos.destino ? obraDestino : null,
        responsable: responsable || undefined,
        obs: obs || undefined,
        fecha: fechaManual ? new Date(fechaManual).toISOString() : undefined,
      },
      {
        onSuccess: (data: any) => {
          const herr      = herramientas.find(x => String(x.id) === herrSel)
          const tipoInfo  = config?.movTipos.find(t => t.key === tipoMov)
          const origenNom = obras.find(o => o.cod === obraOrigen)?.nom ?? (obraOrigen || 'Depósito')
          const destinoNom = obras.find(o => o.cod === obraDestino)?.nom ?? (obraDestino || 'Depósito')
          setUltimoRemito({
            numero:    String(data?.id ?? Date.now()).padStart(6, '0'),
            fecha:     fechaManual ? new Date(fechaManual).toISOString() : new Date().toISOString(),
            tipoNom:   tipoInfo?.nom   ?? tipoMov,
            tipoIcono: tipoInfo?.icono ?? '→',
            herramienta: {
              codigo: herr?.codigo ?? '',
              nom:    herr?.nom    ?? '',
              marca:  herr?.marca  ?? undefined,
              modelo: herr?.modelo ?? undefined,
              tipo:   herr?.tipo ? `${herr.tipo.icono ?? ''} ${herr.tipo.nom}` : undefined,
            },
            obraOrigen:  origenNom,
            obraDestino: destinoNom,
            responsable,
            obs,
          })
          toast('✓ Movimiento registrado', 'ok')
          setHerrSel(''); setObraOrigen(''); setObraDestino('')
          setResponsable(''); setObs(''); setFechaManual('')
          setTipoMov('asignacion')
        },
        onError: (e: any) => toast(e.message ?? 'Error al registrar', 'err'),
      }
    )
  }

  function imprimirRemito(r: RemitoData) {
    const fmtDate = (iso: string) => {
      const d = new Date(iso)
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    }
    const copias = [
      { label: 'ORIGINAL',    dest: 'OFICINA'          },
      { label: 'DUPLICADO',   dest: 'OBRA DESTINO'     },
      { label: 'TRIPLICADO',  dest: 'OBRA REMITENTE'   },
    ]
    const copiasHTML = copias.map(c => `
      <div class="copia">
        <div class="cabecera">
          <div class="empresa">CADINC</div>
          <div class="titulo">REMITO DE MOVIMIENTO DE HERRAMIENTAS</div>
          <div class="numero-bloque">
            <div class="numero">Nº ${r.numero}</div>
            <div class="badge">${c.label} — ${c.dest}</div>
          </div>
        </div>
        <div class="seccion-grid">
          <div class="campo"><span class="lbl">Fecha</span><span class="val">${fmtDate(r.fecha)}</span></div>
          <div class="campo"><span class="lbl">Tipo de movimiento</span><span class="val">${r.tipoIcono} ${r.tipoNom}</span></div>
        </div>
        <table class="tabla-herr">
          <thead><tr><th>Código</th><th>Herramienta</th><th>Marca / Modelo</th><th>Tipo</th></tr></thead>
          <tbody>
            <tr>
              <td class="mono">${r.herramienta.codigo}</td>
              <td><strong>${r.herramienta.nom}</strong></td>
              <td>${[r.herramienta.marca, r.herramienta.modelo].filter(Boolean).join(' / ') || '—'}</td>
              <td>${r.herramienta.tipo ?? '—'}</td>
            </tr>
          </tbody>
        </table>
        <div class="seccion-grid">
          <div class="campo origen"><span class="lbl">Obra remitente (origen)</span><span class="val bold">${r.obraOrigen}</span></div>
          <div class="flecha">→</div>
          <div class="campo destino"><span class="lbl">Obra destinataria (destino)</span><span class="val bold azul">${r.obraDestino}</span></div>
        </div>
        <div class="seccion-grid">
          <div class="campo"><span class="lbl">Responsable</span><span class="val">${r.responsable || '—'}</span></div>
          <div class="campo"><span class="lbl">Observaciones</span><span class="val">${r.obs || '—'}</span></div>
        </div>
        <div class="firmas">
          <div class="firma"><div class="linea-firma"></div><div class="lbl-firma">Entrega</div></div>
          <div class="firma"><div class="linea-firma"></div><div class="lbl-firma">Recibe</div></div>
          <div class="firma"><div class="linea-firma"></div><div class="lbl-firma">Conformidad</div></div>
        </div>
      </div>
    `).join('<div class="corte">✂ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</div>')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Remito Nº ${r.numero}</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 9pt; color: #1a1a2e; }
      .copia { height: 89mm; padding: 3mm 4mm; border: 1.5px solid #d1d5db; border-radius: 3mm; display: flex; flex-direction: column; gap: 2mm; page-break-inside: avoid; }
      .corte { text-align: left; font-size: 7pt; color: #aaa; border-bottom: 1px dashed #bbb; margin: 1.5mm 0; padding-left: 2mm; }
      .cabecera { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #1a1a2e; padding-bottom: 2mm; }
      .empresa { font-size: 16pt; font-weight: 900; letter-spacing: 2px; color: #1a1a2e; }
      .titulo { font-size: 7pt; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
      .numero-bloque { text-align: right; }
      .numero { font-size: 12pt; font-weight: 900; font-family: monospace; color: #e85d04; }
      .badge { font-size: 6.5pt; font-weight: bold; background: #fff3e0; color: #e85d04; border: 1px solid #e85d04; border-radius: 2mm; padding: 1px 4px; margin-top: 1mm; display: inline-block; }
      .seccion-grid { display: flex; gap: 3mm; align-items: center; }
      .campo { flex: 1; display: flex; flex-direction: column; gap: 0.5mm; }
      .campo.origen, .campo.destino { flex: 2; }
      .flecha { font-size: 14pt; font-weight: bold; color: #e85d04; flex-shrink: 0; }
      .lbl { font-size: 6.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }
      .val { font-size: 9pt; font-weight: 500; }
      .val.bold { font-weight: 700; }
      .val.azul { color: #1a1a2e; }
      .tabla-herr { width: 100%; border-collapse: collapse; }
      .tabla-herr th { background: #1a1a2e; color: #fff; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.4px; padding: 1.5mm 2mm; text-align: left; }
      .tabla-herr td { border-bottom: 1px solid #e5e7eb; padding: 1.5mm 2mm; font-size: 8.5pt; }
      .tabla-herr .mono { font-family: monospace; font-weight: bold; font-size: 8pt; color: #555; }
      .firmas { display: flex; gap: 4mm; margin-top: auto; }
      .firma { flex: 1; }
      .linea-firma { border-bottom: 1px solid #333; height: 8mm; }
      .lbl-firma { font-size: 6.5pt; color: #888; text-align: center; margin-top: 1mm; text-transform: uppercase; letter-spacing: 0.4px; }
    </style>
    </head><body>${copiasHTML}</body></html>`

    const win = window.open('', '_blank', 'width=794,height=1123')
    if (!win) return
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 400)
  }

  // Tipos disponibles según estado de la herramienta
  const tiposDisponibles = useMemo(() => {
    if (!herramientaActual) return (config?.movTipos ?? []).filter(t => t.key !== 'alta')
    const estado = herramientaActual.estado_key
    return (config?.movTipos ?? []).filter(t => {
      if (t.key === 'alta') return false
      if (estado === 'disponible') return ['asignacion', 'reparacion', 'baja'].includes(t.key)
      if (estado === 'uso') return ['traslado', 'devolucion', 'reparacion', 'baja'].includes(t.key)
      if (estado === 'reparacion') return ['retorno_rep', 'baja'].includes(t.key)
      return false
    })
  }, [herramientaActual, config])

  // Filtrar historial
  const movFiltrados = useMemo(() => {
    return movimientos.filter(m => {
      const q = busqueda.toLowerCase()
      const matchQ = !q ||
        (m.herramienta?.nom ?? '').toLowerCase().includes(q) ||
        (m.herramienta?.codigo ?? '').toLowerCase().includes(q) ||
        (m.responsable ?? '').toLowerCase().includes(q)
      const matchHerr = !filtroHerr || String(m.herramienta_id) === filtroHerr
      const matchTipo = !filtroTipo || m.tipo_key === filtroTipo
      const matchObra = !filtroObra ||
        m.obra_origen_cod === filtroObra ||
        m.obra_destino_cod === filtroObra
      return matchQ && matchHerr && matchTipo && matchObra
    })
  }, [movimientos, busqueda, filtroHerr, filtroTipo, filtroObra])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">

      {/* Header */}
      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">MOVIMIENTOS</h1>
        <p className="text-sm text-gris-dark mt-0.5">Registrá asignaciones y traslados entre obras</p>
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4">
        <h3 className="font-bold text-azul text-base border-b border-gris pb-2">
          Registrar movimiento
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Herramienta */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Herramienta *
            </label>
            <select
              value={herrSel}
              onChange={e => onHerrChange(e.target.value)}
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
            >
              <option value="">— Seleccioná —</option>
              {herramientas
                .filter(h => h.estado_key !== 'baja')
                .map(h => (
                  <option key={h.id} value={String(h.id)}>
                    [{h.codigo}] {h.nom} — {h.estado?.nom ?? h.estado_key}
                    {h.obra ? ` (${h.obra.nom})` : ''}
                  </option>
                ))
              }
            </select>
          </div>

          {/* Tipo de movimiento */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Tipo de movimiento *
            </label>
            <select
              value={tipoMov}
              onChange={e => { setTipoMov(e.target.value); setObraDestino('') }}
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
              disabled={!herrSel}
            >
              {tiposDisponibles.map(t => (
                <option key={t.key} value={t.key}>
                  {t.icono} {t.nom}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Indicador visual */}
        {herramientaActual && (
          <div className="flex items-center gap-3 bg-gris rounded-xl px-4 py-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-carbon">{herramientaActual.nom}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${ESTADO_COLORS[herramientaActual.estado_key]}`}>
                {herramientaActual.estado?.nom ?? herramientaActual.estado_key}
              </span>
            </div>
            {(campos.origen || campos.destino) && (
              <>
                <span className="text-gris-mid">·</span>
                <div className="flex items-center gap-2 text-sm font-mono">
                  {campos.origen && (
                    <span className="text-gris-dark">
                      {obras.find(o => o.cod === obraOrigen)?.nom ?? (obraOrigen || '—')}
                    </span>
                  )}
                  {campos.origen && campos.destino && (
                    <span className="text-naranja font-bold text-lg">→</span>
                  )}
                  {campos.destino && (
                    <span className="text-azul font-bold">
                      {obras.find(o => o.cod === obraDestino)?.nom ?? (obraDestino || '—')}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Selectores de obras */}
        {(campos.origen || campos.destino) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campos.origen && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                  Obra origen
                </label>
                <div className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-gris text-carbon font-semibold">
                  {obras.find(o => o.cod === obraOrigen)?.nom
                    ? `${obras.find(o => o.cod === obraOrigen)!.nom} (${obraOrigen})`
                    : obraOrigen || (tipoMov === 'retorno_rep' ? 'Taller / Depósito' : '—')
                  }
                </div>
              </div>
            )}
            {campos.destino && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                  Obra destino *
                </label>
                <select
                  value={obraDestino}
                  onChange={e => setObraDestino(e.target.value)}
                  className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
                >
                  <option value="">— Seleccioná obra —</option>
                  {obras
                    .filter(o => o.cod !== obraOrigen)
                    .map(o => (
                      <option key={o.cod} value={o.cod}>{o.nom} ({o.cod})</option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>
        )}

        {/* Responsable + Obs + Fecha */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Responsable</label>
            <input
              type="text"
              value={responsable}
              onChange={e => setResponsable(e.target.value)}
              placeholder="Nombre del responsable"
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observaciones</label>
            <input
              type="text"
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Opcional"
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Fecha (opcional)</label>
            <input
              type="datetime-local"
              value={fechaManual}
              onChange={e => setFechaManual(e.target.value)}
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-gris">
          <Button
            variant="primary"
            loading={registrando}
            disabled={!herrSel || !tipoMov}
            onClick={handleRegistrar}
          >
            ✓ Registrar movimiento
          </Button>
        </div>
      </div>

      {/* Banner remito */}
      {ultimoRemito && (
        <div className="bg-verde-light border border-verde/30 rounded-card p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <div>
              <div className="font-bold text-verde">Movimiento registrado</div>
              <div className="text-xs text-verde/80">
                {ultimoRemito.tipoIcono} {ultimoRemito.tipoNom} · {ultimoRemito.herramienta.nom} · Remito Nº {ultimoRemito.numero}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => imprimirRemito(ultimoRemito)}>
              🖨 Imprimir remito
            </Button>
            <button
              onClick={() => setUltimoRemito(null)}
              className="text-xs text-verde/60 hover:text-verde px-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Historial */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gris flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-azul">Historial de movimientos</h3>
          <span className="text-xs text-gris-dark">{movFiltrados.length} registros</span>
        </div>

        {/* Filtros */}
        <div className="px-4 py-3 border-b border-gris flex items-center gap-2 flex-wrap bg-gris/30">
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              placeholder="Buscar..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
            />
          </div>
          <select
            value={filtroHerr}
            onChange={e => setFiltroHerr(e.target.value)}
            className="px-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          >
            <option value="">Todas las herramientas</option>
            {herramientas.map(h => (
              <option key={h.id} value={String(h.id)}>{h.codigo} — {h.nom}</option>
            ))}
          </select>
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          >
            <option value="">Todos los tipos</option>
            {(config?.movTipos ?? []).map(t => (
              <option key={t.key} value={t.key}>{t.icono} {t.nom}</option>
            ))}
          </select>
          <select
            value={filtroObra}
            onChange={e => setFiltroObra(e.target.value)}
            className="px-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          >
            <option value="">Todas las obras</option>
            {obras.map(o => (
              <option key={o.cod} value={o.cod}>{o.nom}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Fecha', 'Herramienta', 'Movimiento', 'Origen', '→', 'Destino', 'Responsable', 'Obs'].map(h => (
                  <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingMov ? (
                <tr>
                  <td colSpan={8} className="text-center py-8">
                    <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                      <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </span>
                  </td>
                </tr>
              ) : movFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gris-dark text-sm">
                    No hay movimientos registrados
                  </td>
                </tr>
              ) : (
                movFiltrados.map(m => (
                  <tr key={m.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gris-dark whitespace-nowrap">
                      {fmtFecha(m.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-sm text-carbon">{m.herramienta?.nom ?? '—'}</div>
                      <div className="font-mono text-[10px] text-gris-dark">{m.herramienta?.codigo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${MOV_COLORS[m.tipo?.color ?? 'azul']}`}>
                        {m.tipo?.icono} {m.tipo?.nom ?? m.tipo_key}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {m.obra_origen?.nom ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-naranja font-bold">→</td>
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {m.obra_destino?.nom ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {m.responsable || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gris-dark max-w-[150px] truncate">
                      {m.obs || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}