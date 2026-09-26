@AGENTS.md

# CLAUDE.md — Frontend `frontend_cadinc_gestion` (ERP CADINC SRL)

> Contexto operativo del proyecto. Leer completo antes de escribir código.
> `CONTEXT_DUMP.md` describe el estado al 2026-05-04 y **está desactualizado**: sirve como historia, no como referencia. Lo vigente es este archivo.
> Repo hermano del backend: ver §12 "Repos hermanos".

---

## 0. Workflow del agente — al cerrar un turno

**Antes de cerrar cualquier turno que haya generado uno o más commits, actualizar el diario de Obsidian** (`~/CADINC/Notas-CADINC/Diario/YYYY-MM-DD.md`):

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
- `pagos-docs` (privado) — PDFs de facturas de proveedor y comprobantes de pago del módulo Pagos.

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

> **Nombre visible ≠ clave** (2026-09-23): en la UI, `certificaciones` se llama «Pedidos y Stock», `pagos` se llama «Compras» y `facturacion` se llama «Ventas». Las claves (permisos, rutas, API, auditoría) NO cambiaron: no renombrarlas sin migrar `profiles.permisos`, `roles` y los links.

| Módulo | Qué hace | Ruta frontend |
|---|---|---|
| **Tarja** | Horas por operario/obra/semana, cierre semanal, recibos PDF | `/tarja`, `/tarja/[obraCod]` |
| **Personal** | CRUD trabajadores, categorías, fecha_nacimiento, documentos (DNI, alta temprana, etc.) | `/personal` (tab de tarja) |
| **Logística** | Tramos, liquidaciones, choferes, **camiones y bateas**, lugares, facturación, gastos, **rentabilidad** (simulador) | `/logistica` |
| **Certificaciones** (se muestra «Pedidos y Stock») | Solicitudes de compra workflow granular (§5.1), stock interno, **stock en proveedores** (§5.8), materiales facturables | `/certificaciones` |
| **Stock** | Inventario depósito central, entradas/salidas, import/export Excel | (integrado en certificaciones) |
| **Herramientas** | Inventario + trazabilidad entre obras | `/herramientas/*` |
| **Caja** | Movimientos con centros de costo y conceptos | `/caja` |
| **Ropa** | Entregas por categoría con vencimiento | `/tarja/ropa` |
| **Préstamos** | Adelantos con descuento en semana | `/tarja/prestamos` |
| **Pagos** (se muestra «Compras») | Facturas de proveedor, aprobación, órdenes de pago y padrón propio de proveedores (§5.18) | `/pagos` |
| **Facturación** (se muestra «Ventas») | Facturas de venta contra ARCA (A, B, FCE MiPyME y sus NC), clientes con padrón ARCA, cobranzas y la tab **Impuestos** (§5.19) | `/facturacion` |
| **Contabilidad** | Plan de cuentas, asientos (partida doble), diario, mayor, sumas y saldos, períodos y cuentas de tesorería (§5.20) | `/contabilidad` |
| **Sueldos** | Liquidación de sueldos UOCRA, UECARA y Camioneros: legajos, convenios con escalas versionadas, recibos, asiento contable, banco y Libro de Sueldos Digital (§5.22) | `/sueldos` |
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

### 4.2.1 Sub-tabs de Pagos (`/pagos?tab=...`)
- `facturas` — la bandeja: qué se debe, a quién y para cuándo. Cargar, aprobar/rechazar (de a una o en lote), ficha completa, registrar pago de varias juntas. Acepta `&aviso=aprobar|vencidas|sin-revisar|observadas` (deep-link de la campana, §5.9).
- `pagos` — órdenes de pago. Arriba, **«Soltá acá los cheques»** (2026-09-25, `ModalChequesSueltos`): se sueltan fotos/PDF de cheques (un PDF del banco con varios endosos se separa solo, `POST /cheques/leer` devuelve `cheques[]`), el backend reconoce el proveedor por el endosatario/beneficiario (CUIT o nombre, `proveedorDelCheque`) y se abre «Pagar en lote» con los cheques cargados y lo que suman repartido entre sus facturas aprobadas. El aviso `CHEQUE_YA_ENTREGADO` también salta con mismo número (sin ceros) + mismo importe; el trigger `trg_pagos_cheque_unico` sigue con su criterio estricto.
- `cuentas` — **cuenta corriente con un proveedor** (20260929s): elegís proveedor y rango y ves saldo inicial, facturas/ND al debe, NC y OPs al haber, saldo corrido, marcas «pago a reconstruir» / «pago reconstruido», Excel y PDF. RPC `pagos_cuenta_corriente` (solo lectura) → `GET /api/pagos/proveedores/:id/cuenta-corriente?desde&hasta` (tab `cuentas`). Deep-link `?tab=cuentas&proveedor=ID` (también desde «Deuda por proveedor» › «cuenta ›»). Es la vista para comparar con el estado de cuenta que manda el proveedor.
- `proveedores` — padrón propio (`pagos_proveedores`), **sin FK a `public.proveedores`**: se cargan de nuevo, con CUIT, alias y CBU.

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
- **Flags de Pagos** (en `permisos.pagos`, todos default **false**): `aprobar_facturas`, `registrar_pagos`, `anular_pagos`. Cargar facturas es `pagos.creacion`; ver la cuenta destino del proveedor pide además `ver_pii`. Ver §5.18.
- **Catálogo de módulos**: `tarja, logistica, certificaciones, herramientas, caja, flota, alquiler, aridos, pagos, sueldos, admin`, espejado en `lib/modulos.ts` de ambos repos. `personal`, `ropa`, `prestamos` y `configuracion` son **tabs de tarja**, no módulos: sus endpoints exigen `tarja.*`.

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

