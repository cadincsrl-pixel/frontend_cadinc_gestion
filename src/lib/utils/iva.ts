// Conversión neto ↔ final con IVA 21%.
//
// Convención del sistema (verificada el 2026-07-30 contra los datos): los
// precios SE GUARDAN como valor final con IVA incluido — así los consumen los
// cobros, la cuenta del cliente, los reportes y los PDFs. Estas funciones son
// para los formularios que dejan cargar la neta y calculan el final solo.
//
// Nacieron en las tarifas de facturación de logística
// (src/modules/logistica/utils/tarifas.ts, que ahora re-exporta de acá) y se
// movieron a lib cuando la compra de materiales necesitó lo mismo: un solo IVA
// en el código, no dos que puedan divergir.

export const IVA = 1.21

export function netaAFinal(neta: number): number {
  return Math.round(neta * IVA * 100) / 100
}

// Prefill de edición con 4 decimales: el roundtrip neta→final devuelve el
// valor original exacto (los finales guardados tienen ≤2 decimales).
export function finalANeta(final: number): number {
  return Number((final / IVA).toFixed(4))
}
