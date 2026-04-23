# CONTEXT_DUMP — Sistema de Gestión CADINC SRL

> Documento exhaustivo de onboarding. Pensado para que alguien externo entienda el proyecto sin tocar el código.
> Última actualización: 2026-04-22

---

## 1. Descripción del Proyecto y Propósito de Negocio

**CADINC SRL** es una empresa argentina de construcción y logística. Este sistema es la plataforma interna que unifica la gestión operativa y administrativa. Reemplaza planillas Excel y procesos manuales.

### Dominios que cubre

1. **Tarja de obra** — Control de horas de trabajo por operario, obra y semana. Cálculo de costos por categoría, cierres semanales, impresión de recibos, export a Excel.
2. **Personal** — Alta/baja de trabajadores, datos personales (DNI, categoría, condición: blanco/asegurado), talles de ropa, historial de categorías.
3. **Logística** — Flota (choferes, camiones), tramos cargado/vacío con remitos escaneados, liquidaciones a choferes por día + km, facturación a empresas transportistas por toneladas entregadas.
4. **Certificaciones / Solicitudes de compra** — Workflow granular a nivel line-item: pedido desde obra → compra externa (factura + proveedor) o despacho de depósito → remito de envío. Al resolverse cada ítem se registra en `materiales_a_cuenta_cliente` para facturación al cliente de la obra.
5. **Stock** — Inventario en depósito central (rubros, materiales, movimientos entrada/salida/ajuste), importable/exportable por Excel.
6. **Herramientas** — Inventario, trazabilidad entre obras, movimientos con responsable.
7. **Caja** — Movimientos de ingreso/egreso con centros de costo y conceptos configurables.
8. **Ropa de trabajo** — Entregas con fecha + vencimiento por categoría (pantalón, botines, camisa).
9. **Préstamos** — Adelantos/préstamos a trabajadores con descuento en semana.
10. **Admin / Auditoría** — Gestión de usuarios, permisos granulares por módulo × acción, audit log completo de todas las mutaciones.

### Usuarios típicos

- **Administración**: carga obras, personal, tarifas, cierra semanas, factura.
- **Capataz / jefe de obra**: carga horas, pide materiales, registra entregas de ropa.
- **Logística**: registra tramos con foto del remito, genera liquidaciones y cobros.
- **Administrador del sistema**: crea usuarios, configura permisos, audita acciones.

---

## 2. Stack Técnico Completo

### Frontend (`frontend_cadinc_gestion`)

```json
{
  "name": "tarjaobra-frontend",
  "version": "0.1.0",
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start", "lint": "eslint" }
}
```

| Dep | Versión |
|---|---|
| next | 16.2.1 |
| react, react-dom | 19.2.4 |
| @tanstack/react-query | ^5.95.2 |
| @tanstack/react-query-devtools | ^5.95.2 |
| zustand | ^5.0.12 |
| react-hook-form | ^7.72.0 |
| @hookform/resolvers | ^5.2.2 |
| zod | ^4.3.6 |
| @supabase/ssr | ^0.9.0 |
| @supabase/supabase-js | ^2.100.0 |
| xlsx | ^0.18.5 |
| recharts | ^3.8.1 |
| tailwindcss | ^3.4.19 (dev) |
| typescript | ^5 (dev) |
| eslint, eslint-config-next | 9, 16.2.1 |
| prettier | ^3.8.1 |

> ⚠️ `AGENTS.md` avisa: "This version of Next.js has breaking changes — APIs, conventions, and file structure may differ from training data. Read guide in `node_modules/next/dist/docs/`." Next.js 16 + React 19 son versiones recientes con App Router estable.

### Backend (`cadincsrl`, repo separado)

| Dep | Versión | Rol |
|---|---|---|
| hono | ^4.12.9 | Web framework |
| @hono/node-server | ^1.19.11 | Adaptador Node |
| @hono/zod-validator | ^0.7.6 | Validación con Zod |
| @supabase/supabase-js | ^2.78.0 | Cliente Supabase |
| zod | ^4.3.6 | Schemas |
| jose | ^6.2.2 | Verificación JWT via JWKS |
| dotenv | ^17.3.1 | Env vars |
| tsx, typescript, vitest | ^4.21.0, ^6.0.2, ^4.1.1 | Dev/tests |

### Base de datos & infra

- **PostgreSQL 17.6** gestionado por Supabase (proyecto: `tarja api`, ref `xclobkgmaxioifpkukul`).
- **Supabase Auth** (JWT, tokens por user) + RLS en todas las tablas (policies `using(true)`: backend autentica, anon key no toca datos directamente).
- **Supabase Storage** (2 buckets):
  - `cert-adjuntos` — facturas/certificaciones.
  - `remitos-logistica` — imágenes/PDF de remitos de carga/descarga (público, sin policy SELECT tras hardening).
- **Hosting**: no confirmado en el código (❓ Aclarar con Franco: ¿Vercel frontend / Render o similar backend?).
- **Dominio**: `cadinc.com.ar` en Hostinger (no cableado a infra todavía según histórico).

---

## 3. Estructura de Carpetas

### Frontend (`src/`)

