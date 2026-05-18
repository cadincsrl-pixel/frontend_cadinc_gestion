/**
 * Props comunes para inputs que aceptan SOLO números enteros (sin decimales).
 *
 * Bloquea:
 *  - el carácter '.' y ',' del teclado (decimales).
 *  - 'e' / 'E' / '+' / '-' (notación científica y signos).
 *
 * Usar:
 *   <Input label="Km" {...intInputProps} {...form.register('km_actuales')} />
 *
 * Nota: el handler de onKeyDown lo añadís inline si el caller ya tiene uno.
 * Si no, este spread lo cubre.
 */
import type { KeyboardEvent, InputHTMLAttributes } from 'react'

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
}
