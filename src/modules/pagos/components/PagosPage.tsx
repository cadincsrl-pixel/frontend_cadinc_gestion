'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { FacturasTab } from './FacturasTab'
import { OrdenesTab } from './OrdenesTab'
import { ProveedoresPagosTab } from './ProveedoresPagosTab'
import { ConfiguracionTab } from './configuracion/ConfiguracionTab'

const TABS = [
  { key: 'facturas',    icon: '🧾', label: 'Facturas',    sub: 'Facturas de proveedor, aprobación y vencimientos' },
  { key: 'pagos',       icon: '💸', label: 'Pagos',       sub: 'Órdenes de pago, notas de crédito y cheques' },
  { key: 'proveedores', icon: '🏢', label: 'Proveedores', sub: 'Padrón propio: CUIT, alias y CBU' },
  { key: 'configuracion', icon: '⚙️', label: 'Configuración', sub: 'Jurisdicciones y percepción por defecto' },
]

/** «123» → 123; cualquier otra cosa → null. */
function idDeUrl(v: string | null): number | null {
  const n = Number(v)
  return v && Number.isInteger(n) && n > 0 ? n : null
}

export function PagosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const permitidos = useTabsPermitidos('pagos')

  // Intersección con los tabs que EXISTEN: un permiso puede traer 'resumen'
  // (fase 2) y hasta que la pantalla exista no hay que ofrecerlo ni caer en él
  // como redirect, porque no renderiza nada.
  const allowedTabs = useMemo(() => {
    const declarados = new Set((TABS_POR_MODULO.pagos ?? []).map(t => t.key))
    return permitidos.filter(t => declarados.has(t))
  }, [permitidos])

  const tab = searchParams.get('tab') ?? 'facturas'
  const aviso = searchParams.get('aviso')
  const importacion = idDeUrl(searchParams.get('importacion'))
  const ficha = idDeUrl(searchParams.get('ficha'))
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!
  const permitido = allowedTabs.length === 0 || allowedTabs.includes(tab)

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/pagos?tab=${allowedTabs[0]}`)
    }
  }, [allowedTabs, tab, router])

  if (!permitido) return null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-2xl sm:text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      {/* Contenido */}
      <div className="flex flex-col gap-4">
        {/* La `key` hace que un deep-link nuevo (campana, importador,
            Contabilidad › «Ir al origen») re-arme el filtro aunque ya se
            esté en la pantalla: el estado inicial sale de la URL. */}
        {tab === 'facturas'    && (
          <FacturasTab key={`${aviso ?? ''}|${importacion ?? ''}|${ficha ?? ''}`}
            aviso={aviso} importacion={importacion} ficha={ficha} />
        )}
        {tab === 'pagos'       && <OrdenesTab key={ficha ?? ''} ficha={ficha} />}
        {tab === 'proveedores' && <ProveedoresPagosTab />}
        {tab === 'configuracion' && <ConfiguracionTab />}
      </div>
    </div>
  )
}
