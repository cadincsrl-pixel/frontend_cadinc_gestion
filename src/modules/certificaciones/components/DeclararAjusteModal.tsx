'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import {
  useCreateMovimiento,
  subirComprobanteAjuste,
} from '../hooks/useStock'

const SUB_MOTIVOS = [
  { value: 'faltante_fisico',    label: 'Faltante físico',                 sign: 'neg', help: 'No aparece. Potencial extravío o robo.' },
  { value: 'dano_rotura',        label: 'Daño / rotura',                   sign: 'neg', help: 'Mercadería rota inservible.' },
  { value: 'merma_normal',       label: 'Merma normal',                    sign: 'neg', help: 'Evaporación, polvo, materiales que merman.' },
  { value: 'error_carga',        label: 'Error de carga al sistema',       sign: 'both', help: 'Se cargó mal en el sistema (corrige administrativamente).' },
  { value: 'ingreso_sin_compra', label: 'Ingreso sin solicitud de compra', sign: 'pos', help: 'Carga inicial, sobrante encontrado, donación, devolución sin orden.' },
  { value: 'otro',               label: 'Otro',                            sign: 'both', help: 'Justificá en observaciones.' },
] as const

interface Material {
  id:           number
  nombre:       string
  unidad:       string
  stock_actual: number
}

interface Props {
  material: Material
  onClose:  () => void
  onSuccess?: () => void
}

