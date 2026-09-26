'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { subirComprobantePendiente, borrarComprobantePendiente, leerCheque, useCarteraCheques, type ChequeDeCartera } from '../../hooks/usePagos'
import { Modal } from '@/components/ui/Modal'
import { useConfigPagos } from '../../hooks/useConfigPagos'
import {
  MAX_ADJUNTO_BYTES, fechasEscalonadas, fmtFecha, fmtM, partirEnPartes, plazoLabel, sumarDiasISO,
} from '../../utils/pagos.utils'
import { mensajeAvisoLectura, mensajeErrorPagos } from '../../utils/pagos.errores'
import {
  chequeVacio, chequesParaEnviar, estadoCheques, n, nEntero, nombreCheque, r2, type CampoCheque, type ChequeFila,
} from '../../utils/pagoForm'
import { Campo, inputCls } from './Campo'
import type { PagosAdjuntoPendiente, PagosChequeLecturaRes, PagosFormaPagoOP, PagosPlanCheques } from '@/types/domain.types'

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

/**
 * Con cheque o e-cheq el importe SIGUE a los cheques, solo (2026-09-26).
 * Antes había que tocar «Usar lo que suman los cheques»; si no, el pago no
 * se podía registrar («tienen que dar igual»). Cada vez que la suma de los
 * cheques cambia (y no se está leyendo una foto) se reparte entre las
 * facturas con `onRepartir`; lo que sobra va a cuenta.
 *
 * Se sigue la SUMA, no el total: si alguien después toca a mano una fila, no
 * se lo pisa (y el aviso de abajo ofrece volver a los cheques). Se ajusta
 * durante el render, el patrón de React para «estado que sigue a otro», así
 * no hay un render con los números viejos.
 */
export function useTotalSigueALosCheques({ pideCheques, cheques, totalPlata, onRepartir }: {
  pideCheques: boolean
  cheques:     ChequeFila[]
  totalPlata:  number
  onRepartir:  (total: number) => void
}) {
  const suma = r2(cheques.reduce((s, c) => s + n(c.monto), 0))
  const leyendo = cheques.some(c => c.leyendo)
  const [seguida, setSeguida] = useState<number | null>(null)
  if (pideCheques && !leyendo && cheques.length > 0 && suma > 0 && suma !== seguida) {
    setSeguida(suma)
    if (Math.abs(suma - totalPlata) >= 0.005) onRepartir(suma)
  }
}

interface Opciones {
  fecha:       string
  totalPlata:  number
  forma:       PagosFormaPagoOP
  pideCheques: boolean
  /** El plan anotado en la factura al cargarla (20260923n), si hay. */
  planFactura: PagosPlanCheques | null
  /** Cheques ya leídos antes de abrir (los que se soltaron en Compras › Pagos). */
  chequesIniciales?: ChequeFila[]
}

