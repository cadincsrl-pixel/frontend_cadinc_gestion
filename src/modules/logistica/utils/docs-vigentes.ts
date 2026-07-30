// Separa los documentos renovables de un tipo en VIGENTES y ARCHIVADOS.
//
// La regla vieja era "el archivo más nuevo es el vigente, el resto archivado".
// Rompía con frente + dorso: Alina subió la licencia de Acosta en dos fotos
// (16:50 y 16:53) y el dorso mandó al frente a "anteriores" (2026-07-30).
//
// La regla correcta agrupa por RENOVACIÓN: todos los archivos que comparten el
// vencimiento del más nuevo son el mismo documento físico (frente, dorso, y lo
// que haga falta). Archivado queda lo que vence distinto — la licencia vieja.

interface DocRenovable {
  id:          number
  created_at?: string | null
  vence_el?:   string | null
}

export function partirVigentesYArchivados<T extends DocRenovable>(
  docs: T[],
): { vigentes: T[]; archivados: T[] } {
  const ord = [...docs].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '') || (b.id - a.id))
  if (ord.length <= 1) return { vigentes: ord, archivados: [] }

  const venceVigente = ord[0]!.vence_el ?? null
  return {
    // Mismo vencimiento que el más nuevo = misma renovación. Si el más nuevo
    // no tiene vencimiento cargado, agrupa con los otros sin vencimiento.
    vigentes:   ord.filter(d => (d.vence_el ?? null) === venceVigente),
    archivados: ord.filter(d => (d.vence_el ?? null) !== venceVigente),
  }
}