Además, el módulo Pagos suma 4 secciones (facturas vencidas, para aprobar, pagadas sin revisar y observadas). **El filtro del deep-link tiene que replicar exactamente la query del aviso**: el link va a `/pagos?tab=facturas&aviso=…` y `FILTRO_POR_AVISO` (en `FacturasTab.tsx`) traduce ese `aviso` al mismo filtro que usó el hook. Si se desincronizan, el badge dice un número y la pantalla muestra otro.

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
- **No tiene precio ni entra en la cuenta del cliente.** Va y vuelve de la obra. Dos triggers lo sostienen: `trg_mcc_sin_herramientas` (AFTER **INSERT** sobre MCC) frena los renglones nuevos, y `trg_material_clase_saca_de_mcc` (AFTER UPDATE OF clase sobre `stock_materiales`, `20260915a`) limpia los que ya estaban cuando una ficha pasa a `herramienta`: borra las filas no congeladas con evento `sacado_de_cuenta_cliente` y deja las que ya tienen `cobro_id`/`certificado_id` con un evento `herramienta_trabada_en_la_cuenta` — a esas hay que soltarlas del cobro a mano. **Hasta el 2026-09-15 ese segundo paso no existía** y había que hacerlo en la migración (lo hicieron `20260910p`, `20260913i`, `20260914ad` y `20260914r`); el botón de la UI no lo hacía, así que reclasificar desde la pantalla dejaba la herramienta facturada al cliente Y en el pañol. `calc_a_cargo_de` ahora también trata `herramienta` como `epp` (a cargo de CADINC). Sigue haciendo falta tocar `material_id = material_id` en sus renglones para que el pañol las tome.
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
- **Flags** (todos en `permisos.certificaciones`): `cargar_precios` (default **false**) habilita tocar la cuenta del cliente y el catálogo; `precio_al_resolver` (default **true**) — apagado, quien resuelve compra sin poner precio y el renglón queda `esperando_precio`; `resolver_items` habilita comprar/despachar. **`aprobar_precios` no existe en el código**: aprobar una propuesta usa `cargar_precios`. `marcar_consumibles` (default **false**, `20260917n`) habilita SOLO marcar consumibles propios en la cuenta corriente, sin valuar, aprobar precios ni certificar; la RPC igual rechaza obras por administración y llave en mano, así que sirve en las de presupuesto cerrado. Lo tiene Diego.
- **EPP que se le cobra al cliente** (`20261002a`, dueño 26/09): un EPP es gasto de CADINC por defecto (`calc_a_cargo_de`), pero en Cargar precios cada renglón de EPP tiene «EPP a cargo: CADINC / Cliente». Marca `solicitud_compra_item.epp_a_cargo_cliente`; única puerta `marcar_epp_a_cargo_cliente` → `POST /api/cuenta-cliente/epp-a-cargo` (flag `cargar_precios`, porque mete plata en la deuda). Vale en obras de cliente y por administración; rechaza llave en mano, cobrados, certificados y lo que no es EPP. Con la marca el renglón queda `a_cargo_de='cliente'` → `a_cobrar`, tipo `epp`. Es distinto de «pagó», que dice quién le pagó al proveedor.
- **Circuito de propuesta**: quien compra pero no puede fijar precios usa `precio_propuesto` y el dueño aprueba (`POST /items/:id/aprobar-precio`). Proponer no mueve la cuenta. Nadie se aprueba a sí mismo salvo admin.
- **`fn_mcc_congelada`**: una fila con `cobro_id` o `certificado_id` NO admite cambio de `precio_unit`, `precio_total` ni `cantidad` (409 `MCC_COBRADO` / `MCC_CERTIFICADO`). El camino correcto son **dos statements**: primero soltar del cobro (`cobro_id` y `monto_cobrado` a null, permitido porque los importes no cambian) y después valuar; el user reimputa con "Imputar lo pagado". El escape `set local cadinc.descongelar = 'on'` es para cuando el renglón DEBE seguir cobrado: no deja rastro, usarlo solo con motivo escrito en la migración.
- **Traza**: el trigger de MCC escribe el evento `precio_cambiado` con antes y después; el catálogo, su historial. Los dos juntos se ven en **Admin › Movimientos de precios** (`v_movimientos_precio`), filtrable por usuario. Ojo: la `fuente` de los renglones dice `sql` casi siempre porque el backend no la setea (PostgREST no expone `set_config`) — **no** significa "tocaron la base a mano".
- **Certificado**: **sale con el precio cargado en cada renglón, sin subir nada al catálogo** (`20260928a`, dueño 24/09: «deberían salir con los precios que se cargó en el sistema»). Hasta ese día `emitir_certificado_cliente` llevaba al catálogo todo renglón que estuviera por debajo (decisión del 08/09); en el certificado N°1 de Farmacia America eso subía $241.923,89 y no daba igual al papel que ya tenía el cliente. Ahora la RPC solo **informa** `bajo_catalogo` / `bajo_catalogo_dif`, y el modal avisa ANTES de emitir (⚠ en el renglón), que es cuando se puede corregir en «Cargar precios». Las fechas de precio **no se pueden retroceder**: un trigger pisa `precio_actualizado_en` con `now()` en cada cambio.
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
- **Dónde se ven las devoluciones** (`20260914ai`): en **Cuenta corriente › obra › Devoluciones al depósito**, TODAS, con o sin nota. Hace falta porque devolver un renglón no cobrado lo descuenta de la cuenta (y si vuelve todo, borra la fila de MCC): en la cuenta no queda rastro. Fuente: `solicitud_item_eventos` (`devuelto`/`cancelado`, con `meta.obra_cod`), RPC `cuenta_corriente_devoluciones_detalle` → `GET /api/cuenta-cliente/devoluciones`. `stock_movimientos` NO sirve de fuente: se saltea renglones sin ficha y las 5 devoluciones de abril no tienen obra.
- **Devolver TODO lo que nunca salió es CANCELAR, no devolver** (`20260913p`). Vuelve todo **y** no salió nada **y** no hay remito emitido: las tres cosas. El renglón queda `rechazado` **conservando su cantidad** — "15 bolsas, rechazado" cuenta la historia; "0 bolsas" no dice nada. Ojo: `cantidad_enviada = 0` **no** equivale a "sin remito" (hay 19 renglones con remito y ese campo en 0, y 57 al revés).
- **Borrar un pedido son dos ciclos** (`20260917j`). `eliminar_solicitud(p_solicitud_id, p_user_id, p_compras)` borra en cascada (renglones, historial y filas de la cuenta de la obra) y **decide el stock por dónde está la mercadería, no por el estado del renglón**: lo despachado de depósito y sin enviar **vuelve al estante** (solo la parte que no viajó); lo **enviado bloquea** (`SOLICITUD_TIENE_ENVIOS`, está en la obra: para eso es Devoluciones o "revertir envío"); y las **compras sin enviar exigen elegir** `p_compras`: `'a_deposito'` (la compra queda en CADINC → entrada `compra` con proveedor, precio y factura en la obs, que es lo único que sobrevive del renglón) o `'devuelta_proveedor'` (no toca stock). Sin destino y con compras → `ELEGIR_DESTINO_COMPRAS`; compra sin ficha con `a_deposito` → `COMPRA_SIN_FICHA`. Herramientas y servicios no mueven stock. Hasta ese día la RPC devolvía stock por `enviado` (inventaba mercadería que estaba en la obra) y no devolvía nada por `comprado` (la compra desaparecía con su costo): el pedido 548 de CASA OPERARIOS destapó las dos cosas.
- **Fraccionar bultos** (`20260913n`/`o`). Abrir un tambor y que salgan litros. **El precio de venta NO se toca al fraccionar.** No hay conversión automática entre presentaciones: se compra un tambor de 200 lts y no se puede despachar 4.

### 5.18 Pagos: la doble firma, y dónde cede (2026-09-18/21)

El circuito es **cargar → aprobar → pagar**, y cada paso pide una persona distinta. Las tres reglas viven en la base:

