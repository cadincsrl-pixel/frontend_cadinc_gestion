'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { subirComprobantePendiente, borrarComprobantePendiente, leerCheque } from '../../hooks/usePagos'
import { useConfigPagos } from '../../hooks/useConfigPagos'
import {
  MAX_ADJUNTO_BYTES, fechasEscalonadas, fmtFecha, fmtM, partirEnPartes, plazoLabel, sumarDiasISO,
} from '../../utils/pagos.utils'
import { mensajeAvisoLectura, mensajeErrorPagos } from '../../utils/pagos.errores'
import {
  chequeVacio, chequesParaEnviar, estadoCheques, n, nEntero, nombreCheque, r2, type CampoCheque, type ChequeFila,
} from '../../utils/pagoForm'
import { Campo, inputCls } from './Campo'
import type { PagosAdjuntoPendiente, PagosFormaPagoOP, PagosPlanCheques } from '@/types/domain.types'

/**
 * El editor de cheques de una orden de pago: partir en N a tal plazo, filas
 * a mano, el «📎 Comprobante» de cada cheque (se lee con IA) y el cuadre
 * contra lo que sale de plata.
 *
 * Con cheque o e-cheq el comprobante del pago ES el archivo de cada cheque
 * (20260929w): no hay un comprobante aparte de toda la orden. En e-cheq es
 * obligatorio en cada fila; en cheque físico, opcional.
 *
 * Lo usan «Registrar pago» (un proveedor) y cada bloque de «Pagar en lote»
 * (20260929t). El estado vive en `useEditorCheques` (uno por OP) y la vista en
 * `<EditorCheques>`; quien lo usa decide qué hacer cuando los cheques mandan
 * sobre el total (`onUsarTotalDeLosCheques`), porque eso toca SUS facturas.
 */

interface Opciones {
  fecha:       string
  totalPlata:  number
  forma:       PagosFormaPagoOP
  pideCheques: boolean
  /** El plan anotado en la factura al cargarla (20260923n), si hay. */
  planFactura: PagosPlanCheques | null
}

