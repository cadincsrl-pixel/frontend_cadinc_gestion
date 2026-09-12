@AGENTS.md

# CLAUDE.md — Frontend `frontend_cadinc_gestion` (ERP CADINC SRL)

> Contexto operativo del proyecto. Leer completo antes de escribir código.
> `CONTEXT_DUMP.md` describe el estado al 2026-05-04 y **está desactualizado**: sirve como historia, no como referencia. Lo vigente es este archivo.
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
  → Handler (valida con zod, opera sobre Supabase como service_role, con el header x-cadinc-user = usuario del JWT)
  → auditMiddleware (loguea post-respuesta si 2xx y método mutativo)
  → Respuesta
```

**El frontend NUNCA muta datos directamente contra Supabase con la anon key.** Toda mutación pasa por el backend Hono. Desde 2026-09-07 la base tampoco lo permite: `anon` y `authenticated` no tienen INSERT/UPDATE/DELETE en `public` (migración `20260906q`); el único escritor es el backend, como `service_role`. `usuario_actual()` devuelve el usuario del request (el header `x-cadinc-user` del backend, o `auth.uid()` si hay JWT) y lo usan los triggers de auditoría.

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
- `viajes` — Tramos cargados/vacíos con remitos foto/PDF, filtro por chofer/tipo/estado/fechas. **"Qué lleva"** (`tramos.producto`, 2026-09-11) es texto con sugerencias, no lista cerrada: el cliente nombra el viaje por la carga ("ya te pagaron la harina de soja") y el buscador de Facturación busca por ahí.
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
- `catalogo` — Catálogo de precios: precio de referencia (final, IVA incluido), fecha y última compra por material. **Fotos por ficha** (§5.17).
- `stock-proveedor` — Materiales **comprados pero todavía en el galpón del proveedor** (§5.8).
- `stock-cliente` — Material del cliente administrado en depósito (no facturable).
- `cuenta-corriente` — Una sola vista de `materiales_a_cuenta_cliente`: cada renglón tiene UN estado (`pago_directo` › `gasto_cadinc` › `cobrado` › `a_cobrar`, en ese orden de precedencia, derivado en `v_cuenta_corriente`), filtros en el server, resumen por obra/mes/proveedor, cargar precios, pagos del cliente y PDF (solo con la deuda del cliente). Reemplazó a `cuenta-cliente`, `gastos-cadinc` y `materiales` el 2026-09-04 (migraciones `20260904ap`/`aq`); las URLs viejas redirigen.

- `adicionales`, `costos`, `gasto-interno` — extras de la obra, costo interno y gastos de CADINC.

Los **certificados al cliente** (`certificados_cliente`) se emiten desde la cuenta corriente: congelan precio y cantidad de los renglones que abarcan, y el cobro se cuelga del certificado. Emitir usa `emitir_certificado_cliente`; anular es solo admin y no corre si ya hay cobros.

### 4.3 Sub-tabs de Herramientas (`/herramientas/<tab>`)
Rutas propias (no query string). Tabs en `profiles.permisos.herramientas.tabs`, orden y redirect al primero permitido en `src/app/(app)/herramientas/page.tsx`:
- `inventario` — fichas HER-NNN (unidades físicas) y su vista "por obra".
- `movimientos` — traslados de fichas entre obras.
- `trazabilidad` — historial por ficha.
- `salidas` / `retornos` — el **pañol** (`herr_entregas`): lo que cada obra se llevó vía pedidos y lo que volvió.
- `catalogo` — **tipos de herramienta** (§5.12): alta, sinónimos, baja, detalle por obra y "Fusionar con…".
- `parametros` — categorías de fichas y configuración.

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

### 5.3 Semana viernes → jueves (y cuándo se cierra)
CADINC cierra semanas los jueves. Todo `sem_key` es el ISO del **viernes** de esa semana. Helpers en `src/lib/utils/dates.ts`: `getViernes`, `getSemDays`, `toISO`. **Nunca calcular semanas con lunes-domingo.**

**El ciclo real de la semana** (del user, 2026-09-11): se trabaja de viernes a jueves, las horas se terminan de cargar el **viernes** y se paga el **sábado**.

**Cuándo una semana está cerrada** (`cadincsrl/src/lib/semanas.ts` y su espejo `src/lib/utils/cierres.ts` — la misma regla escrita dos veces, cambiarla en las dos):
1. fila en `cierres` con estado `cerrado` → cerrada, aunque sea la semana actual;
2. fila con estado `pendiente` → abierta (es una semana reabierta a mano);
3. **sin fila** → cerrada cuando pasó el **viernes siguiente** al jueves de esa semana, o sea que **se cierra sola el sábado**. El margen es `DIAS_DE_GRACIA = 1`; hasta el 2026-09-11 era 0 y el viernes a la mañana, justo cuando se cargan las horas, ya estaba todo trabado.

Editar horas de una semana cerrada devuelve **409 `SEMANA_CERRADA`**. Para corregir hay que reabrir (botón del banner en la pantalla de la obra, o el tab Cierres): pide `tarja.actualizacion` + `ver_pii`, y es obra por obra.

### 5.4 RLS permisiva + base cerrada a escritura directa
Las tablas tienen RLS habilitado con policies `using(true) with check(true)`: la seguridad real está en el **backend Hono** (JWT + permisos + alcance por obra + auditoría). Desde 2026-09-07 (migración `20260906q`) los roles `anon` y `authenticated` **no tienen INSERT/UPDATE/DELETE/TRUNCATE ni USAGE de secuencias en `public`** (tampoco en los default privileges de tablas futuras): aunque alguien use la anon key con su JWT, no puede escribir. El backend escribe como `service_role` y manda el usuario en el header `x-cadinc-user` (`cadincsrl/src/lib/supabase.ts` + `lib/jwt.ts`); `usuario_actual()` lo lee y lo usan los triggers de auditoría. Las **lecturas** directas desde el frontend siguen permitidas y se cierran tabla por tabla (fase 3 de permisos). No proponer RLS estricta ni funciones/vistas que dependan de `auth.uid()` sin consultar: el backend ya no manda JWT a PostgREST, así que `auth.uid()` es null en sus requests.

### 5.5 Permisos granulares
Esquema: `permisos: { modulo: { lectura, creacion, actualizacion, eliminacion, tabs[], <flags_extra>, obras_scope? } }` en `profiles.permisos` (JSONB). **Es lo efectivo**: lo que leen las guardias del backend.

- **Roles** (2026-09-06): la plantilla vive en la tabla `roles` (permisos, tabs, flags, `obras_scope_default`, `rol_base`) y se edita desde Admin › Plantillas. `profiles.rol_key` dice de qué rol partió el usuario y `profiles.personalizado` si tiene ajustes propios. Cambiar un rol no toca a nadie hasta "Aplicar a N usuarios" (`POST /api/usuarios/roles/:key/aplicar` → RPC `aplicar_rol`, solo a los no personalizados, con historial). `tipo_usuario` es legacy y el backend lo ignora.
- **`profiles.modulos` se deriva de `permisos`** (módulos con lectura) en el backend (`modulosDePermisos` / `modulos_de_permisos()`); la pantalla no lo manda. Gatea páginas (Next middleware) y el selector de módulos.
- **Backend**: `requirePermiso(modulo, accion)` en cada ruta mutativa; `requireTab(modulo, tab | tabs)` donde la tab de la pantalla también vale en la API (lista ausente o vacía = todas, igual que la UI); `requireFlag` para flags. Admin (`rol='admin'`) hace bypass. Un perfil con `activo=false` no pasa ninguna guardia y al desactivarlo queda baneado en Supabase Auth.
- **Frontend**: `usePermisos('modulo')` → `{ puedeVer, puedeCrear, puedeEditar, puedeEliminar, verPii, verCostos, ...flags }`. Los botones se **deshabilitan** con tooltip, no se ocultan.
- **Flags**: `ver_pii` default **false** en backend y frontend; `ver_costos` default true. Los condicionales al body se chequean inline en el handler (`forzar_despacho`).
- **Alcance por obra**: `profiles.obras_scope` ('todas' | 'asignadas') con override por módulo en `permisos.<modulo>.obras_scope`; la lista de obras es UNA por usuario (`usuario_obras`). Helpers en `lib/obras-usuario.ts`: `getObrasDelUsuarioCached`, `validarObraDelUsuario`, `validarObraDeRegistro` (para PATCH/DELETE por id). Lo aplican tarja, solicitudes, cuenta corriente, materiales certificables, stock del cliente, stock en proveedor y remitos de envío.
- **Catálogo de módulos**: `tarja, logistica, certificaciones, herramientas, caja, flota, alquiler, aridos, admin`, espejado en `lib/modulos.ts` de ambos repos. `personal`, `ropa`, `prestamos` y `configuracion` son **tabs de tarja**, no módulos: sus endpoints exigen `tarja.*`.

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

**Para traer una tabla entera (admin / scope "todas")**: `todasLasFilas((d, h) => q.order('id').range(d, h))` de `cadincsrl/src/lib/paginar.ts`, siempre con orden estable. Lo usan `GET /horas/:obra`, `/horas/trabajador/:leg`, `/api/prestamos` y los `/all` de cierres, tarifas, cat-obra, asignaciones, certificaciones y hs-extras (2026-09-07). **Para agregados** (quién está activo, última obra por legajo, horas por obra en la semana) no bajar `horas` al cliente: RPCs `personal_actividad(p_desde, p_obras)` → `GET /api/personal/actividad` y `obras_actividad(p_vie, p_obras)` → `GET /api/horas/resumen-obras` (migración `20260907a`; se llaman con el cliente admin, el backend aplica el alcance). Los modales de Excel/Recibos bajan `/api/horas/all` solo al abrirse.

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

**Precio global versionado (2026-07-02)**: el `vh` global por categoría está versionado en `categoria_tarifas (cat_id, vh, desde)` — espejo de `tarifas` por obra. `categorias.vh` es solo **cache de la última versión** (para labels/selects). En cualquier cálculo con fecha (semanas pasadas, recibos, exports) **NUNCA usar `cat.vh` directo**: usar `getVHGlobalEnFecha(cat, fechaRef)` de `costos.ts`. Motivo: el 2026-06-26 un aumento global (UPDATE in-place, modelo viejo) recalculó retroactivamente los costos de todas las semanas ya pagadas; los valores históricos se recuperaron por extrapolación del Excel de pagos (migración `20260702_categoria_tarifas.sql`).

### 5.12 Herramientas: tipos, no precios, fuera de la cuenta del cliente
Una herramienta es una fila de `stock_materiales` con `clase='herramienta'` (rubro "Herramientas y máquinas"). Se llama **tipo** y es lo que ofrece el buscador del pedido y lo que cuenta el pañol por `material_id`. Reglas:
- **No tiene precio ni entra en la cuenta del cliente.** Va y vuelve de la obra; el trigger `trg_mcc_sin_herramientas` la saca de `materiales_a_cuenta_cliente` al insertar. Si una fila del catálogo pasa a `herramienta`, hay que borrar a mano sus filas de MCC no cobradas (evento `sacado_de_cuenta_cliente`) y tocar `material_id = material_id` en sus renglones para que el pañol las tome.
- **El pedido no deja crear herramientas en texto libre ni desde el Combobox**: se crean en `/herramientas/catalogo` (backend `tipos.routes.ts`: `GET/POST /api/herramientas/tipos`, `PATCH /tipos/:id`, `POST /tipos/:id/fusionar`). Ver = tab `catalogo`; crear/editar/baja = `herramientas.actualizacion`; fusionar = `herramientas.eliminacion`.
- **Duplicados**: el backend compara `normTxt(nombre)` y alias contra los tipos activos y responde `409 TIPO_DUPLICADO { candidatos }`; el frontend muestra "ya existe X, sumale un sinónimo". Además existe el índice único parcial `stock_materiales_nombre_norm_uidx`.
- **Renombrar propaga** el nombre nuevo a `solicitud_compra_item.descripcion` y `herr_entregas.descripcion` de los renglones que llevaban el viejo. **Fusionar** (RPC `fusionar_tipo_herramienta`, SECURITY DEFINER, solo service_role) mueve renglones, pañol, movimientos y sinónimos al destino y da de baja el origen; es transaccional y no se deshace desde la UI.
- **Un renglón con dos herramientas** ("masa y cortafierro") se desdobla en un renglón hermano (obs `Desdoblado del renglón #N`), nunca se elige una sola.
- Precios del catálogo: `precio_ref` es **precio final con IVA** (§ memoria). Regla al vincular renglones a $0/$1: toman el precio de referencia solo en obras llave en mano (`obras.materiales_a_cargo_de='cadinc'`); en obras de cliente quedan en $0 salvo pedido explícito del user.

