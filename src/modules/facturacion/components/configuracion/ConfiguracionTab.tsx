'use client'

import { usePermisos } from '@/hooks/usePermisos'
import { Aviso } from '../FichaFactura'
import { ProductosCard } from './ProductosCard'
import { PuntosVentaCard } from './PuntosVentaCard'

/**
 * Ventas › Configuración (tanda 6). Ver lo puede cualquiera con la tab;
 * editar pide además el flag `configurar` (los botones quedan deshabilitados
 * con el motivo). Secciones: Productos (20260929b) y Puntos de venta
 * (20260929d); las demás (montos ARCA, retenciones, valores por defecto) se
 * suman acá.
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
      <div className="text-[11px] text-gris-dark">Los cambios pueden tardar hasta un minuto en verse en todas las pantallas.</div>
    </div>
  )
}
