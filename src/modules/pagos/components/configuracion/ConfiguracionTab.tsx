'use client'

import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { JurisdiccionSelect } from '@/components/JurisdiccionSelect'
import { JurisdiccionesEditor } from '@/components/catalogos/JurisdiccionesEditor'
import { useJurisdicciones } from '@/hooks/useJurisdicciones'
import { nombreJurisdiccion } from '@/lib/utils/jurisdicciones'
import { useConfigPagos, useGuardarConfigPagos } from '../../hooks/useConfigPagos'
import { mensajeErrorPagos } from '../../utils/pagos.errores'

/**
 * Compras › Configuración (tanda 6). Ver lo puede cualquiera con la tab;
 * editar pide además el flag `configurar` de Compras (los botones quedan
 * deshabilitados con el motivo). Por ahora: la jurisdicción por defecto de
 * los tributos (20260929f) y el catálogo de jurisdicciones, que comparte con
 * Ventas. Avisos de pago y plazos de cheque se suman acá (ítem 8).
 */
export function ConfiguracionTab() {
  const { configurar } = usePermisos('pagos')
  return (
    <div className="flex flex-col gap-4">
      {!configurar && (
        <div className="border rounded p-2 text-xs bg-gris border-gris-mid text-gris-dark">
          Podés ver la configuración de Compras; para cambiarla hace falta el permiso «Configurar» (Admin › Usuarios).
        </div>
      )}
      <TributosCard puede={configurar} />
      <JurisdiccionesEditor />
      <div className="text-[11px] text-gris-dark">Los cambios pueden tardar hasta un minuto en verse en todas las pantallas.</div>
    </div>
  )
}

function TributosCard({ puede }: { puede: boolean }) {
  const toast = useToast()
  const cfg = useConfigPagos()
  const { jurisdicciones } = useJurisdicciones()
  const guardar = useGuardarConfigPagos()
  const id = cfg.config.tributos.jurisdiccion_default_id
  const tip = puede ? undefined : 'Necesitás el permiso «Configurar» de Compras'

  async function cambiar(nuevo: number | null) {
    try {
      await guardar.mutateAsync({ tributo_jurisdiccion_default_id: nuevo })
      toast(nuevo ? `✓ Los tributos nuevos proponen ${nombreJurisdiccion(jurisdicciones, nuevo)}` : '✓ Los tributos nuevos arrancan sin jurisdicción', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div>
        <div className="text-sm font-bold">Percepciones de las facturas de compra</div>
        <div className="text-[11px] text-gris-dark">
          La jurisdicción que se propone al agregar una percepción o impuesto en una factura. Se puede cambiar en cada renglón.
        </div>
      </div>
      {cfg.respaldo ? (
        <div className="text-xs text-naranja-dark">El servidor todavía no tiene esta configuración: se propone «Tucumán», como siempre.</div>
      ) : (
        <div className="max-w-sm" title={tip}>
          <JurisdiccionSelect label="Jurisdicción por defecto" disabled={!puede || guardar.isPending || cfg.isLoading}
            value={{ id, nombre: nombreJurisdiccion(jurisdicciones, id) }}
            onChange={v => { if (v.id !== id) void cambiar(v.id) }} />
        </div>
      )}
    </div>
  )
}
