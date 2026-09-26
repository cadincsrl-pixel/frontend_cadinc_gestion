'use client'

import { useState } from 'react'

/** 30714014346 → 30-71401434-6 (si no son 11 dígitos, tal cual). */
export function fmtCuit(c: string | null | undefined): string {
  const d = String(c ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(c ?? '')
}

/**
 * CUIT del proveedor bien a la vista y con «Copiar» (dueño, 27/09/2026: para
 * endosar un cheque había que cerrar el pago e ir a buscarlo a la ficha).
 * Copia sólo los dígitos, que es como lo piden el home banking y el e-cheq.
 */
export function CuitProveedor({ cuit, nombre, compacto = false }: { cuit: string | null | undefined; nombre?: string | null; compacto?: boolean }) {
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)
  const digitos = String(cuit ?? '').replace(/\D/g, '')

  if (!digitos) {
    return <span className="text-[11px] text-naranja-dark">Sin CUIT en la ficha del proveedor</span>
  }

  async function copiar(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(digitos)
      setCopiado('si')
    } catch {
      setCopiado('no')
    }
    setTimeout(() => setCopiado(null), 2000)
  }

  const boton = (
    <button type="button" onClick={copiar}
      className="text-[11px] font-semibold px-2 py-0.5 rounded border border-gris-mid bg-white hover:bg-gris/40"
      title="Copia el CUIT sin guiones">
      {copiado === 'si' ? '✓ Copiado' : copiado === 'no' ? 'Copialo a mano' : 'Copiar'}
    </button>
  )

  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[11px] text-gris-dark">CUIT</span>
        <span className="font-mono text-sm font-semibold select-all tabular-nums">{fmtCuit(digitos)}</span>
        {boton}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-3 flex-wrap border border-gris-mid rounded px-3 py-2 bg-gris/20">
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gris-dark">CUIT del proveedor</span>
        {nombre && <span className="text-xs text-gris-dark">{nombre}</span>}
      </div>
      <span className="font-mono text-lg font-bold select-all tabular-nums">{fmtCuit(digitos)}</span>
      {boton}
    </div>
  )
}
