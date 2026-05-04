# CONTEXT_DUMP.md — ERP CADINC SRL

> Estado exhaustivo del proyecto al **2026-05-04**.
> Para resumen operativo leer `CLAUDE.md` (frontend o backend).
> Esto es la referencia detallada para agentes / nuevos colaboradores.

---

## 1. Repos

| Repo | Rol | Path local |
|---|---|---|
| `frontend_cadinc_gestion` | UI Next.js 16 + React 19 | `/Users/francoleiro/frontend_cadinc_gestion` |
| `cadincsrl` | API Hono + Supabase | `/Users/francoleiro/cadincsrl` |

Los dos comparten la misma DB Supabase (`xclobkgmaxioifpkukul`) y se comunican vía HTTP con JWT.

---

## 2. Stack completo

### Frontend
- **Next.js 16.2.1** (App Router) — versión reciente, breaking changes vs entrenamientos LLM.
- **React 19.2.4** — hooks/conventions nuevas.
- **TypeScript 5.x**.
- **Tailwind CSS 3** — con tokens custom (`naranja`, `azul`, `verde`, `rojo-light`, `gris`, etc.).
- **React Query 5** — `staleTime` default 60s, queryKey como constantes.
- **Zustand 5** — stores: `session.store`, `ui.store`, `tarja.store`.
- **React Hook Form + Zod 4** — `zodResolver`.
- **`@supabase/ssr` + `@supabase/supabase-js`** — cliente con anon key (lecturas) + Bearer JWT (mutaciones via backend).
- **`xlsx`** — generación Excel para horas/recibos.
- **`jszip`** — paquete onboarding ZIP.
- **`tsx`** (dev script).

### Backend
- **Hono 4.12** — web framework.
- **`@hono/zod-validator` + Zod 4** — validación.
- **`jose` 6** — JWT verification vía JWKS de Supabase.
- **`@supabase/supabase-js` 2.78** — service role + factory per-request.
- **`@hono/node-server`** — runtime.
- **TypeScript + tsx (dev)** + **Vitest** (tests).

### Base de datos
- **Supabase PostgreSQL 17.6** — ref `xclobkgmaxioifpkukul`.
- **77 tablas + 7 vistas + ~25 funciones SQL** (ver §6).
- **9 buckets de Storage** (8 privados, 1 público).
- **RLS habilitado en todas las tablas** pero con policies `using(true) with check(true)` — la seguridad real está en el backend.

---

## 3. Estructura del frontend

```
src/
├── app/                       # App Router
│   ├── login/, reset-password/, dashboard/
│   ├── tarja/, tarja/[obraCod]/, tarja/archivadas/, tarja/costos/, tarja/prestamos/, tarja/ropa/
│   ├── personal/
│   ├── horas-trabajador/
│   ├── logistica/             # tabs vía ?tab=
│   ├── certificaciones/       # tabs vía ?tab=
│   ├── caja/
│   ├── herramientas/, herramientas/inventario/, .../movimientos/, .../trazabilidad/, .../remitos/, .../parametros/, .../login/
│   ├── admin/, configuracion/
│   └── globals.css            # tailwind base + .no-spinner utility
├── components/
│   ├── layout/                # Sidebar, Topbar, NotificationsBell
│   └── ui/                    # Button, Input, Select, Combobox, Modal, Toast, Chip, Badge, Pagination, AuditInfo
├── hooks/
│   ├── usePermisos.ts         # { puedeVer, puedeCrear, puedeEditar, puedeEliminar }
│   ├── useTabsPermitidos.ts
│   └── useNotificaciones.ts   # cumpleaños + vencimientos vehículos + vencimientos choferes
├── lib/
│   ├── api/client.ts          # apiGet/Post/Put/Patch/Delete con Bearer
│   ├── config/modulo-tabs.ts  # registro de tabs por módulo (para sidebar + permisos)
│   ├── hooks/usePerfilesMap.ts
│   ├── supabase/              # cliente browser + server-side
│   └── utils/
│       ├── dates.ts           # getViernes, getSemDays, toISO, getViernesCobro
│       ├── costos.ts          # calcularTotalesSemana, costoLeg, costoLegConCatObra, getCatIdEfectivo
│       ├── excel.ts           # exportar Excel + generarRecibos (HTML print)
│       ├── liquidacion-export.ts
│       ├── rentabilidad.ts    # calcularRentabilidad (puerto del Excel YTL)
│       ├── upload.ts          # uploadRemitoImg
│       └── export-onboarding.ts # JSZip de docs de chofer/camión/batea
├── modules/
│   ├── tarja/                 # tarja, personal asignado, horas, hs-extras, cierres, prestamos, ropa, recibos
│   ├── personal/              # CRUD personal + documentos + ModalDetalle/Editar
│   ├── logistica/             # 8 sub-tabs (ver §3.1)
│   ├── certificaciones/       # solicitudes, stock interno, stock proveedor, materiales
│   ├── caja/                  # movimientos, centros de costo, conceptos, saldos
│   ├── herramientas/          # inventario, movimientos, trazabilidad, remitos, parámetros
│   ├── admin/                 # usuarios, permisos, auditoría
│   └── dashboard/             # ResumenHistoricoPage
├── store/
│   ├── session.store.ts       # profile + permisos
│   └── ui.store.ts            # obraActiva, topbarAccion (callback)
├── types/
│   └── domain.types.ts        # Personal, Chofer, Camion, Batea, Tramo, Hora, etc.
└── scripts/
    └── validate-rentabilidad.ts # tsx — valida fórmula contra Excel original
```

