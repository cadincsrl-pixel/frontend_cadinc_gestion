'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { esNombreSoloCodigo, MENSAJE_NOMBRE_ES_CODIGO } from '@/lib/utils/materiales'
import { normalizeText } from '@/lib/utils/text'
import type { StockMaterial, StockRubro } from '@/types/domain.types'
import { useMaterialesParecidos, type CreateStockMaterialDto, type MaterialCandidato } from '../hooks/useStock'
import { etiquetaMotivo } from './MaterialParecidoModal'
import { UNIDADES } from '../constants'

// ── Alta rápida de material desde el pedido ───────────────────────────────
//
// Hasta el 2026-09-07 pedía nombre + rubro y nada más, y Sosa (depósito) creó
// 17 materiales en una semana desde pedidos: "pintura cod7055 x 4l", "pintura
// de latex blanca", "proyector iglesia"... siete duplicados o de una sola vez,
// todos a $0. Lo que cambia:
//   · Los parecidos se muestran EN VIVO mientras se tipea (misma búsqueda que
//     el 409 del backend), con "Usar este" y "guardar como sinónimo".
//   · El nombre tiene que decir qué es: un código solo no pasa.
//   · Rubro, unidad y precio de referencia (final, con IVA) son obligatorios.
//   · Lo que se buscó queda como sinónimo del material nuevo (opcional).
// El permiso lo decide el caller (editar certificaciones + pestaña Catálogo).

export interface AltaRapidaMaterialModalProps {
  /** Lo que el usuario tipeó en el buscador del pedido: nombre inicial y sinónimo sugerido. */
  buscadoComo:      string
  /** Unidad de la línea que disparó el alta (ya la eligió el usuario). */
  unidadInicial:    string
  rubros:           StockRubro[]
  /** Catálogo cargado en la pantalla, para "Usar este" (necesita el material completo). */
  materiales:       StockMaterial[]
  /** Hay un POST/PATCH en vuelo: no dejar disparar otro. */
  ocupado:          boolean
  /** 400 NOMBRE_ES_CODIGO del backend, si el chequeo local dejó pasar algo. */
  errorNombre?:     string | null
  onClose:          () => void
  onCrear:          (dto: CreateStockMaterialDto) => void
  onUsarExistente:  (m: StockMaterial) => void
  /** Suma `termino` como sinónimo del candidato y lo usa en la línea. */
  onAgregarSinonimo: (c: MaterialCandidato, termino: string) => void
}

