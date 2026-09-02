'use client'

import { Button } from '@/components/ui/Button'

// Bloque de adjunto foto/PDF (subir / ver / quitar). Copia del bloque de DNI
// del modal de contratista, parametrizado para el doc del presupuesto.
interface Props {
  label:      string
  docNombre:  string | null
  /** Sin id todavía (alta): no se puede adjuntar hasta guardar. */
  sinId?:     boolean
  puedeMutar: boolean
  motivo?:    string | null
  subiendo:   boolean
  quitando:   boolean
  onSubir:    (e: React.ChangeEvent<HTMLInputElement>) => void
  onVer:      () => void
  onQuitar:   () => void
}

export function BloqueAdjunto({
  label, docNombre, sinId = false, puedeMutar, motivo, subiendo, quitando,
  onSubir, onVer, onQuitar,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
        {label}
      </label>
      {sinId ? (
        <p className="text-xs text-gris-dark italic">
          Guardá primero para adjuntar el archivo.
        </p>
      ) : docNombre ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border-[1.5px] border-gris-mid px-3 py-2">
          <span className="text-sm text-carbon truncate" title={docNombre}>
            📎 {docNombre}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onVer}>Ver</Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!puedeMutar || quitando}
              title={motivo ?? undefined}
              onClick={onQuitar}
            >
              {quitando ? 'Quitando…' : 'Quitar'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={onSubir}
            disabled={!puedeMutar || subiendo}
            title={motivo ?? undefined}
            className="text-xs text-gris-dark file:mr-3 file:rounded-lg file:border-0 file:bg-gris file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-carbon hover:file:bg-gris-mid disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {subiendo && (
            <span className="text-xs text-gris-dark inline-flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
              Subiendo…
            </span>
          )}
          <span className="text-[11px] text-gris-mid">
            JPG, PNG, WEBP, HEIC o PDF · máx. 10 MB
          </span>
        </div>
      )}
    </div>
  )
}