### 5.13 Personal: alta, DNI, historial de categorías y "activo" (2026-09-06)
- **El alta guarda todo**: `condicion` (null = "sin especificar"), `modalidad` (default `hora`), talles y `fecha_nacimiento`. `CreatePersonalSchema`/`UpdatePersonalSchema` (`personal.schema.ts`) son la fuente de verdad; la UI repite las mismas reglas con `src/lib/utils/personal.ts`. Los 400 de validación vuelven como `{ error, campo }` y los modales los muestran bajo el input (`errorDeCampo`).
- **DNI obligatorio al crear y único** (índice parcial `personal_dni_uidx`, CHECK `personal_dni_formato_check`, 7 u 8 dígitos). El backend normaliza (`"36.890.735"` → `36890735`), responde `409 DNI_DUPLICADO: …` / `409 LEGAJO_DUPLICADO: …` y al editar no deja borrarlo (`400 DNI_OBLIGATORIO`) salvo en los 7 legajos viejos que nunca lo tuvieron.
- **Reglas de formato** (mismas en `personal.schema.ts` y `src/lib/utils/personal.ts`; CHECKs `personal_leg_formato_check` y `personal_tel_formato_check`): legajo 3–4 dígitos; nombre con al menos dos palabras y solo letras; teléfono solo dígitos, 8 a 13 (texto sin dígitos se rechaza, no se vacía); talles número 30–60 o XS…XXXL. Todo se guarda normalizado. En los schemas zod el `.optional()` va AFUERA del schema con transform, para que un campo ausente en el PATCH no se pise con `''`.
- **`personal_cat_historial` se escribe solo cuando cambia la categoría**: una fila por `(leg, desde)` (índice único), `desde` siempre viernes (`cat_desde` opcional en el PATCH; default la semana en curso). Un `cat_desde` pasado tira `409 AFECTA_SEMANAS_CERRADAS` salvo `confirmar_historico: true`, igual que tarifas y precios globales. Hasta esa fecha cada edición insertaba una fila (453 filas para 116 cambios reales; se limpiaron).
- **Un solo criterio de "activo"**: `esActivo(p, legsConHoras)` en `src/lib/utils/personal.ts` (override manual › mensualizado = activo › horas en las últimas 3 semanas). Lo usan Personal, Ropa y las alertas de legajo; no reimplementarlo.

