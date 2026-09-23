// Combobox: una opción se elige con CLICK, no con mousedown, y ningún botón
// del dropdown es submit (bug del 2026-09-23 en Facturación: se buscó
// «CLINICA HERAS» y quedó «9 DE JULIO 882», la primera de la lista completa).
// Sin DOM en los tests: se inspecciona el elemento que devuelve el componente.
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { OptionButton, clickElige } from '@/components/ui/Combobox'

type Props = {
  type?: string
  onClick?: (e: { detail: number }) => void
  onMouseDown?: (e: { preventDefault: () => void }) => void
}

function render(value: string) {
  const onSelect = vi.fn()
  const onPress = vi.fn()
  const el = OptionButton({ o: { value, label: value }, selected: false, onSelect, onPress }) as ReactElement<Props>
  return { el, onSelect, onPress }
}

describe('Combobox · OptionButton', () => {
  it('es type="button": Enter en un input del form no la «clickea» por submit implícito', () => {
    expect(render('CC CLINICA HERAS').el.props.type).toBe('button')
  })

  it('el mousedown NO elige: evita que el input pierda el foco y marca la opción apretada', () => {
    const { el, onSelect, onPress } = render('CC-013')
    const preventDefault = vi.fn()
    el.props.onMouseDown?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(onPress).toHaveBeenCalledWith('CC-013')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('el click pasa ESA opción y si vino del mouse o del teclado', () => {
    const { el, onSelect } = render('CC CLINICA HERAS')
    el.props.onClick?.({ detail: 1 })
    expect(onSelect).toHaveBeenCalledWith('CC CLINICA HERAS', false)
    el.props.onClick?.({ detail: 0 })
    expect(onSelect).toHaveBeenLastCalledWith('CC CLINICA HERAS', true)
  })
})

describe('Combobox · el click solo elige la opción donde se apretó', () => {
  // El bug: entre el mousedown y el click la lista se redibujaba completa y el
  // click caía sobre la primera fila («9 DE JULIO 882», «CLIENTE PRUEBA»).
  it('apretar en una opción y soltar sobre otra NO elige', () => {
    expect(clickElige('CC CLINICA HERAS', 'CC-013', false)).toBe(false)
  })
  it('sin mousedown previo (lista redibujada) NO elige', () => {
    expect(clickElige(null, 'CC-013', false)).toBe(false)
  })
  it('apretar y soltar sobre la misma opción elige', () => {
    expect(clickElige('CC CLINICA HERAS', 'CC CLINICA HERAS', false)).toBe(true)
  })
  it('Enter o Espacio sobre la opción enfocada elige', () => {
    expect(clickElige(null, 'CC-013', true)).toBe(true)
  })
})
