/**
 * Los sinónimos con los que se pide un material en obra ("t1", "ceresita").
 *
 * Dos modos:
 * - Completo (default): un chip por sinónimo. Va donde el usuario tiene que
 *   LEERLOS: el modal "¿No será este?" (ahí "YA LO PIDEN ASÍ" es la salida más
 *   valiosa) y el form de edición.
 * - `compact`: un solo badge con la cantidad, y la lista en el tooltip. Va en la
 *   LISTA del catálogo: con 277 materiales con sinónimos y filas de hasta 16, los
 *   chips completos ensuciaban la lista (pedido del dueño, 2026-09-02).
 */
export function AliasChips({ alias, compact = false }: { alias: string[] | null | undefined; compact?: boolean }) {
  if (!alias || alias.length === 0) return null
  const title = `También se pide como: ${alias.join(', ')}`

  if (compact) {
    return (
      <span
        title={title}
        className="inline-block mt-1 text-[10px] font-semibold text-gris-dark bg-gris px-1.5 py-0.5 rounded cursor-help"
      >
        {alias.length} sinónimo{alias.length !== 1 ? 's' : ''}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1" title={title}>
      {alias.map(a => (
        <span key={a} className="text-[10px] font-semibold text-gris-dark bg-gris px-1.5 py-0.5 rounded">{a}</span>
      ))}
    </div>
  )
}
