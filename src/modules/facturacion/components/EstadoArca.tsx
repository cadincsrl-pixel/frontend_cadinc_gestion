'use client'

import type { VentasArcaEstado } from '@/types/domain.types'

/**
 * Banner FIJO de homologación: mientras el servidor apunte a homologación,
 * nada de lo que se emite tiene validez fiscal. Es sticky a propósito: si se
 * pierde al scrollear, alguien termina mandando un PDF de prueba a un cliente.
 */
export function BannerHomologacion() {
  return (
    <div className="sticky top-0 z-30 bg-amarillo-light text-[#7A5000] border-2 border-amarillo rounded-card px-3 py-2 text-sm font-bold shadow-card flex items-center gap-2">
      <span aria-hidden>⚠</span>
      <span>HOMOLOGACIÓN — las facturas no tienen validez fiscal. Son de prueba contra el ambiente de testeo de ARCA.</span>
    </div>
  )
}

/** Faltan 30 días o menos para que venza el certificado: se muestra en rojo. */
export const DIAS_AVISO_CERTIFICADO = 30

/**
 * Vencimiento del certificado de ARCA (20260929d). Sin dato (backend viejo o
 * certificado ilegible) no muestra nada; lejos del vencimiento, un texto gris.
 */
export function VencimientoCertificado({ estado, soloSiCerca = false }: {
  estado: Pick<VentasArcaEstado, 'certificado'> | undefined
  /** true = no mostrar nada mientras falten más de 30 días. */
  soloSiCerca?: boolean
}) {
  const c = estado?.certificado
  if (!c) return null
  const fecha = new Date(c.vence_el).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const cerca = c.vencido || c.dias_restantes <= DIAS_AVISO_CERTIFICADO
  if (soloSiCerca && !cerca) return null
  const txt = c.vencido ? `Certificado de ARCA vencido el ${fecha}`
    : cerca ? `Certificado de ARCA vence en ${c.dias_restantes} ${c.dias_restantes === 1 ? 'día' : 'días'} (${fecha})`
    : `Certificado vence el ${fecha}`
  return (
    <span className={`text-[11px] ${cerca ? 'px-2 py-1 rounded bg-rojo-light text-rojo font-bold' : 'text-gris-dark'}`}
      title={`Renovarlo en ARCA (Administración de certificados digitales) y cargar el nuevo en el servidor${c.sujeto_cn ? ` · ${c.sujeto_cn}` : ''}`}>
      {cerca && '⚠ '}{txt}
    </span>
  )
}

/** «PV 00004: A 12 · B 3 …» para el tooltip del indicador. */
function ultimosPorPv(estado: VentasArcaEstado): string {
  const u = estado.ultimo_por_pv
  if (!u) return ''
  return Object.entries(u).map(([pv, tipos]) =>
    `PV ${pv.padStart(5, '0')}: ` + Object.entries(tipos).map(([t, n]) => `${t}→${n}`).join(' · ')).join(' | ')
}

/**
 * El semáforo de ARCA: ¿se puede emitir ahora? Tres estados que se tienen
 * que distinguir de un vistazo: en línea, sin respuesta y sin configurar.
 */
export function IndicadorArca({ estado, cargando }: { estado: VentasArcaEstado | undefined; cargando: boolean }) {
  if (cargando && !estado) {
    return <span className="text-[11px] text-gris-dark">ARCA: consultando…</span>
  }
  if (!estado) {
    return <span className="text-[11px] text-gris-dark" title="No se pudo consultar el estado de ARCA">ARCA: sin datos</span>
  }
  const amb = estado.ambiente === 'prod' ? 'producción' : estado.ambiente === 'homo' ? 'homologación' : 'sin ambiente'
  if (!estado.configurado) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-gris text-gris-dark font-bold"
            title={estado.falta.length ? `Falta configurar: ${estado.falta.join(', ')}` : 'La conexión con ARCA no está configurada en el servidor'}>
        <span className="w-2 h-2 rounded-full bg-gris-mid" /> ARCA sin configurar
      </span>
    )
  }
  const ok = !!estado.dummy
    && estado.dummy.appServer === 'OK' && estado.dummy.dbServer === 'OK' && estado.dummy.authServer === 'OK'
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-verde-light text-verde font-bold"
            title={`Servidores de ARCA respondiendo · punto de venta ${String(estado.pto_vta).padStart(5, '0')}${ultimosPorPv(estado) ? ` · último autorizado por tipo: ${ultimosPorPv(estado)}` : ''}`}>
        <span className="w-2 h-2 rounded-full bg-verde" /> ARCA en línea · {amb} · PV {String(estado.pto_vta).padStart(5, '0')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-rojo-light text-rojo font-bold"
          title={estado.error ?? (estado.dummy ? `app ${estado.dummy.appServer} · db ${estado.dummy.dbServer} · auth ${estado.dummy.authServer}` : 'ARCA no responde')}>
      <span className="w-2 h-2 rounded-full bg-rojo" /> ARCA no responde · {amb}
    </span>
  )
}
