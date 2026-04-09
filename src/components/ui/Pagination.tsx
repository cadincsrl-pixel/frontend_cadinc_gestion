'use client'

interface Props {
  page:     number
  total:    number
  pageSize: number
  onChange: (page: number) => void
}

export function Pagination({ page, total, pageSize, onChange }: Props) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  // Generar páginas visibles: siempre 1, última, y hasta 3 alrededor de la actual
  const pages: (number | '...')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-xs text-gris-dark">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold text-gris-dark hover:bg-gris disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-gris-dark">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`
                w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors
                ${p === page
                  ? 'bg-naranja text-white'
                  : 'text-carbon hover:bg-gris'
                }
              `}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold text-gris-dark hover:bg-gris disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  )
}
