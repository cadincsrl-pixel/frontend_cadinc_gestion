Crea un nuevo módulo completo en el frontend siguiendo la arquitectura del proyecto.

El nombre del módulo es: $ARGUMENTS

## Pasos a seguir

1. Agregar los tipos al final de `src/types/domain.types.ts`:
   - Interfaz `[Entidad] extends AuditFields`
   - `Create[Entidad]Dto`
   - `Update[Entidad]Dto`

2. Crear `src/modules/$ARGUMENTS/hooks/use[Entidad].ts` con los 4 hooks CRUD usando la plantilla del CLAUDE.md.

3. Crear `src/modules/$ARGUMENTS/components/[Feature]Page.tsx` con la estructura base de página usando la plantilla del CLAUDE.md.

4. Crear `src/app/(app)/$ARGUMENTS/page.tsx` que importe y renderice el componente de página.

5. Agregar el módulo al sidebar en `src/components/layout/Sidebar.tsx`.

6. Confirmar al usuario qué endpoint de API asume y qué campos inferió. Preguntar si ajustar algo.
