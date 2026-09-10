'use client'

// El modal de exportar la cuenta de una obra: elegís PDF o Excel, tildás qué
// secciones querés, y sale UN documento armado con eso — el mismo patrón de
// selección que los exports de tarja.
//
// Reemplaza a la lista de documentos prearmados (PDF deuda / histórico /
// administración…): en vez de cinco variantes fijas, las secciones se
// combinan. "¿Y si quiero mezclar deuda de materiales con jornales y
// contratistas?" — tildás esas tres y listo.
//
// Reglas que se respetan siempre:
//   · El PDF es para el cliente: montos finales, sin el %. El Excel es
//     interno: costo, % y facturable.
//   · El resumen y el saldo son de la cuenta ENTERA aunque el detalle esté
//     filtrado: la deuda de la obra es una sola.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAdministracionCuenta, type CuentaAdministracion } from './useAdministracionCuenta'
import { useCobrosCliente, useNotasCredito } from '../../hooks/useCuentaCliente'
import { fetchCuentaRenglonesTodos, CUENTA_CORRIENTE_KEY } from '../../hooks/useCuentaCorriente'
import { descargarPdfCuenta, descargarExcelCuenta, type SeleccionExport } from '../../utils/exportCuenta'
import type { Obra, CuentaClienteCobro } from '@/types/domain.types'

export function ModalExportar({ open, onClose, obra }: {
  open: boolean
  onClose: () => void
  obra: Obra
}) {
  if (!open) return null
  // El condicional es montar el componente, no llamar el hook: los datos de
  // administración solo se buscan si la obra está marcada.
  return obra.por_administracion
    ? <CuerpoConAdmin obra={obra} onClose={onClose} />
    : <Cuerpo obra={obra} onClose={onClose} />
}

function CuerpoConAdmin({ obra, onClose }: { obra: Obra; onClose: () => void }) {
  const admin = useAdministracionCuenta(obra)
  return <Cuerpo obra={obra} onClose={onClose} admin={admin} />
}

