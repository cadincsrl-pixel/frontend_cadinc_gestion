'use client'

import { useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { AvisoExport, ExportBanco, ExportLsd, ExportLsdConceptos } from '@/types/sueldos.types'
import {
  traerExportBanco, traerExportLsd, traerExportLsdConceptos, traerResumen, useConvenios, useLiquidacion, useLiquidaciones,
} from '../../hooks/useSueldos'
import { descargarTexto, fmtM, fmtPeriodoLiq } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { descargarResumenExcel } from '../../utils/resumenExcel'
import { Aviso, Cargando, ErrorCarga, EstadoLiq, Tarjeta, Vacio } from '../Comun'

/** Avisos de las exportaciones, en castellano. */
function mensajeAvisoExport(a: AvisoExport): string {
  const d = a.detalle ?? {}
  const quien = a.nombre ? `${a.nombre}: ` : ''
  const lista = (k: string) => Array.isArray(d[k]) ? (d[k] as unknown[]).map(String).join(', ') : ''
  const msj = typeof d.mensaje === 'string' ? d.mensaje : ''
  switch (a.codigo) {
    case 'SIN_CUIL':                   return `${quien}sin CUIL en la ficha (queda afuera del archivo).`
    case 'SIN_CBU':                    return `${quien}sin CBU en la ficha.`
    case 'CBU_INVALIDA':               return `${quien}el CBU de la ficha no es válido.`
    case 'NETO_CERO':                  return `${quien}neto en cero: no va en el archivo del banco.`
    case 'SIN_CODIGO_ARCA':            return `Conceptos sin código ARCA: ${lista('conceptos') || '—'}. Cargalos en Convenios.`
    case 'SIN_OBRA_SOCIAL':            return `${quien}sin código de obra social en la ficha.`
    case 'LIQUIDACION_NO_CERRADA':     return 'La liquidación no está cerrada: el archivo puede cambiar.'
    case 'CODIGOS_F931_POR_DEFECTO':   return `Sin códigos del F.931 en su convenio ni en su ficha (van los por defecto): ${lista('empleados') || '—'}. Cargalos en Convenios o en la ficha.`
    case 'SIN_LOCALIDAD_F931':         return 'Falta el parámetro f931_localidad (Configuración): la localidad va en 00.'
    case 'BASES_SIN_TOPE':             return msj || 'Las bases imponibles van sin tope: revisalas con el contador.'
    case 'SIN_FECHA_PAGO':             return 'La liquidación no tiene fecha de pago.'
    case 'CANTIDAD_REQUERIDA':         return msj || `Conceptos que en el LSD necesitan cantidad: ${lista('conceptos')}.`
    case 'SAC_FUERA_DE_JUNIO_DICIEMBRE': return msj || `SAC fuera de junio o diciembre: ${lista('conceptos')}.`
    default:                           return `${quien}${msj || a.codigo}`
  }
}

function ListaAvisosExport({ avisos }: { avisos: AvisoExport[] }) {
  if (avisos.length === 0) return <Aviso tono="verde">Sin avisos.</Aviso>
  return (
    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
      {avisos.map((a, i) => <Aviso key={i} tono={a.codigo === 'SIN_CUIL' || a.codigo === 'CBU_INVALIDA' ? 'rojo' : 'amarillo'}>{mensajeAvisoExport(a)}</Aviso>)}
    </div>
  )
}

function Bloque({ titulo, descripcion, children }: { titulo: string; descripcion: ReactNode; children: ReactNode }) {
  return (
    <Tarjeta className="p-3 flex flex-col gap-2">
      <h3 className="font-display text-lg text-azul tracking-wider">{titulo}</h3>
      <div className="text-xs text-gris-dark">{descripcion}</div>
      {children}
    </Tarjeta>
  )
}

/**
 * Exportaciones de una liquidación: archivo del banco (CSV con CUIL, nombre,
 * CBU e importe), Excel para el contador (F.931) y el TXT del Libro de
 * Sueldos Digital de ARCA. Aparte, el archivo de conceptos del LSD, que se
 * sube UNA vez antes de la primera liquidación. `?liq=ID` preselecciona.
 */
export function ExportarTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const { verPii } = usePermisos('sueldos')
  const { data: convenios = [] } = useConvenios()
  const [convenioId, setConvenioId] = useState<number | null>(null)
  const liqs = useLiquidaciones({ convenio_id: convenioId }, 1, 100)
  const liqId = Number(searchParams.get('liq')) || null
  const liq = useLiquidacion(liqId)

  const [decimal, setDecimal] = useState<'coma' | 'punto'>('coma')
  const [cargando, setCargando] = useState<'banco' | 'resumen' | 'lsd' | 'conceptos' | null>(null)
  const [banco, setBanco] = useState<ExportBanco | null>(null)
  const [lsd, setLsd] = useState<ExportLsd | null>(null)
  const [lsdConceptos, setLsdConceptos] = useState<ExportLsdConceptos | null>(null)
  const [avisosResumen, setAvisosResumen] = useState<AvisoExport[] | null>(null)

  function elegirLiq(v: string) {
    setBanco(null); setLsd(null); setAvisosResumen(null)
    router.replace(v ? `/sueldos?tab=exportar&liq=${v}` : '/sueldos?tab=exportar')
  }

  const sinPii = verPii ? null : 'Hace falta el permiso «Ver datos personales» (el archivo lleva CUIL y CBU)'
  const noCerrada = liq.data && liq.data.estado !== 'cerrada' ? 'Cerrá la liquidación primero: el archivo del banco sale solo de liquidaciones cerradas' : null
  const motivoBanco = sinPii ?? noCerrada

  async function bajarBanco() {
    if (!liqId) return
    setCargando('banco')
    try {
      const r = await traerExportBanco(liqId, decimal)
      setBanco(r)
      descargarTexto(r.csv, r.archivo, { mime: 'text/csv;charset=utf-8', bom: true })
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    } finally {
      setCargando(null)
    }
  }

  async function bajarResumen() {
    if (!liqId) return
    setCargando('resumen')
    try {
      const r = await traerResumen(liqId)
      setAvisosResumen(r.avisos)
      await descargarResumenExcel(r)
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    } finally {
      setCargando(null)
    }
  }

  async function bajarLsd() {
    if (!liqId) return
    setCargando('lsd')
    try {
      const r = await traerExportLsd(liqId)
      setLsd(r)
      descargarTexto(r.contenido, r.archivo, { mime: 'text/plain;charset=windows-1252', latin1: true })
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    } finally {
      setCargando(null)
    }
  }

  async function bajarConceptos() {
    setCargando('conceptos')
    try {
      const r = await traerExportLsdConceptos()
      setLsdConceptos(r)
      descargarTexto(r.contenido, r.archivo, { mime: 'text/plain;charset=windows-1252', latin1: true })
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    } finally {
      setCargando(null)
    }
  }

  return (
    <>
      <Bloque titulo="Conceptos para el LSD (una vez)"
        descripcion="Archivo de carga masiva de conceptos: da de alta en el Libro de Sueldos Digital de ARCA los códigos de CADINC asociados a cada concepto ARCA. Se sube una sola vez (y de nuevo si se agregan conceptos), antes del primer archivo de liquidación.">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" loading={cargando === 'conceptos'} onClick={bajarConceptos}>⬇ Conceptos para el LSD</Button>
          {lsdConceptos && <span className="text-xs text-gris-dark">{lsdConceptos.conceptos} conceptos en {lsdConceptos.archivo}</span>}
        </div>
        {lsdConceptos && lsdConceptos.avisos.length > 0 && <ListaAvisosExport avisos={lsdConceptos.avisos} />}
      </Bloque>

      <Tarjeta className="p-3 sm:p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <Select label="Convenio" value={convenioId ?? ''} placeholder="Todos"
            onChange={e => setConvenioId(e.target.value ? Number(e.target.value) : null)}
            options={convenios.map(c => ({ value: c.id, label: c.nombre }))} />
          <div className="md:col-span-2">
            <Select label="Liquidación" value={liqId ?? ''} placeholder={liqs.isLoading ? 'Cargando…' : 'Elegí la liquidación'}
              onChange={e => elegirLiq(e.target.value)}
              options={(liqs.data?.items ?? []).filter(x => x.estado !== 'anulada').map(x => ({
                value: x.id,
                label: `${x.codigo} · ${x.convenio.nombre} · ${fmtPeriodoLiq(x)} · neto ${fmtM(x.totales.neto)}${x.estado !== 'cerrada' ? ` (${x.estado})` : ''}`,
              }))} />
          </div>
        </div>
      </Tarjeta>

      {!liqId ? <Vacio>Elegí una liquidación para exportarla.</Vacio>
        : liq.isLoading ? <Cargando />
        : liq.isError || !liq.data ? <ErrorCarga mensaje={mensajeErrorSueldos(liq.error)} onReintentar={() => liq.refetch()} />
        : (
          <>
            <Tarjeta className="p-3 flex flex-wrap items-center gap-2 text-sm">
              <b className="text-azul">{liq.data.codigo}</b> <EstadoLiq estado={liq.data.estado} />
              <span className="text-gris-dark">{liq.data.convenio.nombre} · {fmtPeriodoLiq(liq.data)} · {liq.data.totales.recibos} recibos · neto {fmtM(liq.data.totales.neto)}</span>
            </Tarjeta>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Bloque titulo="🏦 Banco" descripcion="CSV para la acreditación de sueldos: CUIL; apellido y nombre; CBU; importe neto. Los netos en cero no van.">
                <div className="flex items-end gap-2">
                  <Select label="Decimales" value={decimal} onChange={e => setDecimal(e.target.value as 'coma' | 'punto')}
                    options={[{ value: 'coma', label: 'Con coma (1234,56)' }, { value: 'punto', label: 'Con punto (1234.56)' }]} />
                  <Button size="sm" disabled={!!motivoBanco} title={motivoBanco ?? 'Descargar el CSV'} loading={cargando === 'banco'} onClick={bajarBanco}>⬇ CSV</Button>
                </div>
                {banco && (
                  <>
                    <div className="text-xs">{banco.filas.length} transferencias por {fmtM(banco.total)} · {banco.archivo}</div>
                    <ListaAvisosExport avisos={banco.avisos} />
                  </>
                )}
              </Bloque>

              <Bloque titulo="📊 Resumen para el contador" descripcion="Excel con los totales por empleado, el detalle de cada recibo con su código ARCA, los totales por concepto para el F.931 y lo que queda a pagar por destino.">
                <div>
                  <Button size="sm" loading={cargando === 'resumen'} onClick={bajarResumen}>⬇ Excel</Button>
                </div>
                {!verPii && <p className="text-[11px] text-gris-dark">Sin «Ver datos personales» el CUIL sale enmascarado.</p>}
                {avisosResumen && <ListaAvisosExport avisos={avisosResumen} />}
              </Bloque>

              <Bloque titulo="📘 Libro de Sueldos Digital (ARCA)"
                descripcion={<>TXT para importar en el LSD de ARCA (registros 01 a 04). <b>Los códigos del F.931 y las bases sin tope se revisan con el contador</b> antes de presentarlo. Subí antes, una vez, el archivo de conceptos de arriba.</>}>
                <div>
                  <Button size="sm" disabled={!!sinPii} title={sinPii ?? 'Descargar el TXT del LSD'} loading={cargando === 'lsd'} onClick={bajarLsd}>⬇ TXT del LSD</Button>
                </div>
                {liq.data.estado !== 'cerrada' && <p className="text-[11px] text-naranja-dark">La liquidación no está cerrada: el archivo puede cambiar.</p>}
                {lsd && (
                  <>
                    <div className="text-xs">
                      {lsd.archivo} · registros 01: {lsd.registros['01']} · 02: {lsd.registros['02']} · 03: {lsd.registros['03']} · 04: {lsd.registros['04']}
                    </div>
                    <ListaAvisosExport avisos={lsd.avisos} />
                  </>
                )}
              </Bloque>
            </div>
          </>
        )}
    </>
  )
}
