'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHerrTipos, useHerrTipoEntregas, useCrearHerrTipo, useEditarHerrTipo, type HerrTipoInput } from '../hooks/useHerrTipos'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AliasChips } from '@/modules/certificaciones/components/AliasChips'
import { HttpError } from '@/lib/api/client'
import { fmtFecha } from './HerrSalidas'
import type { HerrTipoCatalogo, HerrEntrega } from '@/types/domain.types'

/**
 * Catálogo de herramientas — todos los TIPOS (stock_materiales clase
 * 'herramienta') con lo que dice el pañol de cada uno: cuántas hay en obra y en
 * cuáles, salidas sin revisar, retornos. Desde acá se crean y editan los tipos
 * y sus sinónimos; el buscador del pedido no deja crear herramientas.
 *
 * Ver = tab `catalogo`. Crear / editar / dar de baja = `herramientas.actualizacion`
 * (decisión del user 2026-09-05: Sosa puede sumar un tipo).
 */

type Form = { id?: number; nombre: string; alias: string; obs: string }
const FORM_VACIO: Form = { nombre: '', alias: '', obs: '' }

function parseAlias(txt: string): string[] {
  return txt.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
}

function mensajeError(err: unknown): string {
  if (err instanceof HttpError) {
    const b = err.body as { error?: string; candidatos?: { id: number; nombre: string }[] } | undefined
    if (b?.error === 'TIPO_DUPLICADO') {
      const c = (b.candidatos ?? []).map(x => x.nombre).join(', ')
      return c ? `Ya existe: ${c}. Sumale un sinónimo a ese en vez de crear otro.` : 'Ya existe un tipo con ese nombre o sinónimo.'
    }
  }
  return (err as Error)?.message || 'Error'
}