### 5.14 Precios: tres precios distintos, una puerta para cada uno (2026-09-10)

**No son el mismo número y no se mueven juntos.**

| Precio | Dónde vive | Alcance | Quién puede |
|---|---|---|---|
| **Referencia del catálogo** | `stock_materiales.precio_ref` | TODAS las obras | `certificaciones.actualizacion` **+** flag `cargar_precios` |
| **Precio de la compra** | `solicitud_compra_item.precio_unit` | ese renglón | `resolver_items` (+ `precio_al_resolver`) |
| **Lo que se le cobra al cliente** | `materiales_a_cuenta_cliente.precio_unit` | esa obra | flag `cargar_precios` |

- **`fijar_precio_ref(material, precio, fuente, item, user)` es la ÚNICA puerta al catálogo.** Deja historial en `stock_materiales_precios` (fuente ∈ `manual|compra|ultima_compra|migracion|sql|backfill`). Nunca un `update … set precio_ref`. `precio_ref_en(material, fecha)` da el precio a una fecha; devuelve NULL si el historial no llega.
- **MCC es una foto**: nada la retasa sola. Los cinco escritores están en §5.1 y §5.8.
- **Flags** (todos en `permisos.certificaciones`): `cargar_precios` (default **false**) habilita tocar la cuenta del cliente y el catálogo; `precio_al_resolver` (default **true**) — apagado, quien resuelve compra sin poner precio y el renglón queda `esperando_precio`; `resolver_items` habilita comprar/despachar. **`aprobar_precios` no existe en el código**: aprobar una propuesta usa `cargar_precios`.
- **Circuito de propuesta**: quien compra pero no puede fijar precios usa `precio_propuesto` y el dueño aprueba (`POST /items/:id/aprobar-precio`). Proponer no mueve la cuenta. Nadie se aprueba a sí mismo salvo admin.
- **`fn_mcc_congelada`**: una fila con `cobro_id` o `certificado_id` NO admite cambio de `precio_unit`, `precio_total` ni `cantidad` (409 `MCC_COBRADO` / `MCC_CERTIFICADO`). El camino correcto son **dos statements**: primero soltar del cobro (`cobro_id` y `monto_cobrado` a null, permitido porque los importes no cambian) y después valuar; el user reimputa con "Imputar lo pagado". El escape `set local cadinc.descongelar = 'on'` es para cuando el renglón DEBE seguir cobrado: no deja rastro, usarlo solo con motivo escrito en la migración.
- **Traza**: el trigger de MCC escribe el evento `precio_cambiado` con antes y después; el catálogo, su historial. Los dos juntos se ven en **Admin › Movimientos de precios** (`v_movimientos_precio`), filtrable por usuario. Ojo: la `fuente` de los renglones dice `sql` casi siempre porque el backend no la setea (PostgREST no expone `set_config`) — **no** significa "tocaron la base a mano".
- **Certificado**: valúa con `coalesce(precio_ref_en(ficha, fecha_corte), precio_ref)`, o sea que **si no hay precio a esa fecha usa el de hoy, en silencio**. Y las fechas de precio **no se pueden retroceder**: un trigger pisa `precio_actualizado_en` con `now()` en cada cambio.
- **Todos los precios del sistema son FINALES, con IVA incluido**: `precio_ref`, el `precio_unit` de las compras y el de MCC. El modal de compra deja tipear neto y convierte. **No inferir la convención mirando compras ya cargadas**: hay muchas cargadas sin IVA por error, y tomarlas como referencia propaga el error.

