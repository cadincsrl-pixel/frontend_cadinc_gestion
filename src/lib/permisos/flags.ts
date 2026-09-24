/**
 * Catálogo de acciones y capacidades (flags booleanas) de `permisos`.
 *
 * Compartido por el wizard de usuarios (`PermisosWizard`) y el editor de
 * roles (`PlantillasTab`) para que ambos ofrezcan exactamente las mismas
 * opciones. Si agregás una flag al `ModuloPermisos` de domain.types (y a su
 * whitelist zod en el backend), sumala acá con su `help` y, si solo tiene
 * efecto en un módulo, restringila con `modulos`.
 */
import type { Accion } from '@/types/domain.types'

export const ACCIONES: { key: Accion; label: string }[] = [
  { key: 'lectura',       label: 'Ver'      },
  { key: 'creacion',      label: 'Crear'    },
  { key: 'actualizacion', label: 'Editar'   },
  { key: 'eliminacion',   label: 'Eliminar' },
]

// Módulos donde el override `obras_scope` por módulo tiene sentido.
// (Filtran por usuario_obras según `modulo`.)
export const MODULOS_CON_OBRAS_SCOPE: ReadonlySet<string> = new Set([
  'tarja', 'certificaciones', 'logistica', 'herramientas',
])

export type FlagBoolean =
  | 'ver_pii' | 'ver_costos' | 'administrar_obras' | 'resolver_items' | 'forzar_despacho'
  | 'cargar_precios' | 'precio_al_resolver' | 'editar_pedidos' | 'marcar_consumibles'
  | 'aprobar_ajustes_stock' | 'gestionar_cobros' | 'gestionar_docs' | 'anular_cobros'
  | 'costos_oficina' | 'asistente_ia'
  | 'registrar_pagos' | 'aprobar_facturas' | 'anular_pagos' | 'aprobar_propias'
  | 'emitir_facturas' | 'emitir_notas_credito' | 'registrar_finnegans' | 'registrar_cobros'

export interface FlagDef {
  key:   FlagBoolean
  label: string
  help:  string
  /** Módulos donde la flag tiene efecto. Sin `modulos` se ofrece en todos. */
  modulos?: string[]
}

