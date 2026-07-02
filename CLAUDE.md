@AGENTS.md

# CLAUDE.md — Frontend `frontend_cadinc_gestion` (ERP CADINC SRL)

> Contexto operativo del proyecto. Leer completo antes de escribir código.
> Para detalles exhaustivos: `CONTEXT_DUMP.md` en la raíz del repo.
> Repo hermano del backend: ver §12 "Repos hermanos".

---

## 0. Workflow del agente — al cerrar un turno

**Antes de cerrar cualquier turno que haya generado uno o más commits, actualizar el diario de Obsidian** (`~/Documents/Notas-CADINC/Diario/YYYY-MM-DD.md`):

- Si el archivo del día no existe, crearlo siguiendo el formato del día anterior más reciente (frontmatter `type: diario` + `fecha` + tag, secciones 🎯 Foco / ✅ Hecho / 🚧 Pendientes / 🗒 Notas / 🔗 Links).
- Sumar una sub-sección por cada commit no trivial con: causa, fix, link al commit hash.
- No bajar al diario los chores triviales (rename de variables, typos sueltos) — solo lo que un futuro yo (o el user) necesitaría recordar.

**Por qué**: Obsidian es la fuente de verdad operativa del user. Las memorias del agente no son sustituto — el user lee el diario, el agente no. Sin esto, los aprendizajes y decisiones se pierden entre sesiones.

Hay un hook post-commit configurado en `.claude/settings.json` que dispara un recordatorio mecánico — esta sección sirve para juzgar **qué** anotar; el hook recuerda **cuándo**.

---

## 1. Qué es esto

**CADINC SRL** es una empresa argentina de construcción y logística. Este sistema es su **ERP interno**: reemplaza planillas Excel y procesos manuales, unificando operación y administración.

El código está partido en **dos repos**:
- `frontend_cadinc_gestion` — UI (Next.js 16 + React 19) ← **este repo**
- `cadincsrl` — API (Hono + Supabase) ← repo hermano

Comparten base de datos en Supabase.

## 2. Stack

**Frontend**: Next.js 16.2.1 (App Router), React 19.2.4, TypeScript, Tailwind v3, React Query v5, Zustand v5, React Hook Form + Zod v4, `@supabase/ssr` + `@supabase/supabase-js`.

**Base de datos**: Supabase (PostgreSQL 17.6), ref `xclobkgmaxioifpkukul`. ~80 tablas. Storage:
- `cert-adjuntos` (facturas/certificaciones, público).
- `remitos-logistica` (remitos de carga/descarga de tramos, público).
- `vehiculo-docs` (privado, signed URLs) — tarjeta verde, RTO, póliza, título de camiones y bateas.
- `personal-docs` (privado) — DNI, licencia y otros docs por trabajador.
- `chofer-docs` (privado) — DNI, licencia, libreta sanitaria, etc. de choferes.
- `gastos-logistica` (privado) — comprobantes de gastos de flota.
- `adelantos-logistica` (privado) — comprobantes de adelantos a choferes.
- `remitos-retiro-proveedor` (privado) — comprobantes de retiro de stock en proveedores.
- `cobros-docs` (privado) — adjuntos de cobros (líquido producto, comprobante de pago).

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
| **Tarja** | Horas por operario/obra/semana, cierre semanal, recibos PDF | `/tarja`, `/tarja/[obraCod]` |
| **Personal** | CRUD trabajadores, categorías, fecha_nacimiento, documentos (DNI, alta temprana, etc.) | `/personal` (tab de tarja) |
| **Logística** | Tramos, liquidaciones, choferes, **camiones y bateas**, lugares, facturación, gastos, **rentabilidad** (simulador) | `/logistica` |
| **Certificaciones** | Solicitudes de compra workflow granular (§5.1), stock interno, **stock en proveedores** (§5.8), materiales facturables | `/certificaciones` |
| **Stock** | Inventario depósito central, entradas/salidas, import/export Excel | (integrado en certificaciones) |
| **Herramientas** | Inventario + trazabilidad entre obras | `/herramientas/*` |
| **Caja** | Movimientos con centros de costo y conceptos | `/caja` |
| **Ropa** | Entregas por categoría con vencimiento | `/tarja/ropa` |
| **Préstamos** | Adelantos con descuento en semana | `/tarja/prestamos` |
| **Admin** | Usuarios, permisos, auditoría | `/admin` |

