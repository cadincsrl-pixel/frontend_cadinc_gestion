'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { useCertificados, useEmitirCertificado, useAnularCertificado, fetchCertificado } from '../../hooks/useCuentaCliente'
import { descargarPdfCertificado } from '../../utils/exportCertificado'
import { fmtM, fmtFecha } from './cuentaCorriente.utils'
import type { Obra, CertificadoCliente } from '@/types/domain.types'

/**
 * Certificados al cliente (20260911h): la "presentacion" de la cuenta con
 * nombre propio. Emitir = cortar por fecha, congelar los renglones hasta ahi,
 * llevar el precio de deposito al catalogo del dia y sumar la mano de obra por
 * avance. Despues, el pago se imputa contra el certificado (PagosCliente).
 * Anular es de admin: deshace una presentacion que el cliente puede tener.
 */
export function CertificadosSection({ obra, puedeEmitir, esAdmin }: { obra: Obra; puedeEmitir: boolean; esAdmin: boolean }) {
  const toast = useToast()
  const { data: certificados = [], isLoading } = useCertificados(obra.cod)
  const { mutate: emitir, isPending: emitiendo } = useEmitirCertificado()
  const { mutate: anular, isPending: anulando } = useAnularCertificado()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ fecha_corte: toISO(new Date()), mano_de_obra: '', obs: '' })
  const [anulandoCert, setAnulandoCert] = useState<CertificadoCliente | null>(null)
  const [motivo, setMotivo] = useState('')
  const [descargando, setDescargando] = useState<number | null>(null)

  function abrir() {
    setForm({ fecha_corte: toISO(new Date()), mano_de_obra: '', obs: '' })
    setModal(true)
  }

  function confirmarEmision() {
    const mo = Number(form.mano_de_obra || 0)
    if (!form.fecha_corte) { toast('Elegí la fecha de corte', 'err'); return }
    if (!Number.isFinite(mo) || mo < 0) { toast('La mano de obra tiene que ser un número', 'err'); return }
    emitir({ obra_cod: obra.cod, fecha_corte: form.fecha_corte, mano_de_obra: mo, obs: form.obs || null }, {
      onSuccess: r => {
        setModal(false)
        const partes = [`Certificado N° ${r.numero} emitido: ${r.renglones} renglones, ${fmtM(Number(r.total))}`]
        if (r.retasados > 0) partes.push(`${r.retasados} pasaron al precio del catálogo`)
        if (r.sin_precio_excluidos > 0) partes.push(`${r.sin_precio_excluidos} quedaron afuera por estar en $0`)
        toast(partes.join(' · '), r.sin_precio_excluidos > 0 ? 'warn' : 'ok')
      },
      onError: err => {
        const code = (err as { body?: { error?: string } })?.body?.error
        if (code === 'SIN_PERMISO_CARGAR_PRECIOS') toast('Emitir certificados es del dueño (flag cargar_precios)', 'err')
        else if (code === 'OBRA_ARCHIVADA') toast('La obra está archivada', 'err')
        else if (code === 'OBRA_ES_DEPOSITO') toast('El depósito no certifica', 'err')
        else toast('No se pudo emitir el certificado', 'err')
      },
    })
  }

  async function pdf(c: CertificadoCliente) {
    setDescargando(c.id)
    try { descargarPdfCertificado(await fetchCertificado(c.id), obra) }
    catch { toast('No se pudo armar el PDF', 'err') }
    finally { setDescargando(null) }
  }

  function confirmarAnulacion() {
    if (!anulandoCert) return
    if (motivo.trim().length < 3) { toast('Escribí el motivo', 'err'); return }
    anular({ id: anulandoCert.id, motivo: motivo.trim() }, {
      onSuccess: r => { setAnulandoCert(null); setMotivo(''); toast(`Certificado anulado: ${r.renglones_liberados} renglones vuelven a la cuenta`, 'ok') },
      onError: err => {
        const code = (err as { body?: { error?: string } })?.body?.error
        if (code === 'CERTIFICADO_CON_COBROS') toast('Tiene cobros imputados: eliminá esos pagos primero', 'err')
        else if (code === 'SOLO_ADMIN') toast('Anular un certificado es de admin', 'err')
        else toast('No se pudo anular', 'err')
      },
    })
  }

  const emitidos = certificados.filter(c => c.estado === 'emitido')
  const totalCertificado = emitidos.reduce((s, c) => s + Number(c.total), 0)

  return (
    <section className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-carbon">Certificados al cliente</h3>
          <p className="text-[11px] text-gris-dark">
            {emitidos.length === 0
              ? 'Todavía no se presentó ningún certificado de esta obra.'
              : `${emitidos.length} emitido${emitidos.length !== 1 ? 's' : ''} · ${fmtM(totalCertificado)} certificados en total`}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={abrir} disabled={!puedeEmitir}
          title={puedeEmitir ? 'Cortar la cuenta a una fecha, congelar los materiales y sumar la mano de obra' : 'Emitir certificados es del dueño (flag cargar_precios)'}>
          📄 Presentar certificado
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-gris-dark">Cargando…</p>
      ) : certificados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gris-dark text-left">
                <th className="py-1 pr-2">N°</th><th className="py-1 pr-2">Corte</th><th className="py-1 pr-2">Emitido</th>
                <th className="py-1 pr-2 text-right">Mano de obra</th><th className="py-1 pr-2 text-right">Materiales</th>
                <th className="py-1 pr-2 text-right">Total</th><th className="py-1 pr-2">Estado</th><th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {certificados.map(c => (
                <tr key={c.id} className={'border-t border-gris ' + (c.estado === 'anulado' ? 'opacity-50 line-through' : '')}>
                  <td className="py-1.5 pr-2 font-mono font-bold">{c.numero}</td>
                  <td className="py-1.5 pr-2">{fmtFecha(c.fecha_corte)}</td>
                  <td className="py-1.5 pr-2">{fmtFecha(c.fecha_emision)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmtM(Number(c.mano_de_obra))}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmtM(Number(c.total_materiales))} <span className="text-gris-dark">({c.renglones})</span></td>
                  <td className="py-1.5 pr-2 text-right font-mono font-bold">{fmtM(Number(c.total))}</td>
                  <td className="py-1.5 pr-2">
                    <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (c.estado === 'emitido' ? 'bg-azul-light text-azul' : 'bg-gris text-gris-dark')}>{c.estado}</span>
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => pdf(c)} loading={descargando === c.id} title="PDF del certificado">⬇ PDF</Button>
                    {esAdmin && c.estado === 'emitido' && (
                      <Button variant="ghost" size="sm" onClick={() => { setAnulandoCert(c); setMotivo('') }} title="Anular (solo admin)">✕</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={`Presentar certificado · ${obra.nom}`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gris-dark">
            Entran todos los materiales a cargo del cliente hasta la fecha de corte que todavía no estén en otro certificado.
            Al emitir se congelan y los de depósito pasan al precio del catálogo de ese día. Los que estén en $0 quedan afuera.
          </p>
          <Input label="Fecha de corte" type="date" value={form.fecha_corte} onChange={e => setForm(f => ({ ...f, fecha_corte: e.target.value }))} />
          <InputMonto label="Mano de obra por avance ($)" placeholder="0" value={form.mano_de_obra} onChange={raw => setForm(f => ({ ...f, mano_de_obra: raw }))} />
          <Input label="Nota (opcional)" placeholder="Qué avance certifica, referencia…" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setModal(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={confirmarEmision} loading={emitiendo}>Emitir</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!anulandoCert} onClose={() => setAnulandoCert(null)} title={anulandoCert ? `Anular certificado N° ${anulandoCert.numero}` : ''}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gris-dark">Los renglones vuelven a la cuenta sin certificar. Los precios quedan como están. No se puede anular si tiene cobros imputados.</p>
          <Input label="Motivo" placeholder="Por qué se anula" value={motivo} onChange={e => setMotivo(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setAnulandoCert(null)}>Cancelar</Button>
            <Button variant="danger" size="sm" onClick={confirmarAnulacion} loading={anulando}>Anular</Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
