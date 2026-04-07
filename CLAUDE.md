# Frontend — frontend_cadinc_gestion

## Contexto del sistema

**CADINC SRL** es una empresa constructora argentina. Este frontend es su sistema de gestión interna.

**Módulos del negocio:**
- **Tarja** (`/tarja`): grilla semanal de horas por obra. Operarios en filas, días en columnas. Central del sistema
- **Cierres**: se muestran dentro de cada obra en `TarjaObraPage`. Calculan horas + costos + contratistas por semana
- **Herramientas** (`/herramientas`): inventario de equipos con movimientos entre obras
- **Logística** (`/logistica`): viajes de camiones, choferes, liquidaciones semanales
- **Personal** (`/personal`): legajos de operarios
- **Configuración** (`/configuracion`): categorías laborales y usuarios/permisos

**Vocabulario clave del dominio:**
- `Obra`: proyecto de construcción. `cod` es la PK
- `Legajo (leg)`: ID único del operario
- `sem_key`: clave de semana = fecha del viernes (YYYY-MM-DD)
- `vh`: valor hora = tarifa horaria del operario
- `Cierre`: bloqueo semanal de horas para calcular el pago
- `Certificación`: monto fijo de contratista por semana

**Referencia de negocio**: `index.html` en la raíz del proyecto es el sistema viejo con toda la lógica implementada.

App de gestión construida con **Next.js App Router + React 19 + TypeScript**. Estilos con **Tailwind CSS** (tokens custom). Servidor con **React Query**. UI global con **Zustand**.

> ⚠️ Esta versión de Next.js tiene breaking changes. Leer `node_modules/next/dist/docs/` antes de escribir código nuevo.

## Comandos

```bash
npm run dev          # desarrollo
npm run build        # build de producción
npm run lint         # ESLint
npm run lint:fix     # ESLint con auto-fix
npm run typecheck    # TypeScript sin emitir
npm run format       # Prettier
```

## Estructura de carpetas

```
src/
├── app/
│   ├── (app)/[ruta]/page.tsx     # páginas protegidas
│   └── (auth)/login/page.tsx     # páginas públicas
├── modules/[feature]/
│   ├── components/[Feature]Page.tsx
│   └── hooks/use[Entidad].ts
├── components/ui/                 # Button, Modal, Badge, Chip, Input, Select, Toast
├── lib/api/                       # client.ts + [entidad].api.ts
├── lib/utils/                     # costos.ts, dates.ts, excel.ts
├── types/domain.types.ts          # TODOS los tipos de dominio
├── store/                         # Zustand: ui.store.ts, session.store.ts
└── hooks/                         # usePermisos.ts, etc.
```

---

## Design System — tokens Tailwind

**Colores** (`tailwind.config.ts`):
| Token | Valor | Uso |
|---|---|---|
| `azul` / `azul-mid` / `azul-light` | #0F2744 | Color principal, textos, headers |
| `naranja` / `naranja-dark` / `naranja-light` | #E8621A | Acciones primarias, acentos |
| `verde` / `verde-light` | #1A6B3C | Éxito, estado cerrado |
| `amarillo` / `amarillo-light` | #F5A623 | Pendiente, advertencias |
| `rojo` / `rojo-light` | #C0392B | Error, eliminación |
| `gris` / `gris-mid` / `gris-dark` | #F0EFEB | Fondos, bordes, textos secundarios |

**Tipografías**:
- `font-sans` → Syne (textos generales)
- `font-mono` → JetBrains Mono (números, montos)
- `font-display` → Bebas Neue (títulos grandes, headers)

**Clases custom**: `rounded-card` (14px), `shadow-card`, `shadow-card-lg`

---

## Plantillas exactas

### Hook React Query (`modules/[feature]/hooks/use[Entidad].ts`)
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { [Entidad], Create[Entidad]Dto, Update[Entidad]Dto } from '@/types/domain.types'