export function useEditorCheques({ fecha, totalPlata, forma, pideCheques, planFactura }: Opciones) {
  const toast = useToast()
  const [cheques, setCheques] = useState<ChequeFila[]>([])
  // Cómo se reparte el pago en cheques (2026-09-21). Son tres preguntas que el
  // dueño hace en voz alta al entregar: en cuántos, a qué plazo el primero, y
  // cada cuánto los demás. Antes estaba fijo en 30/60/90.
  const [cantCheques, setCantCheques] = useState('3')
  const [primerPlazo, setPrimerPlazo] = useState(30)
  // Plazos de Compras › Configuración (20260929i); sin el endpoint, los de
  // siempre (PLAZOS_CHEQUE). El elegido se suma a la lista si no está, para
  // que el select nunca muestre un valor que no ofrece.
  const { plazosCheque } = useConfigPagos()
  const opcionesPlazo = useMemo(
    () => [...new Set([...plazosCheque, primerPlazo])].sort((a, b) => a - b),
    [plazosCheque, primerPlazo])
  const [cadaDias, setCadaDias] = useState('30')

  const { totalCheques, difCheques, incompletos, leyendo } = estadoCheques(cheques, totalPlata, fecha)

  // El plan anotado en la factura al cargarla (20260923n): con cheque o
  // e-cheq, las filas arrancan armadas con esas fechas. Una sola vez, y sólo
  // si todavía no se cargó ningún cheque: no pisa lo que se tipeó. Una fecha
  // que ya pasó arranca en la fecha del pago.
  //
  // Se ajusta DURANTE el render (el patrón de React para «estado que sigue a
  // una prop»), no en un effect: así no hay un render de más con la lista
  // vacía. `planAplicado` corta la repetición.
  const [planAplicado, setPlanAplicado] = useState(false)
  if (!planAplicado && planFactura && pideCheques && cheques.length === 0 && totalPlata > 0) {
    const k = planFactura.cantidad
    const primero = planFactura.primer_cobro > fecha ? planFactura.primer_cobro : fecha
    const fechas = fechasEscalonadas(primero, k, 0, planFactura.cada_dias)
    setPlanAplicado(true)
    setCantCheques(String(k))
    setCadaDias(String(planFactura.cada_dias))
    setCheques(partirEnPartes(totalPlata, k).map((m, i) => chequeVacio(fechas[i] ?? primero, String(m))))
  }

  function setCheque(i: number, cambio: Partial<ChequeFila>) {
    setCheques(cs => cs.map((c, j) => j === i ? { ...c, ...cambio } : c))
  }

  /** Lo tipea la persona: deja de decir «leído de la foto». */
  function setChequeAMano(i: number, cambio: Partial<Pick<ChequeFila, CampoCheque>>) {
    const tocados = Object.keys(cambio) as CampoCheque[]
    setCheques(cs => cs.map((c, j) => j === i
      ? { ...c, ...cambio, leidos: c.leidos.filter(k => !tocados.includes(k)) }
      : c))
  }

  function setChequeUid(uid: number, cambio: Partial<ChequeFila> | ((c: ChequeFila) => Partial<ChequeFila>)) {
    setCheques(cs => cs.map(c => c.uid === uid ? { ...c, ...(typeof cambio === 'function' ? cambio(c) : cambio) } : c))
  }

  // Las miniaturas son object URLs: se liberan al cerrar el modal.
  const urlsFotos = useRef(new Set<string>())
  useEffect(() => {
    const urls = urlsFotos.current
    return () => { for (const u of urls) URL.revokeObjectURL(u) }
  }, [])

  /**
   * «📎 Comprobante» de la fila (20260925; 20260929w): sube la foto o el PDF
   * como adjunto pendiente de la OP, lo lee con IA y completa la fila
   * marcando lo leído. La persona revisa y
   * corrige. Si no se puede leer, la foto queda igual (se adjunta a la OP) y
   * los datos se cargan a mano. Si el importe no cierra, lo dice el aviso de
   * siempre de la suma de cheques.
   */
  async function leerFotoCheque(uid: number, file: File) {
    if (file.size > MAX_ADJUNTO_BYTES) { toast('El archivo supera los 10 MB', 'err'); return }
    const previa = cheques.find(c => c.uid === uid)
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    if (url) urlsFotos.current.add(url)
    setChequeUid(uid, { leyendo: true, avisosFoto: [] })
    let adj: PagosAdjuntoPendiente
    try {
      adj = await subirComprobantePendiente(file, 'cheque')
    } catch (e) {
      setChequeUid(uid, { leyendo: false, avisosFoto: [mensajeErrorPagos(e)] })
      return
    }
    // La foto anterior de esta fila ya no va: se borra del bucket.
    if (previa?.foto) borrarComprobantePendiente(previa.foto.storage_path).catch(() => {})
    setChequeUid(uid, { foto: adj, fotoUrl: url })
    try {
      const r = await leerCheque(adj)
      const p = r.propuesta
      setChequeUid(uid, c => {
        const cambio: Partial<ChequeFila> = {}
        const leidos: CampoCheque[] = []
        if (p.numero?.trim())      { cambio.numero = p.numero.trim(); leidos.push('numero') }
        if (p.banco?.trim())       { cambio.banco = p.banco.trim(); leidos.push('banco') }
        if (p.fecha_cobro)         { cambio.fecha_cobro = p.fecha_cobro.slice(0, 10); leidos.push('fecha_cobro') }
        if (p.importe != null && p.importe > 0) { cambio.monto = String(p.importe); leidos.push('monto') }
        const librador = [p.librador?.trim(), p.librador_cuit ? `CUIT ${p.librador_cuit}` : null].filter(Boolean).join(' · ')
        // El librador sólo se usa si el cheque es de un tercero: si está como
        // propio se guarda para ofrecerlo al tildar «De tercero».
        if (librador && !c.es_propio) { cambio.librador = librador; leidos.push('librador') }
        const avisos = (r.avisos ?? []).map(a => mensajeAvisoLectura(a)).filter(Boolean)
        if (p.es_echeq && forma === 'cheque') avisos.push('La foto parece de un e-cheq, y la forma de pago elegida es cheque.')
        if (leidos.length === 0) avisos.push('No se pudo sacar ningún dato de la foto: cargalos a mano. La foto queda adjunta igual.')
        return {
          ...cambio, leyendo: false, libradorLeido: librador,
          leidos: [...new Set([...c.leidos, ...leidos])], avisosFoto: avisos,
          foto: r.storage_path ? { ...adj, storage_path: r.storage_path } : adj,
        }
      })
    } catch (e) {
      setChequeUid(uid, { leyendo: false, avisosFoto: [`${mensajeErrorPagos(e)} La foto queda adjunta igual.`] })
    }
  }

  /** «📷 Agregar desde foto»: una fila nueva que arranca con la foto. */
  function agregarDesdeFoto(file: File) {
    const nuevo = chequeVacio('', '')
    setCheques(cs => [...cs, nuevo])
    void leerFotoCheque(nuevo.uid, file)
  }

  function quitarCheque(i: number) {
    const c = cheques[i]
    if (c?.foto) borrarComprobantePendiente(c.foto.storage_path).catch(() => {})
    setCheques(cs => cs.filter((_, j) => j !== i))
  }

  /**
   * Parte lo que sale de plata en `k` cheques iguales y les pone las fechas de
   * cobro según el plazo elegido: «tres a 30, 60 y 90», «dos al día y a 30»,
   * «uno a 7». La última parte absorbe los centavos para que la suma cierre
   * exacto — el backend compara por igualdad estricta.
   *
   * Conserva número, banco y librador de las filas que ya estaban: cambiar el
   * plazo después de tipear los números no obliga a tipearlos de nuevo.
   */
  function generarCheques() {
    const k = Math.trunc(nEntero(cantCheques))
    if (totalPlata <= 0 || k <= 0) return
    const partes = partirEnPartes(totalPlata, k)
    const fechas = fechasEscalonadas(fecha, k, primerPlazo, nEntero(cadaDias))
    setCheques(cs => partes.map((m, i) => ({
      ...(cs[i] ?? chequeVacio('', '')),
      fecha_cobro: fechas[i] ?? fecha,
      monto: String(m),
    })))
  }

  /** El plazo que quedó, en días desde la fecha del pago. Se lee al lado de
   *  cada fecha para reconocer «el de 60» sin contar en el calendario. */
  function plazoDe(fechaCobro: string): string | undefined {
    if (!fechaCobro || fechaCobro < fecha) return undefined
    const dias = Math.round(
      (new Date(`${fechaCobro}T12:00:00`).getTime() - new Date(`${fecha}T12:00:00`).getTime()) / 86_400_000)
    return plazoLabel(dias)
  }

  /** Uno más, siguiendo el paso elegido desde el último cargado. */
  function agregarCheque() {
    setCheques(cs => {
      const paso = Math.max(0, nEntero(cadaDias))
      const ultima = cs.length > 0 ? cs[cs.length - 1]!.fecha_cobro || fecha : null
      const siguiente = ultima ? sumarDiasISO(ultima, paso) : sumarDiasISO(fecha, primerPlazo)
      return [...cs, chequeVacio(siguiente, String(Math.max(0, difCheques)))]
    })
  }

  /** Lo que falta o sobra va al último: evita el rebote por centavos. */
  function ajustarUltimoCheque() {
    setCheques(cs => cs.map((c, i) => i === cs.length - 1 ? { ...c, monto: String(r2(n(c.monto) + difCheques)) } : c))
  }

  /** Las fotos ya subidas al bucket (para limpiarlas si no se registra). */
  function fotosSubidas(): string[] {
    return cheques.flatMap(c => c.foto ? [c.foto.storage_path] : [])
  }

  return {
    cheques, cantCheques, setCantCheques, primerPlazo, setPrimerPlazo, opcionesPlazo, cadaDias, setCadaDias,
    totalCheques, difCheques, incompletos, leyendo,
    setCheque, setChequeAMano, leerFotoCheque, agregarDesdeFoto, quitarCheque, generarCheques, plazoDe,
    agregarCheque, ajustarUltimoCheque, fotosSubidas,
    paraEnviar: () => chequesParaEnviar(cheques),
  }
}