```
src/
├── app/                            # Next.js App Router
│   ├── (app)/                      # Grupo de rutas autenticadas (sidebar/shell)
│   │   ├── admin/page.tsx
│   │   ├── caja/page.tsx
│   │   ├── certificaciones/page.tsx
│   │   ├── configuracion/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── herramientas/
│   │   │   ├── inventario/page.tsx
│   │   │   ├── movimientos/page.tsx
│   │   │   ├── parametros/page.tsx
│   │   │   ├── remitos/page.tsx
│   │   │   └── trazabilidad/page.tsx
│   │   ├── horas-trabajador/page.tsx
│   │   ├── logistica/page.tsx
│   │   ├── personal/page.tsx       (protegida con modulo="tarja")
│   │   ├── tarja/
│   │   │   ├── page.tsx            (listado obras)
│   │   │   ├── [obraCod]/page.tsx  (tarja semanal de una obra)
│   │   │   ├── archivadas/page.tsx
│   │   │   ├── costos/page.tsx
│   │   │   ├── prestamos/page.tsx
│   │   │   └── ropa/page.tsx
│   │   └── layout.tsx              (envuelve con Shell)
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── herramientas/login/page.tsx (login específico herramientas — ❓ Aclarar con Franco)
│   ├── reset-password/page.tsx
│   ├── favicon.ico, globals.css
│   ├── layout.tsx                  (RootLayout + fonts + Providers)
│   ├── page.tsx                    (selector de módulo post-login)
│   └── providers.tsx               (QueryClient + ToastProvider + ProfileLoader)
├── components/
│   ├── ui/                         # Base: Button, Input, Select, Combobox,
│   │                               # Modal, Toast, Chip, Badge, Pagination, AuditInfo
│   ├── layout/                     # Shell, Topbar, Sidebar
│   ├── GuardWrapper.tsx            (requiere permisoVer(modulo))
│   ├── LoginPage.tsx               (form login reusable)
│   ├── ModuloSelector.tsx          (home: tarjetas de módulos habilitados)
│   └── ProfileLoader.tsx           (carga perfil al montar la app)
├── hooks/
│   ├── usePermisos.ts              ({ puedeVer, puedeCrear, puedeEditar, puedeEliminar })
│   ├── useProfile.ts               (fetch /api/me/profile)
│   ├── useGuard.ts
│   └── useTabsPermitidos.ts
├── lib/
│   ├── api/
│   │   ├── client.ts               (apiGet/Post/Put/Patch/Delete con Bearer token)
│   │   ├── categorias.api.ts
│   │   ├── horas.api.ts
│   │   ├── obras.api.ts
│   │   └── personal.api.ts
│   ├── config/modulo-tabs.ts       (TABS_POR_MODULO — define pestañas por módulo)
│   ├── hooks/usePerfilesMap.ts     (user_id → nombre para audit)
│   ├── supabase/client.ts          (createBrowserClient)
│   └── utils/
│       ├── costos.ts               (calcular totales, costo x legajo, etc.)
│       ├── dates.ts                (semanas viernes→jueves, toISO, etc.)
│       ├── excel.ts                (exportarCSVTarja, etc.)
│       ├── liquidacion-export.ts
│       └── upload.ts               (uploadRemitoImg a Supabase Storage)
├── modules/
│   ├── admin/                      (AdminPage, AuditoriaTab)
│   ├── caja/                       (CajaPage con MovimientosTab, ResumenTab, ConfiguracionTab)
│   ├── certificaciones/            (CertificacionesPage, SolicitudesTab, StockTab,
│   │                                MaterialesTab, AdicionalesTab, RemitoEnvioPrint)
│   │   └── hooks/                  (useSolicitudes, useStock, useProveedores,
│   │                                useFacturasCompra, useRemitosEnvio, useCertificaciones)
│   ├── configuracion/              (modales de configuración de tarja)
│   ├── dashboard/                  (ResumenHistoricoPage con recharts)
│   ├── herramientas/               (HerrInventario, HerrMovimientos, HerrTrazabilidad,
│   │                                HerrRemitos, HerrParametros)
│   ├── logistica/                  (LogisticaPage + 6 tabs: Viajes/Tramos, Liquidaciones,
│   │                                Choferes, Camiones, Lugares, Facturacion)
│   │   └── hooks/useLogistica.ts   (~30 hooks en un solo archivo)
│   ├── personal/                   (PersonalPage + 4 modales:
│   │                                Nuevo/Editar/Detalle/ImportarPersonal)
│   └── tarja/                      (~20 componentes: TarjaResumenPage, TarjaObraPage,
│       │                            TarjaTable, ToolbarTarja, WeekNavigator,
│       │                            Modal*Obra, ModalAgregarTrabajador, ModalExcelObras,
│       │                            ModalRecibos, CierresSection, TarifasPanel,
│       │                            ContratistasPanel, RopaPage, HorasTrabajadorPage,
│       │                            PrestamosPage, ObrasArchivadasPage)
│       ├── hooks/                  (useObras, useAsignaciones, useCategorias, useCatObra,
│       │                            useCierres, useContratistas, useHoras, usePersonal,
│       │                            usePrestamos, useRopa, useTarifas)
│       └── store/tarja.store.ts    (semActual, navSem)
├── store/
│   ├── session.store.ts            (profile, email, canDo, isAdmin, hasModulo)
│   └── ui.store.ts                 (obraActiva, topbarAccion)
├── types/
│   └── domain.types.ts             (~710 líneas: todos los DTOs y entidades)
└── middleware.ts                   (check de sesión antes de (app)/*)
```

### Backend (`cadincsrl/src/`)

```
src/
├── index.ts                        (Hono app: logger → cors → audit mw → 25 app.route)
├── lib/supabase.ts                 (client admin + factory per-request)
├── middleware/
│   ├── auth.ts                     (JWT verify via JWKS, set user + accessToken en ctx)
│   ├── audit.ts                    (post-response: clona body, loguea a audit_log)
│   └── permission.ts               (requirePermiso + requirePermisoOr)
└── modules/
    ├── admin/                      (GET /api/admin/audit — solo admin)
    ├── asignaciones/
    ├── auth/                       (/api/me/profile, /api/me/perfiles)
    ├── caja/
    ├── cat-obra/
    ├── categorias/
    ├── certificaciones/
    ├── cierres/
    ├── contratistas/
    ├── facturas-compra/
    ├── herramientas/
    ├── horas/
    ├── logistica/                  (subcarpetas: tramos, choferes, camiones, lugares,
    │                                viajes, liquidaciones, tarifas, empresas, cobros)
    ├── obras/
    ├── personal/
    ├── proveedores/
    ├── remitos-envio/
    ├── solicitudes/                (workflow: comprar/despachar/enviar/rechazar/revertir)
    ├── stock/                      (rubros + materiales + movimientos)
    ├── tarifas/
    └── usuarios/                   (CRUD usuarios Supabase Auth — solo admin)
```

Cada módulo backend sigue patrón: `*.routes.ts` + `*.schema.ts` (zod) + `*.service.ts` (supabase).

---

## 4. Schema de Base de Datos

**68 tablas en `public`**, todas con RLS habilitado. Policies uniformes `using(true) with check(true)` — el backend autentica con JWT, la anon key no debería usarse para mutaciones.

Leyenda columnas: `int` = integer, `num` = numeric, `timestamptz` = timestamp with time zone, `bool` = boolean. Default `seq` = autoincrement `nextval()`. `✓` = nullable, `—` = not null.

