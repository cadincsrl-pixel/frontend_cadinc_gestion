/**
 * Props comunes para inputs que aceptan SOLO números enteros (sin decimales).
 *
 * Bloquea:
 *  - el carácter '.' y ',' del teclado (decimales).
 *  - 'e' / 'E' / '+' / '-' (notación científica y signos).
 *  - la rueda del mouse (el input numérico nativo incrementa/decrementa al
 *    scrollear con el campo enfocado — cambia valores sin querer; el blur
 *    deja que el scroll siga siendo scroll).
 *
 * Usar:
 *   <Input label="Km" {...intInputProps} {...form.register('km_actuales')} />
 *
 * Nota: los handlers los añadís inline si el caller ya tiene uno.
 * Si no, este spread los cubre.
 */
import type { KeyboardEvent, WheelEvent, InputHTMLAttributes } from 'react'

export const intInputProps: Partial<InputHTMLAttributes<HTMLInputElement>> = {
  type: 'number',
  step: '1',
  min: '0',
  inputMode: 'numeric',
  pattern: '[0-9]*',
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
    if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault()
    }
  },
  onWheel: (e: WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur()
  },
}