export type EditorChequesEstado = ReturnType<typeof useEditorCheques>

export function EditorCheques({ ed, forma, fecha, totalPlata, cantFacturas, onUsarTotalDeLosCheques }: {
  ed:          EditorChequesEstado
  forma:       PagosFormaPagoOP
  fecha:       string
  totalPlata:  number
  /** Para explicar a dónde va lo que suman los cheques. */
  cantFacturas: number
  /** Los cheques mandan: el total de arriba pasa a ser lo que suman. */
  onUsarTotalDeLosCheques: (totalCheques: number) => void
}) {
  const { cheques, cantCheques, primerPlazo, cadaDias, totalCheques, difCheques } = ed
  return (
    <div className="border border-gris-mid rounded">
      <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 bg-gris/40 border-b border-gris-mid">
        <span className="text-xs font-bold uppercase tracking-wide text-gris-dark">
          {forma === 'echeq' ? 'E-cheqs' : 'Cheques'}
          <span className="block normal-case tracking-normal font-normal text-[11px]">
            {forma === 'echeq'
              ? 'El comprobante del pago es el PDF de cada e-cheq: subilo en su fila.'
              : 'El comprobante de cada cheque (foto o PDF) es opcional.'}
          </span>
        </span>
        {/* En cuántos se parte y a qué plazo. Un click en vez de tipear
            fila por fila, y sin el 30/60/90 fijo de antes. */}
        <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
          <span className="text-[11px] text-gris-dark">Partir en</span>
          <input inputMode="numeric" value={cantCheques} aria-label="Cantidad de cheques"
            onChange={e => ed.setCantCheques(e.target.value.replace(/\D/g, '').slice(0, 2))}
            className="w-11 px-1.5 py-0.5 text-[11px] text-right font-mono tabular-nums border border-gris-mid rounded bg-white" />
          <span className="text-[11px] text-gris-dark">· primero</span>
          <select value={primerPlazo} onChange={e => ed.setPrimerPlazo(Number(e.target.value))}
            aria-label="Plazo del primer cheque"
            className="px-1.5 py-0.5 text-[11px] border border-gris-mid rounded bg-white">
            {ed.opcionesPlazo.map(d => <option key={d} value={d}>{plazoLabel(d)}</option>)}
          </select>
          <span className="text-[11px] text-gris-dark">· después cada</span>
          <input inputMode="numeric" value={cadaDias} aria-label="Días entre cheques"
            onChange={e => ed.setCadaDias(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className="w-11 px-1.5 py-0.5 text-[11px] text-right font-mono tabular-nums border border-gris-mid rounded bg-white" />
          <span className="text-[11px] text-gris-dark">días</span>
          <Button variant="secondary" size="sm" onClick={ed.generarCheques}
            disabled={totalPlata <= 0 || nEntero(cantCheques) <= 0}
            title={totalPlata <= 0 ? 'Primero poné cuánto se paga' : 'Rehace las filas con estos plazos y el importe repartido'}>
            Generar
          </Button>
        </div>
      </div>

      {cheques.length === 0 && (
        <div className="px-2.5 py-3 text-xs text-gris-dark">
          Sin cheques cargados. Poné en cuántos se parte y tocá «Generar», o agregá uno a mano.
          {totalPlata > 0 && nEntero(cantCheques) > 0 && (
            <div className="mt-1 text-[11px]">
              Quedarían {nEntero(cantCheques)} de <b className="font-mono tabular-nums">
                {fmtM(totalPlata / nEntero(cantCheques))}</b>, el primero el{' '}
              <b>{fmtFecha(sumarDiasISO(fecha, primerPlazo))}</b>
              {nEntero(cantCheques) > 1 && <> y el último el{' '}
                <b>{fmtFecha(sumarDiasISO(fecha, primerPlazo + nEntero(cadaDias) * (nEntero(cantCheques) - 1)))}</b></>}.
            </div>
          )}
        </div>
      )}

      {cheques.map((c, i) => (
        <div key={c.uid} className="border-b border-gris last:border-0 p-2.5 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2 items-end">
            <ComprobanteCheque c={c} obligatorio={forma === 'echeq'} onElegir={file => void ed.leerFotoCheque(c.uid, file)} />
            <Campo label="Número" ancho="w-28" leido={c.leidos.includes('numero')}>
              <input value={c.numero} onChange={e => ed.setChequeAMano(i, { numero: e.target.value })}
                className={inputCls} placeholder="00012345" />
            </Campo>
            <Campo label="Banco" ancho="w-32" leido={c.leidos.includes('banco')}>
              <input value={c.banco} onChange={e => ed.setChequeAMano(i, { banco: e.target.value })} className={inputCls} />
            </Campo>
            <Campo label="Se cobra el" hint={ed.plazoDe(c.fecha_cobro)} ancho="w-36" leido={c.leidos.includes('fecha_cobro')}>
              <input type="date" value={c.fecha_cobro} min={fecha}
                onChange={e => ed.setChequeAMano(i, { fecha_cobro: e.target.value })} className={inputCls} />
            </Campo>
            <Campo label="Importe" ancho="w-32" leido={c.leidos.includes('monto')}>
              <InputMonto value={c.monto} onChange={v => ed.setChequeAMano(i, { monto: v })}
                className="text-right font-mono tabular-nums py-2 rounded" />
            </Campo>
            <label className="flex items-center gap-1 text-xs pb-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={!c.es_propio}
                onChange={e => ed.setCheque(i, {
                  es_propio: !e.target.checked,
                  // Al tildar «De tercero» se ofrece el librador leído de la foto.
                  librador: e.target.checked ? (c.librador || c.libradorLeido) : '',
                  leidos: e.target.checked && !c.librador && c.libradorLeido
                    ? [...c.leidos, 'librador'] : c.leidos.filter(k => k !== 'librador'),
                })} />
              De tercero
            </label>
            {!c.es_propio && (
              <Campo label="Librador" hint="De quién era" ancho="w-44" leido={c.leidos.includes('librador')}>
                <input value={c.librador} onChange={e => ed.setChequeAMano(i, { librador: e.target.value })}
                  className={inputCls} placeholder="Quién lo libró" />
              </Campo>
            )}
            <button type="button" onClick={() => ed.quitarCheque(i)} disabled={c.leyendo}
              title={c.leyendo ? 'Esperá a que termine de leer la foto' : undefined}
              className="ml-auto text-xs text-rojo hover:underline pb-1.5 disabled:opacity-50 disabled:no-underline">Quitar</button>
          </div>
          {c.leyendo && <div className="text-[11px] text-azul animate-pulse">Leyendo el comprobante del cheque…</div>}
          {forma === 'echeq' && !c.foto && !c.leyendo && (
            <div className="text-[11px] text-rojo font-semibold">Falta el comprobante del {nombreCheque(forma, c, i)}.</div>
          )}
          {c.leidos.length > 0 && !c.leyendo && (
            <div className="text-[11px] text-gris-dark">Los campos marcados se leyeron del comprobante: revisalos antes de registrar.</div>
          )}
          {c.es_propio && c.libradorLeido && !c.leyendo && (
            <div className="text-[11px] text-gris-dark">La foto dice que lo libró <b>{c.libradorLeido}</b>. Si no es de CADINC, tildá «De tercero».</div>
          )}
          {c.avisosFoto.map((a, k) => (
            <div key={k} className="text-[11px] text-[#7A5000]">⚠ {a}</div>
          ))}
        </div>
      ))}

      {/*
        Las dos direcciones, y cuál usar. Antes había sólo «ajustar», que
        toca el CHEQUE para que cierre contra el total de arriba — y el
        dueño venía tipeando el total a mano porque es la dirección al
        revés: los cheques ya están escritos. (2026-09-21)
      */}
      {Math.abs(difCheques) >= 0.005 && cheques.length > 0 && (
        <div className="px-2.5 py-2 border-t border-gris-mid bg-rojo-light/40 flex flex-col gap-1.5">
          <div className="text-xs text-carbon">
            Los cheques suman <b className="font-mono">{fmtM(totalCheques)}</b> y arriba se está
            pagando <b className="font-mono">{fmtM(totalPlata)}</b>. Tienen que dar igual.
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="secondary" size="sm" onClick={() => onUsarTotalDeLosCheques(totalCheques)}>
              Usar lo que suman los cheques
            </Button>
            <span className="text-[11px] text-gris-dark">
              {cantFacturas > 1
                ? 'Reparte entre las facturas empezando por la que vence primero; si sobra, va a «A cuenta».'
                : 'Pone ese importe arriba; si pasa del saldo, la diferencia va a «A cuenta».'}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="ghost" size="sm" onClick={ed.ajustarUltimoCheque}>
              Cambiar el último cheque
            </Button>
            <span className="text-[11px] text-gris-dark">
              Al revés: le suma {fmtM(difCheques)} al último cheque para que cierre. Para los centavos del reparto.
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 border-t border-gris-mid">
        <Button variant="ghost" size="sm" onClick={ed.agregarCheque}>+ Agregar cheque</Button>
        <label className="text-xs px-2.5 py-1.5 rounded hover:bg-gris cursor-pointer font-semibold text-gris-dark"
          title="Una fila nueva a partir de la foto o el PDF del cheque: se completa sola y ése queda como su comprobante">
          📷 Agregar desde foto
          <input type="file" className="hidden" accept="image/*,application/pdf" capture="environment"
            onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) ed.agregarDesdeFoto(file) }} />
        </label>
        <div className="ml-auto text-xs text-right">
          <span className="text-gris-dark">Suman </span>
          <b className="font-mono tabular-nums">{fmtM(totalCheques)}</b>
          <span className="text-gris-dark"> de {fmtM(totalPlata)}</span>
          {Math.abs(difCheques) >= 0.005 && (
            <span className="ml-2 text-rojo font-semibold">
              {difCheques > 0 ? `faltan ${fmtM(difCheques)}` : `sobran ${fmtM(-difCheques)}`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * El «📎 Comprobante» de la fila: la foto o el PDF del cheque. Al elegirlo se
 * sube y se lee con IA (número, banco, fecha e importe). Ya subido muestra la
 * miniatura (o 📄 si es PDF) y el nombre del archivo, y se puede cambiar.
 */
function ComprobanteCheque({ c, obligatorio, onElegir }: { c: ChequeFila; obligatorio: boolean; onElegir: (f: File) => void }) {
  const falta = obligatorio && !c.foto && !c.leyendo
  return (
    <div className="flex items-end gap-1.5">
      {c.foto && (
        c.fotoUrl
          ? <a href={c.fotoUrl} target="_blank" rel="noreferrer" title={c.foto.nombre_archivo}>
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, no pasa por next/image */}
              <img src={c.fotoUrl} alt="Comprobante del cheque" className="w-14 h-9 object-cover rounded border border-gris-mid" />
            </a>
          : <span className="w-14 h-9 flex items-center justify-center rounded border border-gris-mid text-[10px] text-gris-dark" title={c.foto.nombre_archivo}>📄 PDF</span>
      )}
      <div className="flex flex-col">
        <label className={`text-xs px-2 py-2 rounded border font-semibold whitespace-nowrap
          ${falta ? 'border-rojo text-rojo bg-rojo-light' : c.foto ? 'border-verde/50 bg-white text-verde' : 'border-gris-mid bg-white'}
          ${c.leyendo ? 'opacity-60 cursor-wait' : 'hover:bg-gris cursor-pointer'}`}
          title={c.foto
            ? `${c.foto.nombre_archivo} · tocá para cambiarlo (se vuelve a leer)`
            : `PDF o foto del cheque${obligatorio ? '' : ' (opcional)'}: completa número, banco, fecha e importe`}>
          {c.leyendo ? 'Subiendo…' : c.foto ? '✓ Comprobante' : '📎 Comprobante'}
          {/* Sin `capture`: forzaría la cámara y el PDF del e-cheq no se podría elegir. */}
          <input type="file" className="hidden" accept="image/*,application/pdf" disabled={c.leyendo}
            onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onElegir(file) }} />
        </label>
        {c.foto && (
          <span className="text-[10px] text-gris-dark truncate max-w-[110px]" title={c.foto.nombre_archivo}>{c.foto.nombre_archivo}</span>
        )}
      </div>
    </div>
  )
}
