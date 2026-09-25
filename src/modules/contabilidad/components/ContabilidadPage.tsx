'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { AsientosTab } from './AsientosTab'
import { DiarioTab } from './DiarioTab'
import { MayorTab } from './MayorTab'
import { SumasSaldosTab } from './SumasSaldosTab'
import { EstadosTab } from './EstadosTab'
import { PlanTab } from './PlanTab'
import { PeriodosTab } from './PeriodosTab'
import { AutomaticosTab } from './AutomaticosTab'
import { MapeosTab } from './MapeosTab'
import { TesoreriaTab } from './TesoreriaTab'
import { BienesTab } from './BienesTab'

const TABS = [
  { key: 'asientos',     icon: '📝', label: 'Asientos',        sub: 'Carga manual, borradores, confirmación y anulación de asientos' },
  { key: 'diario',       icon: '📖', label: 'Libro diario',    sub: 'Los asientos confirmados del período, en orden y con sus líneas' },
  { key: 'mayor',        icon: '📒', label: 'Mayor',           sub: 'Movimientos y saldo de una cuenta, con el saldo anterior del ejercicio' },
  { key: 'sumas-saldos', icon: '⚖️', label: 'Sumas y saldos',  sub: 'Balance de sumas y saldos por cuenta, con control de que cuadre' },
  { key: 'estados',      icon: '📊', label: 'Estados contables', sub: 'Estado de situación patrimonial a una fecha y estado de resultados de un rango' },
  { key: 'tesoreria',    icon: '🏦', label: 'Tesorería',       sub: 'Movimientos de fondos sin factura (comisiones, impuesto al cheque, VEP, sueldos, transferencias) y sus conceptos' },
  { key: 'bienes',       icon: '🏗', label: 'Bienes de uso',   sub: 'Inventario de bienes de uso, cuadro de amortizaciones y generación de los asientos de amortización' },
  { key: 'plan',         icon: '🗂', label: 'Plan de cuentas', sub: 'Cuentas contables y cuentas de tesorería (bancos, caja y valores)' },
  { key: 'periodos',     icon: '🔒', label: 'Períodos',        sub: 'Cierre mensual: numera el libro diario y congela el mes' },
  { key: 'automaticos',  icon: '⚙️', label: 'Automáticos',     sub: 'Asientos de Ventas, Compras y movimientos de fondos: qué falta contabilizar, por qué, y contabilizar hasta una fecha' },
  { key: 'mapeos',       icon: '🔗', label: 'Mapeos',          sub: 'Qué cuenta usa cada concepto, alícuota, tributo y medio de cobro' },
]

export function ContabilidadPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const permitidos = useTabsPermitidos('contabilidad')

  const allowedTabs = useMemo(() => {
    const declarados = new Set((TABS_POR_MODULO.contabilidad ?? []).map(t => t.key))
    return permitidos.filter(t => declarados.has(t))
  }, [permitidos])

  const tab = searchParams.get('tab') ?? 'asientos'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!
  const permitido = allowedTabs.length === 0 || allowedTabs.includes(tab)

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/contabilidad?tab=${allowedTabs[0]}`)
    }
  }, [allowedTabs, tab, router])

  if (!permitido) return null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-2xl sm:text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      <div className="flex flex-col gap-4">
        {tab === 'asientos'     && <AsientosTab />}
        {tab === 'diario'       && <DiarioTab />}
        {tab === 'mayor'        && <MayorTab />}
        {tab === 'sumas-saldos' && <SumasSaldosTab />}
        {tab === 'estados'      && <EstadosTab />}
        {tab === 'plan'         && <PlanTab />}
        {tab === 'periodos'     && <PeriodosTab />}
        {tab === 'automaticos'  && <AutomaticosTab />}
        {tab === 'mapeos'       && <MapeosTab />}
        {tab === 'tesoreria'    && <TesoreriaTab />}
        {tab === 'bienes'       && <BienesTab />}
      </div>
    </div>
  )
}
