'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { LegajosTab } from './legajos/LegajosTab'
import { LiquidacionesTab } from './liquidaciones/LiquidacionesTab'
import { RecibosTab } from './recibos/RecibosTab'
import { ConveniosTab } from './convenios/ConveniosTab'
import { ConfiguracionTab } from './configuracion/ConfiguracionTab'
import { ExportarTab } from './exportar/ExportarTab'

const TABS = [
  { key: 'legajos',       icon: '🪪', label: 'Legajos',       sub: 'La ficha laboral de cada empleado en blanco: convenio, categoría, CUIL, obra social y CBU' },
  { key: 'liquidaciones', icon: '🧮', label: 'Liquidaciones', sub: 'Quincenas, meses, SAC, vacaciones y liquidaciones finales: generar, cargar y cerrar los recibos' },
  { key: 'recibos',       icon: '🧾', label: 'Recibos',       sub: 'Recibos de sueldo en PDF con el formato del Decreto 407/2026, de a uno o todos juntos' },
  { key: 'convenios',     icon: '📑', label: 'Convenios',     sub: 'Categorías y escalas de cada convenio, paritarias y conceptos con sus valores' },
  { key: 'configuracion', icon: '⚙️', label: 'Configuración', sub: 'Parámetros generales (detracción, ART, horas del mes…) y mapeo contable' },
  { key: 'exportar',      icon: '📤', label: 'Exportar',      sub: 'Archivo para el banco, resumen para el contador y Libro de Sueldos Digital' },
]

export function SueldosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const permitidos = useTabsPermitidos('sueldos')

  const allowedTabs = useMemo(() => {
    const declarados = new Set((TABS_POR_MODULO.sueldos ?? []).map(t => t.key))
    return permitidos.filter(t => declarados.has(t))
  }, [permitidos])

  const tab = searchParams.get('tab') ?? 'legajos'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!
  const permitido = allowedTabs.length === 0 || allowedTabs.includes(tab)

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/sueldos?tab=${allowedTabs[0]}`)
    }
  }, [allowedTabs, tab, router])

  if (!permitido) return null

  return (
    <div className="p-3 sm:p-4 md:p-6 flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-2xl sm:text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      <div className="flex flex-col gap-4">
        {tab === 'legajos'       && <LegajosTab />}
        {tab === 'liquidaciones' && <LiquidacionesTab />}
        {tab === 'recibos'       && <RecibosTab />}
        {tab === 'convenios'     && <ConveniosTab />}
        {tab === 'configuracion' && <ConfiguracionTab />}
        {tab === 'exportar'      && <ExportarTab />}
      </div>
    </div>
  )
}
