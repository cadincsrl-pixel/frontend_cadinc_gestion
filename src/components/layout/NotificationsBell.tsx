'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotificaciones, fmtDiasFaltan, type CumpleanieroItem } from '@/hooks/useNotificaciones'

/**
 * Campana del topbar. Muestra:
 * - Badge rojo con count cuando hay cumpleaños HOY (urgente).
 * - Punto azul sutil cuando solo hay cumpleaños PRÓXIMOS.
 * - Sin marcas si no hay nada.
 *
 * Click → popover con dos secciones:
 * - 🎂 Cumplen hoy (en rojo)
 * - 📅 Próximos 7 días
 *
 * Click en una notificación → abre el modal del personal en /personal?leg=...
 */
export function NotificationsBell() {
  const router = useRouter()
  const { hoy, proximos, totalUrgente } = useNotificaciones()
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al click afuera.
  useEffect(() => {
    if (!abierto) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [abierto])

  const totalProximos = proximos.length
  const sinNotifs     = totalUrgente === 0 && totalProximos === 0

  function abrirPersonal(leg: string) {
    setAbierto(false)
    router.push(`/personal?leg=${encodeURIComponent(leg)}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto(p => !p)}
        title={sinNotifs ? 'Sin notificaciones' : `${totalUrgente + totalProximos} notificación${totalUrgente + totalProximos !== 1 ? 'es' : ''}`}
        className={`
          relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors
          ${totalUrgente > 0
            ? 'bg-rojo-light text-rojo hover:bg-rojo hover:text-white'
            : totalProximos > 0
              ? 'bg-azul-light text-azul hover:bg-azul hover:text-white'
              : 'text-gris-dark hover:bg-gris'
          }
        `}
      >
        <span className="text-lg leading-none">🔔</span>
        {totalUrgente > 0 && (
          <span className="absolute -top-1 -right-1 bg-rojo text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
            {totalUrgente}
          </span>
        )}
        {totalUrgente === 0 && totalProximos > 0 && (
          <span className="absolute top-1.5 right-1.5 bg-azul w-2 h-2 rounded-full border border-white" />
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-card shadow-card border border-gris z-50 overflow-hidden">
          <div className="bg-azul text-white px-3 py-2 text-xs font-bold uppercase tracking-wide">
            Notificaciones
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {sinNotifs && (
              <div className="px-3 py-6 text-center text-xs text-gris-dark">
                No hay cumpleaños esta semana.
              </div>
            )}

            {totalUrgente > 0 && (
              <Section titulo="🎂 Cumplen hoy" tono="rojo">
                {hoy.map(item => (
                  <NotifRow key={item.trabajador.leg} item={item} hoy onClick={() => abrirPersonal(item.trabajador.leg)} />
                ))}
              </Section>
            )}

            {totalProximos > 0 && (
              <Section titulo="📅 Próximos 7 días" tono="azul">
                {proximos.map(item => (
                  <NotifRow key={item.trabajador.leg} item={item} onClick={() => abrirPersonal(item.trabajador.leg)} />
                ))}
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ titulo, tono, children }: { titulo: string; tono: 'rojo' | 'azul'; children: React.ReactNode }) {
  const cls = tono === 'rojo'
    ? 'bg-rojo-light text-rojo'
    : 'bg-gris/40 text-gris-dark'
  return (
    <>
      <div className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${cls}`}>
        {titulo}
      </div>
      <div className="divide-y divide-gris">{children}</div>
    </>
  )
}

function NotifRow({ item, hoy, onClick }: { item: CumpleanieroItem; hoy?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-gris/40 transition-colors"
    >
      <div className="font-bold text-sm text-azul">{item.trabajador.nom}</div>
      <div className="text-xs text-gris-dark mt-0.5 flex items-center gap-2">
        <span>{hoy ? '🎂 Hoy' : `📅 ${fmtDiasFaltan(item.diasFaltan)}`}</span>
        {item.edad != null && <span>· cumple {item.edad} años</span>}
      </div>
    </button>
  )
}
