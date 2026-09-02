/**
 * Los sinónimos con los que se pide un material en obra ("t1", "ceresita").
 * Se muestran chiquitos debajo del nombre: sirven para que quien mira el
 * catálogo entienda por qué su búsqueda encontró esa fila.
 */
export function AliasChips({ alias }: { alias: string[] | null | undefined }) {
  if (!alias || alias.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1" title={`También se pide como: ${alias.join(', ')}`}>
      {alias.map(a => (
        <span key={a} className="text-[10px] font-semibold text-gris-dark bg-gris px-1.5 py-0.5 rounded">{a}</span>
      ))}
    </div>
  )
}
