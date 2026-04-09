'use client'

import { useState } from 'react'
import { useRemitos, useCreateRemito, useEmitirRemito, useDeleteRemito } from '../hooks/useRemitos'
import { useObras }   from '@/modules/tarja/hooks/useObras'
import { Modal }      from '@/components/ui/Modal'
import { Button }     from '@/components/ui/Button'
import { Input }      from '@/components/ui/Input'
import { Badge }      from '@/components/ui/Badge'
import { useToast }   from '@/components/ui/Toast'
import type { Remito, RemitoItem } from '@/types/domain.types'

function fmtFecha(s: string) {
  const [y, m, d] = s.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

const UNIDADES = ['unidad', 'kg', 'lts', 'mts', 'm²', 'm³', 'bolsa', 'caja', 'rollo', 'par']

function nextNumero(remitos: Remito[]): string {
  const nums = remitos
    .map(r => r.numero.match(/^REM-(\d+)$/))
    .filter(Boolean)
    .map(m => parseInt(m![1]))
  const max = nums.length ? Math.max(...nums) : 0
  return `REM-${String(max + 1).padStart(4, '0')}`
}

function imprimirRemito(r: Remito) {
  const copias = [
    { label: 'ORIGINAL',   dest: 'OFICINA'    },
    { label: 'DUPLICADO',  dest: 'DESTINATARIO' },
    { label: 'TRIPLICADO', dest: 'REMITENTE'  },
  ]

  const itemsHTML = r.items.map(it => `
    <tr>
      <td>${it.cantidad}</td>
      <td>${it.unidad}</td>
      <td><strong>${it.descripcion}</strong></td>
      <td>${it.obs ?? '—'}</td>
    </tr>
  `).join('')

  const copiasHTML = copias.map(c => `
    <div class="copia">
      <div class="cabecera">
        <div>
          <div class="empresa">CADINC</div>
          <div class="titulo">REMITO DE MATERIALES</div>
        </div>
        <div class="numero-bloque">
          <div class="numero">Nº ${r.numero}</div>
          <div class="badge">${c.label} — ${c.dest}</div>
          <div class="fecha">${fmtFecha(r.fecha)}</div>
        </div>
      </div>
      <div class="seccion-grid">
        <div class="campo"><span class="lbl">Origen / Remitente</span><span class="val bold">${r.origen}</span></div>
        <div class="flecha">→</div>
        <div class="campo"><span class="lbl">Destino / Destinatario</span><span class="val bold azul">${r.destino}</span></div>
      </div>
      <table class="tabla-items">
        <thead><tr><th>Cant.</th><th>Unidad</th><th>Descripción</th><th>Obs.</th></tr></thead>
        <tbody>${itemsHTML}</tbody>
      </table>
      ${r.obs ? `<div class="obs-bloque"><span class="lbl">Observaciones:</span> ${r.obs}</div>` : ''}
      <div class="firmas">
        <div class="firma"><div class="linea-firma"></div><div class="lbl-firma">Entrega</div></div>
        <div class="firma"><div class="linea-firma"></div><div class="lbl-firma">Recibe</div></div>
        <div class="firma"><div class="linea-firma"></div><div class="lbl-firma">Aclaración</div></div>
      </div>
    </div>
  `).join('<div class="corte">✂ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Remito ${r.numero}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #1a1a2e; }
    .copia { height: 89mm; padding: 3mm 4mm; border: 1.5px solid #d1d5db; border-radius: 3mm; display: flex; flex-direction: column; gap: 2mm; page-break-inside: avoid; }
    .corte { font-size: 7pt; color: #aaa; border-bottom: 1px dashed #bbb; margin: 1.5mm 0; padding-left: 2mm; }
    .cabecera { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a2e; padding-bottom: 2mm; }
    .empresa { font-size: 16pt; font-weight: 900; letter-spacing: 2px; }
    .titulo { font-size: 7pt; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
    .numero-bloque { text-align: right; }
    .numero { font-size: 12pt; font-weight: 900; font-family: monospace; color: #e85d04; }
    .badge { font-size: 6.5pt; font-weight: bold; background: #fff3e0; color: #e85d04; border: 1px solid #e85d04; border-radius: 2mm; padding: 1px 4px; display: inline-block; margin-top: 1mm; }
    .fecha { font-size: 7pt; color: #888; margin-top: 1mm; }
    .seccion-grid { display: flex; gap: 3mm; align-items: center; }
    .campo { flex: 1; display: flex; flex-direction: column; gap: 0.5mm; }
    .flecha { font-size: 14pt; font-weight: bold; color: #e85d04; flex-shrink: 0; }
    .lbl { font-size: 6.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }
    .val { font-size: 9pt; font-weight: 500; }
    .val.bold { font-weight: 700; }
    .val.azul { color: #1a1a2e; }
    .tabla-items { width: 100%; border-collapse: collapse; flex: 1; }
    .tabla-items th { background: #1a1a2e; color: #fff; font-size: 6.5pt; text-transform: uppercase; padding: 1.5mm 2mm; text-align: left; }
    .tabla-items td { border-bottom: 1px solid #e5e7eb; padding: 1mm 2mm; font-size: 8pt; }
    .obs-bloque { font-size: 7.5pt; color: #555; background: #f9fafb; border-radius: 2mm; padding: 1.5mm 2mm; }
    .firmas { display: flex; gap: 4mm; margin-top: auto; }
    .firma { flex: 1; }
    .linea-firma { border-bottom: 1px solid #333; height: 8mm; }
    .lbl-firma { font-size: 6.5pt; color: #888; text-align: center; margin-top: 1mm; text-transform: uppercase; }
  </style>
  </head><body>${copiasHTML}</body></html>`

  const win = window.open('', '_blank', 'width=794,height=1123')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => { win.focus(); win.print() }, 400)
}

export function HerrRemitos() {
  const toast = useToast()
  const { data: remitos = [], isLoading } = useRemitos()
  const { data: obras   = [] }            = useObras()
  const { mutate: crear,   isPending: creando  } = useCreateRemito()
  const { mutate: emitir                        } = useEmitirRemito()
  const { mutate: eliminar                      } = useDeleteRemito()

  const [modalNuevo, setModalNuevo] = useState(false)

  // Form state
  const [numero,  setNumero]  = useState('')
  const [fecha,   setFecha]   = useState('')
  const [origen,  setOrigen]  = useState('')
  const [destino, setDestino] = useState('')
  const [obs,     setObs]     = useState('')
  const [items,   setItems]   = useState<Omit<RemitoItem, 'id'>[]>([
    { descripcion: '', cantidad: 1, unidad: 'unidad', obs: '' },
  ])

  function abrirNuevo() {
    setNumero(nextNumero(remitos))
    setFecha(new Date().toISOString().slice(0, 10))
    setOrigen(''); setDestino(''); setObs('')
    setItems([{ descripcion: '', cantidad: 1, unidad: 'unidad', obs: '' }])
    setModalNuevo(true)
  }

  function addItem() {
    setItems(prev => [...prev, { descripcion: '', cantidad: 1, unidad: 'unidad', obs: '' }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof Omit<RemitoItem, 'id'>, value: string | number) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  function handleCrear() {
    if (!origen.trim())  { toast('Ingresá el origen', 'err'); return }
    if (!destino.trim()) { toast('Ingresá el destino', 'err'); return }
    if (items.some(it => !it.descripcion.trim())) { toast('Completá la descripción de todos los ítems', 'err'); return }
    crear(
      { numero, fecha, origen, destino, obs: obs || null, items },
      {
        onSuccess: () => { toast('✓ Remito guardado', 'ok'); setModalNuevo(false) },
        onError:   () => toast('Error al guardar remito', 'err'),
      }
    )
  }

  const lugaresOpciones = [
    'Depósito central',
    'Oficina',
    ...obras.map(o => o.nom),
  ]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">REMITOS</h1>
          <p className="text-sm text-gris-dark mt-1">Emisión y registro de remitos de materiales</p>
        </div>
        <Button variant="primary" size="sm" onClick={abrirNuevo}>
          ＋ Nuevo remito
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando...
        </div>
      ) : remitos.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-12 text-center text-gris-dark">
          <div className="text-4xl mb-3">📄</div>
          <p className="font-semibold text-azul text-base">No hay remitos registrados</p>
          <p className="text-sm mt-1">Creá el primero con el botón de arriba</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {remitos.map((r: Remito) => (
            <div
              key={r.id}
              className={`bg-white rounded-card shadow-card p-4 border-l-4 ${r.estado === 'emitido' ? 'border-verde' : 'border-amarillo'}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge
                      variant={r.estado === 'emitido' ? 'cerrado' : 'pendiente'}
                      label={r.estado === 'emitido' ? '✓ Emitido' : '📝 Borrador'}
                    />
                    <span className="font-mono text-xs text-gris-dark font-bold">{r.numero}</span>
                    <span className="text-xs text-gris-dark">{fmtFecha(r.fecha)}</span>
                  </div>
                  <div className="font-bold text-azul text-sm">
                    {r.origen} <span className="text-naranja mx-1">→</span> {r.destino}
                  </div>
                  <div className="text-xs text-gris-dark mt-0.5">
                    {r.items.length} ítem{r.items.length !== 1 ? 's' : ''}
                    {r.obs && ` · ${r.obs}`}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="secondary" size="sm" onClick={() => imprimirRemito(r)}>
                    🖨 Imprimir
                  </Button>
                  {r.estado === 'borrador' && (
                    <Button
                      variant="primary" size="sm"
                      onClick={() => emitir(r.id, { onSuccess: () => toast('✓ Remito emitido', 'ok') })}
                    >
                      ✓ Emitir
                    </Button>
                  )}
                  <button
                    onClick={() => { if (confirm('¿Eliminar este remito?')) eliminar(r.id, { onSuccess: () => toast('✓ Eliminado', 'ok') }) }}
                    className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Items preview */}
              <div className="mt-3 bg-gris rounded-xl overflow-hidden">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {['Cant.', 'Unidad', 'Descripción', 'Obs.'].map(h => (
                        <th key={h} className="bg-azul/10 text-azul text-left px-3 py-1.5 font-bold uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((it, i) => (
                      <tr key={i} className="border-b border-gris-mid last:border-0">
                        <td className="px-3 py-1.5 font-mono font-bold">{it.cantidad}</td>
                        <td className="px-3 py-1.5 text-gris-dark">{it.unidad}</td>
                        <td className="px-3 py-1.5 font-semibold">{it.descripcion}</td>
                        <td className="px-3 py-1.5 text-gris-dark">{it.obs || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo remito */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="📄 NUEVO REMITO"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando} onClick={handleCrear}>✓ Guardar remito</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">

          {/* Encabezado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Número</label>
              <div className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-gris font-mono font-bold text-carbon">
                {numero}
              </div>
            </div>
            <Input label="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          {/* Origen / Destino */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Origen / Remitente *</label>
              <input
                list="lugares-list"
                value={origen}
                onChange={e => setOrigen(e.target.value)}
                placeholder="Depósito central, obra..."
                className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Destino / Destinatario *</label>
              <input
                list="lugares-list"
                value={destino}
                onChange={e => setDestino(e.target.value)}
                placeholder="Obra, taller..."
                className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
              />
            </div>
          </div>
          <datalist id="lugares-list">
            {lugaresOpciones.map(l => <option key={l} value={l} />)}
          </datalist>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                Ítems ({items.length})
              </label>
              <button
                onClick={addItem}
                className="text-xs font-bold text-naranja hover:text-naranja-dark transition-colors"
              >
                ＋ Agregar ítem
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[60px_100px_1fr_100px_28px] gap-2 items-end">
                  <div className="flex flex-col gap-1">
                    {i === 0 && <label className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Cant.</label>}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.cantidad}
                      onChange={e => updateItem(i, 'cantidad', parseFloat(e.target.value) || 0)}
                      className="px-2 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors text-center font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    {i === 0 && <label className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Unidad</label>}
                    <select
                      value={it.unidad}
                      onChange={e => updateItem(i, 'unidad', e.target.value)}
                      className="px-2 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white transition-colors"
                    >
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    {i === 0 && <label className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Descripción</label>}
                    <input
                      type="text"
                      value={it.descripcion}
                      onChange={e => updateItem(i, 'descripcion', e.target.value)}
                      placeholder="Pintura látex blanco, Portland..."
                      className="px-2 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    {i === 0 && <label className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Obs.</label>}
                    <input
                      type="text"
                      value={it.obs ?? ''}
                      onChange={e => updateItem(i, 'obs', e.target.value)}
                      placeholder="Opcional"
                      className="px-2 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    className="pb-1 text-gris-mid hover:text-rojo transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Obs general */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observaciones generales</label>
            <input
              type="text"
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Opcional"
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
            />
          </div>

        </div>
      </Modal>

    </div>
  )
}
