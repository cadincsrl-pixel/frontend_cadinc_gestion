'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  useNotificaciones,
  fmtDiasFaltan,
  fmtDiasVencimiento,
  fmtDocTipo,
  type CumpleanieroItem,
  type DocVencimientoItem,
  type DocChoferVencimientoItem,
  type ServiceCamionItem,
  type GastoPendienteItem,
} from '@/hooks/useNotificaciones'

// Mapea la ruta actual al módulo cuyos avisos queremos mostrar.
// `null` = no hay módulo específico → mostrar todo (home, admin, login).
// Las rutas de tarja están dispersas (sidebar de tarja incluye /dashboard,
// /horas-trabajador, /configuracion, etc.); las listamos todas explícitamente.
function moduloFromPath(pathname: string | null): 'tarja' | 'logistica' | null {
  if (!pathname) return null
  if (pathname.startsWith('/tarja') ||
      pathname.startsWith('/personal') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/horas-trabajador') ||
      pathname.startsWith('/configuracion')) return 'tarja'
  if (pathname.startsWith('/logistica')) return 'logistica'
  return null
}

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
  const pathname = usePathname()
  const modulo = moduloFromPath(pathname)
  const notifs = useNotificaciones()

  // Aplico filtro por módulo: tarja sólo cumpleaños, logística sólo papeles/services/gastos.
  // Si no hay módulo identificado (home, admin), mostramos todo.
  const showCumple   = modulo === null || modulo === 'tarja'
  const showLogistica = modulo === null || modulo === 'logistica'

  const hoy                    = showCumple    ? notifs.hoy                    : []
  const proximos               = showCumple    ? notifs.proximos               : []
  const papelesVencidos        = showLogistica ? notifs.papelesVencidos        : []
  const papelesPorVencer       = showLogistica ? notifs.papelesPorVencer       : []
  const papelesChoferVencidos  = showLogistica ? notifs.papelesChoferVencidos  : []
  const papelesChoferPorVencer = showLogistica ? notifs.papelesChoferPorVencer : []
  const serviciosVencidos      = showLogistica ? notifs.serviciosVencidos      : []
  const serviciosProximos      = showLogistica ? notifs.serviciosProximos      : []
  const gastosPendientes       = showLogistica ? notifs.gastosPendientes       : []

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

  const totalUrgente =
    hoy.length + papelesVencidos.length + papelesChoferVencidos.length +
    serviciosVencidos.length + gastosPendientes.length
  const totalNoUrgentes =
    proximos.length + papelesPorVencer.length + papelesChoferPorVencer.length +
    serviciosProximos.length
  const sinNotifs = totalUrgente === 0 && totalNoUrgentes === 0

  function abrirPersonal(leg: string) {
    setAbierto(false)
    router.push(`/personal?leg=${encodeURIComponent(leg)}`)
  }

  // Llevar al tab "Camiones y bateas" del módulo logística. Los sub-tabs
  // de camion/batea son state interno del componente, así que no podemos
  // hacer deep-link directo al modal del vehículo. El user encuentra el
  // vehículo por la patente que mostramos en la notif.
  function abrirVehiculo(_entidad: 'camion' | 'batea', _id: number) {
    setAbierto(false)
    router.push('/logistica?tab=camiones')
  }

  function abrirChofer(_id: number) {
    setAbierto(false)
    // El tab Choferes no tiene deep-link al modal de un chofer específico.
    // Llevamos al tab; el usuario encuentra el chofer por nombre.
    router.push('/logistica?tab=choferes')
  }

  function abrirCamionService(_camionId: number) {
    setAbierto(false)
    // Igual que con vehículos: no hay deep-link al modal del camión.
    router.push('/logistica?tab=camiones')
  }

  function abrirGastoPendiente(_id: number) {
    setAbierto(false)
    // El tab Gastos arranca en "Lista". El user filtra por estado=pendiente
    // desde el filtro del tab. No hay deep-link al gasto puntual hoy.
    router.push('/logistica?tab=gastos&estado=pendiente')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto(p => !p)}
        title={sinNotifs ? 'Sin notificaciones' : `${totalUrgente + totalNoUrgentes} notificación${totalUrgente + totalNoUrgentes !== 1 ? 'es' : ''}`}
        className={`
          relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors
          ${totalUrgente > 0
            ? 'bg-rojo-light text-rojo hover:bg-rojo hover:text-white'
            : totalNoUrgentes > 0
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
        {totalUrgente === 0 && totalNoUrgentes > 0 && (
          <span className="absolute top-1.5 right-1.5 bg-azul w-2 h-2 rounded-full border border-white" />
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-card shadow-card border border-gris z-50 overflow-hidden">
          <div className="bg-azul text-white px-3 py-2 text-xs font-bold uppercase tracking-wide">
            Notificaciones
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {sinNotifs && (
              <div className="px-3 py-6 text-center text-xs text-gris-dark">
                Sin notificaciones pendientes.
              </div>
            )}

            {/* Papeles de vehículos vencidos */}
            {papelesVencidos.length > 0 && (
              <Section titulo="🛻 Papeles de vehículos vencidos" tono="rojo">
                {papelesVencidos.map(d => (
                  <DocRow key={`${d.entidad}-${d.doc_id}`} doc={d} onClick={() => abrirVehiculo(d.entidad, d.entidad_id)} />
                ))}
              </Section>
            )}

            {/* Papeles de choferes vencidos */}
            {papelesChoferVencidos.length > 0 && (
              <Section titulo="👷 Papeles de choferes vencidos" tono="rojo">
                {papelesChoferVencidos.map(d => (
                  <DocChoferRow key={d.doc_id} doc={d} onClick={() => abrirChofer(d.chofer_id)} />
                ))}
              </Section>
            )}

            {/* Services de camiones vencidos */}
            {serviciosVencidos.length > 0 && (
              <Section titulo="🔧 Services vencidos" tono="rojo">
                {serviciosVencidos.map(s => (
                  <ServiceRow
                    key={s.camion_id}
                    item={s}
                    onClick={() => abrirCamionService(s.camion_id)}
                  />
                ))}
              </Section>
            )}

            {/* Gastos pendientes de aprobación */}
            {gastosPendientes.length > 0 && (
              <Section titulo={`💸 Gastos pendientes de aprobar (${gastosPendientes.length})`} tono="rojo">
                {gastosPendientes.slice(0, 8).map(g => (
                  <GastoPendienteRow key={g.id} item={g} onClick={() => abrirGastoPendiente(g.id)} />
                ))}
                {gastosPendientes.length > 8 && (
                  <button
                    onClick={() => abrirGastoPendiente(0)}
                    className="w-full text-center px-3 py-2 text-[11px] text-azul hover:underline"
                  >
                    Ver los {gastosPendientes.length - 8} restantes →
                  </button>
                )}
              </Section>
            )}

            {/* Cumpleaños hoy */}
            {hoy.length > 0 && (
              <Section titulo="🎂 Cumplen hoy" tono="rojo">
                {hoy.map(item => (
                  <NotifRow key={item.trabajador.leg} item={item} hoy onClick={() => abrirPersonal(item.trabajador.leg)} />
                ))}
              </Section>
            )}

            {/* Papeles de vehículos por vencer */}
            {papelesPorVencer.length > 0 && (
              <Section titulo="🛻 Papeles de vehículos por vencer (30 días)" tono="amarillo">
                {papelesPorVencer.map(d => (
                  <DocRow key={`${d.entidad}-${d.doc_id}`} doc={d} onClick={() => abrirVehiculo(d.entidad, d.entidad_id)} />
                ))}
              </Section>
            )}

            {/* Papeles de choferes por vencer */}
            {papelesChoferPorVencer.length > 0 && (
              <Section titulo="👷 Papeles de choferes por vencer (30 días)" tono="amarillo">
                {papelesChoferPorVencer.map(d => (
                  <DocChoferRow key={d.doc_id} doc={d} onClick={() => abrirChofer(d.chofer_id)} />
                ))}
              </Section>
            )}

            {/* Services de camiones próximos */}
            {serviciosProximos.length > 0 && (
              <Section titulo="🔧 Services próximos" tono="amarillo">
                {serviciosProximos.map(s => (
                  <ServiceRow
                    key={s.camion_id}
                    item={s}
                    onClick={() => abrirCamionService(s.camion_id)}
                  />
                ))}
              </Section>
            )}

            {/* Cumpleaños próximos */}
            {proximos.length > 0 && (
              <Section titulo="📅 Cumpleaños próximos" tono="azul">
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

function Section({ titulo, tono, children }: { titulo: string; tono: 'rojo' | 'azul' | 'amarillo'; children: React.ReactNode }) {
  const cls =
    tono === 'rojo'     ? 'bg-rojo-light text-rojo' :
    tono === 'amarillo' ? 'bg-amarillo-light text-[#7A5500]' :
                          'bg-gris/40 text-gris-dark'
  return (
    <>
      <div className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${cls}`}>
        {titulo}
      </div>
      <div className="divide-y divide-gris">{children}</div>
    </>
  )
}