- `NO_PUEDE_APROBAR_PROPIA` (`pagos_aprobar_factura`) — no aprobás lo que cargaste.
- `NO_PUEDE_PAGAR_PROPIA` y `NO_PUEDE_PAGAR_LO_QUE_APROBO` (`_pagos_emitir_orden`) — no pagás lo que cargaste ni lo que aprobaste.

**La primera cede ante el flag `aprobar_propias`** (default false, `20260921f`): con él, quien carga puede aprobar lo suyo Y sus facturas **nacen aprobadas** (auto-aprobación en `crearFactura`, que exige `aprobar_facturas` **+** `aprobar_propias`). Nació porque Diego es el único aprobador y además carga: sin esto cada factura suya quedaba trabada esperando al único admin. **Las otras dos NO ceden**: la plata sigue necesitando otra persona, y ahí está el control real.

La auto-aprobación es **best-effort a propósito**: si la factura no se puede aprobar (la paga el cliente, el proveedor quedó inactivo, nació `pagada`), queda como nació. Un error ahí no puede tirar abajo una carga ya guardada.

`_pagos_flag(user, flag, default)` es el espejo en SQL de `flagPagos()` del backend. **Lleva un `coalesce` por afuera**: sin fila el subselect da NULL, `not NULL` es NULL, y el `if` del que cuelga la regla no entra por ninguna rama — un uuid inexistente se colaba. Mismo patrón que `_pagos_es_admin`.

**Los tabs de `pagos` no son sólo la UI**: las rutas usan `requireTab('pagos', TAB_PAGO)` con `TAB_PAGO = ['facturas','pagos']`, así que con el tab `facturas` ya se pasa el guard de `GET /ordenes` y del `signed-url` que baja el comprobante. Y el **orden del array importa**: `useTabsPermitidos` los devuelve tal cual se guardan y `PagosPage` redirige a `allowedTabs[0]`.

### 5.17 Lo que se pide viaja en la DESCRIPCIÓN, no en columnas nuevas (2026-09-11/12)

`materiales_a_cuenta_cliente` y los remitos llevan una `descripcion` desnormalizada, y **todos los documentos que importan imprimen esa descripción**. Por eso lo que distingue al producto se compone adentro al escribir, en vez de agregar una columna a cada tabla y a cada PDF.

- **Color**: `desc_con_color()` (`20260913t`) lo mete en la descripción desde las tres RPC que escriben MCC; el backend lo espeja en `src/lib/desc-con-color.ts`. El remito resuelve el color **en el server** desde `item_id`, no confía en el cliente. Usa `norm_txt` (no `norm_material`) para no duplicar "verde-amarillo" contra "verde amarillo" (`20260913u`).
- **No pre-generar grillas color x tamaño.** De 62 fichas de pintura, 4 tienen stock positivo y 50 no tienen un solo movimiento: el depósito compra por obra, no inventaría colores. La ficha más usada es la genérica con `usa_color` prendido. Una ficha **no puede** tener el color en el nombre Y el flag prendido.
- **La observación del renglón** (`solicitud_compra_item.obs`) se muestra pegada a la descripción en la fila, la tarjeta y los modales de comprar y despachar. Son 255 renglones y dicen "gris zócalo", "ALBA", "mallado": es parte de QUÉ se pide.
- **Fotos del catálogo** (`20260912g`): tabla `stock_material_fotos` + `stock_materiales.foto_url` (la principal, la mantiene un trigger, **no escribirla a mano**). Bucket **público** `catalogo-fotos`, 5 MB, JPG/PNG/WEBP/HEIC. El duplicado se mira por `(material_id, file_hash)`: la misma foto en fichas distintas es válida a propósito (foto de familia). Para tandas, `scripts/subir-fotos-catalogo.mjs`.

### 5.18 Pagos: módulo independiente, que solo comparte las obras (2026-09-18)

**Por decisión explícita del user, Pagos NO se cruza con ningún otro módulo.** No lee ni escribe `materiales_a_cuenta_cliente`, no se engancha con las solicitudes de compra y no usa `public.proveedores`. Lo único compartido son las **obras**, que alimentan los centros de costo. Si en el futuro se conecta con compras, es una decisión nueva, no una consecuencia.