### adelantos
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| chofer_id → choferes.id | int | ✓ | |
| fecha | date | — | |
| monto | num | — | |
| descripcion | text | ✓ | |
| liquidacion_id → liquidaciones.id | int | ✓ | |
| created_at, updated_at | timestamptz | ✓ | now() |
| created_by, updated_by | uuid | ✓ | |

### adicionales
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | ✓ | |
| fecha | date | — | |
| detalle | text | — | |
| monto | num | — | 0 |
| sem_key | date | ✓ | |
| created_at | timestamptz | ✓ | now() |

### asig_contrat (asignación contratistas × obra)
| col | tipo | null | default |
|---|---|---|---|
| obra_cod → obras.cod | text | — | |
| contrat_id → contratistas.id | int | — | |
| created_at, updated_at | timestamptz | ✓ | now() |
| created_by, updated_by | uuid | ✓ | |

### asignaciones (personal × obra)
| col | tipo | null | default |
|---|---|---|---|
| obra_cod → obras.cod | text | — | |
| leg → personal.leg | text | — | |
| baja_desde | date | ✓ | |
| created_at, updated_at | timestamptz | ✓ | now() |
| created_by, updated_by | uuid | ✓ | |

### audit_log
| col | tipo | null | default |
|---|---|---|---|
| id | bigint | — | seq |
| user_id | uuid | ✓ | |
| user_nombre | text | ✓ | |
| modulo | text | — | |
| accion | text | — | |
| entidad | text | — | |
| entidad_id | text | ✓ | |
| detalle | text | ✓ | |
| ip | text | ✓ | |
| created_at | timestamptz | ✓ | now() |

### caja_centros_costo
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nombre | text | — | |
| activo | bool | — | true |

### caja_conceptos
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nombre | text | — | |
| tipo | text | ✓ | 'ambos' |
| activo | bool | — | true |

### camiones
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| patente | text | — | |
| modelo, marca | text | ✓ | |
| año, anio | int | ✓ | |
| estado | text | ✓ | 'activo' |
| obs | text | ✓ | |
| created_*, updated_* | | | |

> ❓ Aclarar con Franco: hay dos columnas `año` y `anio` (aparente duplicado por encoding).

### camiones_gastos
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| camion_id → camiones.id | int | ✓ | |
| fecha | date | — | |
| tipo | text | — | |
| descripcion | text | ✓ | |
| monto | num | — | |
| proveedor | text | ✓ | |

### canteras
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nombre | text | — | |
| localidad | text | ✓ | |
| provincia | text | ✓ | 'Entre Ríos' |
| maps_url | text | ✓ | |
| obs | text | ✓ | |

### cargas (carga de viaje — no de tramos)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| viaje_id → viajes.id | int | ✓ | |
| fecha | date | — | |
| cantera_id → canteras.id | int | ✓ | |
| toneladas | num | ✓ | |
| remito_num, remito_url | text | ✓ | |
| obs | text | ✓ | |

> ❓ Aclarar con Franco: hay dos entidades paralelas — `viajes/cargas/descargas` (viejo?) y `tramos` (nuevo). Posible migración en curso.

### cat_obra (categoría por obra × legajo × fecha)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | ✓ | |
| leg → personal.leg | text | ✓ | |
| cat_id → categorias.id | int | ✓ | |
| desde | date | — | |

### categorias
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nom | text | — | |
| vh (valor hora global) | num | — | 0 |

### cert_adicionales, cert_materiales (certificaciones con adjuntos)
`cert_materiales`:
| col | tipo | null | default |
|---|---|---|---|
| id | bigint | — | seq |
| obra_cod → obras.cod | text | — | |
| fecha | date | — | |
| descripcion, proveedor | text | — / ✓ | |
| cantidad | num | — | 1 |
| unidad | text | — | 'unid' |
| precio_unit | num | — | 0 |
| total | num | ✓ | |
| adjunto_url, adjunto_nombre | text | ✓ | |
| compra_id | text | ✓ | |

`cert_adicionales` similar, sin precio_unit/cantidad.

### certificaciones (pago quincenal a contratistas)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | ✓ | |
| sem_key | date | — | |
| contrat_id → contratistas.id | int | ✓ | |
| monto | num | ✓ | 0 |
| desc | text | ✓ | '' |
| estado | text | ✓ | 'pendiente' |

### choferes
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nombre | text | — | |
| dni, tel, licencia | text | ✓ | |
| estado | text | ✓ | 'activo' |
| camion_id → camiones.id | int | ✓ | (asignación por defecto) |
| basico_dia | num | — | 0 |
| precio_km | num | — | 0 |

### choferes_basico_hist, choferes_km_hist (historial de tarifas)
Columnas: `id`, `chofer_id → choferes.id`, `valor_dia` / `valor_km`, `desde date`.

### cierres
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | ✓ | |
| sem_key | date | — | |
| estado | text | — | 'pendiente' (o 'cerrado') |
| cerrado_en | timestamptz | ✓ | |

### cobros (a empresas transportistas)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| empresa_id → empresas_transportistas.id | int | — | |
| fecha_desde, fecha_hasta | date | ✓ | |
| toneladas_totales, total | num | — | 0 |
| estado | varchar | — | 'pendiente' |

### contratistas
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nom | text | — | |
| especialidad, tel, obs | text | ✓ | '' |

### depositos
Igual que `canteras` pero para destinos (default provincia 'Neuquén').

### descargas (descarga de viaje — ver nota en `cargas`)
Similar a `cargas` pero con `deposito_id` en lugar de `cantera_id`.

### empresas (transporte genérico)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nombre, cuit, contacto, telefono, email, obs | text | | |

### empresas_transportistas (clientes a quienes se factura el flete)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nombre | varchar | — | |
| cuit, tel, email, obs | | | |
| estado | varchar | — | 'activa' |

> ❓ Aclarar con Franco: coexistencia de `empresas` y `empresas_transportistas`. ¿Son el mismo concepto? ¿Se puede consolidar?

### facturas_compra
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| proveedor_id → proveedores.id | int | — | |
| numero | text | ✓ | |
| fecha | date | — | CURRENT_DATE |
| adjunto_url, adjunto_nombre | text | ✓ | |
| total | num | ✓ | |
| obs | text | ✓ | |

