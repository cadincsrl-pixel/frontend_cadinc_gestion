'use client'

import { useState, useMemo } from 'react'
import {
  useHerramientas,
  useHerrConfig,
  useHerrMovimientosPaginated,
  useRegistrarMovimiento,
} from '../hooks/useHerramientas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { apiGet } from '@/lib/api/client'
import { useQuery } from '@tanstack/react-query'
import { useToast }   from '@/components/ui/Toast'
import { Button }    from '@/components/ui/Button'
import { Combobox }  from '@/components/ui/Combobox'
import { Modal }     from '@/components/ui/Modal'
import { usePermisos } from '@/hooks/usePermisos'
import { MovimientoLoteModal } from './MovimientoLoteModal'
import type { Herramienta, HerrMovTipo, Obra, Profile } from '@/types/domain.types'

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
  const { puedeCrear } = usePermisos('herramientas')
  const [loteModalOpen, setLoteModalOpen] = useState(false)

  const { data: herramientas = [] } = useHerramientas()
  const { data: config } = useHerrConfig()
  const { data: obras = [] } = useObras()
  const { data: personal = [] } = usePersonal()
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-activos'],
    queryFn:  () => apiGet<Profile[]>('/api/usuarios'),
    staleTime: 5 * 60_000,
  })
  const { mutate: registrar, isPending: registrando } = useRegistrarMovimiento()

  // Formulario
  const [herrSel, setHerrSel] = useState('')
  const [tipoMov, setTipoMov] = useState('')
  const [obraOrigen, setObraOrigen] = useState('')
  const [obraDestino, setObraDestino] = useState('')
  // Combo unificado: value codificado como `leg:XXX` (personal) o `user:UUID` (profile).
  // Vacío = sin responsable.
  const [responsableSel, setResponsableSel] = useState('')
  const [obs, setObs] = useState('')
  const [fechaManual, setFechaManual] = useState('')
  const [ultimoRemito, setUltimoRemito] = useState<RemitoData | null>(null)

  // Filtros historial — los structurados van al server (re-query); la búsqueda
  // libre se filtra client-side sobre lo ya cargado.
  const [filtroHerr, setFiltroHerr] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroObra, setFiltroObra] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('') // YYYY-MM-DD
  const [filtroHasta, setFiltroHasta] = useState('') // YYYY-MM-DD
  const [busqueda, setBusqueda] = useState('')

  const {
    data: movPages,
    isLoading: loadingMov,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useHerrMovimientosPaginated({
    herramienta_id: filtroHerr ? Number(filtroHerr) : null,
    tipo_key:       filtroTipo || null,
    obra_cod:       filtroObra || null,
    desde:          filtroDesde ? `${filtroDesde}T00:00:00` : null,
    hasta:          filtroHasta ? `${filtroHasta}T23:59:59.999` : null,
  })
  const movimientos = useMemo(
    () => movPages?.pages.flatMap(p => p.items) ?? [],
    [movPages],
  )
  const totalMovimientos = movPages?.pages[0]?.total ?? 0

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

    // Confirmación destructiva: una baja saca la herramienta del inventario activo.
    if (tipoMov === 'baja') {
      const herr = herramientas.find(x => String(x.id) === herrSel)
      const nombre = herr ? `${herr.codigo} ${herr.nom}` : 'esta herramienta'
      if (!window.confirm(`¿Confirmás dar de BAJA ${nombre}?\n\nVa a salir del inventario activo. La operación queda registrada en auditoría pero no se puede deshacer desde la UI.`)) {
        return
      }
    }

    // Decodificar responsable: `leg:XXX` o `user:UUID` (vacío = sin responsable).
    let responsable_leg: string | null = null
    let responsable_user_id: string | null = null
    let responsableNombre = ''
    if (responsableSel.startsWith('leg:')) {
      responsable_leg = responsableSel.slice(4)
      responsableNombre = personal.find(p => p.leg === responsable_leg)?.nom ?? ''
    } else if (responsableSel.startsWith('user:')) {
      responsable_user_id = responsableSel.slice(5)
      responsableNombre = usuarios.find(u => u.id === responsable_user_id)?.nombre ?? ''
    }

    registrar(
      {
        herramienta_id: Number(herrSel),
        tipo_key: tipoMov,
        obra_origen_cod: campos.origen && obraOrigen ? obraOrigen : null,
        obra_destino_cod: campos.destino ? obraDestino : null,
        responsable_leg,
        responsable_user_id,
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
            responsable: responsableNombre,
            obs,
          })
          toast('✓ Movimiento registrado', 'ok')
          setHerrSel(''); setObraOrigen(''); setObraDestino('')
          setResponsableSel(''); setObs(''); setFechaManual('')
          setTipoMov('')
        },
        onError: (e: any) => toast(e.message ?? 'Error al registrar', 'err'),
      }
    )
  }

  // Reimprime el remito de un movimiento existente (desde el historial).
  // Construye el RemitoData a partir del registro y de la herramienta cacheada
  // (la cual aporta marca/modelo/tipo que no vienen joineados en el movimiento).
  function reimprimirRemito(m: typeof movimientos[number]) {
    const herr = herramientas.find(h => h.id === m.herramienta_id)
    imprimirRemito({
      numero:      String(m.id).padStart(6, '0'),
      fecha:       m.fecha,
      tipoNom:     m.tipo?.nom   ?? m.tipo_key,
      tipoIcono:   m.tipo?.icono ?? '→',
      herramienta: {
        codigo: m.herramienta?.codigo ?? herr?.codigo ?? '',
        nom:    m.herramienta?.nom    ?? herr?.nom    ?? '',
        marca:  herr?.marca  ?? undefined,
        modelo: herr?.modelo ?? undefined,
        tipo:   herr?.tipo ? `${herr.tipo.icono ?? ''} ${herr.tipo.nom}` : undefined,
      },
      obraOrigen:  m.obra_origen?.nom  ?? '—',
      obraDestino: m.obra_destino?.nom ?? '—',
      responsable: m.responsable ?? '',
      obs:         m.obs ?? '',
    })
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

  // Búsqueda libre client-side sobre la data ya paginada. Los filtros
  // estructurados (herr/tipo/obra/desde/hasta) los aplica el server.
  const movFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return movimientos
    return movimientos.filter(m =>
      (m.herramienta?.nom ?? '').toLowerCase().includes(q) ||
      (m.herramienta?.codigo ?? '').toLowerCase().includes(q) ||
      (m.responsable ?? '').toLowerCase().includes(q)
    )
  }, [movimientos, busqueda])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">MOVIMIENTOS</h1>
          <p className="text-sm text-gris-dark mt-0.5">Registrá asignaciones y traslados entre obras</p>
        </div>
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setLoteModalOpen(true)}>
            📦 Movimiento múltiple
          </Button>
        )}
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4">
        <h3 className="font-bold text-azul text-base border-b border-gris pb-2">
          Registrar movimiento
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Herramienta */}
          <Combobox
            label="Herramienta *"
            placeholder="Buscar por código, nombre o marca..."
            options={herramientas
              .filter((h: Herramienta) => h.estado_key !== 'baja')
              .map((h: Herramienta) => ({
                value: String(h.id),
                label: `[${h.codigo}] ${h.nom}`,
                sub:   `${h.estado?.nom ?? h.estado_key}${h.obra ? ` · ${h.obra.nom}` : ''}${h.marca ? ` · ${h.marca}` : ''}`,
              }))
            }
            value={herrSel}
            onChange={onHerrChange}
          />

          {/* Tipo de movimiento */}
          <Combobox
            label="Tipo de movimiento *"
            placeholder="Buscar tipo..."
            options={tiposDisponibles.map((t: HerrMovTipo) => ({
              value: t.key,
              label: `${t.icono} ${t.nom}`,
              sub:   t.descripcion ?? '',
            }))}
            value={tipoMov}
            onChange={v => {
              setTipoMov(v)
              // Una devolución siempre va al depósito interno — no tiene sentido
              // que el usuario elija otra obra. Auto-seteamos el destino.
              if (v === 'devolucion') {
                const depo = obras.find((o: Obra) => o.es_deposito)
                setObraDestino(depo?.cod ?? '')
              } else {
                setObraDestino('')
              }
            }}
            disabled={!herrSel}
          />

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
                      {obras.find(o => o.cod === obraOrigen)?.nom
                        ?? (obraOrigen || (tipoMov === 'retorno_rep' ? 'Taller / Depósito' : '—'))}
                    </span>
                  )}
                  {campos.origen && campos.destino && (
                    <span className={`font-bold text-lg ${obraDestino ? 'text-naranja' : 'text-gris-mid'}`}>→</span>
                  )}
                  {campos.destino && (
                    obraDestino ? (
                      <span className="text-azul font-bold">
                        {obras.find(o => o.cod === obraDestino)?.nom ?? obraDestino}
                      </span>
                    ) : (
                      <span className="text-gris-dark italic font-sans">elegí destino</span>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Obra destino */}
        {herramientaActual && tipoMov && campos.destino && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tipoMov === 'devolucion' ? (
              // Devolución va siempre al depósito — readonly para evitar errores.
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                  Obra destino *
                </label>
                <div className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-gris text-carbon font-semibold">
                  {(() => {
                    const depo = obras.find((o: Obra) => o.es_deposito)
                    return depo ? `${depo.nom} (${depo.cod})` : '⚠ No hay obra marcada como depósito'
                  })()}
                </div>
              </div>
            ) : (
              <Combobox
                label="Obra destino *"
                placeholder="Buscar obra por nombre o código..."
                options={obras
                  .filter((o: Obra) => o.cod !== obraOrigen)
                  .map((o: Obra) => ({ value: o.cod, label: o.nom, sub: o.cod }))
                }
                value={obraDestino}
                onChange={setObraDestino}
              />
            )}
          </div>
        )}

        {/* Responsable + Obs + Fecha */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Combobox
            label="Responsable"
            placeholder="Buscar operario o usuario..."
            options={[
              ...personal.map(p => ({
                value: `leg:${p.leg}`,
                label: p.nom,
                sub:   `Leg. ${p.leg}`,
                group: 'Operarios',
              })),
              ...usuarios
                .filter(u => u.activo !== false)
                .map(u => ({
                  value: `user:${u.id}`,
                  label: u.nombre,
                  sub:   u.rol_base ?? u.rol,
                  group: 'Usuarios del sistema',
                })),
            ]}
            value={responsableSel}
            onChange={setResponsableSel}
          />
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
            variant={tipoMov === 'baja' ? 'danger' : 'primary'}
            loading={registrando}
            disabled={!herrSel || !tipoMov}
            onClick={handleRegistrar}
          >
            {tipoMov === 'baja' ? '✕ Confirmar baja' : '✓ Registrar movimiento'}
          </Button>
        </div>
      </div>

      {/* Modal post-registro: ofrece imprimir el remito por triplicado */}
      {ultimoRemito && (
        <Modal
          open={!!ultimoRemito}
          onClose={() => setUltimoRemito(null)}
          title="✓ Movimiento registrado"
          footer={
            <>
              <Button variant="secondary" onClick={() => setUltimoRemito(null)}>
                No imprimir
              </Button>
              <Button
                variant="primary"
                onClick={() => { imprimirRemito(ultimoRemito); setUltimoRemito(null) }}
              >
                🖨 Imprimir remito triplicado
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-carbon">
              El movimiento se guardó correctamente. ¿Querés imprimir el remito
              en una hoja con tres copias (original, duplicado y triplicado)?
            </p>
            <div className="bg-gris rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gris-dark uppercase tracking-wider">Remito</span>
                <span className="font-mono font-bold text-naranja">Nº {ultimoRemito.numero}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-lg">{ultimoRemito.tipoIcono}</span>
                <span className="font-bold text-carbon">{ultimoRemito.tipoNom}</span>
                <span className="text-gris-dark">·</span>
                <span className="font-mono text-xs text-gris-dark">{ultimoRemito.herramienta.codigo}</span>
                <span className="text-carbon">{ultimoRemito.herramienta.nom}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gris-dark">{ultimoRemito.obraOrigen}</span>
                <span className="text-naranja font-bold">→</span>
                <span className="text-azul font-semibold">{ultimoRemito.obraDestino}</span>
              </div>
              {ultimoRemito.responsable && (
                <div className="text-xs text-gris-dark">
                  Responsable: <span className="font-semibold text-carbon">{ultimoRemito.responsable}</span>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Historial */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gris flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-azul">Historial de movimientos</h3>
          <span className="text-xs text-gris-dark">
            {busqueda
              ? `${movFiltrados.length} de ${movimientos.length} cargados`
              : `${movimientos.length} de ${totalMovimientos} cargados`}
          </span>
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
          <div className="flex items-center gap-1 text-xs">
            <label className="text-gris-dark font-bold">Desde</label>
            <input
              type="date"
              value={filtroDesde}
              max={filtroHasta || undefined}
              onChange={e => setFiltroDesde(e.target.value)}
              className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg outline-none focus:border-naranja bg-white"
            />
            <label className="text-gris-dark font-bold ml-1">Hasta</label>
            <input
              type="date"
              value={filtroHasta}
              min={filtroDesde || undefined}
              onChange={e => setFiltroHasta(e.target.value)}
              className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg outline-none focus:border-naranja bg-white"
            />
          </div>
          {(busqueda || filtroHerr || filtroTipo || filtroObra || filtroDesde || filtroHasta) && (
            <button
              onClick={() => {
                setBusqueda(''); setFiltroHerr(''); setFiltroTipo(''); setFiltroObra('')
                setFiltroDesde(''); setFiltroHasta('')
              }}
              className="text-xs font-bold text-gris-dark hover:text-carbon px-2 py-1 rounded hover:bg-white transition-colors"
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        {/* Desktop: tabla */}
        <div className="hidden md:block overflow-auto max-h-[70vh]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Fecha', 'Herramienta', 'Movimiento', 'Origen', '→', 'Destino', 'Responsable', 'Obs', ''].map((h, i) => (
                  <th key={i} className="sticky top-0 z-10 bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingMov ? (
                <tr>
                  <td colSpan={9} className="text-center py-8">
                    <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                      <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </span>
                  </td>
                </tr>
              ) : movFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gris-dark text-sm">
                    No hay movimientos registrados
                  </td>
                </tr>
              ) : (
                movFiltrados.map(m => {
                  const hasObras = !!(m.obra_origen?.nom || m.obra_destino?.nom)
                  // marca/modelo no vienen joineados en el movimiento — los traemos del cache.
                  const herrCache = herramientas.find(h => h.id === m.herramienta_id)
                  const marcaModelo = [herrCache?.marca, herrCache?.modelo].filter(Boolean).join(' · ')
                  return (
                  <tr key={m.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gris-dark whitespace-nowrap">
                      {fmtFecha(m.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-sm text-carbon">{m.herramienta?.nom ?? '—'}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gris-dark">
                        <span className="font-mono">{m.herramienta?.codigo}</span>
                        {marcaModelo && <span className="font-sans">· {marcaModelo}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${MOV_COLORS[m.tipo?.color ?? 'azul']}`}>
                        {m.tipo?.icono} {m.tipo?.nom ?? m.tipo_key}
                      </span>
                    </td>
                    {hasObras ? (
                      <>
                        <td className="px-4 py-3 text-sm text-gris-dark">
                          {m.obra_origen?.nom ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-naranja font-bold">→</td>
                        <td className="px-4 py-3 text-sm text-gris-dark">
                          {m.obra_destino?.nom ?? '—'}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-4 py-3 text-center text-gris-dark">—</td>
                    )}
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {m.responsable || '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-gris-dark max-w-[150px] truncate"
                      title={m.obs || undefined}
                    >
                      {m.obs || '—'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {hasObras && (
                        <button
                          onClick={() => reimprimirRemito(m)}
                          title="Reimprimir remito"
                          className="text-gris-dark hover:text-naranja hover:bg-gris/50 rounded p-1.5 transition-colors"
                        >
                          🖨
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards */}
        <div className="md:hidden flex flex-col gap-2 p-3">
          {loadingMov ? (
            <div className="text-center py-8">
              <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                Cargando...
              </span>
            </div>
          ) : movFiltrados.length === 0 ? (
            <div className="text-center py-8 text-gris-dark text-sm">
              No hay movimientos registrados
            </div>
          ) : (
            movFiltrados.map(m => {
              const hasObras = !!(m.obra_origen?.nom || m.obra_destino?.nom)
              const herrCache = herramientas.find(h => h.id === m.herramienta_id)
              const marcaModelo = [herrCache?.marca, herrCache?.modelo].filter(Boolean).join(' · ')
              return (
              <div key={m.id} className="bg-white border border-gris rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-carbon truncate">{m.herramienta?.nom ?? '—'}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-gris-dark">
                      <span className="font-mono">{m.herramienta?.codigo}</span>
                      {marcaModelo && <span className="truncate">· {marcaModelo}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${MOV_COLORS[m.tipo?.color ?? 'azul']}`}>
                    {m.tipo?.icono} {m.tipo?.nom ?? m.tipo_key}
                  </span>
                </div>
                {hasObras && (
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="text-gris-dark">{m.obra_origen?.nom ?? '—'}</span>
                    <span className="text-naranja font-bold">→</span>
                    <span className="text-azul font-semibold">{m.obra_destino?.nom ?? '—'}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-[11px] text-gris-dark pt-1 border-t border-gris">
                  <span className="font-mono">{fmtFecha(m.fecha)}</span>
                  <div className="flex items-center gap-2">
                    {m.responsable && <span className="truncate">👤 {m.responsable}</span>}
                    {hasObras && (
                      <button
                        onClick={() => reimprimirRemito(m)}
                        title="Reimprimir remito"
                        className="text-gris-dark hover:text-naranja active:bg-gris/50 rounded p-1 -mr-1 transition-colors"
                      >
                        🖨
                      </button>
                    )}
                  </div>
                </div>
                {m.obs && (
                  <div className="text-xs text-gris-dark italic" title={m.obs}>{m.obs}</div>
                )}
              </div>
              )
            })
          )}
        </div>

        {/* Cargar más — server-side pagination. Si hay búsqueda libre activa,
            la próxima página podría no devolver matches; ese caso se resuelve
            cuando el user limpia la búsqueda. */}
        {hasNextPage && !loadingMov && (
          <div className="px-4 py-3 border-t border-gris flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              Cargar más ({movimientos.length} / {totalMovimientos})
            </Button>
          </div>
        )}
      </div>

      {/* Modal de movimiento múltiple */}
      {loteModalOpen && (
        <MovimientoLoteModal
          onClose={() => setLoteModalOpen(false)}
          onSuccess={() => setLoteModalOpen(false)}
        />
      )}

    </div>
  )
}