### 4.1 Sub-tabs de Logística (`/logistica?tab=...`)
- `viajes` — Tramos cargados/vacíos con remitos foto/PDF, filtro por chofer/tipo/estado/fechas.
- `liquidaciones` — Saldo por chofer + creación de liquidaciones, **adelantos con comprobante foto/PDF**.
- `facturacion` — Cobros a empresas transportistas con adjuntos.
- `choferes` — CRUD con `cuil` (no DNI), camión preasignado (`camion_id`), batea preasignada (`batea_id`), documentos (DNI, licencia, libreta sanitaria, etc.). Modal arranca en modo **detalle** read-only; botón "Editar" lo habilita.
- `camiones` — Sub-tabs internos: Camiones / Bateas. Documentos por vehículo (tarjeta verde, RTO, póliza, título) con `vence_el`.
- `lugares` — Canteras y depósitos.
- `gastos` — Combustible, peajes, viáticos. Inmutabilidad de campos financieros si está aprobado/liquidado.
- `rentabilidad` — Simulador de margen por viaje (porteado del Excel YTL). Tablas `rentabilidad_parametros` (versionada) + `rentabilidad_viajes`.

### 4.2 Sub-tabs de Certificaciones (`/certificaciones?tab=...`)
- `solicitudes` — Pedidos de compra y workflow line-item (§5.1).
- `stock` — Stock en depósito interno por rubro.
- `stock-proveedor` — Materiales **comprados pero todavía en el galpón del proveedor** (§5.8).
- `materiales` — Materiales a cuenta del cliente (facturable).

## 5. Reglas de negocio NO-OBVIAS (críticas)

### 5.1 Tracking a nivel line-item (certificaciones)
El estado se trackea por **cada ítem** de la solicitud, no por la solicitud. Una misma solicitud puede tener un ítem `comprado`, otro `de_deposito` y otro `pendiente`. `solicitud_compra_item.estado` es fuente de verdad.

Estados válidos: `pendiente`, `comprado`, `de_deposito`, `en_proveedor`, `retirado`, `enviado`, `rechazado`.

**Tres caminos de resolución**:
- **Compra externa** → estado `comprado`. Requiere `proveedor_id` + `precio_unit` + opcional `factura_id`. Inserta en MCC inmediatamente.
- **Despacho depósito** → estado `de_deposito`. Descuenta `stock_movimientos` con `motivo='despacho_obra'`. Inserta en MCC inmediatamente.
- **Compra que queda en proveedor** → estado `en_proveedor`. Mismos campos que compra. **NO inserta en MCC todavía**. Suma una entrada en `stock_proveedor_movimientos`. Cuando se retire (con remito) pasa a `retirado` y recién ahí se factura. Ver §5.8.

**Compra y despacho registran en `materiales_a_cuenta_cliente`** (el input para facturar al cliente de la obra), **EXCEPTO** cuando la obra de destino es depósito interno (`obras.es_deposito = true`) — ahí es reposición de stock, no facturable.

El campo `materiales_a_cuenta_cliente.origen` persiste uno de dos valores (restringido por CHECK constraint):
- `'proveedor'` → resolución vía compra externa o retiro de stock en proveedor.
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

### 5.7 Hard cap PostgREST (1000 rows) + cuándo usar RPC
El servidor PostgREST de Supabase impone un **cap duro de 1000 rows por response que NO se bypassea desde el cliente**. Pasar `.range(0, 99999)` o header `Range: 0-99999` parece arreglarlo pero el server recorta igual (verificable: `content-range: 0-999/N`).

**Síntoma típico**: un capataz/jefe-de-obra con muchas semanas cargadas (>1000 filas en `horas` para sus obras) deja de ver trabajadores recientes — el cap recorta los rows nuevos antes de que el backend los pase al filter.