function DocRow({ doc, onClick }: { doc: DocVencimientoItem; onClick: () => void }) {
  const vencido = doc.diasParaVencer < 0
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-gris/40 transition-colors"
    >
      <div className="font-bold text-sm text-azul">
        {doc.entidad === 'batea' ? '🛻' : '🚚'} {doc.entidad_patente}
        <span className="ml-2 text-xs font-semibold text-gris-dark">{fmtDocTipo(doc.tipo)}</span>
      </div>
      <div className={`text-xs mt-0.5 ${vencido ? 'text-rojo font-bold' : 'text-gris-dark'}`}>
        {fmtDiasVencimiento(doc.diasParaVencer)} · {doc.vence_el.split('-').reverse().join('/')}
      </div>
    </button>
  )
}

function DocChoferRow({ doc, onClick }: { doc: DocChoferVencimientoItem; onClick: () => void }) {
  const vencido = doc.diasParaVencer < 0
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-gris/40 transition-colors"
    >
      <div className="font-bold text-sm text-azul">
        👷 {doc.chofer_nombre}
        <span className="ml-2 text-xs font-semibold text-gris-dark">{fmtDocTipo(doc.tipo)}</span>
      </div>
      <div className={`text-xs mt-0.5 ${vencido ? 'text-rojo font-bold' : 'text-gris-dark'}`}>
        {fmtDiasVencimiento(doc.diasParaVencer)} · {doc.vence_el.split('-').reverse().join('/')}
      </div>
    </button>
  )
}