### herramientas + tablas de config (`herr_tipos`, `herr_estados`, `herr_mov_tipos`, `herr_movimientos`)
`herramientas`:
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| codigo | text | — | (único) |
| nom | text | — | |
| tipo_id → herr_tipos.id | int | ✓ | |
| marca, modelo, serie | text | ✓ | |
| fecha_ingreso | date | ✓ | |
| estado_key → herr_estados.key | text | — | 'disponible' |
| obra_cod → obras.cod | text | ✓ | |
| responsable, obs | text | ✓ | |
| activo | bool | — | true |

`herr_movimientos`:
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| herramienta_id → herramientas.id | int | — | |
| tipo_key → herr_mov_tipos.key | text | — | |
| obra_origen_cod, obra_destino_cod → obras.cod | text | ✓ | |
| responsable | text | ✓ | |
| fecha | timestamptz | — | now() |

### horas
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | ✓ | |
| fecha | date | — | |
| leg → personal.leg | text | ✓ | |
| horas | num | — | 0 |

### liquidaciones, liquidacion_tramos, liquidacion_viajes
`liquidaciones`:
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| chofer_id → choferes.id | int | ✓ | |
| fecha_desde, fecha_hasta | date | — | |
| dias_trabajados | int | ✓ | 0 |
| km_totales, precio_km, basico_dia | num | ✓ | 0 |
| subtotal_km, subtotal_basico, total_adelantos, total_neto | num | ✓ | 0 |
| estado | text | ✓ | 'borrador' |

`liquidacion_tramos`, `liquidacion_viajes`: M2M entre liquidación y tramos/viajes incluidos.

### lugares, lugares_tarifa_hist (uso paralelo a canteras/depositos — ver nota)
Columnas básicas: `nombre`, `tipo`, `localidad`, `empresa_id`.

### materiales_a_cuenta_cliente (clave del workflow de solicitudes)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | — | |
| solicitud_id → solicitud_compra.id | int | — | |
| item_id → solicitud_compra_item.id | int | — | |
| descripcion | text | — | |
| cantidad, precio_unit, precio_total | num | — | |
| unidad | text | — | |
| origen | text | — | ('compra' o 'deposito') |
| proveedor_id → proveedores.id | int | ✓ | |
| factura_id → facturas_compra.id | int | ✓ | |
| fecha_resolucion | date | — | |

> Decisión clave: al resolverse cada item (comprar o despachar), se inserta acá. Sirve para facturar al cliente dueño de la obra.

### modulos (catálogo de módulos del sistema)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| key | text | — | (único: tarja, logistica, certificaciones, caja, herramientas, admin, personal?) |
| nombre | text | — | |
| descripcion, icono | text | ✓ | |
| activo | bool | — | true |
| orden | int | — | 0 |

### movimientos_caja
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| fecha | date | — | |
| centro_costo, proveedor, detalle | text | ✓ | |
| concepto | text | — | |
| tipo | text | — | ('ingreso' o 'egreso') |
| monto | num | — | |
| saldo_acum | num | ✓ | |
| es_ajuste | bool | — | false |
| creado_por | text | ✓ | |

### obras (raíz de muchísimas FKs)
| col | tipo | null | default |
|---|---|---|---|
| cod | text | — | (PK) |
| nom | text | — | |
| cc | text | ✓ | (centro de costo) |
| dir, resp, obs | text | ✓ | '' |
| archivada | bool | ✓ | false |
| fecha_archivo | date | ✓ | |
| es_deposito | bool | — | false |

### personal
| col | tipo | null | default |
|---|---|---|---|
| leg | text | — | (PK — legajo) |
| nom | text | — | |
| dni | text | ✓ | '' |
| cat_id → categorias.id | int | ✓ | |
| tel, dir, obs | text | ✓ | '' |
| talle_pantalon, talle_botines, talle_camisa | text | ✓ | |
| activo_override | bool | ✓ | (null = auto según horas recientes) |
| condicion | text | ✓ | 'blanco' / 'asegurado' / null |

### personal_cat_historial (historial de cambios de categoría)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| leg → personal.leg | text | ✓ | |
| cat_id → categorias.id | int | ✓ | |
| desde | date | — | |

### prestamos (préstamos/descuentos a trabajadores)
| col | tipo | null | default |
|---|---|---|---|
| id | bigint | — | |
| leg | text | — | |
| sem_key | text | — | |
| tipo | text | — | |
| monto | num | — | |
| concepto | text | ✓ | |

### profiles (extensión de auth.users)
| col | tipo | null | default |
|---|---|---|---|
| id | uuid | — | (FK auth.users) |
| nombre | text | — | |
| rol | text | — | 'operador' (o 'admin') |
| modulos | text[] | — | '{}' |
| activo | bool | — | true |
| permisos | jsonb | ✓ | '{}' |

> **Estructura de `permisos`** (JSONB): `{ "tarja": { "lectura": true, "creacion": true, "actualizacion": true, "eliminacion": false, "tabs": ["tarja","dashboard"] }, "logistica": {...}, ... }`

### proveedores
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| nombre | text | — | |
| cuit, tel, email, obs | text | ✓ | |
| activo | bool | — | true |

### relevos (cambio de chofer mid-viaje)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| viaje_id → viajes.id | int | ✓ | |
| chofer_sale_id, chofer_entra_id → choferes.id | int | ✓ | |
| fecha_hora | timestamptz | — | |
| lugar, obs | text | ✓ | |

### remitos, remito_items (sistema legacy de remitos generales)
### remitos_carga, remitos_descarga (paralelo a tramos — ver nota)
### remitos_envio, remitos_envio_item (remitos generados al enviar material desde depósito)

`remitos_envio`:
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| numero | text | — | |
| fecha | date | — | CURRENT_DATE |
| obra_cod → obras.cod | text | — | |
| solicitud_id → solicitud_compra.id | int | ✓ | |
| origen | text | — | 'deposito' |

### ropa_categorias, ropa_entregas
`ropa_categorias`: nombre (pantalón, botines, camisa…), icono, meses_vencimiento (default 6).
`ropa_entregas`: leg, categoria_id, fecha_entrega, obs.

### rutas
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| cantera_id → canteras.id | int | ✓ | |
| deposito_id → depositos.id | int | ✓ | |
| km_ida_vuelta | num | — | |

### solicitud_compra
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | — | |
| solicitante | uuid | ✓ | |
| fecha | date | — | CURRENT_DATE |
| estado | text | — | 'pendiente' / 'aprobada' / 'rechazada' |
| prioridad | text | — | 'normal' / 'urgente' |
| aprobado_por | uuid | ✓ | |

