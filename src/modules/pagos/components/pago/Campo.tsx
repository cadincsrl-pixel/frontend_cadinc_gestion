/** Campos del formulario de pago (Registrar pago y Pagar en lote). */

export const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris disabled:text-gris-dark'

export function Campo({ label, hint, ancho, leido, children }: { label: string; hint?: string; ancho?: string; leido?: boolean; children: React.ReactNode }) {
  return (
    <div className={ancho}>
      <label className="block text-xs font-semibold text-gris-dark mb-1">
        {label}{hint && <span className="font-normal"> · {hint}</span>}
        {leido && (
          <span title="Leído de la foto: revisalo" className="ml-1 px-1 rounded border border-azul/30 bg-azul/5 text-azul text-[10px] font-semibold">📷 leído</span>
        )}
      </label>
      {children}
    </div>
  )
}
