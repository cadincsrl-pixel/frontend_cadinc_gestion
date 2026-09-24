'use client'

import { ETIQUETA_ROL, ROLES_CONTACTO, type Contacto, type ContactoInput, type RolContacto } from '@/types/contactos'

/**
 * Lista editable de contactos (nombre, rol, email, teléfono y «recibe avisos
 * de pago»). Controlado: el padre guarda la lista y la manda entera con
 * `PUT …/:id/contactos`. Lo usan el cliente de Ventas y el proveedor de
 * Compras. `validarContactos` repite las reglas del backend para avisar antes.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * La lista para editar. El email suelto del padrón se usa SOLO si el backend
 * no mandó la lista (respuesta vieja): si la mandó vacía es porque se sacaron
 * a propósito, y no hay que resucitarlo (la migración 20260925e ya pasó los
 * emails sueltos a contactos).
 */
export function contactosDesde(lista: Contacto[] | undefined | null, emailSuelto?: string | null): ContactoInput[] {
  if (lista) {
    return lista.map(k => ({
      id: k.id, nombre: k.nombre ?? '', rol: k.rol, email: k.email ?? '', telefono: k.telefono ?? '', recibe_avisos: k.recibe_avisos,
    }))
  }
  const e = (emailSuelto ?? '').trim()
  return e ? [{ nombre: '', rol: 'administracion', email: e, telefono: '', recibe_avisos: true }] : []
}

/** El primer error de la lista (índice + mensaje), o null. */
export function validarContactos(lista: ContactoInput[]): { i: number; mensaje: string } | null {
  const vistos = new Set<string>()
  for (let i = 0; i < lista.length; i++) {
    const k = lista[i]!
    const email = k.email.trim().toLowerCase()
    if (!k.nombre.trim() && !email && !k.telefono.trim()) return { i, mensaje: 'Poné al menos nombre, email o teléfono (o sacá la fila).' }
    if (email && !EMAIL_RE.test(email)) return { i, mensaje: `El email «${k.email.trim()}» no tiene forma de dirección.` }
    if (email && vistos.has(email)) return { i, mensaje: `El email ${email} está dos veces.` }
    if (email) vistos.add(email)
  }
  return null
}

/** Para mandar al backend. */
export function contactosParaGuardar(lista: ContactoInput[]) {
  return lista.map(k => ({
    ...(k.id ? { id: k.id } : {}),
    nombre: k.nombre.trim() || null, rol: k.rol, email: k.email.trim().toLowerCase() || null,
    telefono: k.telefono.trim() || null, recibe_avisos: k.recibe_avisos,
  }))
}

const inputCls = 'w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja disabled:bg-gris/40'

export function ContactosEditor({ value, onChange, disabled, error, textoAvisos = 'Recibe avisos de pago' }: {
  value: ContactoInput[]
  onChange: (v: ContactoInput[]) => void
  disabled?: boolean
  /** Error a mostrar (por ejemplo, el de `validarContactos`). */
  error?: { i: number; mensaje: string } | null
  textoAvisos?: string
}) {
  const set = (i: number, patch: Partial<ContactoInput>) => onChange(value.map((k, j) => (j === i ? { ...k, ...patch } : k)))
  const quitar = (i: number) => onChange(value.filter((_, j) => j !== i))
  const agregar = () => onChange([...value, { nombre: '', rol: value.length ? 'vendedor' : 'administracion', email: '', telefono: '', recibe_avisos: true }])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Contactos</span>
        <button type="button" onClick={agregar} disabled={disabled}
          className="text-xs font-semibold text-azul hover:underline disabled:text-gris-dark disabled:no-underline"
          title={disabled ? 'No tenés permiso para editar' : 'Agregar otro contacto'}>
          + Agregar contacto
        </button>
      </div>
      {value.length === 0 && <p className="text-xs text-gris-dark italic">Sin contactos cargados.</p>}
      {value.map((k, i) => (
        <div key={k.id ?? `nuevo-${i}`}
          className={`border rounded-lg p-2 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center ${error?.i === i ? 'border-rojo' : 'border-gris-mid'}`}>
          <input className={`${inputCls} sm:col-span-3`} placeholder="Nombre" value={k.nombre} disabled={disabled}
            onChange={e => set(i, { nombre: e.target.value })} aria-label="Nombre del contacto" />
          <select className={`${inputCls} sm:col-span-2`} value={k.rol} disabled={disabled}
            onChange={e => set(i, { rol: e.target.value as RolContacto })} aria-label="Rol">
            {ROLES_CONTACTO.map(r => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
          </select>
          <input className={`${inputCls} sm:col-span-4`} type="email" placeholder="email@empresa.com" value={k.email} disabled={disabled}
            onChange={e => set(i, { email: e.target.value })} aria-label="Email" />
          <input className={`${inputCls} sm:col-span-2`} placeholder="Teléfono" value={k.telefono} disabled={disabled}
            onChange={e => set(i, { telefono: e.target.value })} aria-label="Teléfono" inputMode="tel" />
          <button type="button" onClick={() => quitar(i)} disabled={disabled}
            className="sm:col-span-1 text-rojo text-sm font-bold hover:bg-rojo-light rounded px-2 py-1 disabled:text-gris-dark"
            title="Sacar este contacto" aria-label="Sacar contacto">✕</button>
          <label className="sm:col-span-12 flex items-center gap-2 text-xs text-gris-dark cursor-pointer">
            <input type="checkbox" className="accent-naranja" checked={k.recibe_avisos} disabled={disabled}
              onChange={e => set(i, { recibe_avisos: e.target.checked })} />
            {textoAvisos}
          </label>
        </div>
      ))}
      {error && <span className="text-xs text-rojo">{error.mensaje}</span>}
    </div>
  )
}