### solicitud_compra_item (estado por ítem, no por solicitud)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| solicitud_id → solicitud_compra.id | int | — | |
| descripcion | text | — | |
| cantidad | num | — | 1 |
| unidad | text | — | 'unid' |
| estado | text | — | 'pendiente' / 'comprado' / 'despachado' / 'enviado' / 'rechazado' |
| proveedor_id → proveedores.id | int | ✓ | |
| precio_unit | num | ✓ | |
| factura_id → facturas_compra.id | int | ✓ | |
| material_id → stock_materiales.id | int | ✓ | |
| remito_envio_id → remitos_envio.id | int | ✓ | |
| fecha_resolucion, fecha_envio | date | ✓ | |

### stock_rubros, stock_materiales, stock_movimientos
`stock_materiales`:
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| rubro_id → stock_rubros.id | int | — | |
| nombre | text | — | |
| unidad | text | — | 'unid' |
| stock_actual, stock_minimo, precio_ref | num | — | 0 |
| proveedor_id → proveedores.id | int | ✓ | |
| activo | bool | — | true |

`stock_movimientos`:
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| material_id → stock_materiales.id | int | — | |
| tipo | text | — | 'entrada' / 'salida' / 'ajuste' |
| cantidad | num | — | |
| motivo | text | — | 'compra' / 'despacho_obra' / 'devolucion' / 'ajuste_inventario' |
| obra_cod → obras.cod | text | ✓ | |
| solicitud_item_id → solicitud_compra_item.id | int | ✓ | |
| fecha | date | — | CURRENT_DATE |

### tarifas (valor hora × obra × categoría × fecha)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| obra_cod → obras.cod | text | ✓ | |
| cat_id → categorias.id | int | ✓ | |
| vh (valor hora) | num | — | |
| desde | date | — | |

### tarifas_cantera, tarifas_empresa_cantera
Tarifas de transporte: `valor_ton`, `vigente_desde`, FK a canteras y empresas_transportistas.

### tramos (viajes de camiones, modelo nuevo)
| col | tipo | null | default |
|---|---|---|---|
| id | int | — | seq |
| chofer_id → choferes.id | int | — | |
| camion_id → camiones.id | int | — | |
| tipo | text | — | 'cargado' / 'vacio' |
| cantera_id → canteras.id | int | ✓ | |
| deposito_id → depositos.id | int | ✓ | |
| fecha_carga, fecha_descarga, fecha_vacio | date | ✓ | |
| toneladas_carga, toneladas_descarga | num | ✓ | |
| remito_carga, remito_descarga | text | — | '' |
| remito_carga_img_url, remito_descarga_img_url | text | ✓ | (foto/PDF en Storage) |
| estado | text | — | 'en_curso' / 'completado' |
| empresa_id → empresas_transportistas.id | int | ✓ | |
| liquidacion_id → liquidaciones.id | int | ✓ | |
| cobro_id → cobros.id | int | ✓ | |
| fecha_operacion (generated) | date | ✓ | coalesce(fecha_carga, fecha_vacio) |
| orden_dia | bigint | ✓ | (tiebreaker manual para reorden dentro del día) |

### v_horas_detalle (view)
View de reporte: `obra_cod, obra_nom, fecha, leg, persona_nom, cat_id, cat_nom, vh_global, horas`. Configurada con `security_invoker = true` tras fix.

### viajes (modelo legacy)
Paralelo a `tramos` con sus propias `cargas` y `descargas`. ❓ Aclarar con Franco si todavía se usa.

### Storage buckets
- `cert-adjuntos` — facturas PDF, adjuntos de certificaciones.
- `remitos-logistica` — imágenes/PDFs de remito de carga y descarga. Público (URLs CDN). Policy SELECT removida; INSERT/DELETE solo a `authenticated`.

---

## 5. Rutas / Endpoints del Backend

> Todas las rutas están bajo `/api/*`. Todas pasan por `authMiddleware` (JWT Bearer) y el middleware global de `audit`. Las protegidas por módulo usan `requirePermiso(modulo, accion)` o `requirePermisoOr([...])`.

### `/api/me` — auth
- `GET /api/me/profile` → `{ id, nombre, rol, modulos, activo, permisos }`
- `GET /api/me/perfiles` → lista de `{ id, nombre }` activos

### `/api/usuarios` — solo admin
- `GET /` · `GET /modulos` · `POST /` · `PATCH /:id` · `POST /:id/reset-password` · `DELETE /:id`

### `/api/obras`
- `GET /` · `GET /archivadas` · `GET /:cod` (tarja.lectura)
- `POST /` (tarja.creacion)
- `PATCH /:cod` · `PATCH /:cod/archivar` · `PATCH /:cod/desarchivar` (tarja.actualizacion)
- `DELETE /:cod` (tarja.eliminacion)
- `POST /auto-archivar` (tarja.actualizacion) — auto-archiva obras inactivas 3+ semanas. Frontend la llama cada 6 h.

### `/api/personal`
- `GET /` · `GET /:leg` (permiso Or: personal|tarja · lectura)
- `POST /` · `PATCH /:leg` · `DELETE /:leg` (permiso Or: personal|tarja · acción)

### `/api/horas`
- `GET /all` · `GET /:obraCod` (rango desde/hasta) · `GET /trabajador/:leg` (tarja.lectura)
- `PUT /` (upsert unit) · `PUT /lote` (upsert lote) (tarja.actualizacion)
- `DELETE /:obraCod/semana` (tarja.eliminacion)

### `/api/categorias`
- `GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `DELETE /:id` (sin permiso explícito — ❓ Aclarar con Franco)

### `/api/asignaciones`
- `GET /all` · `GET /:obraCod` (tarja.lectura)
- `POST /` · `PATCH /:obraCod/:leg/baja` (tarja.actualizacion / creacion)
- `DELETE /:obraCod/:leg` (tarja.eliminacion)

### `/api/cat-obra`
- `GET /all` · `GET /:obraCod?sem_key=...` (tarja.lectura)
- `PUT /` upsert (tarja.actualizacion)

### `/api/cierres`
- `GET /all` · `GET /:obraCod` · `GET /:obraCod/:semKey` (tarja.lectura)
- `POST /` · `PATCH /:obraCod/:semKey` (tarja.creacion / actualizacion)

### `/api/tarifas`
- `GET /all` · `GET /:obraCod` · `PUT /` (upsert) · `DELETE /:id`

### `/api/contratistas`
- `GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `DELETE /:id`
- `GET /asig/:obraCod` · `POST /asig` · `DELETE /asig/:obraCod/:contratId`
- `GET /cert/all` · `GET /cert/:obraCod` · `PUT /cert` (certificaciones)

