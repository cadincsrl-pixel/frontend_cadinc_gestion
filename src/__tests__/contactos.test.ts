import { describe, it, expect } from 'vitest'
import { contactosDesde, contactosParaGuardar, validarContactos } from '@/components/contactos/ContactosEditor'

describe('contactos (cliente / proveedor)', () => {
  it('el email suelto solo si el backend no mandó la lista; vacía a propósito queda vacía', () => {
    expect(contactosDesde(undefined, 'adm@x.com')).toEqual([{ nombre: '', rol: 'administracion', email: 'adm@x.com', telefono: '', recibe_avisos: true }])
    expect(contactosDesde([], 'adm@x.com')).toEqual([])
    expect(contactosDesde(null, '')).toEqual([])
  })
  it('valida vacío, forma del email y repetidos', () => {
    const base = { nombre: '', rol: 'vendedor' as const, email: '', telefono: '', recibe_avisos: true }
    expect(validarContactos([base])?.i).toBe(0)
    expect(validarContactos([{ ...base, email: 'mal' }])?.mensaje).toMatch(/forma/)
    expect(validarContactos([{ ...base, email: 'a@x.com' }, { ...base, email: 'A@x.com' }])?.i).toBe(1)
    expect(validarContactos([{ ...base, nombre: 'Juan' }, { ...base, email: 'adm@x.com', rol: 'administracion' }])).toBeNull()
  })
  it('lo que se manda: vacíos a null, email en minúscula, id solo si existía', () => {
    expect(contactosParaGuardar([{ id: 3, nombre: ' Ana ', rol: 'pagos', email: 'Ana@X.com', telefono: '', recibe_avisos: false }]))
      .toEqual([{ id: 3, nombre: 'Ana', rol: 'pagos', email: 'ana@x.com', telefono: null, recibe_avisos: false }])
  })
})