- **Padrón propio**: `pagos_proveedores`. Un proveedor que ya existe en certificaciones se carga de nuevo acá, con su CUIT, alias y CBU. No hay FK ni matcheo automático.
- **Tres separaciones de tareas**, todas validadas en el backend: no aprobás lo que cargaste, no pagás lo que cargaste, no pagás lo que aprobaste. El admin las saltea. En la UI los botones quedan **deshabilitados con tooltip** explicando cuál se aplica (§6, misma regla que el resto).
- **Las percepciones NO son parte del precio y NO se reparten a las obras**: son crédito fiscal de CADINC. Lo que se imputa a los centros de costo es `total − percepciones`.
- **El reparto por obra se cuadra en el cliente** (`repartirParejo()` + `ajustarUltima()` en `ModalCargarFactura`) para que la validación exacta del backend nunca rebote por centavos de redondeo.
- **Un cheque es una FILA de `pagos_cheques`, no un campo de la orden** (`20260921a`/`b`). Una OP puede pagarse con N cheques escalonados; cada uno lleva su número (obligatorio), banco, fecha de cobro, importe y si es propio o endosado de un tercero (y ahí `librador` es obligatorio: si rebota hay que saber a quién reclamarle). Reglas, todas en `_pagos_emitir_orden` y espejadas en `validarCheques` del backend: `cheque`/`echeq` exigen al menos uno y cualquier otra forma exige ninguno; **Σ cheques = `monto_pagado`** exacto; ninguno se cobra antes de la fecha del pago. **`pagos_ordenes.fecha_cobro` pasó a ser DERIVADA** = la primera fecha de sus cheques, así que `v_pagos_ordenes.en_cartera` y todo lo que ya la leía siguen andando — no escribirla a mano. Los cheques entran por `p_orden -> 'cheques'`, no por un parámetro nuevo: así la regla vale igual para la OP normal y para la factura que se carga «ya pagada». El trigger `trg_pagos_cheque_unico` frena el mismo cheque entregado dos veces, pero **solo contra OPs `emitida`**: si la orden se anula, sus cheques vuelven a estar disponibles (por eso es un trigger y no un índice único).
- **Una nota de crédito de proveedor es un COMPROBANTE** (desde 2026-09-24, migraciones `20260925a`–`d`; hasta ese día era una línea de la OP y nunca se usó): fila de `pagos_facturas` con `clase='nota_credito'`, su desglose por la misma puerta y su reparto por obra (Σ = total − percepciones; el SIGNO lo pone quien agrega, `pagos_imputaciones.monto` sigue > 0). Declara a qué facturas del mismo proveedor acredita (`pagos_nc_aplicaciones`, única puerta `_pagos_guardar_aplicaciones`). **Baja la deuda al APROBARSE**; mientras tanto RESERVA: el tope de pago es `saldo_pagable = saldo − nc_pendiente`, no `saldo`. El sobrante es crédito a favor que se aplica a mano (`POST /facturas/:id/aplicar-nc`, flag `aprobar_facturas` O `registrar_pagos`). Con `aprobar_propias` la NC nace aprobada igual que la factura (decisión del dueño, 24/09). La OP es solo plata (`pagos_orden_lineas_sin_nc_chk`); la devolución del proveedor se retiró: se carga la NC y listo.
- **Concepto de la factura de compra** (`pagos_conceptos`, `pagos_facturas.concepto_id`, `20260925j`–`n`, pedido del contador): uno por factura, **obligatorio en el alta** y editable siempre (también pagada: es clasificación). Lista editable desde Compras › Facturas › «Conceptos» (sin borrar: baja con `activo`). La lectura IA lo sugiere. La `descripcion` libre sigue siendo el detalle.
- **Datos de ARCA del proveedor** (`20260925o`): domicilio, provincia, `condicion_iva_id`, tipo de persona y actividad salen del padrón (`GET /proveedores/padron/:cuit`, `POST /proveedores/:id/actualizar-desde-arca`, masivo). Las funciones puras viven en `cadincsrl/src/lib/arca/padron-datos.ts` y Ventas las comparte. Un aviso (que no bloquea) `LETRA_NO_COINCIDE_CONDICION` salta cuando la letra de la factura no cuadra con la condición. Local corre contra homologación: su padrón no sirve para probar datos reales.
- **Cheque leído de la foto y recibo del proveedor** (`20260925p`/`q`): la foto se sube como comprobante pendiente de la OP (`tipo:'cheque'`), `POST /cheques/leer` la lee con IA sin crear nada y cada cheque manda su `foto_path` al emitir, que queda como adjunto `cheque`. Esa foto NO reemplaza el `comprobante_pago`. El adjunto `recibo_proveedor` alimenta `v_pagos_ordenes.tiene_recibo` y el filtro `sin_recibo`.
- **Forma de pago habitual del proveedor** (`pagos_proveedores.forma_pago_habitual`, `20260930a`/`b`): con ella y el plazo (`plazo_pago_dias` / `vencimiento_modo`) nacen sus facturas, tanto al cargarlas a mano como al importarlas de ARCA (`_pagos_prevision_pago`: forma, vencimiento y, con cheque/e-cheq, UN cheque al vencimiento). Null = transferencia. Caso: ABC S.A., e-cheq a 30 días de la factura.
- **Concepto y centro de costo habituales del proveedor** (`pagos_proveedores.concepto_habitual_id` / `obra_habitual_cod`, `20260930p`): la carga a mano precarga el concepto (le gana a la sugerencia de la lectura, con marca «habitual del proveedor») y el 100 % a la obra mientras nadie los toque; el importador de «Mis Comprobantes» pone el concepto y, con los dos, imputa con `pagos_imputar_lote` (best effort: si rebota —p. ej. `TRIBUTOS_A_REVISAR`— queda `sin_imputar`; la fila dice `imputada_habitual`). Caso: Truck NOA → «Mantenimiento y repuestos» a CC-020 Áridos. La misma migración arregló el importador: desde `20260930a` el plan de cheques llegaba como jsonb `'null'` y los CHECK tiraban abajo toda importación.
- **Código de proveedor** `PRV-0001…` (`pagos_proveedores.codigo`, `20260925i`): lo pone un default de secuencia, no se edita (`CODIGO_NO_EDITABLE`), está en `busq`.
- **Contactos múltiples** (`pagos_proveedor_contactos` y `ventas_cliente_contactos`, `20260925e`–`g`): nombre, rol, email, teléfono y `recibe_avisos`; se guardan enteros con `*_guardar_contactos` (única puerta), que además deja el contacto principal en las columnas viejas (`email/contacto/telefono`) para los lectores que quedan (Galicia, exports). El aviso de pago manda un mail por dirección: las tildadas; sin elegir, las que reciben avisos; sin ningún contacto con email, el email viejo.
- **Cada obra es su propio centro de costo; el cliente las agrupa** (decisión del dueño, 2026-09-23). `obras.cc` —el nombre del cliente tipeado a mano— **quedó en desuso**: los agrupados salen de `obras.cliente_id` → `ventas_clientes` (resumen de la cuenta corriente, Costos, Tarja, dashboard, Pagos vía `20260923i`). `_pagos_centro_de(cliente, nom, es_interna, es_deposito)`: interna o depósito → su nombre; si no, el cliente; sin cliente, el nombre de la obra. Caja ya usaba la obra por su nombre. `GET /api/obras` trae `cliente_nom` aplanado. El único que todavía lee `cc` es Facturación (era el centro de costo para Finnegans, que se dejó el 24/09: §5.19).
- **Los errores del backend se traducen en `utils/pagos.errores.ts`** (~40 códigos). El `HttpError` del client trae `{ message: code, body: { error, detail } }`: leer `body.error`, no `message`.
- **Factura «archivo primero» y desglose ARCA** (`20260924u`). Al cargar, primero se suelta el archivo: el **navegador** decodifica el QR de ARCA (pdfjs sin worker + jsQR, `utils/qrFactura.ts`; el backend no rasteriza PDFs a propósito), el backend lo lee con IA (`lectura/ia.ts`, claude-sonnet-5 por defecto —`PAGOS_LECTURA_MODEL` lo cambia—, structured output) y devuelve una propuesta con avisos y la fuente de cada campo, sin crear nada; la lectura queda en `pagos_facturas_lecturas` y la factura la toma por `lectura_id`, nunca del cliente. El detalle vive en `pagos_factura_iva` (alícuota ARCA 3/4/5/6/8/9) y `pagos_factura_tributos` (percepcion_iva/iibb/ganancias/municipal, impuestos_internos, otro, con jurisdicción); `neto`, `iva`, `percepciones` y `otros` se **derivan** del detalle en `_pagos_guardar_desglose` (única puerta) y un trigger diferido frena el desalineo. Cierre: neto + no gravado + exento + IVA + percepciones + otros = total (±0,01). **Los QR reales vienen mal armados seguido** (importe en centavos, número truncado): el QR manda salvo el total verificable, y si difiere del papel es aviso de error con «usar el del papel».
- **El módulo no emite broadcast de realtime** (`middleware/realtime.ts` del backend lo excluye a propósito): el volumen es bajo y el ancho de banda de Render es el cuello de botella conocido (§5.9 del backend / `useNotificaciones.ts`).

### 5.19 Impuestos: sin Finnegans, desde el ERP (2026-09-24)

**El dueño dejó Finnegans**: «manejaremos desde acá la contabilidad, no registraremos nada ahí». Todo lo de «registrar en Finnegans» (bandeja de Ventas, número de Finnegans en la OP, chips y KPIs) salió de la pantalla; las columnas (`numero_finnegans`, `registrada_at`…) y el flag `registrar_finnegans` quedan en la base sin uso. Saldos iniciales con `origen='finnegans'` sigue: son facturas viejas reales. La contabilidad completa (plan de cuentas, asientos) se planifica aparte, después.

