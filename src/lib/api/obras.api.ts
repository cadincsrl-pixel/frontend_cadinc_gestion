import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { Obra, CreateObraDto, UpdateObraDto } from '@/types/domain.types'

// Helper para appendear ?modulo=X cuando se pasa.
// El backend respeta el override permisos.<modulo>.obras_scope; sin
// modulo cae al scope global del perfil. Las páginas de tarja deben
// pasar 'tarja' para que casos como Cristian (encargado de depósito
// con tarja restringida a la obra depósito) vean solo lo que toca.
function withModulo(path: string, modulo?: string): string {
  if (!modulo) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}modulo=${encodeURIComponent(modulo)}`
}

export const obrasApi = {
  getAll: (modulo?: string) =>
    apiGet<Obra[]>(withModulo('/api/obras', modulo)),

  getArchivadas: (modulo?: string) =>
    apiGet<Obra[]>(withModulo('/api/obras/archivadas', modulo)),

  getByCod: (cod: string, modulo?: string) =>
    apiGet<Obra>(withModulo(`/api/obras/${encodeURIComponent(cod)}`, modulo)),

  create: (dto: CreateObraDto) =>
    apiPost<Obra>('/api/obras', dto),

  update: (cod: string, dto: UpdateObraDto) =>
    apiPatch<Obra>(`/api/obras/${encodeURIComponent(cod)}`, dto),

  archivar: (cod: string) =>
    apiPatch<Obra>(`/api/obras/${encodeURIComponent(cod)}/archivar`, {}),

  delete: (cod: string) =>
    apiDelete<{ success: boolean }>(`/api/obras/${encodeURIComponent(cod)}`),

  desarchivar: (cod: string) =>
    apiPatch<Obra>(`/api/obras/${encodeURIComponent(cod)}/desarchivar`, {}),

  responsablesDisponibles: () =>
    apiGet<{
      capataces:  Array<{ id: string; nombre: string }>
      jefes_obra: Array<{ id: string; nombre: string }>
    }>('/api/obras/responsables-disponibles'),

  proximoCodigo: () =>
    apiGet<{ cod: string }>('/api/obras/proximo-codigo'),
}