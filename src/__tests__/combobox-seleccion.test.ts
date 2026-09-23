// Combobox: una opción se elige con CLICK, no con mousedown, y ningún botón
// del dropdown es submit (bug del 2026-09-23 en Facturación: se buscó
// «CLINICA HERAS» y quedó «9 DE JULIO 882», la primera de la lista completa).
// Sin DOM en los tests: se inspecciona el elemento que devuelve el componente.
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { OptionButton } from '@/components/ui/Combobox'

type Props = {
  type?: string
  onClick?: () => void
  onMouseDown?: (e: { preventDefault: () => void }) => void
}

function render(value: string) {
  const onSelect = vi.fn()
  const el = OptionButton({ o: { value, label: value }, selected: false, onSelect }) as ReactElement<Props>
  return { el, onSelect }
}

describe('Combobox · OptionButton', () => {
  it('es type="button": Enter en un input del form no la «clickea» por submit implícito', () => {
    expect(render('CC CLINICA HERAS').el.props.type).toBe('button')
  })

  it('el mousedown NO elige (solo evita que el input pierda el foco)', () => {
    const { el, onSelect } = render('CC-013')
    const preventDefault = vi.fn()
    el.props.onMouseDown?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('el click elige ESA opción', () => {
    const { el, onSelect } = render('CC CLINICA HERAS')
    el.props.onClick?.()
    expect(onSelect).toHaveBeenCalledWith('CC CLINICA HERAS')
  })
})