- **Tab `impuestos` de Ventas** (reemplaza a `finnegans`, migración `20260924x`): el mes se elige una vez y vale para las tres vistas. **Posición de IVA** (débito − crédito − pago a cuenta ITC del mes (45 % del ICL de gasoil, primero y solo hasta el impuesto, §5.20) − percepciones de IVA − retenciones de IVA; ayuda para el contador, NO arrastra saldos de meses anteriores), **Libro IVA ventas** y **Libro IVA compras**. Backend: `GET /api/facturacion/lid-ventas`, `/lid-compras`, `/posicion-iva` (+ `/descargar`), guardia lectura + tab `impuestos` (acepta también la vieja `finnegans`).
- **Libro de compras** (`cadincsrl/src/modules/facturacion/lid-compras.ts`, puro, con las fuentes de ARCA): sale de `pagos_facturas` no anuladas **por fecha del comprobante**, con `pagos_factura_iva` y `pagos_factura_tributos`. Es el único lugar donde Ventas lee datos de Compras (excepción explícita a §5.18, de solo lectura). Queda FUERA con error: sin desglose (`desglose_a_revisar` o A sin alícuotas), número sin forma `PPPPP-NNNNNNNN`, CUIT inválida, recibo/ticket/otro, bienes usados (049, archivo propio). B/C: 0 alícuotas y sin crédito. **1 centavo de redondeo del proveedor se acepta** (advertencia, se informa como el papel; decisión del dueño por la #19 Zeramiko): no se inventa un no gravado de $0,01. Formato calcado del COMPRAS_CBTE que ARCA le aceptó al contador (ago-2026 v5): despacho de importación en blanco y código de operación en blanco / «N» (B/C) / «E». Crédito fiscal **sin prorrateo** (= IVA liquidado): si CADINC empezara a tener operaciones exentas, eso cambia.
- **Ventas no muestra vencimientos de cobro** (dueño, 24/09: «no me sirven para nada»). `vence_el`, `cobro_estado='vencida'` y `dias_vencido` siguen en la base (el backend calcula `vence_el` = fecha + plazo del cliente) pero ninguna pantalla, PDF ni la campana los usa. **Deudores cuenta la antigüedad desde la FECHA de la factura** (`ventas_deudores_antiguedad_al`, `20260924y`: hasta 30 / 31–60 / 61–90 / +90). Quedan el vencimiento del CAE y el de pago de la FCE MiPyME, que son de ARCA.
- **CVLP (060) de Casilda Combustibles**: fletes de camiones de CADINC que Casilda cobra por cuenta y orden y liquida con su comisión descontada. Anexo VII: CADINC es el VENDEDOR → van en el libro de VENTAS con el neto, el IVA y el total del papel; la comisión descontada no va a ningún libro. Sin facturas de CADINC a Casilda que las dupliquen (verificado 24/09). En Impuestos van **incluidas por defecto**.
- **Gastos descontados y «Cargar liquidación»** (20260930k/l): el cobro tiene una tercera pata, `ventas_cobro_gastos` (concepto de `ventas_cobro_gasto_conceptos`, editable en Ventas › Configuración con sinónimos), y **total = medios + retenciones + gastos**. Entran por `p_cobro -> 'gastos'` (no hay parámetro nuevo). En Contabilidad van al debe de la clave `cobros.gasto` (subclave = id del concepto); sin mapeo, SIN_MAPEO. «Cargar liquidación» (Cobranzas) sube el PDF, el navegador saca el texto (`utils/textoPdf.ts`), el backend lo lee con el parser de Casilda (`facturacion/liquidacion.ts`; si no alcanza, IA) y devuelve una propuesta SIN crear nada; se confirma con el `POST /cobros` de siempre, con `liquidacion_numero` (único por cliente entre vigentes: LIQUIDACION_DUPLICADA) y la liquidación como adjunto `liquidacion`. Los cheques del cobro entran a la cartera por el trigger; si el cheque ya estaba (Logística), se VINCULA al medio, no se duplica, y al anular el cobro solo se desvincula.
- **Las NC de proveedor** entran solas al libro de compras (restan); ya no existen NC como línea de OP (CHECK `pagos_orden_lineas_sin_nc_chk`).

### 5.20 Contabilidad (fase 1, 2026-09-24)

El ejercicio de CADINC va de **julio a junio**; la contabilidad se lleva en el ERP desde el **01/07/2026** (decisión del dueño, 24/09). Diseño y spec en Obsidian `Proyectos/Contabilidad en el ERP — diseño (2026-09-24).md` y `… fase 1 — spec`.

- **Tablas** `cont_ejercicios`, `cont_periodos`, `cont_cuentas`, `cont_asientos`, `cont_asiento_lineas` (20260926a–f). Única puerta: RPC `cont_*` (security definer, `p_user_id`, solo service_role). Partida doble con constraint trigger diferido; el guard `PERIODO_CERRADO` frena tocar un mes cerrado.
- **Anular**: borrador → se borra; confirmado con período abierto → `anulado`; período cerrado → **contraasiento** en un período abierto (`revierte_id`).
- **Numeración del diario**: al CERRAR el período, correlativa por ejercicio en orden (fecha, id). Se cierra en orden y solo se reabre el último cerrado (desnumera).
- **Tesorería** (`tesoreria_cuentas`, 20260926b): bancos, caja y valores de CADINC. Tabla propia, NO `ventas_cuentas_bancarias` (esa exige CBU y alimenta la FCE). `pagos_ordenes.cuenta_origen_id` (20260926g) = de qué cuenta salió la plata; opcional, entra por `p_orden -> 'cuenta_origen_id'`.
- **Contabilidad es la integradora**: sus líneas referencian `ventas_clientes`, `pagos_proveedores` y `obras` (excepción explícita a §5.18).
- **Flags** (default false): `asientos_manuales`, `cerrar_periodos`, `editar_plan`. Todo flag nuevo va TAMBIÉN en `ModuloPermisosSchema` de `usuarios.routes.ts`: si no, Admin lo borra al guardar el usuario (pasó con 6 flags de Ventas/Pagos hasta el 24/09).
- **Plan provisorio** en `supabase/seeds/cont_plan_provisorio_2026.csv` (172 cuentas): NO se aplica solo, se importa desde Contabilidad › Plan con vista previa. Pendiente la decisión del contador sobre el plan.
- **Ejercicio siguiente**: se abre desde Períodos › «Abrir ejercicio siguiente» (RPC `cont_abrir_ejercicio_siguiente`, flag `cerrar_periodos`, 20260928e); sin él, las fechas posteriores al 30/06/2027 dan `FECHA_SIN_PERIODO`.
- **Plan real = el de Finnegans** (importado 24/09, 335 cuentas): códigos con puntos, 1110101 → 1.1.1.01.01. El importador de Plan acepta directo el CSV que exporta Finnegans (lo convierte; las cuentas `habilitada=NO` se omiten). La 4 «RESULTADO DEL PERIODO» es rubro `resultado` (solo títulos; sus hijas pueden ser ingreso o egreso, 20260927i).
- **Asientos automáticos** (20260927d–f): `cont_contabilizar` batch idempotente por `(origen_tabla, origen_id, evento)` + `origen_hash`, sin triggers en las tablas de origen; desde `cont_config.automaticos_desde` (01/07/2026). Las cuentas salen SOLO de `cont_mapeos` (lo carga el contador) y de `tesoreria_cuentas.cuenta_id`: sin mapeo el origen queda pendiente con motivo, nunca se inventa. Período abierto → se regenera; cerrado → queda desactualizado y se corrige con contraasiento (`revertir_cerrados`, pide `cerrar_periodos`). Compra con período IVA corrido: el asiento va el día 1 del mes de IVA. CVLP: por el neto; el total de ARCA ya es neto de la comisión de Casilda, así que el motor usa `coalesce(liquido, total)` y `liquido` es solo una corrección opcional (20260928f).
- **Período IVA en compras** (`pagos_facturas.periodo_iva`, 20260927a): el Libro IVA compras y la posición filtran por él, no por la fecha. Default = mes de la fecha, o el primer mes abierto si ese está cerrado en Contabilidad (Pagos lee `cont_periodos`, excepción de solo lectura a §5.18).
- **Importador de «Mis Comprobantes Recibidos»** (20260927b/c/j, 20260928g): acepta también «Comprobantes de Compras» (dice Vendedor; sin columna de otros tributos, la diferencia con el total entra como tributo a revisar). Si el archivo trae comprobantes de meses anteriores ofrece «Período IVA de todos: <mes del archivo>». las importadas entran `sin_imputar` (sin concepto ni reparto): cuentan para IVA y contabilidad, pero no se aprueban ni pagan hasta imputarlas. «Otros tributos» entra `tributos_a_revisar`. El duplicado se mira con el código ARCA (una ND y una FA pueden compartir número).
- **«Marcar pagadas» en lote** (20260927h/l): tarjeta o billetera, una OP por factura, SOLO facturas sin aprobar (salvo admin). Es la única excepción a la doble firma, igual que «ya pagada al cargar» con tarjeta/efectivo; la factura queda con saldo 0 y `pendiente` hasta aprobarse.
- **Compras de meses ya pagados** (20260928b): el importador con «historica» las marca `pago_a_reconstruir`: no cuentan como deuda (Deuda por proveedor las muestra aparte en `a_reconstruir`), no se aprueban (`FACTURA_A_RECONSTRUIR`) ni salen en la campana; la marca deja de valer sola cuando una OP las deja en saldo 0. Jul–ago 2026 importadas así (importaciones 12 y 13).
- **Ventas por cliente** (20260928c): el mapeo `ventas.cliente` manda sobre `ventas.producto`/`ventas.externo`. Los clientes de transporte van a 4110103, el resto a 4110101.
- **Compra con `desglose_a_revisar`** (20260928d): queda pendiente con `DESGLOSE_A_REVISAR` (criterio del contador); si ya tenía asiento en período abierto se anula, en cerrado queda desactualizado.
- **Automáticos por circuito** (20260928h): tildes Ventas/Cobros/Compras/Pagos que filtran pendientes y lo que se contabiliza (`p_fuentes`). Cerrar un período mira todos los circuitos.
- **Libro Diario resumido** (20260928i, `cont_libro_diario_resumido`): detallado, por día o por mes; los automáticos se agrupan por circuito y período, los manuales van uno por uno. Es presentación: no crea asientos. Export a Excel con encabezado para rubricar.
- **Estados contables** (tab `estados`, 20260928j/k): balance a una fecha (el resultado no cerrado va como fila virtual del PN) y estado de resultados de un rango, comparativo por mes. Sin asiento de apertura el balance cuadra pero no refleja el patrimonio real (aviso `sin_apertura`).
- **Movimientos de fondos** (tab `tesoreria`, 20260928l/m): plata que entra o sale SIN factura (gastos bancarios, VEP, sueldos, retiros, transferencias entre cuentas propias). Tabla `tesoreria_movimientos` (MF-NNNNNN) con conceptos editables (`tesoreria_conceptos`) mapeados por `fondos.concepto`; circuito «Fondos» del motor. Flag `movimientos_fondos`. Anular, nunca borrar. Campos `origen`/`extracto_linea_id` reservados para la conciliación bancaria.
- **Asiento mensual de IVA** (20260928n/o, columna IVA en Períodos): cancela los saldos del mayor del mes (DF, CF, percepciones y retenciones de IVA) contra IVA a pagar o saldo a favor (`iva.ddjj`). La posición de los libros es el control: si difiere, 409 `IVA_DIFIERE_DE_LIBROS` (forzable). Tipo `ajuste`, `origen_evento='ddjj'` (el lote no lo toma).
- **Bienes de uso** (tab `bienes`, 20260928p/q): ficha por bien (BU-NNNN), cuadro de amortizaciones, importador de Excel del inventario y `cont_amortizar` (mensual o anual, proporcional o año completo, por `cont_config`), idempotente por (bien, período), `origen_evento='amortizacion'`. Flag `bienes_uso`.
- **Cartera de cheques recibidos** (`cheques_recibidos`, `20260930f`, fase 1; diseño en Obsidian `Proyectos/Cartera de cheques recibidos — diseño (2026-09-25)`): cheques de terceros que entran por cobros de Logística (al adjuntar la liquidación o el comprobante al cobro se leen en segundo plano con IA → `cheques_recibidos_registrar`, `20260930h`; librador vacío o CADINC = la empresa del cobro; modelo: `CARTERA_LECTURA_MODEL`, que cae a Sonnet como Compras). El adjunto muestra el estado de la lectura (`cobros_adjuntos.cheques_lectura`, `20260930j`) y el cobro tiene «Cheques recibidos» con carga a mano (bloqueada mientras se lee, 409 `LECTURA_EN_CURSO`). Un cheque que entra ya endosado se vincula solo (`_cartera_vincular_endosos`, `20260930m`) y de Ventas (`ventas_cobro_medios`, por trigger). Único por (número sin ceros, importe). Un cheque de tercero en una OP toma librador/banco de la cartera si venían vacíos o «No informado…» y la marca `endosado`; OP anulada o cheque borrado → vuelve a `en_cartera`. Rechazado → vuelve a la cartera hasta que lo paguen (`rechazado` → `recuperado`). Pantalla: Contabilidad › Tesorería › «Cheques recibidos» (`?vista=cheques`, `v_cheques_recibidos`, `20260930n`: origen, destino, vencidos, alta a mano) y en Compras «🏦 Elegir de la cartera» en el editor de cheques (`GET /api/pagos/cheques/cartera`). Depositar (en lote; sin fecha = la de cobro de cada cheque), rechazado, recuperado y deshacer con `cheques_recibidos_cambiar_estado` (`20260930o`), **sin asiento todavía** (fase 4b: los cobros de Logística no se contabilizan, así que Valores a depositar no recibe esos cheques aunque el endoso los acredita; preguntas para el contador en el diseño). «Vencido» = en cartera con la fecha pasada.
- **Tesorería** incluye tipos `tarjeta` (vinculada a una cuenta del PASIVO) y `billetera` (Mercado Pago).
- **ITC computable** (`20261001a`/`b`, Ley 23.966, transporte de carga): tributos de compra `icl` (ICL/ITC) e `idc` (no son percepciones: van a `otros` y a la obra; en el LID siguen en «otros tributos», campo 22). Con `pagos_proveedores.icl_computa_pago_a_cuenta` (ficha; YPF y Petronorte), el asiento de la compra manda el **45 % de cada ICL** (round 2) a `compras.itc_computable` (1.1.4.01.12) y el 55 % + todo el IDC a `compras.tributo|icl` / `|idc` (4.2.1.07.16 / .15). El asiento mensual de IVA usa el saldo de ITC (ejercicio hasta fin de mes) **después del saldo técnico y antes de percepciones**, solo hasta el impuesto: el sobrante queda en la cuenta (nunca es libre disponibilidad). Diferencia `itc` contra los libros. Mismo día: IIBB por provincia (`compras.tributo|percepcion_iibb|<jurisdiccion_id>` → 1.1.4.01.13–17 y .19 Tucumán; las sin jurisdicción pasaron a Tucumán) y la «Tasa Vial» de YPF es `impuestos_internos` (costo), no percepción.
- Criterios del contador (24/09) y lo que falta (apertura con el balance al 30/06, reconstrucción jul–sep, conciliación bancaria, cierre de ejercicio): nota de diseño en Obsidian.

### 5.21 Configuración desde el ERP (2026-09-25, migraciones `20260929a`–`k`)

Regla del dueño: **lo operativo se edita desde la pantalla**; terminal/SQL solo para cambiar el sistema. Lo que es del sistema (CUIT del emisor, certificado ARCA, cuenta SMTP, secretos) sigue en env/migraciones. Spec en Obsidian `Proyectos/Parametrización desde el ERP — spec (2026-09-25).md`.

- **Flag `configurar`** (default false) en `facturacion`, `pagos` y `admin` (espejo SQL: `_perm_flag(user, modulo, flag, default)`). Tabs nuevas: `facturacion.configuracion`, `pagos.configuracion`, `admin.empresa`. Leer no pide tab; escribir pide tab + `configurar`. Usuarios con lista explícita de tabs NO ven una tab nueva hasta agregársela.
- **Datos de la empresa** (`empresa_config`, Admin › Datos de la empresa): PDFs y Excel leen de ahí. El CUIT no se edita (va atado al certificado de ARCA). No confundir con `public.empresas` (transportistas, legacy).
- **Ventas › Configuración**: productos (`ventas_productos`, la factura elige del catálogo y pide período si corresponde), puntos de venta (`ventas_puntos_venta`) + vencimiento del certificado ARCA, **montos de ARCA con vigencia** (`ventas_parametros`: mínimo FCE y tope CF; cada factura usa el vigente a SU fecha, nunca se borra una vigencia pasada), tipos de retención sufrida (`ventas_retencion_tipos`; `iva` reservado y único porque lo leen el LID y el asiento de IVA) y valores por defecto de la factura (`ventas_config`: condición de pago, provincia de la lista ARCA, unidad, leyenda FCE; vacía = la de ARCA).
- **Jurisdicciones** (`jurisdicciones`, compartido Compras/Ventas, `/api/catalogos/jurisdicciones`): 24 provincias con código COMARB y ARCA + municipios. `pagos_factura_tributos` y `ventas_cobro_retenciones` llevan `jurisdiccion_id`; un trigger resuelve el texto (IA, backend viejo) por nombre/alias y pisa el texto con el nombre canónico. Texto que no resuelve queda con id null: no bloquea. Mapeos contables `tipo|<id>`.
- **Compras › Configuración** (`pagos_config`): jurisdicción por defecto de las percepciones, mail del contador (orden: pantalla › env `CONTADOR_EMAIL` › usuario con rol Contador), responder a, nombre del remitente (la DIRECCIÓN sigue siendo la del SMTP del env), texto al pie (bloquea CBU de 22 dígitos y alias con punto, mismo guard en SQL/backend/frontend) y plazos de cheque. **Mail de compras (copia)** (`aviso_compras_email`, `20260929x`): recibe el mismo paquete que el contador en un mail propio (destinatario `compras` en `pagos_ordenes_avisos`); en el modal viene tildado si está cargado.
- **Cuenta título de bienes de uso** (`cont_config.bu_titulo_rubros`, `_cont_bu_prefijo()`): sus hijas directas son los rubros. Reemplaza al `'1.2.2.'` escrito a mano.
- **Deshacer una importación de «Mis Comprobantes»** (`pagos_deshacer_importacion`, flag `importar_comprobantes` + `pagos.eliminacion`): vista previa y después todo o nada; bloquea si alguna factura tiene pago, NC, está imputada, aprobada o con asiento en período cerrado. Anula las facturas y sus asientos de períodos abiertos en la misma transacción. No hay «rehacer»: se reimporta el archivo.
- **Caché**: backend 60 s en memoria (con varias instancias en Render un cambio tarda hasta un minuto); frontend React Query 5 min, invalidado al guardar. Los hooks nuevos caen a las constantes viejas ante un 404.

### 5.22 Sueldos (2026-09-26, migraciones `20261004a`–`h`)

Módulo propio (`sueldos`), NO una tab de tarja. **El recibo se carga a criterio, no sale de la tarja**: las horas del recibo las decide el liquidador (el dueño maneja los recibos aparte de lo que se trabajó). La tarja sigue siendo la fuente del costo real de obra (§5.11); Sueldos es lo que se declara y se paga por recibo. Relevamiento de convenios y decisiones en Obsidian `Proyectos/Liquidación de sueldos en el ERP — relevamiento y convenios (2026-09-26).md`.

- **Personal sigue siendo la ficha única**; `sueldos_legajos` cuelga de `personal.leg` o de `choferes.id` (un chofer que además está en Personal tiene UN legajo con los dos). Los datos laborales (CUIL, CBU, obra social, ingreso, cónyuge/hijos, convenio y categoría) viven en el legajo y se ven solo desde Sueldos. CUIL y CBU con dígito verificador, en la base también; CUIL único. Sin `ver_pii` salen enmascarados y no se pueden cambiar (`SIN_PERMISO_PII`).
- **Convenios versionados por fecha**: `sueldos_escalas` (categoría × zona × `vigente_desde`), `sueldos_concepto_valores` y `sueldos_parametros` (18 %, RIFL, ART, SCVO, detracción, FAL…). Cada liquidación usa lo vigente a su fecha (`sueldos_valores_a_fecha`); una paritaria nueva es una fila nueva («Nueva paritaria», flag `configurar`), nunca un UPDATE. Un valor 0 vigente = el concepto no se aplica; `a_confirmar` marca lo que falta validar con el contador.
- **Motor en el backend** (`cadincsrl/src/modules/sueldos/calculo.ts`, puro y testeado): «Generar recibos» arma un borrador por legajo con entradas SUGERIDAS; el liquidador cambia horas, días, adicionales y conceptos manuales y guarda. La base recalcula los totales desde las líneas y rebota si no cuadran (`TOTALES_NO_CUADRAN`). `total_contribuciones` NO incluye el fondo de cese (va en `fondo_cese`).
- **Estados**: borrador → cerrada (recibos cerrados + asiento) → reabrir (solo si el asiento está en período contable abierto; lo anula) o anular (asiento abierto se anula, cerrado → contraasiento). Una sola liquidación vigente por convenio/tipo/período(/quincena) para `quincena` y `mensual`; SAC, vacaciones, final y ajuste se repiten.
- **Asiento**: `tipo='ajuste'`, `origen_evento='liquidacion'` (el lote de automáticos no lo toma), fecha = fin del período devengado. Debe: remunerativo, no remunerativo, contribuciones y fondo de cese por convenio (con la obra habitual del legajo); haber: sueldos a pagar, F.931, sindicato, fondo de cese, préstamos y otros según el `destino` de cada concepto. **Siempre cierra**: sin mapeo deja el aviso `SIN_MAPEO` y se contabiliza después con «Contabilizar». Al 26/09 faltan `sueldos.sindicato_a_pagar`, `fondo_cese_a_pagar` y `otros_a_pagar`.
- **Libro de Sueldos Digital**: el TXT sigue el diseño de la planilla oficial de ARCA (`LSD-ARMADO-TXT-Liquidaciones.xlsx`, copia en `~/Desktop/CADINC-documentos/ARCA/LSD/`): reg. 01 = 35, 02 = 115, 03 = 51, 04 = 370 posiciones, ANSI y CRLF. En el 03 va el código **del empleador** (`C` + id del concepto), no el de ARCA: antes del primer archivo se sube UNA vez el TXT de conceptos (`GET /api/sueldos/exportar/lsd-conceptos`, 195 posiciones) que los asocia a su concepto ARCA. Los códigos F.931 del 04 (actividad, condición, localidad…) y las bases sin tope de ANSES quedan A CONFIRMAR y el archivo lo avisa.
- **Códigos ARCA de los conceptos** (`20261004g`): los descuentos son 810000 jubilación, 810001 INSSJyP, 810002 obra social, 810004 cuota sindical, 810005 seguro de vida, 810007 préstamos, 820000 otros. El SAC es 120000 (el 120001/120002 fija el semestre) y solo va en junio y diciembre, salvo el proporcional 120003, que pide días. Vacaciones no gozadas queda sin código hasta que el contador defina si es remunerativa.
- **Flags** (`permisos.sueldos`, todos default false y en `ModuloPermisosSchema`): `ver_pii`, `liquidar`, `cerrar_liquidaciones`, `configurar`. Tabs: legajos, liquidaciones, recibos, exportar, configuracion.
- **Préstamos de Tarja**: «Generar» sugiere el saldo de Tarja › Préstamos menos lo ya puesto en recibos de OTRAS liquidaciones en borrador. Al CERRAR, la base escribe en `prestamos` una fila `descontado` por legajo (`sueldos_liquidacion_id`, `sem_key` = viernes de la semana de la fecha de pago); reabrir o anular las borra. Tarja no deja borrarlas (`409 PRESTAMO_DE_SUELDOS`). Un legajo sin `leg` (chofer solo) deja el aviso `PRESTAMO_SIN_LEGAJO_TARJA`.
- **Cerrar exige**: fecha de pago (`FECHA_PAGO_REQUERIDA`), fecha de ingreso en todos los legajos (`LEGAJOS_SIN_FECHA_INGRESO`: sin ella la antigüedad da 0 y el fondo de cese sale al 12 %) y ningún neto negativo (`NETO_NEGATIVO`, que también frena al guardar). La fecha de pago se puede corregir con la liquidación cerrada. «Generar» omite al que va por hora y no tiene horas en la tarja del período (`SIN_HORAS_EN_TARJA`): se lo agrega a mano si corresponde.
- **Datos personales**: sin `ver_pii`, CUIL/CBU/DNI salen `***1234` y la ficha no trae teléfono, dirección, nacimiento, licencia ni alias bancario. El `audit_log` guarda CUIL y CBU enmascarados (trigger con 4º argumento de columnas a enmascarar, y `cuil`/`cbu` en `CLAVES_OMITIDAS` del middleware, que vale para todo el sistema). El CSV del banco solo sale de una liquidación cerrada.
- **Asiento en período cerrado**: cerrar deja `PERIODO_CERRADO` sin asiento; «Contabilizar» lo lleva al primer día abierto con aviso `ASIENTO_EN_OTRO_PERIODO`. La obra del gasto sale del snapshot del recibo.
- **A confirmar con el contador** (al 26/09): tope de la base de aportes (hoy sin tope), SAC proporcional y SAC sobre vacaciones no gozadas en la liquidación final, criterio de días de mensualizados en meses de 28/31, valores marcados `a_confirmar` y los mapeos que faltan.

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
- **Librador** — Quien firmó un cheque. En un cheque endosado de un tercero no es CADINC, y es a quien hay que reclamarle si rebota.
- **Orden de pago (OP)** — El documento con el que se paga: agrupa una o varias facturas, sus notas de crédito como líneas y el comprobante.
- **Percepción** — Impuesto que el proveedor retiene en la factura. Es crédito fiscal de CADINC: no se le reparte a las obras (§5.18).
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
- **Precios, lo que quedó abierto de la auditoría del 2026-09-10** (informe en Obsidian `Proyectos/Permisos y precios - auditoria 2026-09-10.md`): (a) la `fuente` del evento `precio_cambiado` siempre dice `sql` porque el backend no la setea — se arregla cuando las escrituras de MCC pasen por una RPC; (b) ~~el certificado usa el precio de HOY cuando no hay precio a la fecha de corte~~ (desde `20260928a` el certificado no usa el catálogo para valuar); (c) `POST/PATCH /api/certificaciones/materiales` escribe un precio facturable con guardas flojas, pero `cert_materiales` está vacía y nadie la lee: es código muerto para borrar; (d) `fn_mcc_congelada` no cubre DELETE y deja tocar `certificado_id` a mano; (e) `stock_materiales_precios` tiene FK `on delete cascade`: borrar una ficha borra su historial de precios.
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

_Última actualización: 2026-09-26 (módulo Sueldos, §5.22)._
