'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCreatePersonal, useUpdatePersonal } from '@/modules/tarja/hooks/usePersonal'
import {
  LEGAJO_RE, normalizarDni, dniValido, normalizarTelefono, telefonoValido,
  normalizarNombre, nombreValido, normalizarTalle, talleValido,
} from '@/lib/utils/personal'
import type { Personal, Categoria, UpdatePersonalDto } from '@/types/domain.types'

interface Props {
  open:       boolean
  onClose:    () => void
  personal:   Personal[]
  categorias: Categoria[]
}

interface Fila {
  leg:            string
  nom:            string
  dni:            string
  condicion:      '' | 'blanco' | 'asegurado'
  modalidad:      '' | 'hora' | 'mes'
  categoria:      string   // nombre para mostrar
  cat_id:         number | null
  tel:            string
  dir:            string
  talle_pantalon: string
  talle_botines:  string
  talle_camisa:   string
  obs:            string
  esNuevo:        boolean  // false = actualizar
  error:          string | null
}

const COLS = [
  'Legajo', 'Apellido y Nombre', 'DNI', 'Categoría', 'Condición', 'Modalidad',
  'Teléfono', 'Dirección', 'Pantalón', 'Botines', 'Camisa', 'Observaciones',
]

function descargarPlantilla() {
  const ws = XLSX.utils.aoa_to_sheet([
    COLS,
    ['001', 'Pérez, Juan', '12345678', 'Oficial', 'Asegurado', 'Hora', '351-111-2222', 'Calle 123', '44', '42', 'L', ''],
  ])
  ws['!cols'] = COLS.map((_, i) => ({ wch: i === 1 ? 28 : i === 7 ? 24 : 14 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Personal')
  XLSX.writeFile(wb, 'Plantilla_Personal.xlsx')
}

export function ModalImportarPersonal({ open, onClose, personal, categorias }: Props) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const { mutateAsync: crear    } = useCreatePersonal()
  const { mutateAsync: actualizar } = useUpdatePersonal()

  const [filas,    setFilas]    = useState<Fila[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ nuevos: number; actualizados: number } | null>(null)

  function parsear(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target!.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]!]!
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]

        // Buscar fila de encabezados (buscar "Legajo")
        const headerIdx = rows.findIndex(r =>
          r.some(c => String(c).trim().toLowerCase() === 'legajo')
        )
        if (headerIdx === -1) {
          toast('No se encontró la columna "Legajo". Usá la plantilla.', 'err')
          return
        }

        const headers = rows[headerIdx]!.map((c: any) => String(c).trim().toLowerCase())
        const col = (name: string) => headers.indexOf(name.toLowerCase())

        const iLeg  = col('legajo')
        const iNom  = col('apellido y nombre')
        const iDni  = col('dni')
        const iCat  = col('categoría')
        const iTel  = col('teléfono')
        const iDir  = col('dirección')
        const iPant = col('pantalón')
        const iBoti = col('botines')
        const iCami = col('camisa')
        const iObs  = col('observaciones')
        const iCond = col('condición')
        const iMod  = col('modalidad')

        const dataRows = rows.slice(headerIdx + 1).filter(r => String(r[iLeg] ?? '').trim())

        const parsed: Fila[] = dataRows.map(r => {
          const celda   = (i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '')
          const leg     = celda(iLeg)
          const nom     = normalizarNombre(celda(iNom))
          const catNom  = celda(iCat)
          const catObj  = categorias.find(c => c.nom.toLowerCase() === catNom.toLowerCase())
          const esNuevo = !personal.some(p => p.leg === leg)
          const dniCrudo = celda(iDni)
          const telCrudo = celda(iTel)
          const dni     = normalizarDni(dniCrudo)
          const tel     = normalizarTelefono(telCrudo)
          const talle_pantalon = normalizarTalle(celda(iPant))
          const talle_botines  = normalizarTalle(celda(iBoti))
          const talle_camisa   = normalizarTalle(celda(iCami))
          const condTxt = celda(iCond).toLowerCase()
          const condicion: Fila['condicion'] =
            condTxt === 'blanco' ? 'blanco' : condTxt === 'asegurado' ? 'asegurado' : ''
          const modTxt  = celda(iMod).toLowerCase()
          const modalidad: Fila['modalidad'] =
            /^(mes|mensual|mensualizado)$/.test(modTxt) ? 'mes'
            : /^(hora|por hora|jornal)$/.test(modTxt)   ? 'hora'
            : ''

          // Mismas reglas que el alta manual y que el backend.
          let error: string | null = null
          if (!leg)                               error = 'Legajo vacío'
          else if (!LEGAJO_RE.test(leg))          error = 'Legajo inválido (3 dígitos, ej. 112)'
          else if (esNuevo && !nom)               error = 'Nombre requerido para trabajador nuevo'
          else if (nom && !nombreValido(nom))     error = 'Nombre inválido (apellido y nombre, solo letras)'
          else if (esNuevo && !catObj)            error = catNom ? `Categoría "${catNom}" no encontrada` : 'Categoría requerida para trabajador nuevo'
          else if (!esNuevo && catNom && !catObj) error = `Categoría "${catNom}" no encontrada`
          else if (esNuevo && !dni)               error = 'DNI requerido para trabajador nuevo'
          else if (!dniValido(dniCrudo))          error = 'DNI inválido (7 u 8 dígitos)'
          else if (!telefonoValido(telCrudo))     error = 'Teléfono inválido (10 dígitos, ej. 3815551234)'
          else if (![talle_pantalon, talle_botines, talle_camisa].every(talleValido)) error = 'Talle inválido (ej. 44 o L)'
          else if (condTxt && !condicion)         error = `Condición "${condTxt}" no válida (Blanco / Asegurado)`
          else if (modTxt && !modalidad)          error = `Modalidad "${modTxt}" no válida (Hora / Mes)`

          return {
            leg,
            nom,
            dni,
            condicion,
            modalidad,
            categoria:      catNom,
            cat_id:         catObj?.id ?? null,
            tel,
            dir:            celda(iDir),
            talle_pantalon,
            talle_botines,
            talle_camisa,
            obs:            celda(iObs),
            esNuevo,
            error,
          }
        })

        setFilas(parsed)
        setResultado(null)
      } catch {
        toast('Error al leer el archivo', 'err')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleGuardar() {
    if (!filas) return
    const validas = filas.filter(f => !f.error)
    if (!validas.length) { toast('No hay filas válidas para importar', 'err'); return }

    setGuardando(true)
    let nuevos = 0, actualizados = 0, errores = 0

    for (const f of validas) {
      try {
        if (f.esNuevo) {
          if (!f.nom || f.cat_id == null || !f.dni) continue
          await crear({
            leg:            f.leg,
            nom:            f.nom,
            dni:            f.dni,
            condicion:      f.condicion || undefined,
            modalidad:      f.modalidad || undefined,
            cat_id:         f.cat_id,
            tel:            f.tel   || undefined,
            dir:            f.dir   || undefined,
            obs:            f.obs   || undefined,
            talle_pantalon: f.talle_pantalon || undefined,
            talle_botines:  f.talle_botines  || undefined,
            talle_camisa:   f.talle_camisa   || undefined,
          })
          nuevos++
        } else {
          const dto: UpdatePersonalDto = {}
          if (f.nom)            dto.nom            = f.nom
          if (f.dni)            dto.dni            = f.dni
          if (f.condicion)      dto.condicion      = f.condicion
          if (f.modalidad)      dto.modalidad      = f.modalidad
          if (f.cat_id)         dto.cat_id         = f.cat_id
          if (f.tel)            dto.tel            = f.tel
          if (f.dir)            dto.dir            = f.dir
          if (f.obs)            dto.obs            = f.obs
          if (f.talle_pantalon) dto.talle_pantalon = f.talle_pantalon
          if (f.talle_botines)  dto.talle_botines  = f.talle_botines
          if (f.talle_camisa)   dto.talle_camisa   = f.talle_camisa
          await actualizar({ leg: f.leg, dto })
          actualizados++
        }
      } catch { errores++ }
    }

    setGuardando(false)
    setResultado({ nuevos, actualizados })
    if (errores) toast(`${errores} fila${errores > 1 ? 's' : ''} con error al guardar`, 'err')
  }

  function handleClose() {
    setFilas(null)
    setResultado(null)
    onClose()
  }

  const validas   = filas?.filter(f => !f.error).length ?? 0
  const conError  = filas?.filter(f => !!f.error).length ?? 0
  const nuevos    = filas?.filter(f => !f.error && f.esNuevo).length ?? 0
  const actualiz  = filas?.filter(f => !f.error && !f.esNuevo).length ?? 0

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="📥 IMPORTAR PERSONAL"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          {!resultado && filas && validas > 0 && (
            <Button variant="primary" loading={guardando} onClick={handleGuardar}>
              ✓ Importar {validas} fila{validas !== 1 ? 's' : ''}
            </Button>
          )}
          {resultado && (
            <Button variant="primary" onClick={handleClose}>Cerrar</Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Resultado final */}
        {resultado && (
          <div className="bg-verde-light border border-verde/30 rounded-xl p-4 text-center">
            <div className="text-verde font-bold text-lg">✓ Importación completada</div>
            <div className="text-sm text-carbon mt-1">
              {resultado.nuevos > 0 && <span>{resultado.nuevos} trabajador{resultado.nuevos !== 1 ? 'es' : ''} creado{resultado.nuevos !== 1 ? 's' : ''}</span>}
              {resultado.nuevos > 0 && resultado.actualizados > 0 && ' · '}
              {resultado.actualizados > 0 && <span>{resultado.actualizados} actualizado{resultado.actualizados !== 1 ? 's' : ''}</span>}
            </div>
          </div>
        )}

        {/* Paso 1: seleccionar archivo */}
        {!resultado && (
          <>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 bg-azul text-white rounded-lg font-bold text-sm hover:bg-azul/90 transition-colors"
              >
                📂 Seleccionar archivo Excel
              </button>
              <button
                onClick={descargarPlantilla}
                className="flex items-center gap-2 px-4 py-2.5 bg-gris text-gris-dark rounded-lg font-bold text-sm hover:bg-gris-mid transition-colors"
              >
                📋 Descargar plantilla
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) parsear(f); e.target.value = '' }}
              />
            </div>

            <p className="text-xs text-gris-dark">
              Columnas esperadas: <span className="font-mono">Legajo, Apellido y Nombre, DNI, Categoría, Condición, Modalidad, Teléfono, Dirección, Pantalón, Botines, Camisa, Observaciones</span>.
              Si el legajo ya existe, se actualizan los datos. Si no existe, se crea el trabajador (categoría y DNI obligatorios).
              Condición (Blanco / Asegurado) y Modalidad (Hora / Mes) son opcionales. Se aplican las mismas reglas que el alta manual.
            </p>
          </>
        )}

        {/* Preview */}
        {filas && !resultado && (
          <>
            {/* Resumen */}
            <div className="flex gap-2 flex-wrap">
              {nuevos > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde-light text-verde">
                  ＋ {nuevos} nuevo{nuevos !== 1 ? 's' : ''}
                </span>
              )}
              {actualiz > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-azul-light text-azul">
                  ✎ {actualiz} actualización{actualiz !== 1 ? 'es' : ''}
                </span>
              )}
              {conError > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rojo-light text-rojo">
                  ✕ {conError} con error (se omiten)
                </span>
              )}
            </div>

            {/* Tabla */}
            <div className="overflow-auto max-h-72 border border-gris-mid rounded-xl">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-azul text-white">
                    <th className="px-3 py-2 text-left font-bold">Legajo</th>
                    <th className="px-3 py-2 text-left font-bold">Nombre</th>
                    <th className="px-3 py-2 text-left font-bold">Categoría</th>
                    <th className="px-3 py-2 text-left font-bold">Acción</th>
                    <th className="px-3 py-2 text-left font-bold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className={`border-b border-gris last:border-0 ${f.error ? 'bg-rojo-light/40' : i % 2 === 0 ? 'bg-white' : 'bg-gris/30'}`}>
                      <td className="px-3 py-2 font-mono font-bold text-carbon">{f.leg}</td>
                      <td className="px-3 py-2 text-carbon">{f.nom || <span className="text-gris-mid italic">—</span>}</td>
                      <td className="px-3 py-2 text-gris-dark">{f.categoria || <span className="text-gris-mid italic">—</span>}</td>
                      <td className="px-3 py-2">
                        {!f.error && (
                          <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${f.esNuevo ? 'bg-verde-light text-verde' : 'bg-azul-light text-azul'}`}>
                            {f.esNuevo ? '＋ Nuevo' : '✎ Actualizar'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {f.error
                          ? <span className="text-rojo font-semibold">✕ {f.error}</span>
                          : <span className="text-verde font-semibold">✓</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
