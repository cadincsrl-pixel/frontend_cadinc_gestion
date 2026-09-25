'use client'

import { usePermisos } from '@/hooks/usePermisos'
import { Aviso } from '../FichaFactura'
import { ProductosCard } from './ProductosCard'
import { PuntosVentaCard } from './PuntosVentaCard'
import { ParametrosCard } from './ParametrosCard'
import { RetencionTiposCard } from './RetencionTiposCard'
import { JurisdiccionesEditor } from '@/components/catalogos/JurisdiccionesEditor'

/**
 * Ventas › Configuración (tanda 6). Ver lo puede cualquiera con la tab;
 * editar pide además el flag `configurar` (los botones quedan deshabilitados
 * con el motivo). Secciones: Productos (20260929b), Puntos de venta
 * (20260929d), Montos de ARCA (20260929e), Retenciones sufridas (20260929g)
 * y Jurisdicciones (20260929f, compartido con Compras); los valores por
 * defecto de la factura se suman acá.
 */
export function ConfiguracionTab() {
  const { configurar } = usePermisos('facturacion')
  return (
    <div className="flex flex-col gap-4">
      {!configurar && (
        <Aviso tono="gris">
          Podés ver la configuración de Ventas; para cambiarla hace falta el permiso «Configurar» (Admin › Usuarios).
        </Aviso>
      )}
      <ProductosCard />
      <PuntosVentaCard />
      <ParametrosCard />
      <RetencionTiposCard />
      <JurisdiccionesEditor />
      <div className="text-[11px] text-gris-dark">Los cambios pueden tardar hasta un minuto en verse en todas las pantallas.</div>
    </div>
  )
}
