'use client'

import { useState } from 'react'
import {
  useContratistas,
  useContratistasObra,
  useCertificacionesObra,
  useAsignarContratista,
  useDesasignarContratista,
  useUpsertCertificacion,
  useCreateContratista,
} from '../hooks/useContratistas'
import { useTarjaStore } from '../store/tarja.store'
import { toISO } from '@/lib/utils/dates'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import type { Contratista } from '@/types/domain.types'

const ESP_OPTIONS = [
  { value: 'Electricista', label: 'Electricista' },
  { value: 'Sanitarista', label: 'Sanitarista' },
  { value: 'Durlero', label: 'Durlero / Durlock' },
  { value: 'Pintor', label: 'Pintor' },
  { value: 'Plomero', label: 'Plomero' },
  { value: 'Herrero', label: 'Herrero' },
  { value: 'Carpintero', label: 'Carpintero' },
  { value: 'Otro', label: 'Otro' },
]

interface Props {
  obraCod: string
}

export function ContratistasPanel({ obraCod }: Props) {
  const toast = useToast()
  const { semActual } = useTarjaStore()
  const semKey = toISO(semActual)

  const { data: todos = [] } = useContratistas()
  const { data: asignados = [] } = useContratistasObra(obraCod)
  const { data: certificaciones = [] } = useCertificacionesObra(obraCod)

  const { mutate: asignar, isPending: asignando } = useAsignarContratista()
  const { mutate: desasignar } = useDesasignarContratista()
  const { mutate: upsertCert, isPending: guardandoCert } = useUpsertCertificacion()
  const { mutate: createContrat, isPending: creando } = useCreateContratista()

  const [expanded, setExpanded] = useState(false)
  const [modalAsig, setModalAsig] = useState(false)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalCert, setModalCert] = useState<number | null>(null) // contrat_id
  const [selContrat, setSelContrat] = useState('')

  const formNuevo = useForm<any>()
  const formCert = useForm<any>()

  // Contratistas no asignados aún
  const disponibles = todos.filter(
    c => !asignados.some(a => a.contrat_id === c.id)
  )

  function handleAsignar() {
    if (!selContrat) return
    asignar(
      { obra_cod: obraCod, contrat_id: Number(selContrat) },
      {
        onSuccess: () => { toast('✓ Contratista asignado', 'ok'); setModalAsig(false); setSelContrat('') },
        onError: () => toast('Error al asignar', 'err'),
      }
    )
  }

  function handleDesasignar(contratId: number, nom: string) {
    if (!confirm(`¿Quitar a ${nom} de esta obra?`)) return
    desasignar(
      { obraCod, contratId },
      {
        onSuccess: () => toast('✓ Contratista quitado', 'ok'),
        onError: () => toast('Error al quitar', 'err'),
      }
    )
  }

  function handleCreateContratista(data: any) {
    createContrat(data, {
      onSuccess: () => { toast('✓ Contratista creado', 'ok'); setModalNuevo(false); formNuevo.reset() },
      onError: () => toast('Error al crear', 'err'),
    })
  }

  function getCert(contratId: number) {
    return certificaciones.find(
      c => c.contrat_id === contratId && c.sem_key === semKey
    )
  }

  function handleOpenCert(contratId: number) {
    const cert = getCert(contratId)
    formCert.reset({
      monto: cert?.monto ?? 0,
      desc: cert?.desc ?? '',
      estado: cert?.estado ?? 'pendiente',
    })
    setModalCert(contratId)
  }

  function handleSaveCert(data: any) {
    if (modalCert === null) return
    upsertCert(
      {
        obra_cod: obraCod,
        contrat_id: modalCert,
        sem_key: semKey,
        monto: Number(data.monto),
        desc: data.desc,
        estado: data.estado,
      },
      {
        onSuccess: () => { toast('✓ Certificación guardada', 'ok'); setModalCert(null) },
        onError: () => toast('Error al guardar', 'err'),
      }
    )
  }

  const contratistasConDatos = asignados.map(a => ({
    ...a.contratistas,
    cert: getCert(a.contrat_id),
  }))

  return (
    <>
      <div className="bg-white rounded-card shadow-card border-l-4 border-[#5A2D82]">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setExpanded(p => !p)}
            className="flex items-center gap-3 text-left flex-1"
          >
            <span className="text-azul text-lg">{expanded ? '▾' : '▸'}</span>
            <div>
              <h3 className="font-display text-xl tracking-wider text-azul">
                CONTRATISTAS EXTERNOS
              </h3>
              <p className="text-xs text-gris-dark mt-0.5">
                {asignados.length} asignados a esta obra
              </p>
            </div>
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setModalAsig(true)}
          >
            ＋ Asignar
          </Button>
        </div>

        {expanded && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {contratistasConDatos.length === 0 ? (
              <p className="text-sm text-gris-dark text-center py-4">
                No hay contratistas asignados a esta obra.
              </p>
            ) : (
              contratistasConDatos.map(c => (
                <div
                  key={c.id}
                  className="border border-gris-mid rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#EEE8FF] flex items-center justify-center text-[#5A2D82] font-bold text-sm flex-shrink-0">
                      {c.nom.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-carbon">{c.nom}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {c.especialidad && (
                          <span className="text-[10px] font-bold bg-[#EEE8FF] text-[#5A2D82] px-2 py-0.5 rounded">
                            {c.especialidad}
                          </span>
                        )}
                        {c.tel && (
                          <span className="text-xs text-gris-dark">{c.tel}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Certificación semana actual */}
                    {c.cert ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={c.cert.estado === 'cerrado' ? 'cerrado' : 'pendiente'}
                        />
                        <span className="font-mono text-sm font-bold text-verde">
                          ${c.cert.monto.toLocaleString('es-AR')}
                        </span>
                        <button
                          onClick={() => handleOpenCert(c.id)}
                          className="text-xs font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors"
                        >
                          ✏️
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenCert(c.id)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde-light text-verde hover:bg-verde hover:text-white transition-colors"
                      >
                        ＋ Certificar semana
                      </button>
                    )}
                    <button
                      onClick={() => handleDesasignar(c.id, c.nom)}
                      className="text-xs font-bold px-2 py-1.5 rounded-lg text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal asignar contratista */}
      <Modal
        open={modalAsig}
        onClose={() => setModalAsig(false)}
        title="🔧 ASIGNAR CONTRATISTA"
        footer={
          <>
            <button
              onClick={() => { setModalAsig(false); setModalNuevo(true) }}
              className="mr-auto text-xs font-bold text-azul hover:text-naranja transition-colors"
            >
              ＋ Crear nuevo
            </button>
            <Button variant="secondary" onClick={() => setModalAsig(false)}>Cancelar</Button>
            <Button variant="primary" loading={asignando} onClick={handleAsignar}>
              ✓ Asignar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Seleccioná contratista"
            placeholder="Elegí"
            value={selContrat}
            onChange={e => setSelContrat(e.target.value)}
            options={disponibles.map(c => ({
              value: c.id,
              label: `${c.nom}${c.especialidad ? ' — ' + c.especialidad : ''}`,
            }))}
          />
          {disponibles.length === 0 && (
            <p className="text-sm text-gris-dark bg-gris rounded-lg p-3">
              Todos los contratistas ya están asignados.
            </p>
          )}
        </div>
      </Modal>

      {/* Modal nuevo contratista */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="🔧 NUEVO CONTRATISTA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={creando}
              onClick={formNuevo.handleSubmit(handleCreateContratista)}
            >
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nombre / Razón social"
            placeholder="Juan Pérez / Electricidad del Norte SRL"
            {...formNuevo.register('nom')}
          />
          <Select
            label="Especialidad"
            options={ESP_OPTIONS}
            {...formNuevo.register('especialidad')}
          />
          <Input
            label="Teléfono"
            placeholder="351-XXX-XXXX"
            {...formNuevo.register('tel')}
          />
          <Input
            label="Observaciones"
            placeholder="Notas adicionales"
            {...formNuevo.register('obs')}
          />
        </div>
      </Modal>

      {/* Modal certificación */}
      {(() => {
        const certActual = modalCert !== null ? getCert(modalCert) : null
        return (
          <Modal
            open={modalCert !== null}
            onClose={() => setModalCert(null)}
            title="💰 CERTIFICACIÓN DE SEMANA"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalCert(null)}>Cancelar</Button>
                <Button
                  variant="primary"
                  loading={guardandoCert}
                  onClick={formCert.handleSubmit(handleSaveCert)}
                >
                  ✓ Guardar
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="bg-gris rounded-lg px-3 py-2 text-sm">
                <span className="text-gris-dark font-semibold">Semana: </span>
                <span className="font-mono font-bold text-azul">{semKey}</span>
              </div>
              <Input
                label="Monto ($)"
                type="number"
                step="100"
                placeholder="0"
                {...formCert.register('monto')}
              />
              <Input
                label="Descripción"
                placeholder="Ej: Instalación eléctrica piso 2"
                {...formCert.register('desc')}
              />
              <Select
                label="Estado"
                options={[
                  { value: 'pendiente', label: 'Pendiente' },
                  { value: 'cerrado', label: 'Cerrado' },
                ]}
                {...formCert.register('estado')}
              />
              {certActual && (
                <AuditInfo
                  createdBy={certActual.created_by}
                  updatedBy={certActual.updated_by}
                  createdAt={certActual.created_at}
                  updatedAt={certActual.updated_at}
                />
              )}
            </div>
          </Modal>
        )
      })()}
    </>
  )
}