### 3.1 Sub-tabs por módulo

**Logística (`/logistica?tab=...`)**:
- `viajes` — Tramos (cargados/vacíos), filtro por chofer/tipo/estado/fechas, alertas de auto-vacío.
- `liquidaciones` — Saldo por chofer + creación de liquidaciones, adelantos con comprobante.
- `facturacion` — Empresas transportistas + tarifas + cobros + remitos.
- `choferes` — CRUD choferes con `cuil` + `camion_id` + `batea_id` + documentos. Modal arranca en modo detalle.
- `camiones` — Wrapper con sub-tabs internos: Camiones / Bateas. Documentos por vehículo.
- `lugares` — Canteras y depósitos.
- `gastos` — Gastos de flota (combustible, peajes, viáticos). Sub-tabs: Listado / Reportes / Consumo.
- `rentabilidad` — Simulador de margen por viaje (port del Excel YTL).

**Certificaciones (`/certificaciones?tab=...`)**:
- `solicitudes` — Pedidos de compra con workflow line-item.
- `stock` — Stock en depósito interno por rubro.
- `stock-proveedor` — Materiales comprados que quedan en el galpón del proveedor.
- `materiales` — Materiales facturables a cuenta del cliente.

**Tarja**: `dashboard`, `tarja`, `costos`, `personal`, `prestamos`, `ropa`. Pages dedicadas: `/tarja/[obraCod]`, `/horas-trabajador`.

**Caja**: `movimientos`, `resumen`, `configuracion`.

**Herramientas**: `inventario`, `movimientos`, `trazabilidad`, `remitos`, `parametros`.

---

## 4. Estructura del backend

