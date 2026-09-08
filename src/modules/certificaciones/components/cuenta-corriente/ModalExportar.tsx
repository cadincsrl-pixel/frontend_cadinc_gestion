'use client'

// Un solo lugar para llevarse la cuenta: el botón "Exportar" abre esto y acá
// están todas las salidas, cada una con una línea que dice para qué sirve.
//
// Antes había cinco botones repartidos en dos cabeceras (Excel, PDF deuda,
// Histórico, y el Excel y PDF de administración) y la pantalla no se entendía
// — el pedido del user fue literal: "está muy sucia, muchos distintos, capaz
// abrir un modal y seleccionar lo que queremos".
//
// Tocás una opción y descarga. El detalle de administración se monta solo si
// la obra está marcada (el hook comparte queries con la sección de arriba, así
// que no duplica ningún request).

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAdministracionCuenta } from './useAdministracionCuenta'
import { descargarAdministracionPdf } from '../../utils/administracionPdf'
import { exportarAdministracionExcel } from '../../utils/administracionExcel'
import type { Obra } from '@/types/domain.types'

export interface OpcionExport {
  key:     string
  grupo:   'pdf' | 'excel'
  icono:   string
  titulo:  string
  desc:    string
  run:     () => void | Promise<void>
  /** Texto del motivo cuando la opción no está disponible. */
  bloqueada?: string
}

export function ModalExportar({ open, onClose, obra, opciones }: {
  open: boolean
  onClose: () => void
  obra?: Obra
  opciones: OpcionExport[]
}) {
  return (
    <Modal open={open} onClose={onClose} title="⬇ EXPORTAR"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <div className="space-y-4">
        <Grupo titulo="📄 PDF — para llevarle al cliente" opciones={opciones.filter(o => o.grupo === 'pdf')} onClose={onClose} />
        {obra?.por_administracion && <FilaAdminPdf obra={obra} onClose={onClose} />}
        <Grupo titulo="📊 Excel — para trabajar" opciones={opciones.filter(o => o.grupo === 'excel')} onClose={onClose} />
        {obra?.por_administracion && <FilaAdminExcel obra={obra} onClose={onClose} />}
      </div>
    </Modal>
  )
}

function Grupo({ titulo, opciones, onClose }: { titulo: string; opciones: OpcionExport[]; onClose: () => void }) {
  if (opciones.length === 0) return null
  return (
    <div>
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">{titulo}</div>
      <div className="space-y-1.5">
        {opciones.map(o => <Fila key={o.key} opcion={o} onClose={onClose} />)}
      </div>
    </div>
  )
}

function Fila({ opcion, onClose }: { opcion: OpcionExport; onClose: () => void }) {
  const toast = useToast()
  const [corriendo, setCorriendo] = useState(false)
  const bloqueada = !!opcion.bloqueada

  async function correr() {
    if (bloqueada || corriendo) return
    setCorriendo(true)
    try {
      await opcion.run()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar', 'err')
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <button onClick={correr} disabled={bloqueada || corriendo}
      title={opcion.bloqueada}
      className={`w-full text-left border-[1.5px] rounded-lg px-3 py-2 transition-colors ${
        bloqueada
          ? 'border-gris-mid bg-gris/40 opacity-50 cursor-not-allowed'
          : 'border-gris-mid bg-white hover:border-naranja hover:bg-naranja-light/40'}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{opcion.icono}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-carbon">{opcion.titulo}{corriendo ? '…' : ''}</div>
          <div className="text-[11px] text-gris-dark leading-tight">{opcion.bloqueada ?? opcion.desc}</div>
        </div>
      </div>
    </button>
  )
}

// ── Las dos salidas de administración ─────────────────────────────────
// Componentes aparte (y no opciones armadas por el padre) porque necesitan el
// hook de datos, y un hook no puede llamarse condicionalmente: acá el
// condicional es montar o no el componente.

function FilaAdminPdf({ obra, onClose }: { obra: Obra; onClose: () => void }) {
  const datos = useAdministracionCuenta(obra)
  return (
    <div className="-mt-2.5">
      <Fila onClose={onClose} opcion={{
        key: 'pdf-admin', grupo: 'pdf', icono: '🧮',
        titulo: 'PDF por administración',
        desc: 'La cuenta completa: jornales, contratistas y materiales con el % adentro, sin mostrarlo. Pagos y saldo.',
        bloqueada: datos.cargando ? 'Cargando los datos de administración…' : !datos.vigente ? 'La obra no tiene porcentajes cargados' : undefined,
        run: () => descargarAdministracionPdf({ obra, semanas: datos.semanas, meses: datos.meses, tot: datos.tot, cobros: datos.cobros }),
      }} />
    </div>
  )
}

function FilaAdminExcel({ obra, onClose }: { obra: Obra; onClose: () => void }) {
  const datos = useAdministracionCuenta(obra)
  return (
    <div className="-mt-2.5">
      <Fila onClose={onClose} opcion={{
        key: 'excel-admin', grupo: 'excel', icono: '🧮',
        titulo: 'Excel por administración',
        desc: 'Semana por semana y mes por mes, con costo, % y facturable a la vista. Para uso interno.',
        bloqueada: datos.cargando ? 'Cargando los datos de administración…' : !datos.vigente ? 'La obra no tiene porcentajes cargados' : undefined,
        run: () => exportarAdministracionExcel({ obra, semanas: datos.semanas, meses: datos.meses, tot: datos.tot, cobros: datos.cobros }),
      }} />
    </div>
  )
}