export function AltaRapidaMaterialModal({
  buscadoComo, unidadInicial, rubros, materiales, ocupado, errorNombre,
  onClose, onCrear, onUsarExistente, onAgregarSinonimo,
}: AltaRapidaMaterialModalProps) {
  const [nombre,  setNombre]  = useState(buscadoComo)
  const [rubroId, setRubroId] = useState<number | ''>('')
  const [unidad,  setUnidad]  = useState(UNIDADES.some(u => u.value === unidadInicial) ? unidadInicial : '')
  const [precio,  setPrecio]  = useState('')
  // "No sé el precio": nace en $0 y cae en la lista de tasar.
  const [sinPrecio, setSinPrecio] = useState(false)
  const [guardarSinonimo, setGuardarSinonimo] = useState(true)

  const nombreLimpio    = nombre.trim()
  const nombreDebounced = useDebouncedValue(nombreLimpio, 300)
  const { data: parecidos = [], isFetching } = useMaterialesParecidos(nombreDebounced)
  // Los candidatos son de ESTE nombre (no de uno que ya se siguió tipeando):
  // recién ahí "Agregar igual" puede saltear el 409, porque el usuario los vio.
  const parecidosAlDia = parecidos.length > 0 && !isFetching && nombreDebounced === nombreLimpio

  const matById = useMemo(() => new Map(materiales.map(m => [m.id, m])), [materiales])
  const termino = normalizeText(buscadoComo)
  const sinonimoDistinto = termino.length > 0 && termino !== normalizeText(nombreLimpio)

  const esCodigo   = nombreLimpio.length > 0 && esNombreSoloCodigo(nombreLimpio)
  const precioNum  = Number(precio)
  const precioOk   = sinPrecio || (precio !== '' && Number.isFinite(precioNum) && precioNum > 0)
  const nombreOk   = nombreLimpio.length >= 3 && !esCodigo
  const listo      = nombreOk && rubroId !== '' && unidad !== '' && precioOk

  const errorDeNombre = esCodigo ? MENSAJE_NOMBRE_ES_CODIGO : (errorNombre ?? undefined)

  function crear() {
    if (!listo) return
    onCrear({
      nombre:     nombreLimpio,
      rubro_id:   Number(rubroId),
      unidad,
      precio_ref: sinPrecio ? 0 : precioNum,
      alias:      sinonimoDistinto && guardarSinonimo ? [buscadoComo.trim()] : [],
      forzar:     parecidosAlDia,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-lg"
      title="＋ AGREGAR AL CATÁLOGO"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={ocupado} disabled={!listo} onClick={crear}>
          {parecidosAlDia ? 'Ninguno es, agregar igual' : 'Agregar y usar'}
        </Button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gris-dark">
          Lo que sumes acá lo ven todas las obras y se usa para cotizar. Fijate primero si ya está.
        </p>

        <Input
          label="Nombre"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          error={errorDeNombre}
          hint={errorDeNombre ? undefined : 'Qué es, cómo viene y el tamaño: "Esmalte sintético x 4lts". El código del proveedor va como sinónimo.'}
          autoFocus
        />

        {parecidos.length > 0 && (
          <div className="rounded-xl border-[1.5px] border-[#E0A800]/50 bg-amarillo-light/60 p-2.5 flex flex-col gap-2">
            <div className="text-[11px] font-bold text-[#7A5500] uppercase tracking-wider">
              🔎 ¿No será alguno de estos?
            </div>
            {parecidos.map(c => {
              const existente = matById.get(c.id)
              const unidadLabel = UNIDADES.find(u => u.value === (c.unidad ?? existente?.unidad))?.label ?? c.unidad ?? ''
              const yaEsSinonimo = c.por_alias || (existente?.alias ?? []).includes(termino)
              const ofrecerSinonimo = sinonimoDistinto && !yaEsSinonimo && normalizeText(c.nombre) !== termino
              return (
                <div key={c.id} className="bg-white rounded-lg border border-gris-mid px-2.5 py-2 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    {existente?.foto_url && (
                      <a href={existente.foto_url} target="_blank" rel="noopener" className="shrink-0" title="Ver la foto grande">
                        <img src={existente.foto_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-gris-mid" />
                      </a>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-carbon leading-tight">{c.nombre}</div>
                      <div className="text-[11px] text-gris-dark">
                        {unidadLabel}
                        {existente && existente.stock_actual > 0 && <> · <span className="font-mono font-bold">{existente.stock_actual}</span> en depósito</>}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${c.motivo === 'alias' || c.motivo === 'alias_parecido' || c.motivo === 'codigo' ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}>
                      {etiquetaMotivo(c)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="secondary" size="sm" disabled={ocupado || !existente} onClick={() => { if (existente) onUsarExistente(existente) }}>
                      Usar este
                    </Button>
                    {ofrecerSinonimo && (
                      <Button variant="ghost" size="sm" disabled={ocupado || !existente} className="text-azul" onClick={() => onAgregarSinonimo(c, buscadoComo.trim())}>
                        Es este: guardar &ldquo;{buscadoComo.trim()}&rdquo; como sinónimo
                      </Button>
                    )}
                  </div>
                  {!existente && (
                    <p className="text-[10px] text-gris-dark">No está en la lista cargada; recargá la página para usarlo.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Rubro</label>
            <select
              value={rubroId}
              onChange={e => setRubroId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-2 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
            >
              <option value="">Elegí un rubro...</option>
              {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Unidad</label>
            <select
              value={unidad}
              onChange={e => setUnidad(e.target.value)}
              className="w-full px-2 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
            >
              <option value="">Elegí la unidad...</option>
              {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>

        <InputMonto
          label="Precio de referencia (final, con IVA)"
          value={precio}
          onChange={v => { setPrecio(v); if (v !== '') setSinPrecio(false) }}
          placeholder="0,00"
          disabled={sinPrecio}
          error={precio !== '' && !precioOk ? 'Tiene que ser mayor a cero' : undefined}
          hint={precio === '' && !sinPrecio ? 'Lo que se paga por una unidad, IVA incluido. Es lo que se cotiza a la obra.' : undefined}
        />

        {/* La salida honesta cuando no se sabe el precio. Sin esto, el campo
            obligatorio se llenaba con cualquier número —el 08 y 09/09, cinco
            fichas nuevas nacieron con "$11"— y eso es PEOR que dejarlo en
            cero: el cero aparece en la alerta de "sin precio" y en la lista de
            tasar; un $11 inventado no lo ve nadie hasta que alguien mira la
            cuenta de la obra. */}
        <label className="flex items-start gap-2 text-xs text-carbon cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={sinPrecio}
            onChange={e => { setSinPrecio(e.target.checked); if (e.target.checked) setPrecio('') }} />
          <span>
            <b>No sé el precio</b> — se guarda sin precio y queda en la lista de <b>Para tasar</b> del catálogo.
            {' '}Es preferible a poner un número inventado: ese después se cobra.
          </span>
        </label>

        {sinonimoDistinto && (
          <label className="flex items-start gap-2 text-xs text-carbon cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={guardarSinonimo} onChange={e => setGuardarSinonimo(e.target.checked)} />
            <span>
              Guardar <span className="font-mono">&ldquo;{buscadoComo.trim()}&rdquo;</span> como sinónimo, así la próxima vez lo encuentran buscándolo así.
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}