export function useEditorCheques({ fecha, totalPlata, forma, pideCheques, planFactura, chequesIniciales }: Opciones) {
  const toast = useToast()
  const [cheques, setCheques] = useState<ChequeFila[]>(() => chequesIniciales ?? [])
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
    // La foto anterior de esta fila ya no va: se borra del bucket, salvo que
    // otra fila la comparta (un archivo con varios cheques).
    if (previa?.foto && !fotoCompartida(previa.foto.storage_path, uid)) borrarComprobantePendiente(previa.foto.storage_path).catch(() => {})
    setChequeUid(uid, { foto: adj, fotoUrl: url })
    try {
      const r = await leerCheque(adj)
      const foto = r.storage_path ? { ...adj, storage_path: r.storage_path } : adj
      const lecturas = r.cheques?.length ? r.cheques : [{ propuesta: r.propuesta, avisos: r.avisos }]
      // Un archivo con varios cheques (el PDF del banco con la emisión y los
      // endosos): la primera lectura completa esta fila y cada una de las
      // demás es una fila nueva justo debajo, con el MISMO archivo como
      // comprobante (el backend lo adjunta una vez con todos los números).
      const extra = lecturas.slice(1).map(() => chequeVacio('', ''))
      setCheques(cs => cs.flatMap(c => {
        if (c.uid !== uid) return [c]
        const [primera, ...resto] = lecturas
        const avisoVarios = lecturas.length > 1
          ? [`Este archivo trae ${lecturas.length} cheques: se agregaron en ${lecturas.length} filas con el mismo comprobante.`] : []
        const esta = filaDesdeLectura(c, primera!, forma)
        return [
          { ...esta, foto, fotoUrl: url, avisosFoto: [...avisoVarios, ...esta.avisosFoto] },
          ...resto.map((l, k) => ({ ...filaDesdeLectura({ ...extra[k]!, es_propio: c.es_propio }, l, forma), foto, fotoUrl: url })),
        ]
      }))
    } catch (e) {
      setChequeUid(uid, { leyendo: false, avisosFoto: [`${mensajeErrorPagos(e)} La foto queda adjunta igual.`] })
    }
  }

  /**
   * «🏦 Elegir de la cartera» (20260930n): cheques de terceros que ya están
   * en la cartera de cheques recibidos. Entran como «De tercero» con el
   * librador, el banco, la fecha y el importe de la cartera; las filas en
   * blanco se reemplazan y uno que ya está cargado no se repite.
   */
  function agregarDeCartera(lista: ChequeDeCartera[]) {
    const yaCargados = new Set(cheques.map(c => `${c.numero.replace(/\D/g, '').replace(/^0+/, '')}|${r2(n(c.monto))}`))
    const nuevos = lista
      .filter(x => !yaCargados.has(`${x.numero.replace(/^0+/, '')}|${r2(Number(x.importe))}`))
      .map(x => ({
        ...chequeVacio(x.fecha_cobro ?? '', String(x.importe)),
        numero: x.numero, banco: x.banco ?? '', es_propio: false,
        librador: [x.librador, x.librador_cuit ? `CUIT ${x.librador_cuit}` : null].filter(Boolean).join(' · '),
        avisosFoto: [`De la cartera: lo dio ${x.recibido_de ?? '—'}${x.recibido_el ? ` el ${fmtFecha(x.recibido_el)}` : ''}.`],
      }))
    if (nuevos.length === 0) { toast('Esos cheques ya están cargados en este pago', 'warn'); return }
    const enBlanco = (c: ChequeFila) => !c.foto && !c.leyendo && !c.numero.trim()
    setCheques(cs => [...cs.filter(c => !enBlanco(c)), ...nuevos])
  }

  /** «📷 Agregar desde foto»: una fila nueva que arranca con la foto. */
  function agregarDesdeFoto(file: File) {
    agregarDesdeArchivos([file])
  }

  /**
   * Varios comprobantes de una vez (arrastrados o elegidos juntos, 2026-09-25):
   * una fila por archivo, cada una se lee sola. Nació con cinco cheques
   * endosados al mismo proveedor que había que subir de a uno.
   *
   * Las filas que están en blanco (sin comprobante ni número, típicamente las
   * de «Generar») se reemplazan: los archivos SON los cheques. Las que ya
   * tienen algo se respetan y las nuevas van al final.
   * Se leen de a 3 a la vez para no disparar diez lecturas juntas.
   */
  function agregarDesdeArchivos(files: File[]) {
    const validos = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf')
    const descartados = files.length - validos.length
    if (descartados > 0) toast(`${descartados} archivo${descartados === 1 ? '' : 's'} no ${descartados === 1 ? 'es' : 'son'} foto ni PDF: no se ${descartados === 1 ? 'agregó' : 'agregaron'}.`, 'err')
    if (validos.length === 0) return
    // Arrancan «leyendo»: las que esperan turno no piden el comprobante que ya tienen.
    const nuevos = validos.map(() => ({ ...chequeVacio('', ''), leyendo: true }))
    const enBlanco = (c: ChequeFila) => !c.foto && !c.leyendo && !c.numero.trim()
    const reemplazadas = cheques.filter(enBlanco).length
    setCheques(cs => [...cs.filter(c => !enBlanco(c)), ...nuevos])
    if (validos.length > 1 || reemplazadas > 0) {
      toast(`Leyendo ${validos.length} comprobante${validos.length === 1 ? '' : 's'}${reemplazadas > 0 ? ` (reemplazan ${reemplazadas} fila${reemplazadas === 1 ? '' : 's'} en blanco)` : ''}…`, 'ok')
    }
    const cola = nuevos.map((c, i) => ({ uid: c.uid, file: validos[i]! }))
    const trabajar = async () => {
      for (let t = cola.shift(); t; t = cola.shift()) await leerFotoCheque(t.uid, t.file)
    }
    // La cantidad se fija ANTES: cada trabajador saca de la cola al arrancar.
    const trabajadores = Math.min(3, cola.length)
    for (let k = 0; k < trabajadores; k++) void trabajar()
  }

  /** ¿Otra fila usa el mismo archivo? (un PDF con varios cheques) */
  function fotoCompartida(path: string, uidPropio: number): boolean {
    return cheques.some(o => o.uid !== uidPropio && o.foto?.storage_path === path)
  }

  function quitarCheque(i: number) {
    const c = cheques[i]
    if (c?.foto && !fotoCompartida(c.foto.storage_path, c.uid)) borrarComprobantePendiente(c.foto.storage_path).catch(() => {})
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
    return [...new Set(cheques.flatMap(c => c.foto ? [c.foto.storage_path] : []))]
  }

  return {
    cheques, cantCheques, setCantCheques, primerPlazo, setPrimerPlazo, opcionesPlazo, cadaDias, setCadaDias,
    totalCheques, difCheques, incompletos, leyendo,
    setCheque, setChequeAMano, leerFotoCheque, agregarDesdeFoto, agregarDesdeArchivos, agregarDeCartera, quitarCheque, generarCheques, plazoDe,
    agregarCheque, ajustarUltimoCheque, fotosSubidas,
    paraEnviar: () => chequesParaEnviar(cheques),
  }
}