export function DeclararAjusteModal({ material, onClose, onSuccess }: Props) {
  const toast = useToast()
  const { mutateAsync: createMov, isPending: creating } = useCreateMovimiento()
  const [signo,      setSigno]      = useState<'-' | '+'>('-')
  const [cantidadAbs, setCantidadAbs] = useState('')
  const [subMotivo,  setSubMotivo]  = useState<typeof SUB_MOTIVOS[number]['value']>('faltante_fisico')
  const [obs,        setObs]        = useState('')
  const [archivo,    setArchivo]    = useState<File | null>(null)
  const [subiendo,   setSubiendo]   = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!archivo) { setPreviewUrl(null); return }
    if (!archivo.type.startsWith('image/')) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(archivo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  useEffect(() => {
    const def = SUB_MOTIVOS.find(s => s.value === subMotivo)
    if (def?.sign === 'pos') setSigno('+')
    if (def?.sign === 'neg') setSigno('-')
  }, [subMotivo])

  const cantidadNum = Number(cantidadAbs)
  const cantidadFirmada = (signo === '-' ? -1 : 1) * cantidadNum
  const stockResultante = material.stock_actual + cantidadFirmada
  const subInfo = SUB_MOTIVOS.find(s => s.value === subMotivo)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > 5 * 1024 * 1024) {
      toast(`${f.name}: supera los 5 MB`, 'err')
      return
    }
    setArchivo(f)
  }

  async function handleConfirmar() {
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      toast('Ingresá una cantidad positiva', 'err'); return
    }
    if (obs.trim().length < 3) {
      toast('La observación es obligatoria (mínimo 3 caracteres)', 'err'); return
    }
    if (!archivo) {
      toast('Adjuntá una foto o comprobante (obligatorio)', 'err'); return
    }
    if (stockResultante < 0) {
      const ok = window.confirm(`El stock resultante quedaría en ${stockResultante}. ¿Continuar igual?`)
      if (!ok) return
    }

    let comprobantePath = ''
    let comprobanteHash = ''
    try {
      setSubiendo(true)
      const r = await subirComprobanteAjuste(archivo)
      comprobantePath = r.storage_path
      comprobanteHash = r.file_hash
    } catch (e: any) {
      toast(e?.message ?? 'Error al subir el comprobante', 'err')
      setSubiendo(false)
      return
    } finally {
      setSubiendo(false)
    }

    try {
      await createMov({
        material_id:    material.id,
        tipo:           'ajuste',
        cantidad:       cantidadFirmada,
        motivo:         'ajuste_inventario',
        sub_motivo:     subMotivo,
        obs:            obs.trim(),
        comprobante_storage_path: comprobantePath,
        comprobante_hash:         comprobanteHash,
      })
      toast('✓ Diferencia declarada — queda pendiente de aprobación', 'ok')
      onSuccess?.()
      onClose()
    } catch (e: any) {
      toast(e?.message ?? 'Error al declarar la diferencia', 'err')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="↔ DECLARAR DIFERENCIA"
      width="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={creating || subiendo} onClick={handleConfirmar}>
            ✓ Declarar (queda pendiente)
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-amarillo-light/40 border border-amarillo/30 rounded-lg p-3 text-xs text-[#7A5500]">
          ⚠ La diferencia <strong>no impacta el stock</strong> hasta que un usuario con permiso la apruebe. Quedará visible en el panel de ajustes pendientes con tu nombre, foto y observación.
        </div>

        <div className="bg-gris rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Material</div>
            <div className="font-bold text-sm text-carbon">{material.nombre}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Stock actual</div>
            <div className="font-mono font-bold text-azul text-lg">{material.stock_actual} {material.unidad}</div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Motivo *</label>
          <select
            value={subMotivo}
            onChange={e => setSubMotivo(e.target.value as typeof subMotivo)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
          >
            {SUB_MOTIVOS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {subInfo && <span className="text-[11px] text-gris-dark italic">{subInfo.help}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Diferencia *</label>
          <div className="flex items-stretch gap-0">
            <button
              type="button"
              onClick={() => setSigno('-')}
              disabled={subInfo?.sign === 'pos'}
              className={`px-4 py-2 border-[1.5px] rounded-l-lg font-bold text-lg transition-colors ${signo === '-' ? 'bg-rojo text-white border-rojo' : 'bg-white text-gris-dark border-gris-mid'} ${subInfo?.sign === 'pos' ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setSigno('+')}
              disabled={subInfo?.sign === 'neg'}
              className={`px-4 py-2 border-[1.5px] border-l-0 font-bold text-lg transition-colors ${signo === '+' ? 'bg-verde text-white border-verde' : 'bg-white text-gris-dark border-gris-mid'} ${subInfo?.sign === 'neg' ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              +
            </button>
            {/* Wrapper con flex-1: el className del Input cae en el <input>
                interno (que ya es w-full) — el ancho debe ir en un contenedor. */}
            <div className="flex-1 min-w-0">
              <Input
                type="number"
                min="0"
                step="any"
                value={cantidadAbs}
                onChange={e => setCantidadAbs(e.target.value)}
                placeholder="Cantidad"
                className="rounded-l-none rounded-r-lg"
              />
            </div>
          </div>
          {cantidadNum > 0 && (
            <div className="text-xs text-gris-dark">
              Stock resultante: <span className={`font-mono font-bold ${stockResultante < 0 ? 'text-rojo' : stockResultante < material.stock_actual ? 'text-naranja' : 'text-verde'}`}>{stockResultante} {material.unidad}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observación *</label>
          <textarea
            rows={3}
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Explicá qué pasó. Ej: faltaban 2 unidades en estante 3, se rompió 1 en el transporte..."
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors resize-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Foto / comprobante *</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          {!archivo ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gris-mid rounded-lg p-6 text-center hover:border-naranja hover:bg-naranja-light/20 transition-colors text-sm text-gris-dark"
            >
              📷 Toca para sacar foto o elegir archivo<br/>
              <span className="text-[11px]">Foto del estante, comprobante de baja, etc.</span>
            </button>
          ) : (
            <div className="border border-gris-mid rounded-lg overflow-hidden">
              {previewUrl ? (
                <img src={previewUrl} alt={archivo.name} className="w-full max-h-48 object-contain bg-gris" />
              ) : (
                <div className="bg-gris p-4 text-center text-sm text-gris-dark">📄 {archivo.name}</div>
              )}
              <div className="flex items-center justify-between px-3 py-2 text-xs bg-white">
                <span className="truncate">{archivo.name} · {(archivo.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => { setArchivo(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="text-rojo font-bold hover:underline ml-2 px-3 py-2 -my-2 shrink-0"
                >
                  ✕ Quitar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
