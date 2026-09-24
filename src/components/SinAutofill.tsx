'use client'

import { useEffect } from 'react'

/**
 * Los gestores de contraseñas (en esta oficina, LastPass) toman cualquier
 * campo de texto suelto por «usuario» y le meten el email: pasó en el Alias
 * del proveedor y en otros lados (24/09). `Input` de components/ui ya trae las
 * marcas para que no lo hagan, pero hay ~240 `<input>` crudos en el sistema.
 *
 * En vez de tocarlos uno por uno, esto les pone las marcas a TODOS los campos
 * de texto de la aplicación — también a los que aparecen después en modales —
 * salvo los de contraseña. Va en el layout de `(app)`: el login y el cambio de
 * contraseña están fuera y siguen autocompletando.
 *
 * Un campo que SÍ quiera autocompletar lleva `data-autofill="si"`.
 */

const MARCAS: Record<string, string> = {
  'data-lpignore': 'true',       // LastPass
  'data-1p-ignore': 'true',      // 1Password
  'data-bwignore': 'true',       // Bitwarden
  'data-form-type': 'other',     // Dashlane
  'data-protonpass-ignore': 'true',
}

function marcar(el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
  if (el.dataset.autofill === 'si') return
  if (el instanceof HTMLInputElement && ['password', 'hidden', 'checkbox', 'radio', 'file', 'submit', 'button'].includes(el.type)) return
  for (const [k, v] of Object.entries(MARCAS)) if (!el.hasAttribute(k)) el.setAttribute(k, v)
  if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off')
}

function marcarTodo(raiz: ParentNode) {
  raiz.querySelectorAll('input, textarea').forEach(marcar)
}

export function SinAutofill() {
  useEffect(() => {
    marcarTodo(document)
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n instanceof Element) {
            marcar(n)
            marcarTodo(n)
          }
        })
      }
    })
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])
  return null
}
