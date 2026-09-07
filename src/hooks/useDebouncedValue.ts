'use client'

import { useEffect, useState } from 'react'

/**
 * Devuelve `value` recién cuando dejó de cambiar por `ms` milisegundos. Para
 * búsquedas que pegan a la API mientras el usuario tipea.
 */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}