function Cuerpo({ obra, onClose, admin }: {
  obra: Obra
  onClose: () => void
  admin?: CuentaAdministracion
}) {
  const toast = useToast()
  const esAdmin = !!admin
  const [formato, setFormato] = useState<'pdf' | 'excel'>('pdf')
  const [sel, setSel] = useState<SeleccionExport>({
    resumen: true,
    jornales: esAdmin,
    contratistas: esAdmin,
    materiales: true,
    modoMateriales: 'deuda',
    pagos: true,
  })
  const [exportando, setExportando] = useState(false)

  // Los renglones de la cuenta (a cobrar + cobrado) y los pagos: se buscan al
  // abrir el modal, no al apretar exportar, así el botón responde al toque.
  const { data: renglones = [], isLoading: cargandoRenglones } = useQuery({
    queryKey: [...CUENTA_CORRIENTE_KEY, 'export', obra.cod],
    queryFn: () => fetchCuentaRenglonesTodos({ obra_cod: obra.cod, estados: ['a_cobrar', 'cobrado'], archivadas: true }),
    staleTime: 60_000,
  })
  const { data: cobros = [] } = useCobrosCliente(obra.cod)
  // Devoluciones ya cobradas: el PDF las muestra como línea propia para que
  // el cliente vea de dónde sale la diferencia con lo que se le facturó.
  const { data: notas = [] } = useNotasCredito(obra.cod)

  const cargando = cargandoRenglones || (esAdmin && admin.cargando)
  const nadaTildado = !sel.resumen && !sel.jornales && !sel.contratistas && !sel.materiales && !sel.pagos
  const toggle = (k: 'resumen' | 'jornales' | 'contratistas' | 'materiales' | 'pagos') =>
    setSel(s => ({ ...s, [k]: !s[k] }))

  async function exportar() {
    if (nadaTildado || cargando || exportando) return
    setExportando(true)
    try {
      const datos = { obra, renglones, cobros: cobros as CuentaClienteCobro[], notas, admin }
      if (formato === 'pdf') descargarPdfCuenta(sel, datos)
      else await descargarExcelCuenta(sel, datos)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar', 'err')
    } finally {
      setExportando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="⬇ EXPORTAR LA CUENTA"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={exportar} loading={exportando}
          disabled={nadaTildado || cargando}
          title={nadaTildado ? 'Tildá al menos una sección' : undefined}>
          ⬇ Exportar {formato === 'pdf' ? 'PDF' : 'Excel'}
        </Button>
      </>}>
      <div className="space-y-4">

        {/* Formato */}
        <div className="grid grid-cols-2 gap-2">
          {([['pdf', '📄 PDF', 'Para llevarle al cliente: montos finales, sin porcentajes'],
             ['excel', '📊 Excel', 'Para trabajar: costo, % y facturable a la vista']] as const)
            .map(([k, etiqueta, desc]) => (
            <button key={k} onClick={() => setFormato(k)}
              className={`text-left border-[1.5px] rounded-lg px-3 py-2 transition-colors ${
                formato === k ? 'border-naranja bg-naranja-light/50' : 'border-gris-mid bg-white hover:border-gris-dark'}`}>
              <div className="text-sm font-bold text-carbon">{etiqueta}</div>
              <div className="text-[10px] text-gris-dark leading-tight">{desc}</div>
            </button>
          ))}
        </div>

        {/* Secciones */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">Qué va adentro</div>
          <div className="space-y-1">
            <Tilde activo={sel.resumen} onToggle={() => toggle('resumen')}
              titulo="Resumen y saldo" desc="Los totales de la cuenta entera y lo que queda a cobrar." />
            {esAdmin && (
              <>
                <Tilde activo={sel.jornales} onToggle={() => toggle('jornales')}
                  titulo="Jornales (mano de obra)" desc="Semana por semana, con el % pactado adentro." />
                <Tilde activo={sel.contratistas} onToggle={() => toggle('contratistas')}
                  titulo="Contratistas" desc="Las certificaciones semanales, con su %." />
              </>
            )}
            <Tilde activo={sel.materiales} onToggle={() => toggle('materiales')}
              titulo="Materiales" desc="El detalle renglón por renglón." />
            {sel.materiales && (
              <div className="ml-7 flex gap-3 py-0.5">
                {([['deuda', 'Solo lo adeudado'], ['todo', 'Todo, cobrado incluido']] as const).map(([k, etiqueta]) => (
                  <label key={k} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input type="radio" name="modo-materiales" checked={sel.modoMateriales === k}
                      onChange={() => setSel(s => ({ ...s, modoMateriales: k }))} />
                    {etiqueta}
                  </label>
                ))}
              </div>
            )}
            <Tilde activo={sel.pagos} onToggle={() => toggle('pagos')}
              titulo="Pagos del cliente" desc="Cada pago recibido, con fecha y medio." />
          </div>
        </div>

        {cargando && <p className="text-[11px] text-gris-dark italic">Cargando los datos de la cuenta…</p>}
        {esAdmin && !admin.vigente && (
          <p className="text-[11px] text-[#7A5500] bg-amarillo-light rounded px-2 py-1">
            ⚠ La obra no tiene porcentajes cargados: jornales y contratistas saldrían al costo.
          </p>
        )}
      </div>
    </Modal>
  )
}

function Tilde({ activo, onToggle, titulo, desc }: {
  activo: boolean; onToggle: () => void; titulo: string; desc: string
}) {
  return (
    <label className="flex items-start gap-2.5 border-[1.5px] border-gris-mid rounded-lg px-3 py-2 cursor-pointer select-none hover:border-gris-dark transition-colors bg-white">
      <input type="checkbox" checked={activo} onChange={onToggle} className="mt-0.5" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-carbon">{titulo}</span>
        <span className="block text-[11px] text-gris-dark leading-tight">{desc}</span>
      </span>
    </label>
  )
}
