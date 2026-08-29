'use client'

// ── Diferencia carga vs. descarga (hint en vivo bajo el input) ──────────────
// Muestra la diferencia apenas se tipean las toneladas de descarga. Colores:
// verde = coincide · gris = merma chica (≤1,5%) · naranja = diferencia grande
// · rojo = se descargó MÁS de lo cargado (casi seguro un error de tipeo).
export function DiferenciaToneladas({ carga, descarga }: {
  carga:    number | string | null | undefined
  descarga: number | string | null | undefined
}) {
  const c = Number(carga)
  const d = descarga == null || descarga === '' ? NaN : Number(descarga)
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(d) || d <= 0) return null

  const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
  const dif = Math.round((d - c) * 100) / 100
  const pct = Math.round(Math.abs(dif) / c * 1000) / 10

  if (Math.abs(dif) < 0.005) {
    return <p className="text-xs font-semibold text-verde">✓ Coincide con las {fmt(c)} tn cargadas.</p>
  }
  if (dif > 0) {
    return (
      <p className="text-xs font-bold text-rojo">
        ⚠ Se descargaron {fmt(dif)} tn MÁS de las {fmt(c)} tn cargadas (+{fmt(pct)}%) — revisá el número.
      </p>
    )
  }
  const mermaChica = pct <= 1.5
  return (
    <p className={`text-xs font-semibold ${mermaChica ? 'text-gris-dark' : 'text-naranja-dark'}`}>
      {mermaChica ? '' : '⚠ '}Diferencia: −{fmt(Math.abs(dif))} tn (−{fmt(pct)}%) respecto de las {fmt(c)} tn cargadas.
    </p>
  )
}