// Toggles secundarios del sub-bloque "Capacidades" de cada módulo. Algunos
// solo afectan a ciertos módulos en el código del frontend; los `help` lo
// documentan y `modulos` restringe dónde se ofrecen.
export const FLAGS_BOOLEAN: FlagDef[] = [
  {
    key: 'ver_pii',
    label: 'Ver datos personales (PII)',
    // El admin que arma la cuenta del contador tiene que ver acá que sin este
    // flag el CBU llega enmascarado desde el backend y no va a poder pagar.
    help: 'Permite ver DNI, dirección, teléfono y fecha de nacimiento. En Pagos es además el CBU y el alias completos del proveedor: sin el flag se ven como ***1234 y no se pueden cargar datos de pago.',
  },
  {
    key: 'ver_costos',
    label: 'Ver costos',
    help: 'Muestra precios, totales y tarifas. Aplica a tarja y otros módulos sensibles.',
  },
  {
    key: 'administrar_obras',
    label: 'Administrar obras (catálogo)',
    help: 'Crear, editar, archivar y eliminar la entidad obra. Independiente de los permisos sobre horas. Solo tiene efecto en tarja.',
    modulos: ['tarja'],
  },
  {
    key: 'resolver_items',
    label: 'Resolver items',
    help: 'Comprar / despachar / enviar / rechazar items de solicitudes. Solo tiene efecto en certificaciones.',
    modulos: ['certificaciones'],
  },
  {
    key: 'editar_pedidos',
    label: 'Editar sus propios pedidos',
    help: 'Corregir un pedido que cargó él mismo: cantidades, descripción, sumar o sacar renglones. Solo los propios, y solo mientras el renglón siga pendiente — lo ya comprado o enviado no se toca. Es la alternativa a darle "actualización" del módulo entero, que además habilita consumible propio, cobros, proveedores, facturas y stock. Toda edición queda en Admin › Auditoría con el antes y el después.',
    modulos: ['certificaciones'],
  },
  {
    key: 'marcar_consumibles',
    label: 'Marcar consumibles propios',
    help: 'En Cuenta corriente, marcar los materiales que CADINC pone para ejecutar y no se le cobran al cliente. Sólo funciona en obras de presupuesto cerrado: en las por administración se factura todo con % y en las llave en mano ya es todo gasto propio. NO habilita cargar precios, aprobar propuestas ni emitir certificados (eso es "Cargar precios de la cuenta"). Solo tiene efecto en certificaciones.',
    modulos: ['certificaciones'],
  },
  {
    key: 'cargar_precios',
    label: 'Cargar precios de la cuenta',
    help: 'Editar el precio y el "quién lo pagó" de renglones ya resueltos: mueve lo que se le cobra al cliente. Por pedido del dueño arranca solo para admin.',
    modulos: ['certificaciones'],
  },
  {
    key: 'precio_al_resolver',
    label: 'Poner precio al resolver',
    help: 'Tipear el precio al comprar o despachar un ítem. Apagalo para quien maneja el depósito pero no los números (Sosa): resuelve igual y el renglón queda "esperando precio" para que lo cargue quien corresponde. Viene prendido salvo que se apague.',
    modulos: ['certificaciones'],
  },
  {
    key: 'forzar_despacho',
    label: 'Forzar despacho',
    help: 'Override que permite despachar aunque el stock no alcance. Solo tiene efecto en certificaciones.',
    modulos: ['certificaciones'],
  },
  {
    key: 'aprobar_ajustes_stock',
    label: 'Aprobar ajustes de stock',
    help: 'Aprobar o rechazar los ajustes de stock que declaró otro usuario (doble aprobación: quien declara no aprueba). Solo tiene efecto en certificaciones.',
    modulos: ['certificaciones'],
  },
  {
    key: 'gestionar_cobros',
    label: 'Gestionar cobros',
    help: 'Cargar y editar cobros de clientes sin ser admin (eliminar cobros sigue siendo admin-only). Solo tiene efecto en alquiler.',
    modulos: ['alquiler'],
  },
  {
    key: 'gestionar_docs',
    label: '📄 Documentación de máquinas',
    help: 'Cargar y renovar la póliza de seguro, aseguradora y vencimiento de las máquinas de alquiler sin ser admin. No habilita el resto del ABM de flota (crear/editar/borrar máquinas sigue admin-only). Quitar la póliza requiere además permiso de eliminación en el módulo. Solo tiene efecto en alquiler.',
    modulos: ['alquiler'],
  },
  {
    key: 'anular_cobros',
    label: '🗑 Anular cobros',
    help: 'Logística: eliminar cobros PENDIENTES de facturación (los tramos vuelven a quedar por cobrar) sin tener eliminación de todo el módulo; los ya cobrados primero se revierten a pendiente. Ventas: anular un recibo de cobranza (RC) o una imputación/compensación; el recibo no se borra, queda anulado con su motivo.',
    modulos: ['logistica', 'facturacion'],
  },
  {
    key: 'costos_oficina',
    label: '🏢 Costos de oficina (ver y administrar)',
    help: 'Habilita el tab "Costos oficina" del dashboard: da acceso a los sueldos del personal administrativo y a su prorrateo por obra, incluida la carga de personas, sueldos y asignaciones. Dato sensible — otorgar solo a quien deba ver esos montos. Solo tiene efecto en tarja.',
    modulos: ['tarja'],
  },
  {
    key: 'aprobar_facturas',
    label: '✅ Aprobar facturas de proveedor',
    help: 'Aprobar (de a una o en lote) las facturas que cargó compras, rechazarlas con motivo y revisar las que se cargaron como "ya pagadas". Nadie aprueba lo que cargó él mismo (salvo admin): si esta persona también carga facturas, las suyas las tiene que aprobar otro. Solo tiene efecto en pagos.',
    modulos: ['pagos'],
  },
  {
    key: 'aprobar_propias',
    label: 'Aprobar también sus propias facturas',
    help: 'Levanta la doble firma del circuito: normalmente quien carga una factura NO la aprueba, y con esto sí. Además, las facturas que cargue nacen ya aprobadas, sin esperar a nadie. Va junto con "Aprobar facturas": sin ese permiso no hace nada. NO habilita pagar: seguir sin poder emitir la orden de pago de lo que uno cargó o aprobó es lo que cuida la plata. Solo tiene efecto en pagos.',
    modulos: ['pagos'],
  },
  {
    key: 'registrar_pagos',
    label: '💸 Registrar pagos (órdenes de pago)',
    help: 'Emitir órdenes de pago sobre facturas APROBADAS (transferencia, cheque, notas de crédito del proveedor), observar facturas mal cargadas y cargar el CBU/alias del proveedor. Necesita además "Ver datos personales" para ver la cuenta destino. No habilita cargar ni editar facturas. Solo tiene efecto en pagos.',
    modulos: ['pagos'],
  },
  {
    key: 'anular_pagos',
    label: '🗑 Anular órdenes de pago ajenas',
    help: 'Anular cualquier orden de pago, no solo la propia del día: las facturas vuelven a aprobada (o a pendiente si nadie las había aprobado) y los adjuntos quedan marcados como de OP anulada. Es el escape cuando la plata no salió como se registró. Solo tiene efecto en pagos.',
    modulos: ['pagos'],
  },
  {
    key: 'emitir_facturas',
    label: '🧮 Emitir facturas contra ARCA',
    help: 'Mandar a ARCA un borrador de factura para que le asigne número y CAE, y verificar en ARCA una emisión que quedó sin confirmar. Una factura emitida no se modifica nunca: solo se anula con nota de crédito. Cargar borradores es "Crear". Solo tiene efecto en facturación.',
    modulos: ['facturacion'],
  },
  {
    key: 'emitir_notas_credito',
    label: '↩ Emitir notas de crédito',
    help: 'Emitir contra ARCA una nota de crédito que anula total o parcialmente una factura autorizada. Va separado de "Emitir facturas" a propósito: anular una factura es otra decisión. Solo tiene efecto en facturación.',
    modulos: ['facturacion'],
  },
  {
    key: 'registrar_finnegans',
    label: '📥 Registrar facturas en Finnegans',
    help: 'Marcar una factura autorizada como cargada en Finnegans, con el número de allá, y deshacerlo. Necesita además el tab "Finnegans". Solo tiene efecto en facturación.',
    modulos: ['facturacion'],
  },
  {
    key: 'registrar_cobros',
    label: '💰 Registrar cobros',
    help: 'Ventas: cargar recibos de cobranza (medios, retenciones y aplicación a facturas), aplicar a cuenta después y compensar notas de crédito contra facturas. Necesita además el tab "Cobranzas". Anularlos es otro permiso ("Anular cobros"). Solo tiene efecto en facturación.',
    modulos: ['facturacion'],
  },
  {
    key: 'asistente_ia',
    label: '🤖 Asistente IA',
    help: 'Habilita el chat de consultas sobre los datos del ERP. El asistente responde SOLO con datos que el usuario ya puede ver: cada consulta valida sus permisos y sus obras permitidas (no es un bypass). Consume créditos de API en cada pregunta. Solo tiene efecto en tarja.',
    modulos: ['tarja'],
  },
]

/** Flags que se ofrecen para un módulo (respeta la restricción `modulos`). */
export function flagsDeModulo(modKey: string): FlagDef[] {
  return FLAGS_BOOLEAN.filter(f => !f.modulos || f.modulos.includes(modKey))
}