### 5.15 Catálogo de materiales: cómo se busca y cómo se crea

El catálogo (`stock_materiales`, ~2.600 fichas) **no está vacío, está escondido**: el cuello de botella siempre fue la BÚSQUEDA, no el alta. La obra pide por nombre de obra y la ficha guarda el nombre técnico (lija 150 → `Lija al agua N°150`, alargue → `Prolongación 10m`, taco → `Tarugo fisher`, thinner → `Diluyente`).

- **`alias text[]` + `norm_material()`** resuelven eso: 556 sinónimos sobre 99 materiales llevaron el match exacto de 89 ítems a 935. Índice único parcial sobre el nombre normalizado, y pg_trgm para los parecidos.
- **El matcher corre AL CREAR el renglón, no después.** Un sinónimo nuevo NO alcanza a los renglones ya cargados: después de cada tanda de sinónimos hay que re-matchear los ítems **pendientes sin material**.
- **El matcher del Combobox es `includes()` sobre un blob** de nombre + rubro + alias. Dos consecuencias: un alias corto contamina búsquedas lejanas, y "sopapa 50" NO matchea el alias "sopapa de 50" (falta el "de"). Al agregar sinónimos, agregar también las formas sin preposición.
- **El rubro va SOLO en `group` del Combobox, NUNCA en `sub`**: el filtro corre sobre `label+sub+search`, así que el rubro en `sub` hacía que "pintura" devolviera las 76 filas del rubro.
- **No se puede indexar `unaccent()`** (no es IMMUTABLE): usar `translate`.
- **El import de Excel no chequea duplicados**, ni por `norm_material`: dos fichas nacidas de la misma compra (una desde el pedido, otra al importar). Después de importar, revisar duplicados.
- **Alta rápida desde el pedido**: pide rubro, unidad y precio (o "No sé el precio", que la deja en $0 y en la lista de tasar — antes se inventaba un "$11" que nadie volvía a mirar). Muestra parecidos con 4 señales y rechaza nombres que son códigos (`400 NOMBRE_ES_CODIGO`). Permiso: `certificaciones.actualizacion` + tab `catalogo`.
- **Marca**: cuando el precio cambia 2–3× según la marca, la ficha lleva la marca en el nombre (Awaduct vs PVC en desagüe, y falta hacerlo en eléctrico: Kalop/Cambre/Jeluz/Sica). El código de lista de 4 dígitos en el primer alias es la prueba dura de a qué línea pertenece una ficha.
- **`stock_movimientos` no tiene unidad**: cambiarle la unidad a una ficha reinterpreta en silencio sus movimientos viejos. Fila nueva + desactivar la vieja, nunca rename in-place.
- **`stock_actual` es un cache que escribe el backend: NO hay trigger sobre `stock_movimientos`.** Si tocás movimientos por SQL, recalculalo a mano o queda desfasado.
- **Un alias de UNA palabra sobre fichas hermanas con distinta unidad es un bug de plata esperando.** El matcher es substring, así que "arena" pegaba en "Arena fina" (toneladas) y dos despachos de BOLSAS quedaron colgados ahí: el depósito llegó a −28 toneladas y nadie lo vio hasta que el stock se fue a negativo, porque 30 bolsas y 30 toneladas se anotan idénticas (ver el punto anterior). Al 2026-09-10 hay 15 alias de una sola palabra que matchean fichas con 2 a 5 unidades distintas — los peores: `plastico` (22 fichas, 5 unidades), `balde`, `alambre`, `cemento` (bolsa/m2), `yeso` (bolsa/kg). **Antes de agregar un alias corto, mirar si las fichas hermanas se miden distinto.**
- **Mover despachos entre fichas con un RECUENTO FÍSICO en el medio**: el número contado del ajuste es la verdad y no se toca; lo que hay que recalcular es la cantidad del ajuste, porque al mover un despacho anterior cambia el saldo previo. Verificar con `sum() over (order by created_at)` antes de dar la corrección por buena.

