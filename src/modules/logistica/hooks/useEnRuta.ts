import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api/client'

export interface TramoEnRuta {
  tramo_id:        number
  tipo:            'cargado' | 'vacio'
  patente:         string | null
  chofer_nombre:   string | null
  cantera_nombre:  string | null
  deposito_nombre: string | null
  destino_nombre:  string | null
  fecha_carga:     string | null
  toneladas:       number | null
  gps_lat:         number | null
  gps_lng:         number | null
  gps_velocidad:   number | null
  gps_lectura_en:  string | null
  destino_lat:     number | null
  destino_lng:     number | null
  distancia_m:        number | null
  duracion_s:         number | null
  duracion_traffic_s: number | null
  motivo_sin_calcular: string | null
}

export const EN_RUTA_KEY = ['logistica', 'en-ruta'] as const

export function useTramosEnRuta() {
  return useQuery({
    queryKey: EN_RUTA_KEY,
    queryFn:  () => apiGet<TramoEnRuta[]>('/api/logistica/maps/en-ruta'),
    // Refetch al volver al tab. La distancia ya viene cacheada server-side.
    staleTime: 60_000,
  })
}

// `useGeocode` y `useResolverMapsUrl` se mudaron a `@/hooks/useMaps`: los usa
// también áridos para geolocalizar sus canteras, y no correspondía que un
// módulo importara los hooks de otro. Se re-exportan para no romper imports.
export { useGeocode, useResolverMapsUrl } from '@/hooks/useMaps'

// Km sugerido cantera→depósito vía Google Distance Matrix (backend).
// Es una sugerencia editable — el usuario la verifica con el link del trayecto.
export function useSugerirKm() {
  return useMutation({
    mutationFn: (dto: { cantera_id: number; deposito_id: number }) =>
      apiPost<{ km: number; duracion_s: number }>('/api/logistica/maps/sugerir-km', dto),
  })
}

// Forzar recálculo: invalida la query para que vuelva a pedir.
export function useRefrescarEnRuta() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: EN_RUTA_KEY })
}
