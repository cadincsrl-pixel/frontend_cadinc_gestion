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
  | 'cargar_precios' | 'precio_al_resolver'
  | 'aprobar_ajustes_stock' | 'gestionar_cobros' | 'gestionar_docs' | 'anular_cobros'
  | 'costos_oficina' | 'asistente_ia'

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
    help: 'Permite ver DNI, dirección, teléfono y fecha de nacimiento. Aplica principalmente a tarja.',
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
    label: '🗑 Anular cobros (facturación)',
    help: 'Eliminar cobros PENDIENTES de facturación (los tramos vuelven a quedar por cobrar) sin tener eliminación de todo el módulo logística. Los cobros ya marcados como cobrados no se pueden borrar: primero hay que revertirlos a pendiente. Solo tiene efecto en logística.',
    modulos: ['logistica'],
  },
  {
    key: 'costos_oficina',
    label: '🏢 Costos de oficina (ver y administrar)',
    help: 'Habilita el tab "Costos oficina" del dashboard: da acceso a los sueldos del personal administrativo y a su prorrateo por obra, incluida la carga de personas, sueldos y asignaciones. Dato sensible — otorgar solo a quien deba ver esos montos. Solo tiene efecto en tarja.',
    modulos: ['tarja'],
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
