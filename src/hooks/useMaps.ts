import { useMutation } from '@tanstack/react-query'
import { apiPost } from '@/lib/api/client'

// Traducción de direcciones y links de Google Maps a coordenadas.
//
// Viven fuera de un módulo porque los usan dos: los lugares de logística y las
// canteras de áridos. Los endpoints están montados bajo /api/logistica/maps por
// razones históricas, pero aceptan permiso de logística O de áridos.

// Geocoding por dirección. Es el fallback: suele caer en el centro del pueblo,
// no en la planta, así que el resultado siempre hay que verificarlo.
export function useGeocode() {
  return useMutation({
    mutationFn: (direccion: string) =>
      apiPost<{ lat: number; lng: number; formatted_address: string }>(
        '/api/logistica/maps/geocode',
        { direccion },
      ),
  })
}

// Extrae lat/lng del pin de un link de Google Maps (resuelve shortlinks
// en el backend). Fuente 'pin' = marcador exacto; 'aprox' = centro del mapa.
export function useResolverMapsUrl() {
  return useMutation({
    mutationFn: (url: string) =>
      apiPost<{ lat: number; lng: number; fuente: 'pin' | 'aprox' }>(
        '/api/logistica/maps/resolver-url',
        { url },
      ),
  })
}
