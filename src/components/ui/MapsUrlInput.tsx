'use client'

import type { FieldValues, Path, PathValue, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { Input } from './Input'
import { useToast } from './Toast'
import { useGeocode, useResolverMapsUrl } from '@/hooks/useMaps'

/**
 * Campo de ubicación: link de Google Maps + latitud/longitud, con un botón que
 * resuelve las coordenadas.
 *
 * Estrategia del botón "Buscar", en este orden:
 *  1. Si hay link de Maps → saca el PIN de ese link (punto exacto que eligió
 *     la persona). Es lo bueno.
 *  2. Sin link → geocodifica por nombre + localidad. Es el fallback y suele
 *     caer en el centro del pueblo, no en la planta (caso MARCAMPO: 19 km de
 *     error), por eso el texto de ayuda insiste en verificar.
 *
 * El form que lo use tiene que tener los campos `maps_url`, `lat`, `lng`, y
 * conviene que tenga `nombre` y `localidad` para el fallback.
 *
 * Vive acá y no dentro de una pantalla porque lo usan dos módulos: los lugares
 * de logística y las canteras de áridos. Los endpoints que consulta aceptan
 * permiso de cualquiera de los dos.
 */
// Error de la API: `apiPost` cuelga el cuerpo de la respuesta en `.body`.
type ErrorApi = { body?: { error?: string } }
const codigoDe = (err: unknown): string | undefined => (err as ErrorApi)?.body?.error

export function MapsUrlInput<T extends FieldValues>({ register, watch, setValue }: {
  register:  UseFormRegister<T>
  watch:     UseFormWatch<T>
  setValue?: UseFormSetValue<T>
}) {
  // El componente exige por contrato que el form tenga estos campos, pero T es
  // genérico: estos dos helpers concentran el casteo en un solo lugar en vez de
  // desparramar `any` por todo el archivo.
  const campo = (n: 'maps_url' | 'lat' | 'lng' | 'nombre' | 'localidad') => n as Path<T>
  const coord = (v: number) => v as PathValue<T, Path<T>>

  const url = watch(campo('maps_url')) ?? ''
  const lat = watch(campo('lat'))
  const lng = watch(campo('lng'))
  const nombre    = watch(campo('nombre')) ?? ''
  const localidad = watch(campo('localidad')) ?? ''
  const { mutate: geocodeMutate,  isPending: geocoding }   = useGeocode()
  const { mutate: resolverMutate, isPending: resolviendo } = useResolverMapsUrl()
  const toast = useToast()

  // Geocoding por nombre+localidad. Es el fallback: suele caer en el centro
  // del pueblo, no en la planta (caso MARCAMPO: ~19 km de error).
  function buscarPorDireccion() {
    // Sin `setValue` no hay dónde escribir el resultado. El botón que llama acá
    // ya no se renderiza en ese caso; el guard es para que TypeScript lo sepa.
    if (!setValue) return
    const direccion = [nombre, localidad].filter(Boolean).join(', ').trim()
    if (!direccion) { toast('Cargá el link de Maps, o al menos el nombre o la localidad', 'err'); return }
    geocodeMutate(direccion, {
      onSuccess: (r) => {
        setValue(campo('lat'), coord(r.lat), { shouldDirty: true })
        setValue(campo('lng'), coord(r.lng), { shouldDirty: true })
        toast(`✓ Coordenadas (por nombre): ${r.formatted_address}. Verificá el punto en Maps.`, 'ok')
      },
      onError: (err: unknown) => {
        const msg = codigoDe(err) === 'GOOGLE_API_KEY_MISSING'
          ? 'Falta configurar GOOGLE_MAPS_API_KEY en el backend'
          : 'No se encontró la dirección. Cargá lat/lng manualmente.'
        toast(msg, 'err')
      },
    })
  }

  // Buscar: si hay link de Maps usa el PIN de ese link (punto exacto que
  // cargó el usuario); si no hay link, geocodifica por nombre+localidad.
  function handleBuscar() {
    if (!setValue) return
    const link = (url ?? '').trim()
    if (!link) { buscarPorDireccion(); return }
    resolverMutate(link, {
      onSuccess: (r) => {
        setValue(campo('lat'), coord(r.lat), { shouldDirty: true })
        setValue(campo('lng'), coord(r.lng), { shouldDirty: true })
        toast(r.fuente === 'pin'
          ? '✓ Coordenadas tomadas del pin del link de Maps'
          : '✓ Coordenadas aproximadas (centro del mapa del link). Verificá el punto.', 'ok')
      },
      // Si el link no se pudo resolver (inválido, sin coords), caemos al
      // geocoding por nombre avisando por qué.
      onError: (err: unknown) => {
        const code = codigoDe(err)
        toast(code === 'MAPS_URL_INVALIDA'
          ? 'El link no parece de Google Maps — busco por nombre…'
          : 'No pude sacar coordenadas del link — busco por nombre…', 'warn')
        buscarPorDireccion()
      },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-0 basis-full sm:basis-0">
            <Input label="Link Google Maps" placeholder="https://maps.google.com/..." {...register(campo('maps_url'))} />
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-azul-light text-azul text-xs font-bold hover:bg-azul hover:text-white transition-colors"
            >
              📍 Abrir
            </a>
          )}
        </div>
        <p className="text-xs text-gris-dark mt-1">
          En Google Maps: botón Compartir → Copiar link
        </p>
      </div>

      {/* Coordenadas (necesarias para calcular distancia GPS→destino) */}
      <div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-0 basis-full sm:basis-0 grid grid-cols-2 gap-2">
            <Input
              label="Latitud"
              type="number"
              step="0.0000001"
              placeholder="-34.6037"
              {...register(campo('lat'), { valueAsNumber: true })}
            />
            <Input
              label="Longitud"
              type="number"
              step="0.0000001"
              placeholder="-58.3816"
              {...register(campo('lng'), { valueAsNumber: true })}
            />
          </div>
          {setValue && (
            <button
              type="button"
              onClick={handleBuscar}
              disabled={geocoding || resolviendo}
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-verde-light text-verde text-xs font-bold hover:bg-verde hover:text-white transition-colors disabled:opacity-50"
            >
              {(geocoding || resolviendo) ? '⏳' : '🔍'} Buscar
            </button>
          )}
          {/* Verificar visualmente las coords en Google Maps. Útil cuando
              Geocoding devolvió un punto que no es exactamente el real
              (ej. el centro de la localidad en lugar de la planta). */}
          {lat != null && lng != null && lat !== '' && lng !== '' && (
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}&z=18`}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir las coordenadas exactas en Google Maps para verificarlas"
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-azul-light text-azul text-xs font-bold hover:bg-azul hover:text-white transition-colors"
            >
              📍 Verificar
            </a>
          )}
        </div>
        <p className="text-xs text-gris-dark mt-1">
          {(lat != null && lng != null && lat !== '' && lng !== '')
            ? '✓ Coordenadas cargadas. Verificá en Maps que el punto sea el correcto. Si no, ajustá lat/lng a mano (copialas del lugar exacto en Maps).'
            : 'Click en "Buscar": usa el pin del link de Maps (exacto); sin link, busca por nombre + localidad (aproximado)'}
        </p>
      </div>
    </div>
  )
}