### Logística (agrupador `/api/logistica/...`)

**Tramos:** `GET /tramos` · `POST /tramos` · `PATCH /tramos/:id` · `POST /tramos/:id/descarga` · `POST /tramos/:id/mover` (dir up/down) · `DELETE /tramos/:id`

**Choferes, Camiones:** CRUD estándar.

**Lugares:** `GET/POST/PATCH/DELETE` separados por `canteras`, `depositos`, `rutas`.

**Viajes (legacy):** `POST /viajes`, `POST /viajes/carga`, `POST /viajes/descarga` + updates.

**Liquidaciones:** CRUD + `PATCH /:id/cerrar`, `PATCH /:id/reabrir`. Sub-recurso `/adelantos` con su CRUD.

**Tarifas (cantera):** `GET /tarifas/canteras`, `POST/DELETE`.

**Empresas transportistas:** CRUD + `/empresas/tarifas` (POST/DELETE).

**Cobros:** `GET /` · `POST /` · `PATCH /:id/cobrar` · `DELETE /:id`.

### `/api/solicitudes` (core workflow)
- CRUD de solicitudes
- Sub-recurso `/items/:itemId/{comprar|despachar|enviar|rechazar|revertir}` + `PATCH /items/:itemId`
- `ComprarItemSchema`: `{ proveedor_id, precio_unit, factura_id? }`
- `DespacharItemSchema`: `{ precio_unit }` (toma del stock)
- `EnviarItemSchema`: `{ fecha_envio? }`

### `/api/stock`
- `/rubros`: CRUD
- `/materiales?rubro_id=…`: CRUD
- `/movimientos?material_id=…`: GET + POST (ajustes requieren `eliminacion`)

### `/api/proveedores`, `/api/facturas-compra`, `/api/certificaciones/{materiales,adicionales}` — CRUD estándar.

### `/api/remitos-envio`
- `GET /?obra_cod=…` · `GET /:id` · `POST /` (crea remito + marca items enviados)

### `/api/caja`
- `/movimientos`: CRUD
- `/conceptos`, `/centros-costo`: GET + POST + PATCH (toggle activo)

### `/api/herramientas`
- `/config` · `/stats` · `/config/{tipos,mov-tipos}` (CRUD)
- `/` CRUD herramientas · `/:id/movimientos` · `POST /movimientos`

### `/api/admin/audit`
- `GET /?user_id=&modulo=&desde=&hasta=&limit=` (solo admin)

---

## 6. Componentes Principales de UI

### Layout (`src/components/layout/`)
| Componente | Propósito |
|---|---|
| `Shell.tsx` | Layout principal: Topbar arriba, Sidebar (260px en desktop, drawer en mobile), main scrollable |
| `Topbar.tsx` | Logo, módulo actual, nombre de obra activa, acciones del topbar (excel/csv/recibos), usuario + logout |
| `Sidebar.tsx` | Lista de módulos según `profile.modulos`, expande tabs según `TABS_POR_MODULO` + permisos |

### UI base (`src/components/ui/`)
| Componente | Descripción |
|---|---|
| `Button` | `variant: primary/secondary/ghost/danger`, `size: sm/md/lg`, `loading`, `disabled` |
| `Input` | forwardRef para react-hook-form, label/error/hint |
| `Select` | Native select con `options` |
| `Combobox` | Search/autocompletar (muy usado para elegir chofer/camión/cantera/material) |
| `Modal` | Overlay con header + children + footer; Escape y click en backdrop cierran |
| `Toast` | `useToast()` → `toast('mensaje', 'ok'\|'err'\|'warn')` |
| `Chip` | Contador destacado (colores según semántica) |
| `Badge` | Etiqueta de estado |
| `Pagination` | Paginador numérico con tamaño configurable |
| `AuditInfo` | Muestra creado por / actualizado por + fechas (usa `usePerfilesMap`) |

### Componentes de negocio más grandes
| Componente | Qué hace |
|---|---|
| `TarjaTable` | Tabla editable de horas por trabajador × día. Inputs con onBlur/Enter, auto-fill por fila, cambio de categoría inline, stack de undo |
| `WeekNavigator` | Flechas + "Hoy" + picker manual de semana. La semana = viernes→jueves |
| `ToolbarTarja` | Botones del topbar específicos de la obra: CSV, Excel multiobra, imprimir recibos |
| `CierresSection` | Acciones de cierre de semana + listado histórico |
| `TarifasPanel`, `ContratistasPanel` | Paneles editables al lado de la tabla |
| `ViajesTab` (Tramos) | CRUD visual de tramos con modal nuevo, modal registrar descarga, modal editar. Filtros por chofer/tipo/estado/fecha. Upload de remito (imagen o PDF) a Storage. Botones ▲▼ para reordenar dentro del día |
| `FacturacionTab` | Saldo corriente por empresa, modal de cobro, historial de cobros, sección "Estado de remitos" con export a Excel por empresa + rango |
| `StockTab` | Lista agrupada por rubro, stats, import/export Excel, modales de material/rubro/entrada/historial |
| `SolicitudesTab` | Workflow de items: comprar / despachar / enviar / rechazar / revertir, con subida de factura |
| `PersonalPage` | CRUD con filtro por condición, chips con conteos (blanco/asegurado/sin definir), selects inline de categoría y condición |
| `HerrInventario`, `HerrMovimientos`, `HerrTrazabilidad` | Inventario y movimiento de herramientas |
| `AuditoriaTab` | Tabla de audit logs filtrable por módulo y usuario, muestra columna "Detalle" con los cambios |

---

## 7. Flujos de Usuario Implementados

### 7.1 Login y selección de módulo
1. Usuario entra a `/`, middleware chequea sesión.
2. Si no hay sesión → `/login` (email + password Supabase).
3. Al loguearse → `ProfileLoader` hace `GET /api/me/profile` y guarda en Zustand.
4. `page.tsx` muestra `ModuloSelector` con los módulos del perfil.
5. Click en un módulo → `/tarja`, `/logistica`, etc.

