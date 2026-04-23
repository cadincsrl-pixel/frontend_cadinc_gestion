@AGENTS.md

# CLAUDE.md — Frontend `frontend_cadinc_gestion` (ERP CADINC SRL)

> Contexto operativo del proyecto. Leer completo antes de escribir código.
> Para detalles exhaustivos: `CONTEXT_DUMP.md` en la raíz del repo.
> Repo hermano del backend: ver §12 "Repos hermanos".

---

## 1. Qué es esto

**CADINC SRL** es una empresa argentina de construcción y logística. Este sistema es su **ERP interno**: reemplaza planillas Excel y procesos manuales, unificando operación y administración.

El código está partido en **dos repos**:
- `frontend_cadinc_gestion` — UI (Next.js 16 + React 19) ← **este repo**
- `cadincsrl` — API (Hono + Supabase) ← repo hermano

Comparten base de datos en Supabase.

## 2. Stack

**Frontend**: Next.js 16.2.1 (App Router), React 19.2.4, TypeScript, Tailwind v3, React Query v5, Zustand v5, React Hook Form + Zod v4, `@supabase/ssr` + `@supabase/supabase-js`.

**Base de datos**: Supabase (PostgreSQL 17.6), ref `xclobkgmaxioifpkukul`. ~68 tablas. Storage en 2 buckets principales: `cert-adjuntos` (facturas/certificaciones) y `remitos-logistica` (público).

⚠️ **Next.js 16 + React 19 son versiones recientes con breaking changes respecto al training data. Antes de asumir APIs, consultar `node_modules/next/dist/docs/` o los docs oficiales vía web.** (Este warning también está en `AGENTS.md` — ese archivo se carga automáticamente vía `@AGENTS.md` arriba.)

## 3. Arquitectura

Flujo de una request mutativa iniciada desde el frontend:

```
Cliente (Next.js) 
  → apiPost/Patch/Delete (inyecta Bearer token desde la sesión de Supabase)
  → Hono backend (repo cadincsrl)
  → authMiddleware (verifica JWT)
  → requirePermiso(modulo, accion) o requirePermisoOr(...)
  → Handler (valida con zod, opera sobre Supabase con cliente per-request)
  → auditMiddleware (loguea post-respuesta si 2xx y método mutativo)
  → Respuesta
```

**El frontend NUNCA muta datos directamente contra Supabase con la anon key.** Toda mutación pasa por el backend Hono.

## 4. Dominios (10 módulos)

| Módulo | Qué hace | Ruta frontend |
|---|---|---|
| **Tarja** | Horas por operario/obra/semana, cierre semanal, recibos | `/tarja`, `/tarja/[obraCod]` |
| **Personal** | CRUD trabajadores, categorías, condición (blanco/asegurado) | `/personal` (tab de tarja) |
| **Logística** | Flota, tramos con remitos, liquidaciones choferes, facturación a empresas transportistas | `/logistica` |
| **Certificaciones** | Solicitudes de compra con workflow granular (ver §5.1) | `/certificaciones` |
| **Stock** | Inventario depósito central, entradas/salidas, import/export Excel | (integrado) |
| **Herramientas** | Inventario + trazabilidad entre obras | `/herramientas/*` |
| **Caja** | Movimientos con centros de costo y conceptos | `/caja` |
| **Ropa** | Entregas por categoría con vencimiento | `/tarja/ropa` |
| **Préstamos** | Adelantos con descuento en semana | `/tarja/prestamos` |
| **Admin** | Usuarios, permisos, auditoría | `/admin` |

## 5. Reglas de negocio NO-OBVIAS (críticas)

### 5.1 Tracking a nivel line-item (certificaciones)
El estado se trackea por **cada ítem** de la solicitud, no por la solicitud. Una misma solicitud puede tener un ítem `comprado`, otro `de_deposito` y otro `pendiente`. `solicitud_compra_item.estado` es fuente de verdad.

Estados válidos: `pendiente`, `comprado`, `de_deposito`, `enviado`, `rechazado`.

**Dos caminos de resolución**:
- **Compra externa** → estado `comprado`. Requiere `proveedor_id` + `precio_unit` + opcional `factura_id`.
- **Despacho depósito** → estado `de_deposito`. Descuenta `stock_movimientos` con `motivo='despacho_obra'`.

**Ambos caminos registran en `materiales_a_cuenta_cliente`** (el input para facturar al cliente de la obra), **EXCEPTO** cuando la obra de destino es depósito interno (`obras.es_deposito = true`) — ahí es reposición de stock, no facturable.

El campo `materiales_a_cuenta_cliente.origen` persiste uno de dos valores (restringido por CHECK constraint):
- `'proveedor'` → resolución vía compra externa.
- `'deposito'` → resolución vía despacho de depósito.

### 5.2 Resolución transaccional vía RPCs (Abril 2026)
Las operaciones de resolución de items usan RPCs de PostgreSQL (`resolver_item_compra`, `resolver_item_despacho`) que son transaccionales con locks `FOR UPDATE`. Activación del backend detrás del feature flag `USE_RPC_RESOLVER` (env var). Default off = camino legacy; on = RPCs atómicas. Ver migraciones `20260422_rpc_resolver_items.sql` y `20260423_profiles_forzar_despacho.sql`.