```
src/
├── index.ts                   # entry point — Hono app, mounts /api/<modulo>
├── lib/
│   ├── supabase.ts            # supabaseAdmin (service role) + createSupabaseClient(token)
│   └── utils/dates.ts         # helpers semana viernes→jueves
├── middleware/
│   ├── auth.ts                # authMiddleware (verifica JWT vía JWKS, inyecta user)
│   ├── permission.ts          # requirePermiso(modulo, accion), requirePermisoOr([...])
│   └── audit.ts               # auditMiddleware (post-respuesta, status 2xx, métodos mutativos)
└── modules/
    ├── admin/                 # usuarios CRUD + auditoría
    ├── auth/                  # login passthrough + reset password
    ├── caja/                  # movimientos, centros, conceptos, saldos
    ├── cat-obra/              # overrides de categoría por (obra, leg)
    ├── categorias/            # catálogo + tarifas globales
    ├── certificaciones/
    ├── cierres/               # cierre semanal de tarja por obra
    ├── contratistas/
    ├── facturas-compra/
    ├── herramientas/
    ├── horas/                 # carga de horas (incluye /lote)
    ├── hs-extras/             # horas extras semanales
    ├── logistica/
    │   ├── bateas/            # CRUD + vehiculo-docs.routes (compartido con camiones)
    │   ├── camiones/
    │   ├── choferes/          # CRUD + chofer-docs subroute
    │   ├── cobros/            # con adjuntos (líquido producto, comprobante)
    │   ├── empresas/          # transportistas
    │   ├── gastos/            # CRUD + cargas_combustible asociadas
    │   ├── liquidaciones/     # liquidación + adelantos con comprobante
    │   ├── lugares/           # canteras + depósitos
    │   ├── notificaciones/    # endpoint para campana del topbar
    │   ├── rentabilidad/      # parámetros + viajes
    │   ├── tarifas/           # por (cantera, depósito, empresa)
    │   ├── tramos/            # CRUD + remitos imágenes
    │   └── viajes/            # legacy modelo paralelo (deuda)
    ├── obras/                 # CRUD + auto-archivar via RPC
    ├── personal/              # CRUD + personal-docs subroute
    ├── proveedores/
    ├── remitos-envio/         # de solicitudes de compra
    ├── solicitudes/           # solicitud_compra + items + acciones (comprar/despachar/...)
    ├── stock/                 # inventario depósito interno
    ├── stock-proveedor/       # materiales pendientes de retiro
    └── tarifas/               # historial de valores hora por (obra, cat)
```

---

## 5. Reglas de negocio críticas

Ver `CLAUDE.md` del frontend §5 para el detalle. Resumen:

1. **Tracking line-item** en certificaciones (estados `pendiente`, `comprado`, `de_deposito`, `en_proveedor`, `retirado`, `enviado`, `rechazado`).
2. **Resolución transaccional vía RPCs** detrás del flag `USE_RPC_RESOLVER`.
3. **Semana viernes → jueves** — `sem_key` siempre es ISO del viernes.
4. **RLS permisiva por diseño** — seguridad en backend Hono.
5. **Permisos granulares** — `permisos.modulo.{lectura, creacion, actualizacion, eliminacion, tabs[], <flag_extra>}` en `profiles`.
6. **Auditoría automática** — `auditMiddleware` post-respuesta. NO escribir audit manual en handlers.
7. **Auto-archivo de obras** — vía RPC `obras_a_auto_archivar` (no más `.limit()` directo).
8. **Stock en proveedor** — material comprado que queda en el galpón del proveedor hasta el retiro (RR-NNNN remito).
9. **Notificaciones (campana)** — cumpleaños + vencimientos de papeles (vehículos y choferes), in-memory.
10. **Conflicto de tarja por día** — celdas en rojo con tooltip cuando un operario tiene horas en >1 obra el mismo día.
11. **Cálculo canónico** — `costoLegConCatObra` respeta cat_obra + redondeo per-leg al miles. Lo usan TarjaObraPage chip, footer TarjaTable, CierresSection y ResumenHistoricoPage.

---

## 6. Schema completo de DB

### Tablas (77)

#### Tarja / Personal
| Tabla | Comentario |
|---|---|
| `personal` | Trabajadores. `leg`, `nom`, `dni`, `cat_id`, `tel`, `dir`, `obs`, `talle_*`, `activo_override`, **`fecha_nacimiento`** |
| `personal_cat_historial` | Historial de cambios de categoría (incluye `desde` para vigencia). |
| `personal_documentos` | DNI, alta temprana, baja, telegrama, etc. con `vence_el`. Bucket `personal-docs`. |
| `categorias` | Catálogo global. `nom`, `vh` (precio/hora). |
| `cat_obra` | Override de categoría por (obra, leg, desde). |
| `tarifas` | Tarifas por (obra, cat_id, desde). Vigentes con MAX(desde) ≤ fecha_ref. |
| `obras` | Obras activas. `cod` (PK), `nom`, `dir`, `archivada`, **`es_deposito`** (boolean — si true, no facturable). |
| `asignaciones` | Asignación abierta de personal a obra (con `baja_desde` opcional para cerrar). |
| `asig_contrat` | Asignación de contratistas a obras. |
| `contratistas` | Contratistas externos (subcontratistas). |
| `horas` | Carga semanal: `obra_cod, leg, fecha, horas`. |
| `tarja_hs_extras` | Hs extras por (obra, leg, sem_key). |
| `cierres` | Cierre semanal por obra: `obra_cod, sem_key, estado` (`pendiente`/`cerrado`). |
| `prestamos` | Adelantos a operarios con `tipo` (`otorgado`/`descuento`) y `sem_key`. |
| `ropa_categorias` + `ropa_entregas` | Entregas de ropa de trabajo con vencimiento. |
| `relevos` | (legacy) reemplazos. |

