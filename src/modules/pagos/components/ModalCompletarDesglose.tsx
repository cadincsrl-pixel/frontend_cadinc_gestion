'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { aRaw } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useCompletarDesglose, leerAdjuntoFactura, fetchPagosAdjuntoSignedUrl } from '../hooks/usePagos'
import { leerQrDelArchivo } from '../utils/qrFactura'
import { resumirDesglose } from '../utils/desglose'
import { fmtM } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import { DesgloseArca, type FilaIva, type FilaTributo, type Fuente } from './ModalCargarFactura'
import type { PagosDesgloseInput, PagosDesgloseLeidoRes, PagosFacturaDetalle } from '@/types/domain.types'

/**
 * Completar el desglose impositivo de una factura YA CARGADA (20260924v),
 * aunque esté pagada: IVA por alícuota, no gravado, exento, percepciones y
 * CAE, para el Libro IVA de compras.
 *
 * Lo que NO se puede: cambiar la plata. El desglose tiene que sumar el total
 * que ya tiene la factura (no se edita acá), y las percepciones tienen que dar
 * lo mismo que las cargadas — de ellas cuelga lo imputado a las obras (total −
 * percepciones). Si hoy son 0 y el papel trae percepciones, la base lo frena
 * salvo que un administrador fuerce (y ahí la imputación de una sola obra se
 * ajusta sola). Todo esto lo vuelve a validar la base.
 *
 * «Leer del comprobante» corre la misma lectura que al cargar (QR buscado acá
 * en el navegador + IA en el backend) sobre el adjunto «Factura» ya guardado,
 * y precarga las grillas. No guarda nada hasta «Guardar desglose».
 */

const n = (s: string) => {
  const v = Number(aRaw(String(s), 2))
  return Number.isFinite(v) ? v : 0
}
const r2 = (v: number) => Math.round(v * 100) / 100

interface Props {
  factura: PagosFacturaDetalle
  onClose: () => void
}