### 5.3 Semana viernes → jueves
CADINC cierra semanas los jueves. Todo `sem_key` es el ISO del **viernes** de esa semana. Helpers en `src/lib/utils/dates.ts`: `getViernes`, `getSemDays`, `toISO`. **Nunca calcular semanas con lunes-domingo.**

### 5.4 RLS permisiva por diseño
Las 68 tablas tienen RLS habilitado pero con policies `using(true) with check(true)`. La seguridad real está en el **backend Hono**, que autentica con JWT y valida permisos. La anon key **no se usa para mutar datos**. No proponer cambios a RLS estricta sin consultar — rompería el modelo.

### 5.5 Permisos granulares
Esquema: `permisos: { modulo: { lectura, creacion, actualizacion, eliminacion, tabs[], <flags_extra> } }` en `profiles.permisos` (JSONB).

- **Backend**: `requirePermiso(modulo, accion)` en cada ruta mutativa. Admin (`rol='admin'`) hace bypass.
- **Frontend**: `usePermisos('modulo')` → `{ puedeVer, puedeCrear, puedeEditar, puedeEliminar }`.
- **Flags extra** (como `forzar_despacho` en certificaciones): se chequean inline en el handler del endpoint cuando son condicionales al body.
- **Excepción conocida**: `personal` no es módulo asignable, es tab de `tarja`. Endpoints usan `requirePermisoOr('personal', 'tarja')`.

### 5.6 Auditoría automática
`auditMiddleware` del backend corre **después** de la respuesta. Solo loguea POST/PATCH/PUT/DELETE con status 2xx. Extrae entidad/acción de la ruta. **No escribir auditoría manual en handlers**, ya está cubierta.

### 5.7 Auto-archivo de obras
`useObras()` dispara `POST /api/obras/auto-archivar` una vez cada 6h por navegador (localStorage). Backend archiva obras sin horas cargadas en las últimas 3 semanas.

## 6. Convenciones de código (frontend)

- **Feature-based folders**: `src/modules/<feature>/{components,hooks,store}`. Sin `services/` (los hooks de React Query encapsulan API).
- **API client**: `src/lib/api/client.ts` expone `apiGet/Post/Put/Patch/Delete` con Bearer token. **Nunca hacer `fetch` directo.**
- **React Query**: `staleTime: 60000` por defecto. `queryKey` como constantes (`OBRAS_KEY = ['obras']`). Invalidar queries dependientes en `onSuccess` de mutations.
- **Forms**: `react-hook-form` + `zod` + `zodResolver`. Tipar siempre el form — **no usar `useForm<any>()`** en código nuevo (hay deuda heredada, no la repliques).
- **Zustand**: `session.store` (perfil), `ui.store` (obra activa, callbacks topbar), `modules/tarja/store/tarja.store.ts` (semActual).
- **UI**: componentes base en `components/ui/` (Button, Input, Select, Combobox, Modal, Toast, Chip, Badge, Pagination, AuditInfo). **Reutilizá antes de crear nuevos.**
- **Permisos en UI**: usar `usePermisos('modulo')` para **deshabilitar** botones (no ocultar — backend valida igual; ocultar confunde al usuario sin aportar seguridad).

### Naming
- **Español** para dominio de negocio: `solicitud_compra`, `materiales_a_cuenta_cliente`, `obraCod`, `semActual`, `puedeCrear`.
- **Inglés** para técnico genérico: `useState`, `fetch`, `onSubmit`.
- Snake_case en DB, camelCase en JS/TS.

## 7. Glosario CADINC

- **Tarja** — Planilla semanal de horas por operario.
- **Obra** — Proyecto de construcción en cliente (tiene código `obraCod`).
- **Cerrar semana** — Consolidar tarja de una obra para esa semana.
- **Condición** — Régimen laboral: `blanco` (en relación de dependencia) o `asegurado` (informal con seguro).
- **Categoría** — Rango salarial del operario (hay historial por trabajador).
- **Compulsa** — Proceso de licitación privada.
- **Remito** — Documento de entrega/despacho.
- **Fletero** — Subcontratista de transporte.
- **Batea** — Tipo de semirremolque.
- **Despacho** — Salida de material desde depósito interno.
- **Materiales a cuenta cliente** — Lo que se factura al cliente de la obra.
- **Centro de costo** — Clasificación contable para movimientos de caja.
- **Obra depósito** — Obra interna marcada con `es_deposito=true`. Sus materiales no se facturan al cliente; son reposición de stock.

## 8. Qué NO hacer

