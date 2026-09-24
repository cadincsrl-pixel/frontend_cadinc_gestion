// Contactos de un cliente (Ventas) o de un proveedor (Compras), 20260925e/f.
// Misma forma en los dos padrones: el backend guarda la lista entera con
// `PUT …/:id/contactos` (actualiza los que traen id, agrega y borra).

export const ROLES_CONTACTO = ['administracion', 'vendedor', 'compras', 'pagos', 'otro'] as const
export type RolContacto = typeof ROLES_CONTACTO[number]

export const ETIQUETA_ROL: Record<RolContacto, string> = {
  administracion: 'Administración',
  vendedor:       'Vendedor',
  compras:        'Compras',
  pagos:          'Pagos / tesorería',
  otro:           'Otro',
}

export interface Contacto {
  id:            number
  nombre:        string | null
  rol:           RolContacto
  email:         string | null
  telefono:      string | null
  /** Viene tildado al mandar un aviso de pago. */
  recibe_avisos: boolean
  orden:         number
  obs:           string | null
}

/** Lo que edita la pantalla: `id` solo en los que ya existían. */
export interface ContactoInput {
  id?:           number
  nombre:        string
  rol:           RolContacto
  email:         string
  telefono:      string
  recibe_avisos: boolean
}
