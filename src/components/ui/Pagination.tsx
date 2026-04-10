'use client'

const PAGE_SIZE_OPTIONS = [12, 25, 50, 100]

interface Props {
  page:              number
  total:             number
  pageSize:          number
  onChange:          (page: number) => void
  onPageSizeChange?: (size: number) => void
}

export function Pagination({ page, total, pageSize, onChange, onPageSizeChange }: Props) {
  const totalPages = Math.ceil(total / pageSize)
  const hasMultiplePages = totalPages > 1

  if (!hasMultiplePages && !onPageSizeChange) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

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
      <div className="flex items-center gap-3">
        <span className="text-xs text-gris-dark">
          {total === 0 ? '0 resultados' : `${from}–${to} de ${total}`}
        </span>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={e => { onPageSizeChange(Number(e.target.value)) }}
            className="text-xs border border-gris-mid rounded-lg px-2 py-1.5 text-carbon bg-white outline-none focus:border-naranja cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{s} por página</option>
            ))}
          </select>
        )}
      </div>

      {hasMultiplePages && (
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
      )}
    </div>
  )
}