- ❌ Asumir APIs de Next.js anteriores a v16 o de React anteriores a v19. Siempre verificar.
- ❌ Proponer RLS estricta sin consultar (rompería el modelo actual).
- ❌ Usar la anon key para mutar datos desde el cliente.
- ❌ Agregar `useForm<any>()` o `as any` en código nuevo (hay deuda heredada, no replicar).
- ❌ Calcular semanas con lunes-domingo.
- ❌ Escribir auditoría manual en handlers — el middleware del backend ya cubre.
- ❌ Inventar columnas nuevas sin generar migración Supabase.
- ❌ Tocar `materiales_a_cuenta_cliente` sin entender los dos caminos de resolución + la excepción de `obras.es_deposito`.
- ❌ Modificar `permisos.modulo.accion` sin reflejar el cambio en backend Y frontend.
- ❌ Ignorar los warnings del advisor de Supabase sin documentar por qué.
- ❌ Hacer `fetch` directo desde componentes — usar `apiGet/Post/Put/Patch/Delete` del client central.

## 9. Deuda técnica conocida (no-urgente)

- **Modelos paralelos sin consolidar**: `empresas` vs `empresas_transportistas`, `viajes/cargas/descargas` vs `tramos`, múltiples sistemas de remitos (`remitos` vs `remitos_envio` vs `remitos_carga/descarga`).
- **Columnas duplicadas**: `camiones.año` y `camiones.anio`.
- **`useForm<any>` pendientes de tipado**: ViajesTab, PersonalPage.
- **68 tablas con RLS permisiva**: es decisión consciente, pero documentar antes de cualquier cambio.
- **Login de herramientas separado** (`/herramientas/login`): coexiste con `/login`, razón no documentada.
- **Falta índice** en `stock_movimientos.material_id` y `.solicitud_item_id`. Considerarlo si el volumen crece.
- **`npm audit` en el backend**: 3 vulnerabilidades (2 moderate, 1 high) detectadas al clonar. Evaluar con contexto, no correr `audit fix` a ciegas.

## 10. Comandos útiles

### Frontend (este repo)
```bash
npm run dev      # Dev server (puerto 3000)
npm run build    # Build prod
npm run lint     # ESLint
```

### Supabase
- MCP de Supabase está conectado en Claude Code (si instalaste el plugin). Usarlo para `list_tables`, `execute_sql`, `apply_migration`.
- Dashboard: https://supabase.com/dashboard/project/xclobkgmaxioifpkukul
- Migraciones viven en `supabase/migrations/` de **este repo** (frontend), aunque afecten al backend también. Es la única ubicación versionada.

### Git
- Rama principal: `main` (producción).
- Commits con prefijo: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.

## 11. Subagentes disponibles

Viven en `.claude/agents/` de este repo:
- `frontend-specialist` — UI/UX, React, formularios, componentes
- `backend-specialist` — APIs Hono, queries, transacciones (aunque el código backend viva en el otro repo)
- `database-architect` — schema, migraciones, RPCs
- `nextjs-react-specialist` — gotchas de Next.js 16 / React 19
- `security-specialist` — Auth, permisos, RLS, datos sensibles
- `code-reviewer` — Revisión previa a commit

Invocar con: *"Usá al subagente X para..."*. También se activan proactivamente según su `description`.

## 12. Repos hermanos

El backend Hono (`cadincsrl`) NO está en este monorepo. Vive en un repo separado, ubicado en:

```
/Users/francoleiro/cadincsrl
```

Ambos repos comparten la misma base de datos en Supabase (ref `xclobkgmaxioifpkukul`) y se comunican vía HTTP con JWT.

### Cuándo necesitás cruzar al backend
- Diseñar un endpoint nuevo → leer primero cómo están estructurados los existentes en `cadincsrl/src/modules/<modulo>/`.
- Cambiar el shape de una respuesta → actualizar también el tipo en el frontend y los queries de React Query que lo consumen.
- Agregar un permiso nuevo → tocar tanto `requirePermiso[Or]` en backend como `usePermisos` en frontend.
- Diseñar una RPC de Supabase → el `database-architect` la crea vía MCP; el `backend-specialist` la llama desde el service.

### Archivos clave del backend
- `cadincsrl/src/index.ts` — entry point, setup de middlewares globales
- `cadincsrl/src/middleware/auth.ts` — `authMiddleware` (verifica JWT vía JWKS)
- `cadincsrl/src/middleware/permission.ts` — `requirePermiso`, `requirePermisoOr`
- `cadincsrl/src/middleware/audit.ts` — `auditMiddleware`
- `cadincsrl/src/modules/<modulo>/<modulo>.routes.ts` — definición de rutas
- `cadincsrl/src/modules/<modulo>/<modulo>.service.ts` — lógica de negocio
- `cadincsrl/src/lib/supabase.ts` — instancias de cliente Supabase (service role + per-request)

### Antes de buscar con `find /`
Si un subagente no encuentra un archivo del backend en `/Users/francoleiro/cadincsrl/`, **preguntale al usuario** antes de hacer búsquedas globales — el usuario puede haber movido el repo, no tener el backend clonado, o estar trabajando desde otra máquina.

### Cómo levantar el backend en local
```bash
cd /Users/francoleiro/cadincsrl
npm run dev    # http://localhost:3001
```

El frontend espera al backend en `http://localhost:3001` (configurable vía env).

---

_Última actualización: 2026-04-23._
