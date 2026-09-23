'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { useArcaEstado } from '../hooks/useFacturacion'
import { BannerHomologacion } from './EstadoArca'
import { FacturasTab } from './FacturasTab'
import { ClientesTab } from './ClientesTab'
import { FinnegansTab } from './FinnegansTab'

const TABS = [
  { key: 'facturas',  icon: '🧮', label: 'Facturas',  sub: 'Facturas y notas de crédito A y B contra ARCA' },
  { key: 'clientes',  icon: '🏢', label: 'Clientes',  sub: 'Padrón propio: CUIT, condición IVA y obras que se le facturan' },
  { key: 'finnegans', icon: '📥', label: 'Finnegans', sub: 'Autorizadas que falta cargar a mano en Finnegans' },
]

export function FacturacionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const permitidos = useTabsPermitidos('facturacion')

  const allowedTabs = useMemo(() => {
    const declarados = new Set((TABS_POR_MODULO.facturacion ?? []).map(t => t.key))
    return permitidos.filter(t => declarados.has(t))
  }, [permitidos])

  const tab = searchParams.get('tab') ?? 'facturas'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!
  const permitido = allowedTabs.length === 0 || allowedTabs.includes(tab)

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/facturacion?tab=${allowedTabs[0]}`)
    }
  }, [allowedTabs, tab, router])

  // /arca/estado lo habilita el tab `facturas` (contrato). Sin ese tab no se
  // pide: el banner de homologación igual sale en cada factura (es_homologacion).
  const arca = useArcaEstado(allowedTabs.includes('facturas'))

  if (!permitido) return null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {arca.data?.ambiente === 'homo' && <BannerHomologacion />}

      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-2xl sm:text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      <div className="flex flex-col gap-4">
        {tab === 'facturas'  && <FacturasTab />}
        {tab === 'clientes'  && <ClientesTab />}
        {tab === 'finnegans' && <FinnegansTab />}
      </div>
    </div>
  )
}