**Regla**: cualquier query Supabase de la forma
```ts
supabase.from('X').select(...).in('obra_cod', allowed)
```
sobre una tabla que **puede crecer >1000 rows totales en las obras del usuario** debe ir vía **RPC con `RETURNS SETOF X`** o con DISTINCT/agregación server-side.

**RPCs vivas para este patrón** (todas en migración `20260520_rpcs_de_obras.sql` salvo la primera):
- `legs_de_obras(text[])` — DISTINCT de legs en `horas+asignaciones` (`20260520_rpc_legs_de_obras.sql`)
- `asignaciones_de_obras(text[])` · `cierres_de_obras(text[])` · `hs_extras_de_obras(text[])`
- `certificaciones_de_obras(text[])` · `tarifas_de_obras(text[])` · `cat_obra_de_obras(text[])`
- `rutas_de_canteras_depositos(int[], int[])` — doble filtro

Caso histórico: 2026-05-20 — Candela (jefe_obra, 1705 filas en sus obras) no veía 5 trabajadores. Fix con `legs_de_obras`. La feature de auto-archivado de obras se eliminó el mismo día.

### 5.8 Stock en proveedor (compras pendientes de retiro)
Cuando se compra un material y queda físicamente en el galpón del proveedor (no llega a CADINC ni a la obra todavía), se marca como `en_proveedor`:
- **RPC `resolver_item_en_proveedor`**: setea estado, agrega entrada en `stock_proveedor_movimientos`. NO inserta en MCC.
- **RPC `retirar_de_proveedor(p_proveedor_id, p_obra_cod, p_fecha, p_comprobante_*, p_items, p_user_id)`**: crea `remitos_retiro_proveedor` (numerado RR-NNNN auto), inserta movimientos de salida (parciales OK), y **recién ahí** inserta/actualiza MCC con la cantidad acumulada retirada. Comprobante (foto/PDF) en bucket `remitos-retiro-proveedor` con dedup sha256.
- Vista `v_stock_proveedor` (VIEW normal con `security_invoker`, no materializada; cantidad pendiente por item = entradas − salidas).

### 5.9 Notificaciones (campana del topbar)
Hook `src/hooks/useNotificaciones.ts` calcula 4 secciones in-memory (sin tabla persistente):
- **Cumpleaños hoy** — usa `personal.fecha_nacimiento`. Cuenta para el badge rojo.
- **Cumpleaños próximos 7 días** — informativo (punto azul).
- **Papeles vencidos** (camiones/bateas) — usa vista `v_vehiculo_documentos_vencimientos`. Cuenta para el badge rojo.
- **Papeles por vencer 30 días** — informativo.

`<NotificationsBell />` (en `Topbar.tsx`) muestra popover con las 4 secciones. Click en cumpleaño → `/personal?leg=XXX` (auto-abre modal). Click en papel → `/logistica?tab=camiones`. Endpoint backend: `GET /api/logistica/notificaciones/documentos`.

### 5.10 Conflicto de tarja en el mismo día
En `TarjaTable.tsx`: si un operario tiene horas en >1 obra el **mismo día** (no por semana), las celdas se marcan en **rojo** (fondo + borde + ícono ⚠) con tooltip indicando las otras obras y horas. Badge ↔ al lado del nombre solo si hay al menos un día de conflicto. Trabajar lunes en obra A y martes en obra B NO es conflicto.

### 5.11 Cálculo canónico de costos de tarja
La **fórmula correcta** usa `costoLegConCatObra` (en `src/lib/utils/costos.ts`) que respeta los overrides de `cat_obra` con redondeo per-leg al miles. Usada por:
- Chip "Costo semana" en `TarjaObraPage`.
- Footer de `TarjaTable`.
- `CierresSection` (cierres de semana).
- `ResumenHistoricoPage`.
Los 4 lugares deben dar el mismo número. La función vieja `calcularTotalesSemana` (que usa `costoLeg` sin cat_obra) **ya no se usa**.

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
- **Stock en proveedor** — Material comprado que queda en el galpón del proveedor hasta que se retira con remito. Aún no facturable al cliente.
- **Retiro** — Acción de traer material desde stock en proveedor a la obra. Genera `remitos_retiro_proveedor`.
- **Modalidad de pago al chofer** — `km_jornal` (km × $/km + jornal × días) o `pct_jornal` (% sobre tarifa × ton + jornal × días).

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
- ❌ Mergear features **multi-paso** (upload con signed URL, workflows entre 2+ endpoints, transacciones distribuidas) sin probar manualmente el happy path en local. TS check + build limpio NO atrapa mismatch de shapes entre repos backend/frontend (ej. el bug del 2026-05-19 donde el backend devolvía `path` y el frontend esperaba `storage_path` en upload de fotos de herramientas — 0 filas creadas en prod aunque el archivo sí subía al bucket).

