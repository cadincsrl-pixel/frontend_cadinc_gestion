import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/lib/api/client'

interface PerfilNombre {
  id: string
  nombre: string
}

export function usePerfilesMap(): Map<string, string> {
  const { data = [] } = useQuery({
    queryKey: ['perfiles-nombres'],
    queryFn: () => apiGet<PerfilNombre[]>('/api/me/perfiles'),
    staleTime: 5 * 60 * 1000, // 5 minutos de caché
  })

  return useMemo(() => {
    const map = new Map<string, string>()
    data.forEach(p => map.set(p.id, p.nombre))
    return map
  }, [data])
}