function ServiceRow({ item, onClick }: { item: ServiceCamionItem; onClick: () => void }) {
  const vencido = item.estado === 'vencido'
  const km = item.km_restantes
  const detalle = vencido
    ? `Service vencido hace ${Math.round(Math.abs(km)).toLocaleString('es-AR')} km`
    : `Service en ${Math.round(km).toLocaleString('es-AR')} km`
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-gris/40 transition-colors"
    >
      <div className="font-bold text-sm text-azul">
        🚚 {item.patente}
        <span className={`ml-2 text-xs font-semibold ${vencido ? 'text-rojo' : 'text-gris-dark'}`}>
          {detalle}
        </span>
      </div>
      <div className="text-[11px] text-gris-dark mt-0.5">
        Km actuales: {Math.round(item.km_actuales).toLocaleString('es-AR')} · próx. {Math.round(item.km_proximo_service).toLocaleString('es-AR')}
      </div>
    </button>
  )
}

function GastoPendienteRow({ item, onClick }: { item: GastoPendienteItem; onClick: () => void }) {
  const fechaFmt = item.fecha.split('-').reverse().join('/')
  const lugar = item.patente
    ? `🚚 ${item.patente}`
    : item.chofer_nombre
      ? `👷 ${item.chofer_nombre}`
      : null
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-gris/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-sm text-azul truncate">
          {item.categoria_nombre ?? 'Gasto'}
          {item.proveedor && <span className="ml-1 text-xs font-semibold text-gris-dark">· {item.proveedor}</span>}
        </div>
        <div className="font-mono font-bold text-sm text-rojo shrink-0">
          $ {item.monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="text-xs text-gris-dark mt-0.5 flex items-center gap-2 flex-wrap">
        <span>{fechaFmt}</span>
        {lugar && <span>· {lugar}</span>}
        {item.descripcion && (
          <span className="text-gris-mid italic truncate">· {item.descripcion}</span>
        )}
      </div>
    </button>
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