## 9. Deuda técnica conocida (no-urgente)

- **Modelos paralelos sin consolidar**: `empresas` vs `empresas_transportistas`, `viajes/cargas/descargas` vs `tramos`, múltiples sistemas de remitos (`remitos` vs `remitos_envio` vs `remitos_carga/descarga` vs `remitos_retiro_proveedor`).
- **Columnas duplicadas**: `camiones.año` y `camiones.anio`.
- **`useForm<any>` pendientes de tipado**: ViajesTab, PersonalPage, ChoferesTab, BateasTab, RentabilidadTab, modal adelantos.
- **~80 tablas con RLS permisiva**: es decisión consciente, pero documentar antes de cualquier cambio.
- **Login de herramientas separado** (`/herramientas/login`): coexiste con `/login`, razón no documentada.
- ~~**Falta índice** en `stock_movimientos.material_id` y `.solicitud_item_id`~~ **RESUELTO** — creados en `20260424_perf_indices.sql` (verificado en DB viva 2026-07-01: `stock_movimientos_material_id_idx`, `stock_movimientos_solicitud_item_id_idx` parcial, `solicitud_compra_item_solicitud_estado_idx`).
- **`npm audit` en el backend**: 3 vulnerabilidades (2 moderate, 1 high) detectadas al clonar. Evaluar con contexto, no correr `audit fix` a ciegas.
- **Auto-archivado sin auditoría**: el endpoint `/api/obras/auto-archivar` no genera `audit_log` (filtro explícito en `audit.ts`). Si se necesita rastreo, agregar.
- **Sub-tabs Camiones/Bateas sin URL propia**: `CamionesYBateasTab.tsx` maneja sub-state local, no se puede deep-linkear al modal de un vehículo (la campana de notificaciones lleva al tab pero no abre el modal).
- **Notificaciones sin persistencia**: el hook `useNotificaciones` calcula in-memory. Para "marcar como leído" o silenciar habría que crear tabla `notificaciones_dismiss`.
- **Sin notificaciones de docs de choferes**: la campana muestra solo vencimientos de vehículos, no de papeles del personal de conducción (DNI, licencia).
- **`materiales_a_cuenta_cliente.cantidad` se sobrescribe** en cada retiro parcial desde proveedor (UPSERT con `ON CONFLICT (item_id)`). Eso pierde el detalle por retiro. Si se necesita auditar parciales, mirar `stock_proveedor_movimientos` que sí tiene el desglose.
- **⚠️ RPCs SECURITY DEFINER: SIEMPRE llamarlas con el cliente admin (`supabase` service_role), NUNCA con `createSupabaseClient(token)`.** Ese cliente per-request manda el service key como `apikey` pero el JWT del usuario en `Authorization` → PostgREST resuelve el rol por el JWT → rol efectivo `authenticated`. La migración `20260527_revoke_secdef_from_public` revocó EXECUTE de TODAS las funciones SECURITY DEFINER para `authenticated` (dejando solo `service_role`), así que llamarlas con el token client tira `permission denied`. Patrón correcto: `obras.service.ts` (usa `supabaseAdmin`). Las validaciones de permiso/obra-scope corren en el backend ANTES de la RPC; las funciones reciben `p_user_id` explícito (no usan `auth.uid()`), así que correrlas como service_role es seguro. Regresión detectada y arreglada el 2026-05-29 (commit backend `9c1be32`).

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

_Última actualización: 2026-05-04._
