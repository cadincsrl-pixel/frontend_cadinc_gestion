import { apiDelete, apiGet, apiPut } from './client'
import type { Hora, UpsertHoraDto, UpsertHorasLoteDto } from '@/types/domain.types'

export const horasApi = {
  getBySemana: (obraCod: string, desde: string, hasta: string) =>
    apiGet<Hora[]>(`/api/horas/${encodeURIComponent(obraCod)}?desde=${desde}&hasta=${hasta}`),

  getByObra: (obraCod: string) =>
    apiGet<Hora[]>(`/api/horas/${encodeURIComponent(obraCod)}`),

  getByTrabajador: (leg: string) =>
    apiGet<Hora[]>(`/api/horas/trabajador/${encodeURIComponent(leg)}`),

  // Por el client central: refresca la sesión, reintenta el 401 y tira un
  // HttpError con `status` y `body` (SEMANA_CERRADA, FECHA_FUERA_DE_RANGO…).
  // Con el fetch crudo anterior el motivo del rechazo nunca llegaba a la grilla.
  upsert: (dto: UpsertHoraDto) => apiPut<Hora>('/api/horas', dto),

  upsertLote: (dto: UpsertHorasLoteDto) => apiPut<{ success: boolean }>('/api/horas/lote', dto),

  limpiarSemana: (obraCod: string, desde: string, hasta: string) =>
    apiDelete(`/api/horas/${encodeURIComponent(obraCod)}/semana?desde=${desde}&hasta=${hasta}`),
}