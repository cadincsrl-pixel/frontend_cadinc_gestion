'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbAmortizacionCorrida } from '@/types/contabilidad.types'
import { useAnularCorrida, useBienes, useConfigCtb, useCorridasAmortizacion, useEjercicios, useObrasCtb } from '../hooks/useContabilidad'
import { fmtFecha, fmtFechaHora, fmtM, hoyAR, numeroAsiento } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, Cargando, Cifra, ErrorCarga, Tarjeta, Th, Vacio, inputCls } from './Comun'
import { CuadroAmortizaciones } from './CuadroAmortizaciones'
import { ModalAmortizar } from './ModalAmortizar'
import { ModalBienUso } from './ModalBienUso'
import { ModalImportarBienes } from './ModalImportarBienes'
import { useVisorAsiento } from './VisorAsiento'

type Vista = 'inventario' | 'cuadro' | 'corridas'

const VISTAS: { key: Vista; label: string }[] = [
  { key: 'inventario', label: 'Inventario' },
  { key: 'cuadro',     label: 'Cuadro de amortizaciones' },
  { key: 'corridas',   label: 'Corridas' },
]

function esVista(v: string | null): v is Vista {
  return v === 'inventario' || v === 'cuadro' || v === 'corridas'
}

/**
 * Bienes de uso (tanda 5, 20260928p/q): el inventario (ABM e importación del
 * Excel del contador), el cuadro de amortizaciones con el control contra el
 * mayor, y las corridas de amortización (una por mes o por ejercicio, cada
 * una con su asiento). La sub-vista vive en la URL (`?vista=`).
 */