export function ModalCompletarDesglose({ factura: f, onClose }: Props) {
  const toast = useToast()
  const { puedeEditar, esAdmin } = usePermisos('pagos')
  const completar = useCompletarDesglose()

  // Arranca con lo que ya tenga (si estaba a revisar) o con una fila de 21 % en las A.
  const [filasIva, setFilasIva] = useState<FilaIva[]>(() =>
    (f.iva_detalle ?? []).length
      ? (f.iva_detalle ?? []).map(x => ({ alicuota_id: x.alicuota_id, base: String(x.base_imp), importe: String(x.importe), auto: false }))
      : f.tipo_comprobante === 'A' ? [{ alicuota_id: 5, base: '', importe: '', auto: true }] : [])
  const [tributos, setTributos] = useState<FilaTributo[]>(() =>
    (f.tributos ?? []).map(t => ({ tipo: t.tipo, jurisdiccion: t.jurisdiccion ?? '', descripcion: t.descripcion ?? '', importe: String(t.importe) })))
  const [neto, setNeto] = useState('')
  const [noGravado, setNoGravado] = useState(f.no_gravado ? String(f.no_gravado) : '')
  const [exento, setExento] = useState(f.exento ? String(f.exento) : '')
  const [cae, setCae] = useState(f.cae ?? '')
  const [caeVto, setCaeVto] = useState(f.cae_vto ?? '')
  const [cbteArca, setCbteArca] = useState<number | null>(f.cbte_tipo_arca ?? null)
  const [fuentes, setFuentes] = useState<Record<string, Fuente>>({})
  const [forzar, setForzar] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [lectura, setLectura] = useState<PagosDesgloseLeidoRes | null>(null)

  const adjunto = f.adjuntos.find(a => a.tipo === 'factura' && !a.borrado)
  const total = Number(f.total)
  const percActuales = r2(Number(f.percepciones ?? 0))

  const ivaValidas = filasIva.filter(x => n(x.base) || n(x.importe))
  const tribValidos = tributos.filter(t => n(t.importe) > 0)
  const resumen = resumirDesglose({
    iva: ivaValidas.map(x => ({ alicuota_id: x.alicuota_id, base: n(x.base), importe: n(x.importe) })),
    tributos: tribValidos.map(t => ({ tipo: t.tipo, importe: n(t.importe) })),
    neto: n(neto), noGravado: n(noGravado), exento: n(exento), total,
  })
  const cambiaPerc = Math.round(resumen.percepciones * 100) !== Math.round(percActuales * 100)
  const forzable = cambiaPerc && percActuales === 0 && esAdmin
  const sinIva = f.tipo_comprobante === 'A' && ivaValidas.length === 0 && n(noGravado) + n(exento) === 0
  const caeOk = !cae.trim() || /^\d{14}$/.test(cae.trim())

  const motivoNo =
    !puedeEditar ? 'No tenés permiso para editar facturas'
    : !resumen.cierra ? `El desglose tiene que sumar el total de la factura (${fmtM(total)})`
    : sinIva ? 'Una factura A lleva al menos una alícuota de IVA (o exento / no gravado)'
    : !caeOk ? 'El CAE tiene 14 dígitos'
    : cambiaPerc && !(forzable && forzar)
      ? (percActuales !== 0
          ? `Las percepciones tienen que sumar ${fmtM(percActuales)}, como las cargadas`
          : esAdmin ? 'Tildá «Forzar» para cargar percepciones: cambia lo imputado a las obras'
                    : 'Las percepciones cambian lo imputado a las obras: sólo un administrador puede cargarlas acá')
    : null

  async function leer() {
    if (!adjunto) return
    setLeyendo(true)
    try {
      // El QR se busca acá, sobre el mismo archivo firmado (como al cargar).
      let qr: string | null = null
      try {
        const url = await fetchPagosAdjuntoSignedUrl('facturas', f.id, adjunto.id)
        const blob = await (await fetch(url)).blob()
        qr = await leerQrDelArchivo(new File([blob], adjunto.nombre_archivo, { type: adjunto.mime_type }))
      } catch { qr = null }
      const res = await leerAdjuntoFactura(f.id, { adjunto_id: adjunto.id, qr_texto: qr })
      aplicar(res)
      setLectura(res)
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setLeyendo(false)
    }
  }

  function aplicar(res: PagosDesgloseLeidoRes) {
    const d = res.desglose
    const fu = res.fuente_por_campo
    setFilasIva(d.iva_detalle.map(x => ({ alicuota_id: x.alicuota_id, base: String(x.base_imp), importe: String(x.importe), auto: false })))
    setTributos(d.tributos.map(t => ({ tipo: t.tipo, jurisdiccion: t.jurisdiccion ?? '', descripcion: t.descripcion ?? '', importe: String(t.importe) })))
    setNeto(d.iva_detalle.length === 0 && d.neto != null ? String(d.neto) : '')
    setNoGravado(d.no_gravado ? String(d.no_gravado) : '')
    setExento(d.exento ? String(d.exento) : '')
    if (d.cae) setCae(d.cae)
    if (d.cae_vto) setCaeVto(d.cae_vto)
    if (d.cbte_tipo_arca) setCbteArca(d.cbte_tipo_arca)
    const nuevo: Record<string, Fuente> = {}
    for (const k of ['iva', 'tributos', 'neto', 'no_gravado', 'exento'] as const) if (fu[k]) nuevo[k] = fu[k]
    setFuentes(nuevo)
  }

  async function guardar() {
    const body: PagosDesgloseInput & { id: number; forzar?: boolean } = {
      id: f.id,
      iva_detalle: ivaValidas.map(x => ({ alicuota_id: x.alicuota_id, base_imp: n(x.base), importe: n(x.importe) })),
      tributos: tribValidos.map(t => ({
        tipo: t.tipo, jurisdiccion: t.jurisdiccion.trim() || null, descripcion: t.descripcion.trim(),
        alicuota: null, base_imp: null, importe: n(t.importe),
      })),
      no_gravado: noGravado ? n(noGravado) : null,
      exento: exento ? n(exento) : null,
      neto: ivaValidas.length ? null : (neto ? n(neto) : null),
      cae: cae.trim() || null,
      cae_vto: caeVto || null,
      cbte_tipo_arca: cbteArca,
      ...(forzable && forzar ? { forzar: true } : {}),
    }
    try {
      const r = await completar.mutateAsync(body)
      toast('✓ Desglose completado', 'ok')
      if (r.imputacion_ajustada) toast('Cambiaron las percepciones: se ajustó lo imputado a la obra', 'warn')
      onClose()
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <Modal open onClose={onClose} width="max-w-3xl" title={`Completar desglose · ${f.proveedor_nom}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={completar.isPending}
            disabled={!!motivoNo} title={motivoNo ?? 'Guardar el desglose (el total y lo pagado no cambian)'}>
            Guardar desglose
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          Total de la factura <b className="font-mono tabular-nums text-gris-dark">{fmtM(total)}</b>
          {' · '}percepciones cargadas <b className="font-mono tabular-nums">{fmtM(percActuales)}</b>.
          {' '}El desglose tiene que sumar ese total y no cambia lo pagado.
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={leer} loading={leyendo}
            disabled={!adjunto || !puedeEditar}
            title={!adjunto ? 'La factura no tiene el comprobante adjunto (tipo «Factura»)'
              : !puedeEditar ? 'No tenés permiso para editar facturas'
              : 'Leer el comprobante adjunto (QR de ARCA + lectura) y precargar el desglose'}>
            📄 Leer del comprobante
          </Button>
          {adjunto && <span className="text-[11px] text-gris-dark truncate">{adjunto.nombre_archivo}</span>}
        </div>

        {lectura && <ResultadoLectura r={lectura} />}

        <DesgloseArca
          filasIva={filasIva} setFilasIva={setFilasIva}
          tributos={tributos} setTributos={setTributos}
          neto={neto} setNeto={setNeto}
          noGravado={noGravado} setNoGravado={setNoGravado}
          exento={exento} setExento={setExento}
          resumen={resumen} total={total} tipo={f.tipo_comprobante}
          fuentes={fuentes} disabled={!puedeEditar}
          onQuitar={() => { setFilasIva([]); setTributos([]); setNeto(''); setNoGravado(''); setExento('') }}
        />

        {cambiaPerc && (
          <div className="border rounded p-2 text-xs bg-naranja-light border-naranja/30 text-naranja-dark">
            ⚠ Las percepciones del desglose ({fmtM(resumen.percepciones)}) no son las cargadas ({fmtM(percActuales)}).
            Lo imputado a las obras es el total menos las percepciones: pasaría de {fmtM(r2(total - percActuales))} a {fmtM(resumen.imputable)}.
            {percActuales !== 0
              ? ' Las percepciones ya cargadas no se cambian desde acá.'
              : esAdmin
                ? (
                  <label className="flex items-center gap-1.5 mt-1.5 font-semibold cursor-pointer">
                    <input type="checkbox" checked={forzar} onChange={e => setForzar(e.target.checked)} />
                    Forzar (administrador): cargar las percepciones y ajustar lo imputado a la obra
                  </label>
                )
                : ' Sólo un administrador puede cargarlas en una factura que ya tiene reparto o pagos.'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            <span className="block text-[11px] font-semibold text-gris-dark mb-0.5">CAE</span>
            <input value={cae} onChange={e => setCae(e.target.value.replace(/\D/g, '').slice(0, 14))} disabled={!puedeEditar}
              className="w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-xs font-mono bg-white outline-none focus:border-naranja" />
          </label>
          <label className="text-xs">
            <span className="block text-[11px] font-semibold text-gris-dark mb-0.5">Vencimiento del CAE</span>
            <input type="date" value={caeVto} onChange={e => setCaeVto(e.target.value)} disabled={!puedeEditar}
              className="w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja" />
          </label>
        </div>
      </div>
    </Modal>
  )
}

function ResultadoLectura({ r }: { r: PagosDesgloseLeidoRes }) {
  const c = r.cierre
  const ok = r.completable
  return (
    <div className={`border rounded p-2 text-xs ${ok ? 'bg-verde-light border-verde/40 text-verde' : 'bg-amarillo-light border-amarillo/40 text-[#7A5000]'}`}>
      <div className="font-bold">
        {ok ? '✓ El comprobante cierra con la factura: revisalo y guardalo' : '⚠ El comprobante no cierra solo con la factura: revisalo'}
      </div>
      <div className="mt-0.5">
        Total del papel {c.total_papel != null ? <b className="font-mono tabular-nums">{fmtM(c.total_papel)}</b> : 'no leído'}
        {' · '}factura <b className="font-mono tabular-nums">{fmtM(c.total_factura)}</b>
        {' · '}percepciones del papel <b className="font-mono tabular-nums">{fmtM(c.percepciones_papel)}</b>
        {r.qr_leido ? ' · QR de ARCA leído' : ' · sin QR'}
      </div>
      {r.avisos.filter(a => a.severidad !== 'info').map((a, i) => (
        <div key={i} className="mt-0.5">• {a.mensaje}</div>
      ))}
    </div>
  )
}