export const [ENTIDAD]_KEY = ['[entidad]'] as const

export function use[Entidad]s() {
  return useQuery({
    queryKey: [ENTIDAD]_KEY,
    queryFn: () => apiGet<[Entidad][]>('/api/[ruta]'),
  })
}

export function useCreate[Entidad]() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Create[Entidad]Dto) => apiPost<[Entidad]>('/api/[ruta]', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ENTIDAD]_KEY }),
  })
}

export function useUpdate[Entidad]() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Update[Entidad]Dto }) =>
      apiPatch<[Entidad]>(`/api/[ruta]/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ENTIDAD]_KEY }),
  })
}

export function useDelete[Entidad]() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/[ruta]/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ENTIDAD]_KEY }),
  })
}
```

### Tipos de dominio (`types/domain.types.ts`)
```typescript
// ── [Entidad] ──
export interface [Entidad] extends AuditFields {
  id: number
  nom: string
  // campos del dominio
}

export interface Create[Entidad]Dto {
  nom: string
  // campos requeridos
}

export interface Update[Entidad]Dto {
  nom?: string
  // todos opcionales
}
```

### Componente de página (`modules/[feature]/components/[Feature]Page.tsx`)
```typescript
'use client'

import { useState } from 'react'
import { use[Entidad]s, useCreate[Entidad], useUpdate[Entidad], useDelete[Entidad] } from '../hooks/use[Entidad]'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/hooks/usePermisos'

export function [Feature]Page() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('[modulo]')
  const { data: items = [], isLoading } = use[Entidad]s()
  const { mutate: create, isPending: creating } = useCreate[Entidad]()
  const [modal, setModal] = useState(false)

  if (isLoading) return <div className="p-8 text-gris-dark text-sm">Cargando...</div>

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl tracking-wider text-azul">[TÍTULO]</h1>
        {puedeCrear && (
          <Button size="sm" onClick={() => setModal(true)}>+ Nuevo</Button>
        )}
      </div>

      {/* Contenido */}
      {/* ... */}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nuevo [entidad]">
        {/* form */}
      </Modal>
    </div>
  )
}
```

### Store Zustand (`store/[nombre].store.ts`)
```typescript
import { create } from 'zustand'

interface [Nombre]Store {
  // estado
  valor: string
  // acciones
  setValor: (v: string) => void
}

export const use[Nombre]Store = create<[Nombre]Store>((set, get) => ({
  valor: '',
  setValor: (v) => set({ valor: v }),
}))
```

### Componente UI primitivo (`components/ui/[Nombre].tsx`)
```typescript
'use client'

import { type ReactNode } from 'react'

interface [Nombre]Props {
  children: ReactNode
  variant?: 'default' | 'outline'
}

const variants = {
  default: 'bg-naranja text-white',
  outline: 'border border-naranja text-naranja',
}

export function [Nombre]({ children, variant = 'default' }: [Nombre]Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${variants[variant]}`}>
      {children}
    </span>
  )
}
```

---

## Reglas importantes

- **Nunca usar estilos inline** — solo clases Tailwind con los tokens del design system
- **Todos los tipos** van en `types/domain.types.ts`, agrupados por sección con `// ── Entidad ──`
- **Todas las llamadas a la API** van por `lib/api/client.ts` (apiGet, apiPost, apiPatch, apiDelete, apiPut)
- **Datos del servidor** → React Query hook en `modules/[feature]/hooks/`
- **Estado de UI** → Zustand store
- **Verificar permisos** con `usePermisos('[modulo]')` antes de mostrar botones de acción
- Usar `useToast()` para feedback al usuario (`toast('mensaje', 'ok' | 'err' | 'warn')`)
- Los modales usan el componente `<Modal>` de `components/ui/Modal.tsx`
- Los formularios usan **React Hook Form + Zod resolver**
- `'use client'` solo cuando el componente usa hooks, eventos o browser APIs
