# frontend_cadinc_gestion

ERP interno de **CADINC SRL** — empresa argentina de construcción y logística. Reemplaza planillas Excel y procesos manuales, unificando operación y administración en una sola app.

Este repo es la **UI** (Next.js 16 + React 19). La API vive en un repo hermano (`cadincsrl`, Hono) y comparten DB en Supabase.

## Arquitectura

```
┌──────────────────┐   HTTPS + Bearer JWT   ┌──────────────────┐    ┌─────────────────┐
│  FRONTEND (UI)   │ ─────────────────────▶ │  BACKEND (API)   │───▶│  Supabase       │
│  Next.js 16      │                        │  Hono + Node     │    │  Postgres 17.6  │
│  Vercel          │ ◀───────────────────── │  Render          │    │  Auth + Storage │
└──────────────────┘                        └──────────────────┘    └─────────────────┘
```

- **Frontend (este repo)** — Vercel. Build automático en cada push a `main`.
- **Backend** — `~/cadincsrl`, deployado en Render (web service manual + cron de GPS declarado en `render.yaml`).
- **DB** — Supabase (`xclobkgmaxioifpkukul`), ~80 tablas, 9 buckets de Storage.

El frontend **nunca muta datos** directo con la anon key. Toda mutación va por el backend Hono, que valida JWT + permisos granulares antes de tocar la DB.

## Stack

- **Framework**: Next.js 16.2 (App Router) + React 19.2
- **Estilos**: Tailwind v3 + componentes base en `src/components/ui/`
- **Estado**: React Query v5 (server state) + Zustand v5 (UI/session)
- **Forms**: React Hook Form + Zod v4
- **Supabase client**: `@supabase/ssr` + `@supabase/supabase-js`
- **TypeScript** estricto

## Módulos (10)

| Módulo | Qué hace |
|---|---|
| **Tarja** | Horas por operario/obra/semana, cierre semanal, recibos PDF |
| **Personal** | CRUD trabajadores, categorías, documentos (DNI, alta temprana) |
| **Logística** | Tramos, liquidaciones, choferes, camiones/bateas, facturación, gastos, rentabilidad |
| **Certificaciones** | Solicitudes de compra workflow line-item, stock interno, stock proveedor, materiales facturables |
| **Stock** | Inventario depósito central, entradas/salidas, import/export Excel |
| **Herramientas** | Inventario + trazabilidad entre obras + vista por obra |
| **Caja** | Movimientos con centros de costo y conceptos |
| **Ropa** | Entregas por categoría con vencimiento |
| **Préstamos** | Adelantos con descuento en semana |
| **Admin** | Usuarios, permisos, auditoría |

## Arrancar en local

Requisitos: Node ≥ 20, `npm` o equivalente, acceso a Supabase y al backend Hono corriendo.

```bash
# 1. Backend (otra terminal, repo hermano)
cd ~/cadincsrl
npm install
npm run dev          # http://localhost:3001

# 2. Frontend (este repo)
npm install
npm run dev          # http://localhost:3000
```

### Variables de entorno

`.env.local` necesita al menos:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xclobkgmaxioifpkukul.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_API_URL=http://localhost:3001   # o la URL del backend en Render
```

## Scripts

```bash
npm run dev      # Dev server (puerto 3000)
npm run build    # Build prod
npm run start    # Servir build
npm run lint     # ESLint
```

## Estructura

```
src/
├── app/                  # Next.js App Router (rutas)
│   └── (app)/            # Layout autenticado
├── components/
│   ├── ui/               # Button, Input, Modal, Combobox, etc.
│   └── layout/           # Sidebar, Topbar, NotificationsBell
├── modules/              # Feature folders: <modulo>/{components, hooks, store}
├── lib/
│   ├── api/              # apiGet/Post/Put/Patch/Delete (cliente HTTP central)
│   ├── supabase/         # createClient
│   └── utils/            # dates, costos, excel, resumen-semana
├── hooks/                # Hooks compartidos (usePermisos, etc.)
├── store/                # Zustand: session.store, ui.store
└── types/                # domain.types.ts

supabase/
└── migrations/           # SQL de migraciones (versionadas en este repo)
```

## Despliegue

- **Frontend** → Vercel (push a `main` dispara build + deploy).
- **Backend** → Render (web service manual desde el dashboard + cron `render.yaml`).
- **Migraciones de Supabase** → vía MCP de Supabase en Claude Code (`apply_migration`) o desde el SQL Editor del dashboard. La carpeta `supabase/migrations/` es la fuente versionada — aplicar en orden cronológico al recrear desde cero.

## Documentación adicional

- **`CLAUDE.md`** — convenciones, reglas de negocio NO obvias, gotchas, deuda técnica conocida. Lectura obligatoria antes de tocar código.
- **`AGENTS.md`** — advertencia sobre Next.js 16 + React 19 (breaking changes vs versiones previas).
- **`CONTEXT_DUMP.md`** — detalles exhaustivos del proyecto (datos extendidos del CLAUDE.md).
- **`.claude/agents/`** — subagentes especializados (frontend, backend, database, security, code review).

## Repos hermanos

- **Backend Hono**: `cadincsrl` (`~/cadincsrl` en local).
- Comparten DB en Supabase (ref `xclobkgmaxioifpkukul`) y se comunican vía HTTP con JWT.
