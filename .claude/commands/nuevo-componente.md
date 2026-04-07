Crea un nuevo componente UI primitivo en `src/components/ui/` siguiendo el design system del proyecto.

El nombre del componente es: $ARGUMENTS

## Pasos a seguir

1. Leer los componentes existentes en `src/components/ui/` para verificar que no existe uno similar.

2. Crear `src/components/ui/$ARGUMENTS.tsx` siguiendo estas reglas:
   - Usar solo clases Tailwind con los tokens del design system (azul, naranja, verde, amarillo, rojo, gris y sus variantes)
   - Definir variantes como `Record<Variant, string>` con clases Tailwind
   - Agregar `'use client'` si usa hooks o eventos del browser
   - Usar `forwardRef` si es un elemento interactivo (input, button, etc.)
   - Tipar las props con una interfaz explícita

3. Confirmar al usuario las variantes que creó y si necesita ajustar algo.