#### Logística
| Tabla | Comentario |
|---|---|
| `choferes` | `nombre`, `cuil` (no DNI), `tel`, `licencia`, `estado`, `camion_id`, **`batea_id`**, `basico_dia`, `precio_km`, `obs`. |
| `choferes_basico_hist` + `choferes_km_hist` | Historial de cambios de tarifas. |
| `chofer_documentos` | Bucket `chofer-docs`. Tipos: dni, licencia_conducir, libreta_sanitaria, cnrt, aptitud_psicofisica, art, mopp, etc. |
| `camiones` | `patente`, `modelo`, `año`/`anio` (deuda — ambas), `estado`. |
| `camion_documentos` | Bucket `vehiculo-docs`. Tipos: titulo, tarjeta_verde, rto, poliza_seguro. |
| `bateas` | `patente`, `tipo`, `marca`, `modelo`, `anio`, `capacidad_m3`, `capacidad_tn`, `titular`, `estado`, `obs`. |
| `batea_documentos` | Bucket `vehiculo-docs`. Mismos tipos que camión. |
| `tramos` | Viaje cargado o vacío. `tipo` (`cargado`/`vacio`), `chofer_id`, `camion_id`, `empresa_id`, `cantera_id`, `deposito_id`, `fecha_carga`, `toneladas_carga`, `remito_carga`, `remito_carga_img_url`, similar para descarga. **`empresa_id` obligatorio en cargado**. |
| `viajes`, `cargas`, `descargas` | (deuda — modelo paralelo legacy, no usar). |
| `rutas` | Combinación (cantera, deposito) → `km_ida_vuelta`. |
| `lugares` | Canteras + depósitos en una sola tabla con `tipo`. |
| `lugares_tarifa_hist` | Historial de tarifas por lugar. |
| `canteras`, `depositos` | (vista o tablas separadas para back-compat). |
| `empresas`, `empresas_transportistas` | Cliente final / transportista. (deuda — modelos paralelos). |
| `tarifas_cantera`, `tarifas_empresa_cantera` | Valor de transporte por toneladas según ruta + empresa. |
| `liquidaciones` | Liquidación a chofer. `chofer_id`, `desde`, `hasta`, `subtotal_basico`, `subtotal_km`, `total_adelantos`, `total_neto`, `estado` (`borrador`/`cerrada`). |
| `adelantos` | `chofer_id`, `fecha`, `monto`, `descripcion`, `liquidacion_id` (NULL si pendiente), **`comprobante_url`** + **`comprobante_hash`**. |
| `gastos_logistica` | Gastos de flota. `categoria_id`, `chofer_id`, `camion_id`, `tramo_id`, `monto`, `pagado_por`, `metodo_pago`, `estado` (pendiente/aprobado/pagado/rechazado), `liquidacion_id`, `comprobante_url`, `comprobante_hash`, `comprobante_nro`, soft-delete. |
| `gastos_categorias` | Catálogo (combustible, peajes, viáticos, etc.). |
| `cargas_combustible` | Detalle vinculado a un gasto: `litros`, `odometro_km`, `tipo_combustible`, `tanque_lleno`, `warnings` (jsonb), etc. |
| `cobros` + `cobros_adjuntos` | Cobros a empresas transportistas con adjuntos. |
| `remitos_carga`, `remitos_descarga` | (legacy) — hoy se usa `tramos.remito_*_img_url`. |
| `remitos`, `remito_items` | (legacy). |
| `rentabilidad_parametros` | Versionada con `vigente_desde/vigente_hasta`. UNIQUE parcial sobre vigente_hasta IS NULL. |
| `rentabilidad_viajes` | Lista ilimitada de viajes simulados. `nombre`, `km_ida`, `km_vuelta`, `toneladas`, `tarifa_neta_por_ton`, `precio_gasoil`, `consumo_camion`, `peajes_total`, `chofer_por_km`, `chofer_por_dia`, `modalidad_pago` (`km_jornal`/`pct_jornal`), `pct_sobre_tarifa`. |