export function HerrCatalogo() {
  const { puedeEditar } = usePermisos('herramientas')
  const toast = useToast()

  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const [detalle, setDetalle] = useState<HerrTipoCatalogo | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [baja, setBaja] = useState<HerrTipoCatalogo | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data: tipos = [], isLoading, isError, error, refetch, isFetching } = useHerrTipos(q, verBajas)
  const { mutate: crear, isPending: creando } = useCrearHerrTipo()
  const { mutate: editar, isPending: editando } = useEditarHerrTipo()

  const resumen = useMemo(() => ({
    tipos:      tipos.filter(t => t.activo).length,
    en_obra:    tipos.reduce((s, t) => s + Number(t.en_obra), 0),
    sin_revisar: tipos.reduce((s, t) => s + Number(t.sin_revisar), 0),
  }), [tipos])

  function abrirNuevo() { setForm({ ...FORM_VACIO, nombre: busqueda.trim() }) }
  function abrirEditar(t: HerrTipoCatalogo) { setForm({ id: t.id, nombre: t.nombre, alias: (t.alias ?? []).join('\n'), obs: t.obs ?? '' }) }

  function guardar() {
    if (!form) return
    const nombre = form.nombre.trim()
    if (nombre.length < 3) { toast('El nombre necesita al menos 3 letras', 'err'); return }
    const dto: HerrTipoInput = { nombre, alias: parseAlias(form.alias), obs: form.obs.trim() || null }
    const onError = (err: unknown) => toast(mensajeError(err), 'err')
    if (form.id) {
      editar({ id: form.id, ...dto }, {
        onSuccess: (r) => { toast(r.aviso ? `Guardado. ${r.aviso}` : '✓ Tipo actualizado', r.aviso ? 'err' : 'ok'); setForm(null) },
        onError,
      })
    } else {
      crear(dto, { onSuccess: () => { toast('✓ Tipo creado', 'ok'); setForm(null) }, onError })
    }
  }

  function cambiarActivo(t: HerrTipoCatalogo, activo: boolean) {
    editar({ id: t.id, activo }, {
      onSuccess: () => { toast(activo ? '✓ Tipo reactivado' : '✓ Tipo dado de baja', 'ok'); setBaja(null) },
      onError:   (err: unknown) => toast(mensajeError(err), 'err'),
    })
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">CATÁLOGO DE HERRAMIENTAS</h1>
          <p className="text-sm text-gris-dark mt-0.5">
            Los tipos que el pedido ofrece y el pañol cuenta. Si una herramienta no está acá, se crea acá, no desde el pedido.
          </p>
        </div>
        {puedeEditar && <Button onClick={abrirNuevo}>＋ Nuevo tipo</Button>}
      </div>

      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[220px]">
          <Input placeholder="Buscar por nombre o sinónimo (ej: canguro, parante 6 rosetas)…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gris-dark cursor-pointer select-none">
          <input type="checkbox" checked={verBajas} onChange={e => setVerBajas(e.target.checked)} />
          Ver dados de baja
        </label>
        <div className="text-xs text-gris-dark ml-auto">
          <b className="text-azul">{resumen.tipos}</b> tipos · <b className="text-azul">{resumen.en_obra}</b> en obra · <b className={resumen.sin_revisar > 0 ? 'text-[#7A5500]' : 'text-azul'}>{resumen.sin_revisar}</b> salidas sin revisar
          {isFetching && <span className="ml-2 opacity-60">actualizando…</span>}
        </div>
      </div>

      {isError && (
        <div className="bg-rojo-light text-rojo rounded-card p-3 text-sm flex items-center justify-between">
          <span>No se pudo cargar el catálogo: {(error as Error)?.message}</span>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>Reintentar</Button>
        </div>
      )}

      <div className="bg-white rounded-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gris-dark border-b border-gris-mid">
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right" title="Salidas confirmadas que todavía no volvieron">En obra</th>
              <th className="px-3 py-2 text-right" title="Salidas que nadie confirmó ni archivó">Sin revisar</th>
              <th className="px-3 py-2 text-right">Salidas / retornos</th>
              <th className="px-3 py-2">Última</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gris-dark">Cargando…</td></tr>
            )}
            {!isLoading && tipos.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gris-dark">
                {q ? <>No hay ningún tipo que se llame o se pida como “{q}”.{puedeEditar && <> <button className="underline text-azul" onClick={abrirNuevo}>Crearlo</button>.</>}</> : 'No hay tipos cargados.'}
              </td></tr>
            )}
            {tipos.map(t => (
              <tr key={t.id} className={`border-b border-gris last:border-0 hover:bg-gris/30 ${t.activo ? '' : 'opacity-50'}`}>
                <td className="px-3 py-2">
                  <button className="font-semibold text-azul text-left hover:underline" onClick={() => setDetalle(t)}>{t.nombre}</button>
                  {!t.activo && <span className="ml-2 text-[10px] font-bold text-rojo bg-rojo-light px-1.5 py-0.5 rounded">DE BAJA</span>}
                  <AliasChips alias={t.alias} compact />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(t.en_obra) > 0
                    ? <span className="font-bold text-azul">{Number(t.en_obra)}<span className="text-[11px] font-normal text-gris-dark"> en {t.n_obras} obra{t.n_obras === 1 ? '' : 's'}</span></span>
                    : <span className="text-gris-dark">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(t.sin_revisar) > 0 ? <span className="font-bold text-[#7A5500] bg-amarillo-light px-1.5 py-0.5 rounded">{t.sin_revisar}</span> : <span className="text-gris-dark">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gris-dark">{t.salidas} / {t.devoluciones}</td>
                <td className="px-3 py-2 text-gris-dark">{fmtFecha(t.ultima)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setDetalle(t)}>Ver</Button>
                  {puedeEditar && <Button variant="ghost" size="sm" onClick={() => abrirEditar(t)}>Editar</Button>}
                  {puedeEditar && (t.activo
                    ? <Button variant="ghost" size="sm" onClick={() => setBaja(t)}>Dar de baja</Button>
                    : <Button variant="ghost" size="sm" onClick={() => cambiarActivo(t, true)} disabled={editando}>Reactivar</Button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Nuevo / editar ─────────────────────────────────────────────── */}
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar tipo de herramienta' : 'Nuevo tipo de herramienta'}
        width="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={guardar} loading={creando || editando}>{form?.id ? 'Guardar' : 'Crear'}</Button>
          </div>
        }
      >
        {form && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-bold text-gris-dark mb-1">Nombre técnico</label>
              <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder='Ej: Parante p/ andamio multidireccional 6 rosetas (3m)' autoFocus />
              <p className="text-[11px] text-gris-dark mt-1">Es el nombre con el que sale en el pedido, en Salidas a obra y en los remitos. Si lo cambiás, se actualiza en todos.</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gris-dark mb-1">Sinónimos (uno por línea o separados por coma)</label>
              <textarea
                className="w-full border border-gris-mid rounded-lg px-3 py-2 text-sm min-h-[110px] focus:outline-none focus:ring-2 focus:ring-naranja/40"
                value={form.alias}
                onChange={e => setForm({ ...form, alias: e.target.value })}
                placeholder={'andamio de 6 roseta\nparante 3 metros\nposte 6 rosetas'}
              />
              <p className="text-[11px] text-gris-dark mt-1">Cómo lo piden en la obra. El buscador del pedido los encuentra por cualquiera de estos.</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gris-dark mb-1">Notas (opcional)</label>
              <Input value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Marca, medida, dónde se guarda…" />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirmar baja ─────────────────────────────────────────────── */}
      <Modal
        open={baja !== null}
        onClose={() => setBaja(null)}
        title="Dar de baja el tipo"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBaja(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => baja && cambiarActivo(baja, false)} loading={editando}>Dar de baja</Button>
          </div>
        }
      >
        {baja && (
          <p className="text-sm text-carbon">
            <b>{baja.nombre}</b> deja de aparecer en el buscador del pedido. Sus salidas, retornos y pedidos viejos quedan como están
            {Number(baja.en_obra) > 0 && <> — ojo que todavía hay <b>{Number(baja.en_obra)}</b> en obra</>}.
            Se puede reactivar desde “Ver dados de baja”.
          </p>
        )}
      </Modal>

      {detalle && <DetalleTipo tipo={detalle} onClose={() => setDetalle(null)} onEditar={puedeEditar ? () => { abrirEditar(detalle); setDetalle(null) } : undefined} />}
    </div>
  )
}

// ── Detalle: dónde está cada unidad ──────────────────────────────────────
function DetalleTipo({ tipo, onClose, onEditar }: { tipo: HerrTipoCatalogo; onClose: () => void; onEditar?: () => void }) {
  const { data: entregas = [], isLoading } = useHerrTipoEntregas(tipo.id)
  const { data: obras = [] } = useObras()
  const nombreObra = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of obras) m.set(o.cod, o.nom)
    return (cod: string | null) => (cod ? (m.get(cod) ?? cod) : 'sin obra')
  }, [obras])

  // Agrupado por obra, con lo que sigue afuera arriba de todo.
  const porObra = useMemo(() => {
    const g = new Map<string, { cod: string | null; en_obra: number; filas: HerrEntrega[] }>()
    for (const e of entregas) {
      const k = e.obra_cod ?? '—'
      const cur = g.get(k) ?? { cod: e.obra_cod, en_obra: 0, filas: [] }
      cur.filas.push(e)
      if (e.sentido === 'salida' && e.estado === 'confirmada') cur.en_obra += Number(e.en_obra)
      g.set(k, cur)
    }
    return [...g.values()].sort((a, b) => b.en_obra - a.en_obra || b.filas.length - a.filas.length)
  }, [entregas])

  const ESTADO: Record<string, string> = {
    pendiente: 'sin revisar', confirmada: 'confirmada', revisar: 'a revisar', ignorada: 'archivada', vinculada: 'vinculada', catalogada: 'catalogada', anulada: 'anulada',
  }

  return (
    <Modal open onClose={onClose} title={tipo.nombre} width="max-w-2xl"
      footer={<div className="flex justify-between items-center gap-2">
        <span className="text-xs text-gris-dark">{tipo.renglones} renglón{tipo.renglones === 1 ? '' : 'es'} de pedido usaron este tipo</span>
        <div className="flex gap-2">
          {onEditar && <Button variant="secondary" onClick={onEditar}>Editar</Button>}
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <div><div className="text-[11px] uppercase text-gris-dark">En obra</div><div className="font-bold text-azul text-lg">{Number(tipo.en_obra)}</div></div>
          <div><div className="text-[11px] uppercase text-gris-dark">Sin revisar</div><div className="font-bold text-lg">{tipo.sin_revisar}</div></div>
          <div><div className="text-[11px] uppercase text-gris-dark">Salidas</div><div className="font-bold text-lg">{tipo.salidas}</div></div>
          <div><div className="text-[11px] uppercase text-gris-dark">Retornos</div><div className="font-bold text-lg">{tipo.devoluciones}</div></div>
        </div>
        {(tipo.alias ?? []).length > 0 && (
          <div>
            <div className="text-[11px] uppercase text-gris-dark mb-1">También se pide como</div>
            <AliasChips alias={tipo.alias} />
          </div>
        )}
        {tipo.obs && <p className="text-xs text-gris-dark whitespace-pre-wrap">{tipo.obs}</p>}

        <div>
          <div className="text-[11px] uppercase text-gris-dark mb-1">Movimientos por obra</div>
          {isLoading && <div className="text-sm text-gris-dark">Cargando…</div>}
          {!isLoading && porObra.length === 0 && <div className="text-sm text-gris-dark">Todavía no salió a ninguna obra.</div>}
          <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto pr-1">
            {porObra.map(g => (
              <div key={g.cod ?? '—'} className="border border-gris-mid rounded-lg">
                <div className="flex justify-between items-center px-3 py-1.5 bg-gris/40 text-sm">
                  <span className="font-semibold text-azul">{nombreObra(g.cod)}</span>
                  <span className="text-xs text-gris-dark">{g.en_obra > 0 ? <b className="text-azul">{g.en_obra} en obra</b> : 'nada en obra'} · {g.filas.length} mov.</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {g.filas.map(e => (
                      <tr key={e.id} className="border-t border-gris">
                        <td className="px-3 py-1 whitespace-nowrap text-gris-dark">{fmtFecha(e.fecha)}</td>
                        <td className="px-3 py-1">{e.sentido === 'salida' ? '📤 salida' : '↩ retorno'}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{Number(e.cantidad)}{e.sentido === 'salida' && Number(e.devuelto) > 0 && <span className="text-gris-dark"> (volvieron {Number(e.devuelto)})</span>}</td>
                        <td className="px-3 py-1 text-gris-dark">{ESTADO[e.estado] ?? e.estado}</td>
                        <td className="px-3 py-1 text-gris-dark">{e.remito_numero ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
