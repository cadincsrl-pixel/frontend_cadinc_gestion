'use client'

import { useCallback, useState } from 'react'
import { apiPost } from '@/lib/api/client'

// ── Asistente IA (v1, solo lectura) ──────────────────────────────────
// Chat de consultas sobre datos del ERP vía backend (POST /api/asistente/chat).
// El backend es STATELESS: mandamos el historial completo en cada request
// (máximo 24 mensajes, el último siempre role=user).
//
// El estado vive en memoria del componente que monta el hook — no hay
// persistencia: cerrar el panel NO borra (el hook vive en el Shell),
// pero un reload de página sí.

export interface MensajeAsistente {
  role:    'user' | 'assistant'
  content: string
}

interface AsistenteChatResponse {
  reply:               string
  herramientas_usadas: string[]
}

// Límites del contrato de API (espejo de la validación zod del backend).
const MAX_MENSAJES  = 24
const MAX_CHARS     = 2000

// El client de API tira HttpError (con `status` y `body`) pero la clase no
// está exportada — leemos el status de forma estructural, sin `any`.
function statusDeError(err: unknown): number | undefined {
  if (err instanceof Error && 'status' in err) {
    const s = (err as Error & { status?: unknown }).status
    if (typeof s === 'number') return s
  }
  return undefined
}

function esNoConfigurado(err: unknown): boolean {
  return (
    statusDeError(err) === 503 ||
    (err instanceof Error && err.message === 'ASISTENTE_NO_CONFIGURADO')
  )
}

export function useAsistente() {
  const [mensajes, setMensajes]   = useState<MensajeAsistente[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const sendMessage = useCallback(async (texto: string) => {
    const content = texto.trim().slice(0, MAX_CHARS)
    if (!content || isLoading) return

    const nuevoMensaje: MensajeAsistente = { role: 'user', content }
    // El historial local puede crecer sin límite (para mostrar en la UI);
    // a la API solo van los últimos 24 mensajes.
    const historial = [...mensajes, nuevoMensaje]

    setMensajes(historial)
    setError(null)
    setIsLoading(true)
    try {
      // La ventana no puede arrancar en un mensaje assistant (la API del
      // backend lo exige: primer mensaje = user). Tras el slice, dropeamos
      // los assistant que quedaron al frente. El backend re-valida igual.
      const ventana = historial.slice(-MAX_MENSAJES)
      const primerUser = ventana.findIndex(m => m.role === 'user')
      const res = await apiPost<AsistenteChatResponse>('/api/asistente/chat', {
        messages: primerUser > 0 ? ventana.slice(primerUser) : ventana,
      })
      setMensajes(prev => [...prev, { role: 'assistant', content: res.reply }])
    } catch (err) {
      // El historial NO se pierde: el mensaje del usuario queda en la lista
      // y puede reintentar. Solo mostramos el error en el chat.
      if (esNoConfigurado(err)) {
        setError('El asistente no está configurado todavía (falta la API key).')
      } else {
        const detalle = err instanceof Error ? err.message : 'Error desconocido'
        setError(`No pude procesar la consulta: ${detalle}. Probá de nuevo.`)
      }
    } finally {
      setIsLoading(false)
    }
  }, [mensajes, isLoading])

  // "Nueva conversación": borra historial y errores.
  const reset = useCallback(() => {
    setMensajes([])
    setError(null)
  }, [])

  return { mensajes, sendMessage, isLoading, error, reset }
}
