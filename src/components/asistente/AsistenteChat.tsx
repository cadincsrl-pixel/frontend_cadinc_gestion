'use client'

import { useEffect, useRef, useState } from 'react'
import { usePermisos } from '@/hooks/usePermisos'
import { useAsistente } from '@/hooks/useAsistente'

// ── Asistente IA — chat flotante ─────────────────────────────────────
// Botón 🤖 fijo abajo a la derecha, visible solo con el flag
// tarja.asistente_ia (admin bypass). Abre un panel de chat contra
// POST /api/asistente/chat (solo lectura, el backend valida permisos
// por herramienta — esto es UI, no seguridad).
//
// z-index: el Toast usa z-[100]; acá usamos z-[90] para no taparlo.

// Mensaje inicial client-side — NO va a la API (el backend recibe solo
// el historial real user/assistant).
const MENSAJE_BIENVENIDA =
  'Hola, soy el asistente de CADINC. Puedo responder consultas sobre los ' +
  'datos que ya podés ver en el sistema, por ejemplo:\n' +
  '• Costos de una obra o de una semana de tarja\n' +
  '• Gastos de flota (combustible, peajes, viáticos)\n' +
  '• Viajes y tramos de logística\n' +
  '• Facturación a empresas transportistas\n' +
  '• Saldos de choferes y liquidaciones\n' +
  '• Stock en depósito o en proveedores\n\n' +
  'Las consultas con datos pueden tardar hasta 30 segundos.'

export function AsistenteChat() {
  const { asistenteIa } = usePermisos('tarja')
  const { mensajes, sendMessage, isLoading, error, reset } = useAsistente()

  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto]     = useState('')

  const scrollRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll al fondo cuando llegan mensajes o aparece el "pensando".
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensajes, isLoading, error, abierto])

  // Foco en el input al abrir y al terminar de cargar.
  useEffect(() => {
    if (abierto && !isLoading) textareaRef.current?.focus()
  }, [abierto, isLoading])

  if (!asistenteIa) return null

  function handleEnviar() {
    const t = texto.trim()
    if (!t || isLoading) return
    setTexto('')
    void sendMessage(t)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  function handleNuevaConversacion() {
    if (mensajes.length > 0 && !confirm('¿Empezar una conversación nueva? Se borra el historial actual.')) return
    reset()
    setTexto('')
    textareaRef.current?.focus()
  }

  return (
    <>
      {/* Panel de chat */}
      {abierto && (
        <div
          className="fixed z-[90] bottom-24 inset-x-3 sm:inset-x-auto sm:right-5 sm:w-[380px] h-[70vh] max-h-[600px] flex flex-col bg-white rounded-card shadow-card-lg border border-gris-mid overflow-hidden"
          role="dialog"
          aria-label="Asistente IA"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-azul text-white shrink-0">
            <span className="font-sans font-bold text-sm tracking-wide">🤖 Asistente</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNuevaConversacion}
                title="Nueva conversación"
                className="px-2 py-1 rounded-lg text-xs font-bold hover:bg-azul-mid transition-colors"
              >
                ↺ Nueva
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                title="Cerrar"
                aria-label="Cerrar asistente"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-azul-mid transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 bg-gris/60">
            {/* Bienvenida (client-side, no va a la API) */}
            <BurbujaAsistente texto={MENSAJE_BIENVENIDA} />

            {mensajes.map((m, i) =>
              m.role === 'user'
                ? <BurbujaUser key={i} texto={m.content} />
                : <BurbujaAsistente key={i} texto={m.content} />
            )}

            {/* Indicador "pensando" — las consultas con datos tardan 5-30s */}
            {isLoading && (
              <div className="self-start flex items-center gap-2 bg-white border border-gris-mid rounded-card rounded-bl-md px-3 py-2 text-xs text-gris-dark">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-naranja rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-naranja rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-naranja rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
                Pensando...
              </div>
            )}

            {/* Error inline — el historial no se pierde */}
            {error && !isLoading && (
              <div className="self-start max-w-[90%] bg-rojo-light border border-rojo/30 text-rojo rounded-card px-3 py-2 text-xs whitespace-pre-wrap">
                ⚠️ {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-gris-mid bg-white px-3 py-2 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              maxLength={2000}
              rows={2}
              placeholder="Escribí tu consulta... (Enter para enviar)"
              className="flex-1 resize-none rounded-lg border border-gris-mid px-3 py-2 text-sm font-sans text-carbon placeholder:text-gris-dark focus:outline-none focus:border-naranja disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={handleEnviar}
              disabled={isLoading || !texto.trim()}
              className="shrink-0 px-3 py-2 rounded-lg bg-naranja hover:bg-naranja-dark text-white text-sm font-bold font-sans tracking-wide border border-naranja-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setAbierto(p => !p)}
        title={abierto ? 'Cerrar asistente' : 'Asistente IA'}
        aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente IA'}
        className="fixed z-[90] bottom-5 right-5 w-14 h-14 rounded-full bg-azul hover:bg-azul-mid text-white text-2xl shadow-card-lg border border-azul-mid flex items-center justify-center transition-colors"
      >
        {abierto ? '✕' : '🤖'}
      </button>
    </>
  )
}

function BurbujaUser({ texto }: { texto: string }) {
  return (
    <div className="self-end max-w-[85%] bg-naranja text-white rounded-card rounded-br-md px-3 py-2 text-sm whitespace-pre-wrap break-words">
      {texto}
    </div>
  )
}

function BurbujaAsistente({ texto }: { texto: string }) {
  return (
    <div className="self-start max-w-[85%] bg-white border border-gris-mid text-carbon rounded-card rounded-bl-md px-3 py-2 text-sm whitespace-pre-wrap break-words">
      {texto}
    </div>
  )
}