### 7.2 Tarja (flujo principal diario)
1. Lista de obras activas con búsqueda. Click → `/tarja/[obraCod]`.
2. Carga horas de la semana actual. `WeekNavigator` permite saltar semanas.
3. `TarjaTable`: editás horas por celda (input numérico). `onBlur` / `Enter` llama al PATCH de horas.
4. Podés cambiar categoría por trabajador para la semana (registra en `cat_obra`).
5. Auto-fill: aplica 8hs a todos los días para una fila.
6. Lado derecho: panel de tarifas (editables) y panel de contratistas/certificaciones.
7. Al final: botón "Cerrar semana" → registra en `cierres` estado 'cerrado'.
8. Topbar: exportar CSV de esta obra-semana, Excel con varias obras, imprimir recibos.

### 7.3 Personal (alta y mantenimiento)
1. Listado con filtro por condición (chips clickeables muestran conteos).
2. Click en fila → modal detalle/edición.
3. Select inline en la tabla permite cambiar condición y categoría sin abrir modal.
4. Import: modal con upload CSV para alta masiva.

### 7.4 Logística / Tramos (carga del chofer)
1. Nuevo tramo: chofer + camion (auto-selección si chofer tiene camión por defecto) + tipo (cargado/vacío).
2. Si cargado: cantera + depósito + fecha de carga + toneladas + número de remito + **foto del remito** (imagen/PDF, sube al bucket y guarda URL).
3. Tramo queda `en_curso` hasta que se registra la descarga (modal separado: fecha_descarga + toneladas_descarga + remito_descarga + foto).
4. Estado pasa a `completado` al registrar descarga.
5. Botones ▲▼ en la tarjeta permiten reordenar entre tramos del mismo día.
6. Filtros: chofer, tipo, estado, rango de fechas.

### 7.5 Logística / Liquidaciones y Facturación
- **Liquidaciones**: seleccionar chofer + rango → calcula `dias × basico_dia + sum(km × precio_km) − adelantos`. Estado borrador → cerrada.
- **Facturación a empresas**: pestaña "Estado de remitos" con filtro por empresa + desde/hasta (fecha de descarga). Botón exportar Excel con columnas: fecha descarga, empresa, chofer, patente, cantera, tn carga, tn descarga, remito carga, remito descarga, $/tn, subtotal + total.

### 7.6 Solicitudes de compra (workflow a nivel item)
1. Obra pide X (ej. 50 bolsas cemento) → crea `solicitud_compra` con items.
2. Admin aprueba / rechaza la solicitud (estado de la cabecera).
3. Por cada item (no por solicitud), tres caminos:
   - **Comprar externamente**: elige proveedor + precio_unit + adjunta factura → estado item `comprado` → al "enviarse" genera remito → `enviado`.
   - **Despachar de depósito**: toma stock interno, descuenta `stock_movimientos`, registra `precio_unit` → `despachado` → `enviado`.
   - **Rechazar** o **Revertir** a pendiente.
4. En cada resolución (comprar o despachar) se inserta fila en `materiales_a_cuenta_cliente` para facturación al cliente.
5. Botón para generar remito de envío multi-item con print-friendly view.

### 7.7 Stock
1. Listado agrupado por rubro con stock actual / mínimo / precio ref.
2. Por material: entrada/salida/ajuste.
3. Filtros: rubro, stock bajo, sin stock.
4. Export Excel (matriz actual) + import Excel (actualizar cantidades por match `(rubro, nombre)` normalizado).

### 7.8 Herramientas
1. Crear herramienta con código (único), tipo, marca/modelo/serie, estado (disponible, en uso, etc.), obra asignada.
2. Movimiento: tipo (entrega, devolución, mantenimiento), origen/destino, responsable, fecha.
3. Trazabilidad: historial de movimientos por herramienta.

### 7.9 Caja
1. Movimientos: fecha, concepto (desde catálogo), centro de costo, monto, tipo (ingreso/egreso).
2. Resumen por período con totales.
3. Configuración de conceptos y centros (activos/inactivos).

### 7.10 Admin / Auditoría
1. Users CRUD (con `POST /api/usuarios/:id/reset-password`).
2. Asignación de permisos granulares: `{ modulo: { lectura, creacion, actualizacion, eliminacion, tabs[] } }`.
3. Auditoría: tabla con columnas Fecha / Usuario / Módulo / Acción / Entidad / ID / **Detalle** (text con los campos cambiados, ej. `condicion=asegurado · cat_id=7`).

---

## 8. Decisiones de Diseño Importantes

### 8.1 Tracking a nivel line-item
El workflow de solicitudes trackea estado **por cada ítem**, no por solicitud. Una misma solicitud puede tener un item comprado, otro despachado y otro pendiente. La tabla `solicitud_compra_item.estado` es la fuente de verdad.

### 8.2 Dos caminos para resolver un item
- **Compra externa** (`origen='compra'`): requiere `proveedor_id` + `precio_unit` + opcional `factura_id`. Escala a facturas y pagos a proveedores.
- **Despacho de depósito** (`origen='deposito'`): descuenta `stock_movimientos` (`motivo='despacho_obra'`). El frontend pide `precio_unit` explícito por si difiere del `precio_ref` del material.

Ambos caminos insertan en `materiales_a_cuenta_cliente` para facturar al cliente de la obra.

### 8.3 Sistema de permisos
- **Dos roles**: `admin` (bypass) y `operador`.
- **Cuatro acciones**: `lectura`, `creacion`, `actualizacion`, `eliminacion`.
- **Granularidad por módulo**: `permisos.modulo.accion: bool` en `profiles.permisos` (JSONB).
- **Tabs filtrables**: `permisos.modulo.tabs[]` controla qué pestañas del módulo ve el usuario.
- **Backend valida siempre**: `requirePermiso(modulo, accion)` middleware en cada ruta mutativa.
- **Frontend refleja UI**: `usePermisos('modulo')` → `{ puedeVer, puedeCrear, puedeEditar, puedeEliminar }` se usa para deshabilitar botones/selects.

Particularidad resuelta: `personal` no es módulo asignable, es tab de `tarja`. Por eso los endpoints de `/api/personal` aceptan permiso de `tarja` **o** de `personal` (`requirePermisoOr`).