export type EditorChequesEstado = ReturnType<typeof useEditorCheques>

/** Lo que devuelve la lectura por cada cheque del archivo. */
export type LecturaCheque = NonNullable<PagosChequeLecturaRes['cheques']>[number]

/** Una lectura del backend sobre una fila: completa lo leído y lo marca. */
export function filaDesdeLectura(c: ChequeFila, l: Pick<LecturaCheque, 'propuesta' | 'avisos'>, forma: PagosFormaPagoOP): ChequeFila {
  const p = l.propuesta
  const cambio: Partial<ChequeFila> = {}
  const leidos: CampoCheque[] = []
  if (p.numero?.trim())      { cambio.numero = p.numero.trim(); leidos.push('numero') }
  if (p.banco?.trim())       { cambio.banco = p.banco.trim(); leidos.push('banco') }
  if (p.fecha_cobro)         { cambio.fecha_cobro = p.fecha_cobro.slice(0, 10); leidos.push('fecha_cobro') }
  if (p.importe != null && p.importe > 0) { cambio.monto = String(p.importe); leidos.push('monto') }
  const librador = [p.librador?.trim(), p.librador_cuit ? `CUIT ${p.librador_cuit}` : null].filter(Boolean).join(' · ')
  // Un endoso (o un cheque que la foto dice que libró otro) queda «De
  // tercero» solo; el backend ya le puso el librador, o «No informado…».
  const esPropio = p.es_propio === false ? false : c.es_propio
  if (!esPropio && c.es_propio) cambio.es_propio = false
  // El librador sólo se usa si el cheque es de un tercero: si está como
  // propio se guarda para ofrecerlo al tildar «De tercero».
  if (librador && !esPropio) { cambio.librador = librador; leidos.push('librador') }
  const avisos = (l.avisos ?? []).map(a => mensajeAvisoLectura(a)).filter(Boolean)
  if (p.es_echeq && forma === 'cheque') avisos.push('La foto parece de un e-cheq, y la forma de pago elegida es cheque.')
  if (leidos.length === 0) avisos.push('No se pudo sacar ningún dato de la foto: cargalos a mano. La foto queda adjunta igual.')
  return {
    ...c, ...cambio, leyendo: false, libradorLeido: librador,
    leidos: [...new Set([...c.leidos, ...leidos])], avisosFoto: avisos,
  }
}

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
  const [eligiendo, setEligiendo] = useState(false)
  // Arrastrar varios comprobantes encima del recuadro: una fila por archivo.
  // El contador evita el parpadeo al pasar por encima de los hijos.
  const [arrastrando, setArrastrando] = useState(0)
  const conArchivos = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  // El mismo número en dos filas: casi siempre es el mismo archivo subido dos veces.
  const repetidos = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const c of cheques) { const k = c.numero.replace(/\D/g, '').replace(/^0+/, ''); if (k) cuenta.set(k, (cuenta.get(k) ?? 0) + 1) }
    return new Set([...cuenta].filter(([, v]) => v > 1).map(([k]) => k))
  }, [cheques])
  return (
    <div className={`border rounded relative ${arrastrando > 0 ? 'border-naranja ring-2 ring-naranja/40' : 'border-gris-mid'}`}
      onDragEnter={e => { if (!conArchivos(e)) return; e.preventDefault(); e.stopPropagation(); setArrastrando(v => v + 1) }}
      onDragOver={e => { if (!conArchivos(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={e => { if (!conArchivos(e)) return; e.stopPropagation(); setArrastrando(v => Math.max(0, v - 1)) }}
      onDrop={e => {
        if (!conArchivos(e)) return
        e.preventDefault(); e.stopPropagation(); setArrastrando(0)
        ed.agregarDesdeArchivos(Array.from(e.dataTransfer.files))
      }}>
      {arrastrando > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-naranja-light/90 pointer-events-none">
          <span className="text-sm font-bold text-naranja text-center px-4">
            Soltá los comprobantes: una fila por cada {forma === 'echeq' ? 'e-cheq' : 'cheque'}, se completan solas
          </span>
        </div>
      )}
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
          {!c.leyendo && repetidos.has(c.numero.replace(/\D/g, '').replace(/^0+/, '')) && (
            <div className="text-[11px] text-rojo font-semibold">⚠ Hay otra fila con el número {c.numero}: ¿el mismo comprobante dos veces?</div>
          )}
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
            Los cheques suman <b className="font-mono">{fmtM(totalCheques)}</b> y en las facturas se está
            pagando <b className="font-mono">{fmtM(totalPlata)}</b> (tocaste una fila a mano). Tienen que dar igual.
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
          title="Una fila nueva por cada foto o PDF de cheque: se completan solas y cada archivo queda como su comprobante. Podés elegir varios juntos o arrastrarlos al recuadro">
          📷 Agregar desde fotos o PDF
          {/* Sin `capture`: forzaría la cámara y no dejaría elegir varios PDF. */}
          <input type="file" className="hidden" accept="image/*,application/pdf" multiple
            onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) ed.agregarDesdeArchivos(files) }} />
        </label>
        <span className="text-[11px] text-gris-dark hidden sm:inline">o arrastrá varios acá</span>
        <Button variant="ghost" size="sm" onClick={() => setEligiendo(true)}
          title="Cheques de terceros que ya están en la cartera (recibidos en cobros): se cargan con su librador, banco, fecha e importe">
          🏦 Elegir de la cartera
        </Button>
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
      {eligiendo && <ModalCartera onClose={() => setEligiendo(false)} onElegir={l => { ed.agregarDeCartera(l); setEligiendo(false) }} />}
    </div>
  )
}