#### Certificaciones / Stock
| Tabla | Comentario |
|---|---|
| `solicitud_compra` | Cabecera. `obra_cod`, `solicitante`, `fecha`, `estado` (`pendiente`/`aprobada`/`rechazada`), `prioridad`. |
| `solicitud_compra_item` | Detalle. `descripcion`, `cantidad`, `unidad`, `material_id`, `proveedor_id`, `precio_unit`, `factura_id`, `fecha_resolucion`, `estado` (7 valores). |
| `materiales_a_cuenta_cliente` | Facturable al cliente. UNIQUE (item_id). `origen` ∈ {'proveedor', 'deposito'}. |
| `cert_materiales` | Materiales certificados al cliente. |
| `cert_adicionales` + `adicionales` | Adicionales fuera de solicitud. |
| `certificaciones` | Certificaciones de contratistas (hilo paralelo de costos). |
| `proveedores` | `nombre`, `cuit`, `tel`, `email`. |
| `facturas_compra` | Compras realizadas. Adjunto en bucket `cert-adjuntos`. |
| `stock_rubros` | Catálogo de rubros (cemento, ladrillos, etc.). |
| `stock_materiales` | Catálogo + `stock_actual` (calculado), `stock_minimo`, `precio_ref`, `proveedor_id`. |
| `stock_movimientos` | Auditoría. `tipo` (entrada/salida/ajuste), `motivo` (compra/despacho_obra/devolucion/ajuste_inventario). |
| `stock_proveedor_movimientos` | Movimientos de stock virtual en proveedores (entrada al comprar `en_proveedor`, salida al retirar). |
| `remitos_envio` + `remitos_envio_item` | Remito de envío de materiales certificados (numerado RM-NNNN). |
| `remitos_retiro_proveedor` + `remitos_retiro_proveedor_item` | Remito de retiro de proveedor (numerado RR-NNNN). Comprobante en `remitos-retiro-proveedor` bucket. |

#### Caja / Herramientas / Admin
| Tabla | Comentario |
|---|---|
| `movimientos_caja` | Movimientos de caja con saldo. |
| `caja_centros_costo`, `caja_conceptos` | Catálogos. |
| `herramientas` | Inventario. |
| `herr_tipos`, `herr_estados`, `herr_mov_tipos` | Catálogos. |
| `herr_movimientos` | Movimientos entre obras. |
| `profiles` | Usuarios. `id` (FK auth.users), `nombre`, `rol` (`admin`/`operador`), `modulos[]`, `permisos` (jsonb). |
| `modulos` | Catálogo de módulos del sistema. |
| `audit_log` | Logs de auditoría automática. |

### Vistas (7)

| Vista | Uso |
|---|---|
| `v_horas_detalle` | Horas + obra + categoría + tarifa pre-joinadas. |
| `v_cargas_combustible` | Cargas con info de gasto, camión, chofer. |
| `v_consumo_camion_odometro` | Consumo km/L por camión calculado a partir de odometros. |
| `v_consumo_chofer_mes` | Consumo agregado por chofer/mes. |
| `v_stock_proveedor` | Cantidad pendiente por item en stock proveedor. |
| `v_vehiculo_documentos_vencimientos` | Docs de camion+batea con vence_el (más reciente por entidad+tipo). |
| `v_chofer_documentos_vencimientos` | Docs de choferes con vence_el. |

### Funciones SQL (RPCs custom)