### 5.16 Devolver, fraccionar y la nota de crédito (2026-09-10/11)

**La cuenta del cliente se arma con lo DESPACHADO, no con lo enviado.** Tres operaciones nuevas se cuelgan de esa idea:

- **Devolución** (`devolver_material`, `20260913k`). Material que vuelve al depósito. Si el renglón **ya está cobrado o certificado** genera una **nota de crédito**, que baja la deuda de verdad (`20260913l`/`m`); si no lo está, simplemente baja el renglón. Copia la descripción desde MCC, así que hereda el color solo.
- **Devolver TODO lo que nunca salió es CANCELAR, no devolver** (`20260913p`). Vuelve todo **y** no salió nada **y** no hay remito emitido: las tres cosas. El renglón queda `rechazado` **conservando su cantidad** — "15 bolsas, rechazado" cuenta la historia; "0 bolsas" no dice nada. Ojo: `cantidad_enviada = 0` **no** equivale a "sin remito" (hay 19 renglones con remito y ese campo en 0, y 57 al revés).
- **Fraccionar bultos** (`20260913n`/`o`). Abrir un tambor y que salgan litros. **El precio de venta NO se toca al fraccionar.** No hay conversión automática entre presentaciones: se compra un tambor de 200 lts y no se puede despachar 4.