/**
 * La cartera de cheques recibidos para tildar los que se endosan en este
 * pago (20260930n). Muestra de quién vino cada uno; los vencidos (fecha de
 * cobro pasada) quedan marcados: casi seguro ya se depositaron.
 */
function ModalCartera({ onClose, onElegir }: { onClose: () => void; onElegir: (l: ChequeDeCartera[]) => void }) {
  const { data = [], isLoading, isError } = useCarteraCheques(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [verVencidos, setVerVencidos] = useState(false)
  const qn = q.trim().toLowerCase()
  const lista = data.filter(c => (verVencidos || !c.vencido)
    && (!qn || [c.numero, c.librador, c.banco, c.recibido_de].some(x => (x ?? '').toLowerCase().includes(qn))))
  const elegidos = data.filter(c => sel.has(c.id))
  const suma = elegidos.reduce((t, c) => t + Number(c.importe), 0)
  const alternar = (id: number) => setSel(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x })
  return (
    <Modal open onClose={onClose} title="Elegir cheques de la cartera" width="max-w-3xl"
      footer={
        <div className="flex gap-2 items-center justify-end">
          <span className="text-xs text-gris-dark mr-auto">{elegidos.length} elegido{elegidos.length === 1 ? '' : 's'} · <b className="font-mono tabular-nums">{fmtM(suma)}</b></span>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => onElegir(elegidos)} disabled={elegidos.length === 0}>Agregar al pago</Button>
        </div>
      }>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex gap-2 items-center flex-wrap">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Número, librador, banco, quién lo dio…" className={`${inputCls} flex-1 min-w-[220px]`} />
          <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={verVencidos} onChange={e => setVerVencidos(e.target.checked)} /> Ver también los vencidos
          </label>
        </div>
        {isLoading ? <div className="text-xs text-gris-dark p-4 text-center">Cargando la cartera…</div>
          : isError ? <div className="text-xs text-rojo p-4 text-center">No se pudo leer la cartera.</div>
          : lista.length === 0 ? <div className="text-xs text-gris-dark p-4 text-center">No hay cheques en cartera{qn ? ' con esa búsqueda' : ''}.</div>
          : (
            <div className="border border-gris-mid rounded max-h-[50vh] overflow-y-auto">
              {lista.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-gris last:border-0 cursor-pointer hover:bg-gris/30 text-xs">
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} />
                  <span className="font-mono w-24">{c.numero}</span>
                  <span className={`w-20 ${c.vencido ? 'text-naranja-dark font-semibold' : ''}`}>{c.fecha_cobro ? fmtFecha(c.fecha_cobro) : '—'}</span>
                  <span className="flex-1 min-w-0 truncate" title={c.librador ?? undefined}>{c.librador ?? '—'}{c.banco ? <span className="text-gris-dark"> · {c.banco}</span> : null}</span>
                  <span className="text-gris-dark truncate max-w-[140px]" title={c.recibido_de ?? undefined}>{c.recibido_de ?? ''}</span>
                  <span className="font-mono tabular-nums w-28 text-right font-bold">{fmtM(Number(c.importe))}</span>
                </label>
              ))}
            </div>
          )}
        <p className="text-[11px] text-gris-dark">
          Entran como «De tercero» con el librador de la cartera. Si es un e-cheq, igual hay que subir el comprobante del endoso en su fila.
          Al registrar el pago, la cartera los marca endosados.
        </p>
      </div>
    </Modal>
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