| Función | Propósito |
|---|---|
| `_require_permiso_or_admin(p_user_id, p_modulo, p_accion)` | Helper interno de RPCs SECURITY DEFINER para validar permisos. |
| `obras_a_auto_archivar(p_dias_atras)` | Lista obras candidatas a auto-archivar (sin actividad en N días). |
| `resolver_item_compra(p_item_id, ...)` | Marca item como `comprado` + actualiza stock + MCC, transaccional. |
| `resolver_item_despacho(p_item_id, ..., p_forzar_sin_stock)` | Marca como `de_deposito`, descuenta stock, MCC. |
| `resolver_item_en_proveedor(p_item_id, ...)` | Marca como `en_proveedor`, NO inserta MCC. Solo entrada en stock_proveedor_movimientos. |
| `retirar_de_proveedor(p_proveedor_id, p_obra_cod, p_fecha, p_comprobante_*, p_items, p_user_id)` | Crea remito de retiro + descuenta stock + UPSERT en MCC. |
| `mover_tramo_orden(...)` | Reordena tramos del mismo día. |
| `create_liquidacion_con_reintegros(...)` | Liquidación atómica con tramos+adelantos+gastos. |
| `reabrir_liquidacion(p_liquidacion_id, p_user_id)` | Desliga children y vuelve a `borrador`. |
| `eliminar_liquidacion(p_liquidacion_id, p_user_id)` | Desliga children + delete. |
| `eliminar_solicitud(p_solicitud_id, p_user_id)` | Delete con validación de estado. |
| `sp_crear_gasto_con_carga(...)` | Crea gasto + carga_combustible vinculada en una transacción. |
| `sp_recalcular_saldos_caja()` | Recalcula saldos acumulados de caja. |
| `cargas_combustible_valida_categoria()` | Trigger: solo crear carga_combustible si la categoría aplica. |
| `gastos_logistica_protege_categoria_con_carga()` | Trigger: bloquea cambio de categoría si el gasto tiene carga_combustible. |
| `gastos_logistica_soft_delete_cascade()` | Trigger: cascadea soft-delete a cargas. |
| `handle_new_user()` | Trigger sobre auth.users → crea profile. |
| `set_audit_fields()` | Trigger: completa created_by/updated_by. |
| `set_updated_at()` / `update_updated_at()` | Triggers: actualiza updated_at en cada UPDATE. |
| `_*_touch_updated_at()` | Versiones por tabla del trigger. |

### Buckets de Storage

| Bucket | Público | Uso |
|---|---|---|
| `cert-adjuntos` | No | Facturas de compra, certificaciones (legacy: público). |
| `remitos-logistica` | **Sí** | Imágenes de remitos de tramos (carga/descarga). |
| `vehiculo-docs` | No | Tarjeta verde, RTO, póliza, título de camiones+bateas. Signed URLs 15min. |
| `personal-docs` | No | Docs del personal (DNI, alta, baja, telegrama). |
| `chofer-docs` | No | Docs de choferes (DNI, licencia, libreta sanitaria, etc.). |
| `gastos-logistica` | No | Comprobantes de gastos. SHA-256 dedup. |
| `adelantos-logistica` | No | Comprobantes de adelantos. SHA-256 dedup. |
| `remitos-retiro-proveedor` | No | Comprobantes de retiros de stock en proveedor. |
| `cobros-docs` | No | Adjuntos de cobros (líquido producto, comprobante de pago). |

---

## 7. Patrones recurrentes

### 7.1 Comprobante en bucket privado (signed URLs)
Patrón consolidado para cualquier feature que necesite adjuntar un archivo:
1. **Frontend**: `POST /api/<modulo>/upload-comprobante` con `{filename, content_type, size_bytes}`. Backend devuelve `{path, signedUrl, token, expiresIn}`.
2. **Frontend**: `PUT signedUrl` con el archivo (no pasa por nuestro backend).
3. **Frontend**: `POST /api/<modulo>/<entity>` con `{...campos, comprobante_path}`.
4. **Backend**: descarga el archivo, calcula SHA-256, valida UNIQUE constraint, persiste `comprobante_url` + `comprobante_hash`.
5. Para descargar: `GET /api/<modulo>/<entity>/:id/comprobante-url` → signed URL TTL 15min.