### 5.17 Lo que se pide viaja en la DESCRIPCIÓN, no en columnas nuevas (2026-09-11/12)

`materiales_a_cuenta_cliente` y los remitos llevan una `descripcion` desnormalizada, y **todos los documentos que importan imprimen esa descripción**. Por eso lo que distingue al producto se compone adentro al escribir, en vez de agregar una columna a cada tabla y a cada PDF.

- **Color**: `desc_con_color()` (`20260913t`) lo mete en la descripción desde las tres RPC que escriben MCC; el backend lo espeja en `src/lib/desc-con-color.ts`. El remito resuelve el color **en el server** desde `item_id`, no confía en el cliente. Usa `norm_txt` (no `norm_material`) para no duplicar "verde-amarillo" contra "verde amarillo" (`20260913u`).
- **No pre-generar grillas color x tamaño.** De 62 fichas de pintura, 4 tienen stock positivo y 50 no tienen un solo movimiento: el depósito compra por obra, no inventaría colores. La ficha más usada es la genérica con `usa_color` prendido. Una ficha **no puede** tener el color en el nombre Y el flag prendido.
- **La observación del renglón** (`solicitud_compra_item.obs`) se muestra pegada a la descripción en la fila, la tarjeta y los modales de comprar y despachar. Son 255 renglones y dicen "gris zócalo", "ALBA", "mallado": es parte de QUÉ se pide.
- **Fotos del catálogo** (`20260912g`): tabla `stock_material_fotos` + `stock_materiales.foto_url` (la principal, la mantiene un trigger, **no escribirla a mano**). Bucket **público** `catalogo-fotos`, 5 MB, JPG/PNG/WEBP/HEIC. El duplicado se mira por `(material_id, file_hash)`: la misma foto en fichas distintas es válida a propósito (foto de familia). Para tandas, `scripts/subir-fotos-catalogo.mjs`.

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
- **Devolución** — Material que vuelve de la obra al depósito. Si ya estaba cobrado, genera nota de crédito (§5.16).
- **Fraccionar** — Abrir un envase grande para despachar por unidad chica. No cambia el precio de venta (§5.16).
- **Modalidad de pago al chofer** — `km_jornal` (km × $/km + jornal × días) o `pct_jornal` (% sobre tarifa × ton + jornal × días).