### 8.4 Semana viernes → jueves
Cadinc cierra sus semanas laborales el jueves. Todos los `sem_key` son el ISO del viernes de esa semana. Helpers en `src/lib/utils/dates.ts`:
- `getViernes(date)` — ajusta cualquier fecha al viernes anterior
- `getSemDays(viernes)` — devuelve array de 7 fechas
- `toISO(date)` — `YYYY-MM-DD`

### 8.5 Auditoría automática
- Middleware `audit` corre **después** de la respuesta.
- Solo loguea POST/PATCH/PUT/DELETE con status 2xx.
- Extrae entidad y acción desde la ruta (con mapping explícito para verbos: `comprar`, `despachar`, `enviar`, `archivar`, `desarchivar`, `mover`).
- Clona el Request body y lo resume en texto plano (`campo=valor · campo=valor`), omitiendo claves sensibles y strings largos (URLs). Máximo 500 chars.

### 8.6 Storage y URLs públicas
- Bucket `remitos-logistica` es **público**: las URLs de `getPublicUrl` van por CDN sin RLS.
- Policies: `INSERT` y `DELETE` restringidas a `authenticated`. `SELECT` no es necesaria (no se usa `list()` desde el cliente) y fue removida por el advisor.

### 8.7 Auto-archivo de obras
`useObras()` en el frontend dispara `POST /api/obras/auto-archivar` una vez cada 6 h por navegador (localStorage). El backend archiva obras sin horas cargadas en las últimas 3 semanas.

### 8.8 Patrones de código
- **Feature-based**: `src/modules/<feature>/{components,hooks,store}`. Sin carpeta `services/` porque los hooks (React Query) ya encapsulan la lógica de acceso a API.
- **API client centralizado**: `src/lib/api/client.ts` con `apiGet/Post/Put/Patch/Delete` que inyecta `Authorization: Bearer <token>` en cada fetch.
- **React Query**: `staleTime` generalmente 60s, `queryKey` como constantes (ej. `OBRAS_KEY = ['obras']`). `onSuccess` invalida queries dependientes.
- **Formularios**: `react-hook-form` + `zod` con `zodResolver`. En varios lugares todavía hay `useForm<any>()`, foco de migración futura.
- **Zustand** para estado global: `session.store` (perfil/email) y `ui.store` (obra activa, callbacks del topbar) + `modules/tarja/store/tarja.store.ts` (semActual).

### 8.9 Backend patrón modular
Cada módulo del backend es un `Hono()` montado con `app.route('/api/<path>', mod)`. Middlewares encadenados en orden: logger → cors → **auditMiddleware** → rutas. Cada módulo aplica `authMiddleware` al empezar y `requirePermiso[Or]` por endpoint.

Instanciación de Supabase:
- `supabase` (service role) — solo en tareas que no necesitan pasar RLS (config interna).
- `createSupabaseClient(accessToken)` — por request, con el JWT del usuario. Respetaría RLS si las policies fueran estrictas.

### 8.10 RLS "permisiva por diseño"
Todas las 68 tablas tienen RLS habilitado, pero con policies `using(true) with check(true)`. El advisor marca esto como WARN x68, pero es un patrón consciente: la anon key no se usa para mutar datos, siempre va por backend con JWT. Mover a policies estrictas (ej. `to authenticated`) requeriría auditar que ningún cliente pega con la anon key (actualmente: storage frontend directo sí usa el cliente browser, y lo hace logueado, así que el cambio sería viable con planificación).

---

## 9. TODOs y Comentarios Relevantes

El proyecto tiene **muy pocos** TODOs/FIXME explícitos (el estilo es código autoexplicativo). Lo relevante encontrado:

- `src/modules/tarja/components/RopaPage.tsx:383` — comentario sobre filtro "solo vencidos": necesita entregas de TODOS los trabajadores, no solo los activos.
- `src/modules/certificaciones/components/SolicitudesTab.tsx:58-67` — helper `uploadAdjunto(file)` usa bucket `cert-adjuntos` con path aleatorio; no borra archivos huérfanos si se cancela.

**Warnings pre-existentes de ESLint**:
- Muchos `useForm<any>` / `as any` quedan en módulos grandes (ViajesTab, PersonalPage) — migración gradual pendiente.
- `react-hook-form`'s `watch()` es incompatible con React Compiler → warnings de memoización. No bloquea compilación.

**Advisories de Supabase (no bloqueantes)**:
- `rls_policy_always_true` × 68 — decisión de diseño (ver 8.10).
- `auth_leaked_password_protection` — feature opcional a activar en panel de Auth.

---

## 10. Archivos .md de Documentación Existentes

### `AGENTS.md`
> "This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."

### `CLAUDE.md`
Incluye `@AGENTS.md` (es un wrapper).

### `README.md`
Boilerplate de `create-next-app` sin info del proyecto (último commit: "# test").

### `.claude/agents/frontend-specialist.md`
Subagente `frontend-specialist` con contexto del app de solicitudes de compra (tools: Read, Write, Edit, Glob, Grep, Bash).

**Ausentes** (recomendado agregar): `CONTRIBUTING.md`, `ARCHITECTURE.md`, `DEPLOY.md`, changelog.

---

## Preguntas pendientes para Franco (marcado ❓ a lo largo del doc)

1. **Coexistencia de modelos paralelos**:
   - `empresas` vs `empresas_transportistas` → ¿se puede consolidar?
   - `viajes/cargas/descargas` vs `tramos` → ¿`viajes` ya es legacy? ¿Hay datos vivos?
   - `remitos/remito_items` vs `remitos_envio/remitos_envio_item` vs `remitos_carga/remitos_descarga` → múltiples sistemas de remitos.
2. **Columnas duplicadas**: `camiones.año` y `camiones.anio`.
3. **Hosting**: ¿Vercel + Render? ¿Ambos producción? ¿Hay staging? `cadinc.com.ar` en Hostinger aún no conectado.
4. **Categorías sin permiso**: `/api/categorias` no valida permiso. ¿Intencional o falta `requirePermiso`?
5. **Login herramientas separado**: `/herramientas/login` — ¿Por qué paralelo a `/login`?
6. **Módulo "personal" en permisos**: no está en `TABS_POR_MODULO` pero algunos endpoints lo referencian. Se resolvió con `requirePermisoOr(personal|tarja)`, ¿es el patrón permanente?

---

_Documento generado con colección automatizada: exploración de código (agentes), MCP de Supabase (`list_tables`, `execute_sql` para columnas y FKs), y lectura de `package.json` / archivos `.md`._