Ejemplos: gastos, adelantos, retiros de proveedor, cobros.

### 7.2 Modal "detalle vs edición"
- Click en fila abre modal en **modo detalle** (read-only).
- Botón "✏️ Editar" en footer cambia a modo edición.
- Cancelar dentro de edición → vuelve a detalle, descarta cambios.
- Guardar → vuelve a detalle con datos actualizados.
- Implementado en `ChoferesTab` (es el patrón de referencia).

### 7.3 Cards mobile + tabla desktop
- `<div className="hidden md:block"><table>...</table></div>` para desktop.
- `<div className="md:hidden flex flex-col gap-2">{items.map(card)}</div>` para mobile.
- Click en card abre el mismo modal que la fila.
- Botones de acción en una segunda fila con `border-t` + `e.stopPropagation()`.

### 7.4 RPC SECURITY DEFINER con auth gate
Para operaciones transaccionales con FOR UPDATE:
```sql
CREATE FUNCTION mi_rpc(...) RETURNS ...
SECURITY DEFINER
AS $$
BEGIN
  PERFORM _require_permiso_or_admin(p_user_id, 'modulo', 'accion');
  -- lógica con FOR UPDATE
END $$;
```

### 7.5 Auto-fetch + invalidate
React Query maneja invalidación cruzada:
- Mutation de stock proveedor invalida `['solicitudes']` + `['materiales']` + `['stock-proveedor']`.
- Mutation de auto-archivar invalida `['obras']`.
- Defaults: `staleTime: 60s`, `retry: false` para queries opcionales.

---

## 8. Permisos

### Estructura
```jsonc
{
  "rol": "admin" | "operador",
  "modulos": ["tarja", "logistica", "certificaciones", ...],
  "permisos": {
    "<modulo>": {
      "lectura": true,
      "creacion": true,
      "actualizacion": true,
      "eliminacion": false,
      "tabs": ["viajes", "choferes", ...],   // opcional, si falta = todos
      "<flag_extra>": true                    // ej: "forzar_despacho"
    }
  }
}
```

### Bypass
- `rol === 'admin'` salta TODOS los chequeos de permiso.

### Excepciones
- `personal` no es módulo asignable — endpoints usan `requirePermisoOr('personal', 'tarja')`.
- `hs-extras` y `horas` usan permisos del módulo `tarja` (no `'horas'`, que no existe).
- `forzar_despacho` (certificaciones): permiso ad-hoc chequeado inline cuando `body.forzar_sin_stock = true`.

---

## 9. Migraciones recientes (post 2026-04-23)

Path: `supabase/migrations/`

| Archivo | Cambio |
|---|---|
| `20260424_*` | Múltiples — perf indices, drop modelo paralelo, RPCs eliminar liquidación/solicitud, recalcular saldos caja, security_invoker views. |
| `20260427_adelantos_comprobante.sql` | + `comprobante_url/hash` en adelantos + bucket. |
| `20260427_bateas_y_vehiculo_docs.sql` | Tabla `bateas` + docs compartidos camión/batea + bucket. |
| `20260427_chofer_documentos.sql` | Tabla `chofer_documentos` + bucket. |
| `20260427_choferes_batea_id.sql` | + `batea_id` en choferes. |
| `20260427_choferes_dni_to_cuil.sql` | Rename `dni` → `cuil` en choferes. |
| `20260427_cobros_adjuntos.sql` | Tabla `cobros_adjuntos` + bucket `cobros-docs`. |
| `20260428_rentabilidad_simulador.sql` | Tablas `rentabilidad_*` + seed con 7 viajes. |
| `20260429_personal_fecha_nacimiento.sql` | + `fecha_nacimiento` en personal. |
| `20260429_stock_en_proveedor.sql` | Tablas `stock_proveedor_*` + RPCs `resolver_item_en_proveedor` + `retirar_de_proveedor` + bucket. |
| `20260429_view_vehiculo_docs_vencimientos.sql` | Vista para campana. |
| `20260430_rpc_obras_auto_archivar.sql` | RPC `obras_a_auto_archivar` (fix del bug del cap PostgREST). |
| `20260504_view_chofer_docs_vencimientos.sql` | Vista para campana — papeles de choferes. |