## 8. Qué NO hacer

- ❌ Asumir APIs de Next.js anteriores a v16 o de React anteriores a v19. Siempre verificar.
- ❌ Proponer RLS estricta sin consultar (rompería el modelo actual).
- ❌ Usar la anon key para mutar datos desde el cliente (desde 2026-09-07 la base lo rechaza con `permission denied`).
- ❌ Escribir RPCs, vistas o triggers que dependan de `auth.uid()`: en los requests del backend es null. Usar `usuario_actual()` o recibir `p_user_id`.
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
- **RLS permisiva + lectura directa desde el frontend en ~130 tablas**: la escritura directa ya está cerrada (`20260906q`, 2026-09-07); la lectura se cierra tabla por tabla en la fase 3 de permisos (ver Obsidian `Proyectos/Permisos - Revisión completa 2026-09-06.md`).
- **Login de herramientas separado** (`/herramientas/login`): coexiste con `/login`, razón no documentada.
- **Precios, lo que quedó abierto de la auditoría del 2026-09-10** (informe en Obsidian `Proyectos/Permisos y precios - auditoria 2026-09-10.md`): (a) la `fuente` del evento `precio_cambiado` siempre dice `sql` porque el backend no la setea — se arregla cuando las escrituras de MCC pasen por una RPC; (b) el certificado usa el precio de HOY cuando no hay precio a la fecha de corte, en silencio; (c) `POST/PATCH /api/certificaciones/materiales` escribe un precio facturable con guardas flojas, pero `cert_materiales` está vacía y nadie la lee: es código muerto para borrar; (d) `fn_mcc_congelada` no cubre DELETE y deja tocar `certificado_id` a mano; (e) `stock_materiales_precios` tiene FK `on delete cascade`: borrar una ficha borra su historial de precios.
- ~~**Falta índice** en `stock_movimientos.material_id` y `.solicitud_item_id`~~ **RESUELTO** — creados en `20260424_perf_indices.sql` (verificado en DB viva 2026-07-01: `stock_movimientos_material_id_idx`, `stock_movimientos_solicitud_item_id_idx` parcial, `solicitud_compra_item_solicitud_estado_idx`).
- **`npm audit` en el backend**: 3 vulnerabilidades (2 moderate, 1 high) detectadas al clonar. Evaluar con contexto, no correr `audit fix` a ciegas.
- **Auto-archivado sin auditoría**: el endpoint `/api/obras/auto-archivar` no genera `audit_log` (filtro explícito en `audit.ts`). Si se necesita rastreo, agregar.
- **Sub-tabs Camiones/Bateas sin URL propia**: `CamionesYBateasTab.tsx` maneja sub-state local, no se puede deep-linkear al modal de un vehículo (la campana de notificaciones lleva al tab pero no abre el modal).
- **Notificaciones sin persistencia**: el hook `useNotificaciones` calcula in-memory. Para "marcar como leído" o silenciar habría que crear tabla `notificaciones_dismiss`.
- **Sin notificaciones de docs de choferes**: la campana muestra solo vencimientos de vehículos, no de papeles del personal de conducción (DNI, licencia).
- **`materiales_a_cuenta_cliente.cantidad` se sobrescribe** en cada retiro parcial desde proveedor (UPSERT con `ON CONFLICT (item_id)`). Eso pierde el detalle por retiro. Si se necesita auditar parciales, mirar `stock_proveedor_movimientos` que sí tiene el desglose.
- **RPCs SECURITY DEFINER**: la migración `20260527_revoke_secdef_from_public` dejó EXECUTE solo para `service_role`. Hasta 2026-09-07 el cliente per-request (`createSupabaseClient(token)`) mandaba el JWT del usuario y PostgREST lo trataba como `authenticated` → `permission denied` (regresión del 2026-05-29, commit backend `9c1be32`). Desde el commit `5ff41ad` ese cliente también es `service_role` (+ header `x-cadinc-user`), así que las RPC se pueden llamar con cualquiera de los dos clientes. La regla que sigue vigente: las validaciones de permiso/obra-scope corren en el backend ANTES de la RPC y las funciones reciben `p_user_id` explícito (no usan `auth.uid()`).

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
- **Nombre**: `AAAAMMDD<letra>_descripcion.sql`, letra correlativa dentro del día (`a`, `b`, … `z`). El número NO es la fecha real de aplicación: la serie `20260912*` se aplicó el 09/09. **Antes de elegir letra, `ls supabase/migrations | tail`** — puede haber otra sesión de Claude trabajando en paralelo sobre el mismo repo y los prefijos chocan (pasó el 09/09; se resolvió renombrando, ver `20260912i/j/k`).
- **Aplicar**: `apply_migration` del MCP, una por vez, y **probando antes con rollback**: envolver el cuerpo en `do $t$ … raise exception 'ROLLBACK_OK %', … $t$;` y verificar los números que devuelve. Es la práctica del proyecto para cualquier migración de datos.

### Git
- Rama principal: `main` (producción).
- Commits con prefijo: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.

## 11. Subagentes disponibles

Viven en `.claude/agents/` de este repo:
- `frontend-specialist` — UI/UX, React, formularios, componentes
- `backend-specialist` — APIs Hono, queries, transacciones (aunque el código backend viva en el otro repo)
- `database-architect` — schema, migraciones, RPCs. **Tiene el MCP de Supabase** (`execute_sql`, `apply_migration`, `list_tables`, `get_advisors`): puede mirar la base viva. Hasta el 2026-09-10 la descripción decía que sí pero la lista de herramientas no lo incluía, y una auditoría entera salió a ciegas.
- `nextjs-react-specialist` — gotchas de Next.js 16 / React 19
- `security-specialist` — Auth, permisos, RLS, datos sensibles. Lee la base solo con `list_tables` y `get_advisors`: para consultas SQL, pedírselas al `database-architect`.
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

_Última actualización: 2026-09-12._