export function BienesTab() {
  const router = useRouter()
  const sp = useSearchParams()
  const vistaUrl = sp.get('vista')
  const vista: Vista = esVista(vistaUrl) ? vistaUrl : 'inventario'
  const { puedeCrear, puedeEditar, bienesUso } = usePermisos('contabilidad')
  const visor = useVisorAsiento()
  // undefined = cerrado; null = nuevo; número = ese bien.
  const [bienAbierto, setBienAbierto] = useState<number | null | undefined>(undefined)
  const [importando, setImportando] = useState(false)
  const [amortizando, setAmortizando] = useState(false)

  function setVista(v: Vista) {
    const p = new URLSearchParams(sp.toString())
    p.set('vista', v)
    router.replace(`/contabilidad?${p.toString()}`)
  }

  const sinFlag = !bienesUso ? 'No tenés permiso (hace falta «Bienes de uso»)' : null
  const bloqueoCrear = sinFlag ?? (!puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null)
  const bloqueoAmortizar = sinFlag ?? (!puedeEditar ? 'No tenés permiso de Editar en Contabilidad (amortizar lo pide)' : null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Bienes de uso">
          {VISTAS.map(v => (
            <button key={v.key} type="button" role="tab" aria-selected={vista === v.key} onClick={() => setVista(v.key)}
              className={`text-sm px-3 py-1.5 rounded-full border ${vista === v.key ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => setImportando(true)} disabled={!!bloqueoCrear}
            title={bloqueoCrear ?? 'Importar el inventario desde Excel o CSV'}>
            📥 Importar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAmortizando(true)} disabled={!!bloqueoAmortizar}
            title={bloqueoAmortizar ?? 'Generar los asientos de amortización hasta una fecha'}>
            ⚙️ Amortizar
          </Button>
          <Button size="sm" onClick={() => setBienAbierto(null)} disabled={!!bloqueoCrear} title={bloqueoCrear ?? 'Dar de alta un bien de uso'}>
            + Nuevo bien
          </Button>
        </div>
      </div>

      {vista === 'inventario' && <Inventario onAbrir={id => setBienAbierto(id)} />}
      {vista === 'cuadro' && <CuadroAmortizaciones onAbrirBien={id => setBienAbierto(id)} />}
      {vista === 'corridas' && <Corridas onVerAsiento={visor.abrir} onAmortizar={() => setAmortizando(true)} bloqueoAmortizar={bloqueoAmortizar} />}

      {bienAbierto !== undefined && (
        <ModalBienUso key={bienAbierto ?? 'nuevo'} id={bienAbierto} onClose={() => setBienAbierto(undefined)}
          onCreado={id => setBienAbierto(id)}
          onVerAsiento={id => { setBienAbierto(undefined); visor.abrir(id) }} />
      )}
      {importando && <ModalImportarBienes onClose={() => setImportando(false)} />}
      {amortizando && (
        <ModalAmortizar onClose={() => setAmortizando(false)} onVerAsiento={id => { setAmortizando(false); visor.abrir(id) }} />
      )}
      {visor.modales}
    </div>
  )
}

// ── Inventario ──────────────────────────────────────────────────────────

function Inventario({ onAbrir }: { onAbrir: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [bajas, setBajas] = useState(false)
  const [rubro, setRubro] = useState('')
  const [obra, setObra] = useState('')
  const lista = useBienes({ incluirBajas: bajas, q, obra_cod: obra || null })
  const obras = useObrasCtb()
  const config = useConfigCtb()

  const todos = useMemo(() => lista.data ?? [], [lista.data])
  const rubros = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of todos) m.set(b.rubro_codigo, b.rubro_nombre)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [todos])
  const items = useMemo(() => todos.filter(b => !rubro || b.rubro_codigo === rubro), [todos, rubro])
  const tot = useMemo(() => ({
    vo: items.reduce((a, b) => a + Number(b.valor_origen || 0), 0),
    acum: items.reduce((a, b) => a + Number(b.amort_acum_hoy || 0), 0),
    neto: items.reduce((a, b) => a + Number(b.valor_neto_hoy || 0), 0),
  }), [items])

  const opcionesObra = useMemo<ComboboxOption[]>(() => [
    { value: '', label: 'Todas las obras' },
    ...(obras.data ?? []).map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, search: [o.cod, o.nom] })),
  ], [obras.data])
  const hayFiltros = !!(q.trim() || rubro || obra)

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_220px_240px_auto] gap-2 items-end">
        <Campo label="Buscar">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Descripción, código BU-, patente o n° de serie…" className={inputCls} />
        </Campo>
        <Campo label="Rubro">
          <select value={rubro} onChange={e => setRubro(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {rubros.map(([cod, nom]) => <option key={cod} value={cod}>{cod} {nom}</option>)}
          </select>
        </Campo>
        <Campo label="Obra">
          <Combobox options={opcionesObra} value={obra} onChange={setObra} placeholder={obras.isLoading ? 'Cargando obras…' : 'Todas las obras'} />
        </Campo>
        <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none pb-2">
          <input type="checkbox" className="accent-naranja" checked={bajas} onChange={e => setBajas(e.target.checked)} />
          Incluir dados de baja
        </label>
      </Tarjeta>

      {todos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Cifra label="Bienes" valor={String(items.length)} />
          <Cifra label="Valor de origen" valor={fmtM(tot.vo)} />
          <Cifra label="Amort. acumulada hoy" valor={fmtM(tot.acum)} />
          <Cifra label="Valor neto hoy" valor={fmtM(tot.neto)} tono="verde" />
        </div>
      )}

      {lista.isLoading ? <Cargando />
        : lista.isError ? <ErrorCarga mensaje={mensajeErrorCtb(lista.error)} onReintentar={() => void lista.refetch()} />
        : items.length === 0 ? (
          <Vacio>
            {hayFiltros || bajas ? 'No hay bienes con estos filtros.'
              : <>Todavía no hay bienes de uso. Importá el inventario del contador (al {fmtFecha(config.data?.bu_corte_inicial ?? '2026-06-30')}) con «Importar», o cargalos de a uno con «+ Nuevo bien».</>}
          </Vacio>
        ) : (
          <Tarjeta className={`overflow-hidden ${lista.isFetching ? 'opacity-70' : ''}`}>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse min-w-[1000px]">
                <thead>
                  <tr>
                    <Th>Código</Th><Th>Bien</Th><Th>Rubro</Th><Th>Alta</Th><Th derecha>Vida útil</Th>
                    <Th derecha>Valor de origen</Th><Th derecha>Acumulada hoy</Th><Th derecha>Neto hoy</Th><Th>Obra</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(b => (
                    <tr key={b.id} onClick={() => onAbrir(b.id)} className={`border-t border-gris cursor-pointer hover:bg-blanco ${b.fecha_baja ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{b.codigo}</td>
                      <td className="px-3 py-2 text-sm max-w-[320px]">
                        <span className="block truncate" title={b.descripcion}>{b.descripcion}</span>
                        {(b.identificador || b.fecha_baja) && (
                          <span className="text-[11px] text-gris-dark">
                            {b.identificador}
                            {b.fecha_baja && <span className="ml-1 text-[10px] px-1 rounded bg-gris font-bold uppercase">baja {fmtFecha(b.fecha_baja)}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gris-dark max-w-[180px] truncate" title={`${b.rubro_codigo} ${b.rubro_nombre}`}>{b.rubro_nombre}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtFecha(b.fecha_alta)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums">{b.vida_util_anios != null ? `${Number(b.vida_util_anios).toLocaleString('es-AR')} años` : <span className="text-gris-dark">no se amortiza</span>}</td>
                      <td className="px-3 py-2 text-xs text-right font-mono tabular-nums whitespace-nowrap">{fmtM(b.valor_origen)}</td>
                      <td className="px-3 py-2 text-xs text-right font-mono tabular-nums whitespace-nowrap">{fmtM(b.amort_acum_hoy)}</td>
                      <td className="px-3 py-2 text-xs text-right font-mono tabular-nums whitespace-nowrap font-bold">{fmtM(b.valor_neto_hoy)}</td>
                      <td className="px-3 py-2 text-xs text-gris-dark" title={b.obra_nom ?? undefined}>{b.obra_cod ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-gris">
              {items.map(b => (
                <button key={b.id} type="button" onClick={() => onAbrir(b.id)} className={`w-full text-left p-3 flex flex-col gap-0.5 ${b.fecha_baja ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between gap-2">
                    <span className="text-sm truncate">{b.descripcion}</span>
                    <span className="font-mono tabular-nums text-sm font-bold">{fmtM(b.valor_neto_hoy)}</span>
                  </div>
                  <span className="text-[11px] text-gris-dark">{b.codigo} · {b.rubro_nombre} · alta {fmtFecha(b.fecha_alta)} · VO {fmtM(b.valor_origen)}</span>
                </button>
              ))}
            </div>
          </Tarjeta>
        )}
    </div>
  )
}

// ── Corridas de amortización ────────────────────────────────────────────

const anularSchema = z.object({
  motivo: z.string()
    .refine(v => v.trim().length >= 3, 'Escribí el motivo (al menos 3 caracteres)')
    .refine(v => v.length <= 500, 'Hasta 500 caracteres'),
})
type AnularForm = z.infer<typeof anularSchema>

function Corridas({ onVerAsiento, onAmortizar, bloqueoAmortizar }: {
  onVerAsiento:     (id: number) => void
  onAmortizar:      () => void
  bloqueoAmortizar: string | null
}) {
  const { puedeEditar, bienesUso } = usePermisos('contabilidad')
  const ejercicios = useEjercicios()
  const [elegido, setElegido] = useState<number | null>(null)
  const ejercicioId = useMemo(() => {
    if (elegido) return elegido
    const lista = ejercicios.data ?? []
    const hoy = hoyAR()
    return (lista.find(e => e.desde <= hoy && hoy <= e.hasta) ?? lista[0])?.id ?? null
  }, [elegido, ejercicios.data])
  const q = useCorridasAmortizacion(ejercicioId)
  const [aAnular, setAAnular] = useState<CtbAmortizacionCorrida | null>(null)

  const bloqueoAnularBase = !bienesUso ? 'No tenés permiso (hace falta «Bienes de uso»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null
  const items = [...(q.data ?? [])].sort((a, b) => b.hasta.localeCompare(a.hasta) || b.id - a.id)
  const totalVigente = items.filter(c => c.estado === 'vigente').reduce((a, c) => a + Number(c.total || 0), 0)

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 flex flex-wrap gap-2 items-end">
        <Campo label="Ejercicio" className="min-w-[200px]">
          <select value={ejercicioId ?? ''} onChange={e => setElegido(Number(e.target.value) || null)} className={inputCls}
            disabled={ejercicios.isLoading || (ejercicios.data ?? []).length === 0}>
            {(ejercicios.data ?? []).map(e => (
              <option key={e.id} value={e.id}>{e.nombre} ({fmtFecha(e.desde)} – {fmtFecha(e.hasta)})</option>
            ))}
          </select>
        </Campo>
        <p className="text-xs text-gris-dark flex-1 min-w-[240px]">
          Cada corrida es el asiento de amortizaciones de un mes (o del ejercicio). Volver a amortizar regenera las de meses abiertos;
          anular una corrida anula su asiento, y el próximo «Amortizar» la vuelve a calcular.
        </p>
        <Cifra label="Amortizado en el ejercicio" valor={fmtM(totalVigente)} />
        <Button size="sm" onClick={onAmortizar} disabled={!!bloqueoAmortizar} title={bloqueoAmortizar ?? 'Generar amortizaciones hasta una fecha'}>
          ⚙️ Amortizar
        </Button>
      </Tarjeta>

      {q.isLoading || ejercicios.isLoading ? <Cargando />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
        : items.length === 0 ? <Vacio>No hay amortizaciones generadas en este ejercicio.</Vacio>
        : (
          <Tarjeta className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr><Th>Período</Th><Th>Frecuencia</Th><Th>Estado</Th><Th derecha>Bienes</Th><Th derecha>Total</Th><Th>Asiento</Th><Th>Generada</Th><Th /></tr>
                </thead>
                <tbody>
                  {items.map(c => {
                    const cerrado = c.periodo_estado === 'cerrado'
                    const bloqueo = bloqueoAnularBase ?? (c.estado === 'anulada' ? 'Ya está anulada'
                      : cerrado ? 'El período está cerrado: reabrilo para anular la corrida' : null)
                    return (
                      <tr key={c.id} className={`border-t border-gris ${c.estado === 'anulada' ? 'opacity-60' : ''}`}>
                        <td className="px-3 py-2 text-sm whitespace-nowrap">{fmtFecha(c.desde)} – {fmtFecha(c.hasta)}</td>
                        <td className="px-3 py-2 text-xs">{c.frecuencia === 'anual' ? 'Anual' : 'Mensual'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${c.estado === 'vigente' ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}
                            title={c.motivo_anulacion ?? undefined}>
                            {c.estado === 'vigente' ? 'Vigente' : 'Anulada'}
                          </span>
                          {cerrado && <span className="ml-1 text-[10px]" title="Período cerrado">🔒</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{c.bienes ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono tabular-nums">{fmtM(c.total)}</td>
                        <td className="px-3 py-2 text-xs">
                          {c.asiento_id
                            ? <button type="button" className="text-azul underline" onClick={() => onVerAsiento(c.asiento_id!)}>{numeroAsiento(c.asiento_numero ?? null)}</button>
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gris-dark">
                          {c.created_by_nombre ?? '—'}, {fmtFechaHora(c.created_at)}
                          {c.estado === 'anulada' && c.motivo_anulacion && <span className="block">Anulada: {c.motivo_anulacion}</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="secondary" disabled={!!bloqueo} title={bloqueo ?? 'Anular la corrida y su asiento'}
                            onClick={() => setAAnular(c)}>
                            Anular
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}

      {aAnular && <ModalAnularCorrida corrida={aAnular} onClose={() => setAAnular(null)} />}
    </div>
  )
}

function ModalAnularCorrida({ corrida, onClose }: { corrida: CtbAmortizacionCorrida; onClose: () => void }) {
  const toast = useToast()
  const anular = useAnularCorrida()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<AnularForm>({
    resolver: zodResolver(anularSchema),
    defaultValues: { motivo: '' },
  })

  async function enviar(d: AnularForm) {
    setErrorServer(null)
    try {
      await anular.mutateAsync({ id: corrida.id, motivo: d.motivo.trim() })
      toast('✓ Corrida de amortización anulada', 'ok')
      onClose()
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={anular.isPending ? () => {} : onClose} width="max-w-lg"
      title={`Anular amortizaciones ${fmtFecha(corrida.desde)} – ${fmtFecha(corrida.hasta)}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={anular.isPending}>Cancelar</Button>
        <Button variant="danger" size="sm" loading={anular.isPending} onClick={handleSubmit(enviar)}>Anular</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <Aviso tono="gris">
          Se anulan la corrida y su asiento ({fmtM(corrida.total)}). Las amortizaciones de ese período dejan de contar: el próximo
          «Amortizar» las vuelve a calcular.
        </Aviso>
        <Campo label="Motivo" error={errors.motivo?.message}>
          <input {...register('motivo')} maxLength={500} autoFocus placeholder="Ej.: faltaba dar de alta un bien" className={inputCls} />
        </Campo>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