---

## 10. Deuda técnica viva

### Schema
- **Modelos paralelos**: `empresas` vs `empresas_transportistas`, `viajes/cargas/descargas` vs `tramos`, múltiples sistemas de remitos (`remitos`, `remitos_envio`, `remitos_carga/descarga`, `remitos_retiro_proveedor`).
- **Columnas duplicadas**: `camiones.año` y `camiones.anio`.
- **Falta índice** en `stock_movimientos.material_id` y `.solicitud_item_id`.

### Frontend
- **`useForm<any>`** en ViajesTab, PersonalPage, ChoferesTab, BateasTab, RentabilidadTab, modal adelantos.
- **Sub-tabs Camiones/Bateas sin URL**: deep-link al modal del vehículo no funciona (la campana lleva al tab pero no abre el modal).
- **Login de herramientas separado** (`/herramientas/login`): coexiste con `/login`, razón no documentada.

### Backend
- **Camino legacy de resolución items**: cuando `USE_RPC_RESOLVER ≠ 'true'`, el handler cae al multi-mutation no-transaccional. Eliminar después de validar.
- **`npm audit`**: 3 vulnerabilidades (2 moderate, 1 high) detectadas al clonar.

### Notificaciones
- **Sin persistencia**: hook in-memory, no se puede "marcar como leído". Si querés mute por usuario, tabla `notificaciones_dismiss`.
- **Auto-archivado sin auditoría**: filtro explícito en `audit.ts:14`. Si se quiere rastrear, sacar.

### Stock proveedor
- **`materiales_a_cuenta_cliente.cantidad` se sobrescribe** en cada retiro parcial (UPSERT). Detalle por retiro solo en `stock_proveedor_movimientos` y `remitos_retiro_proveedor_item`.
- **Sin RPC para revertir retiros**: si se carga mal un remito, hoy no hay reversión limpia.

### RLS
- **77 tablas con policies `using(true)`**: decisión consciente por simplicidad del backend Hono. No proponer migrar a estricta sin plan.

---

## 11. Comandos útiles

### Frontend
```bash
cd /Users/francoleiro/frontend_cadinc_gestion
npm run dev      # next dev — puerto 3000
npm run build    # next build
npm run lint     # eslint
```

### Backend
```bash
cd /Users/francoleiro/cadincsrl
npm run dev      # tsx watch — puerto 3001
npm run build    # tsc
npm test         # vitest
```

### Validación de fórmula de rentabilidad
```bash
cd /Users/francoleiro/frontend_cadinc_gestion
npx tsx scripts/validate-rentabilidad.ts   # 7/7 OK contra Excel
```

### Supabase
- MCP de Supabase: `apply_migration`, `execute_sql`, `list_tables` (vía Claude Code plugin).
- Dashboard: `https://supabase.com/dashboard/project/xclobkgmaxioifpkukul`.
- Migraciones se versionan en `supabase/migrations/` del repo frontend (única fuente).

### Git
- Rama principal: `main` (producción).
- Commits con prefijo: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.
- NO usar `Co-Authored-By` (preferencia del usuario).
- NO encadenar git con `&&` — secuencial paso a paso.
- Merges directos a main (no PRs en GitHub).

---

## 12. Subagentes disponibles

Viven en `.claude/agents/` del frontend:
- `frontend-specialist` — UI/UX, React, formularios.
- `backend-specialist` — APIs Hono, services, middlewares.
- `database-architect` — schema, migraciones, RPCs.
- `nextjs-react-specialist` — gotchas de Next.js 16 / React 19.
- `security-specialist` — auth, permisos, RLS, datos sensibles.
- `code-reviewer` — review pre-commit.

Invocar con: *"Usá al subagente X para…"*. También se activan proactivamente según `description`.

---

_Última regeneración: 2026-05-04._
