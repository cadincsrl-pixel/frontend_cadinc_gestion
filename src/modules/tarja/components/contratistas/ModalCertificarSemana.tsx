'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { useTarjaStore } from '../../store/tarja.store'
import {
  useContratistasObra,
  useCertificacionesObra,
  usePresupuestosObra,
  useUpsertCertificacion,
  useDeleteCertificacion,
} from '../../hooks/useContratistas'
import type { Certificacion, Presupuesto } from '@/types/domain.types'
import { fmtMonto, fmtDDMM, rangoSemana, fechaPago, mensajeError, parseISOLocal } from './utils'

// ── Form tipado: una fila por presupuesto abierto (o una sola "Sin presupuesto") ──
const filaSchema = z.object({
  presupuesto_id: z.number().nullable(),
  // Formato máquina de InputMonto ("1234567.89" | ""). Vacío = 0.
  monto: z.string().refine(
    s => s === '' || (Number.isFinite(Number(s)) && Number(s) >= 0),
    'Monto inválido',
  ),
  desc: z.string(),
})
const schema = z.object({ filas: z.array(filaSchema) })
type FormData = z.infer<typeof schema>

interface FilaBase {
  presupuesto: Presupuesto | null   // null = "Sin presupuesto"
  cert:        Certificacion | null // cert existente de esta semana para esta fila
  saldoActual: number | null        // monto − Σ certs del presupuesto (todas las semanas)
}

function montoDe(raw: string | undefined): number {
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

interface Props {
  obraCod:       string
  contratId:     number
  semKey:        string
  puedeMutar:    boolean
  motivoBloqueo: string | null
  onClose:       () => void
}

// Cabecera común (contratista · obra · semana · fecha de pago).
function Encabezado({ nom, obraCod, semKey, semanaPasada }: {
  nom: string; obraCod: string; semKey: string; semanaPasada: boolean
}) {
  return (
    <div className="bg-gris rounded-lg px-3 py-2 text-sm flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gris-dark font-semibold">Contratista:</span>
        <span className="font-bold text-azul">{nom}</span>
        <span className="text-gris-dark">· obra</span>
        <span className="font-mono font-bold text-azul">{obraCod}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gris-dark font-semibold">Semana:</span>
        <span className="font-bold text-carbon">{rangoSemana(semKey)}</span>
        <span className="text-gris-dark">· se paga <span className="font-bold text-carbon">{fechaPago(semKey)}</span></span>
        {semanaPasada && (
          <span className="text-[10px] font-bold bg-amarillo-light text-[#7A5000] px-1.5 py-0.5 rounded">
            semana pasada
          </span>
        )}
      </div>
    </div>
  )
}

// El contenedor resuelve las queries; el form se monta recién cuando los datos
// están (useForm toma defaultValues UNA vez: si se montara con las queries en
// loading arrancaría con una sola fila vacía y Guardar sería un no-op silencioso).
export function ModalCertificarSemana(props: Props) {
  const { obraCod, contratId, semKey, onClose } = props
  const asigQ   = useContratistasObra(obraCod)
  const certsQ  = useCertificacionesObra(obraCod)
  const presupQ = usePresupuestosObra(obraCod)

  const cargando = asigQ.isLoading || certsQ.isLoading || presupQ.isLoading
  const fallo    = asigQ.isError || certsQ.isError || presupQ.isError

  if (cargando || fallo) {
    return (
      <Modal
        open
        onClose={onClose}
        title="💰 CERTIFICAR SEMANA"
        width="max-w-lg"
        footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
      >
        {cargando ? (
          <p className="text-sm text-gris-dark py-4 text-center">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            <p className="text-sm text-rojo font-semibold">
              No se pudieron cargar las certificaciones o los presupuestos de la obra.
            </p>
            <Button
              variant="secondary"
              onClick={() => { asigQ.refetch(); certsQ.refetch(); presupQ.refetch() }}
            >
              Reintentar
            </Button>
          </div>
        )}
      </Modal>
    )
  }

  const asig = (asigQ.data ?? []).find(a => a.contrat_id === contratId)
  return (
    <FormCertificarSemana
      {...props}
      nom={asig?.contratistas.nom ?? '—'}
      finalizado={asig?.finalizado_en != null}
      certificaciones={certsQ.data ?? []}
      presupuestos={presupQ.data ?? []}
      semKey={semKey}
    />
  )
}

interface FormProps extends Props {
  nom:             string
  finalizado:      boolean
  certificaciones: Certificacion[]
  presupuestos:    Presupuesto[]
}

function FormCertificarSemana({
  obraCod, contratId, semKey, puedeMutar, motivoBloqueo, onClose,
  nom, finalizado, certificaciones, presupuestos,
}: FormProps) {
  const toast = useToast()
  const { semActual } = useTarjaStore()
  const semActualKey = toISO(semActual)

  const upsert = useUpsertCertificacion()
  const borrar = useDeleteCertificacion()
  const [guardando, setGuardando] = useState(false)

  const certsContrat = certificaciones.filter(c => c.contrat_id === contratId)
  const certsSemana  = certsContrat.filter(c => c.sem_key === semKey)
  const abiertos     = presupuestos.filter(p => p.contrat_id === contratId && !p.cerrado_en)

  // Filas editables: una por presupuesto abierto. Sin presupuestos abiertos,
  // una sola "Sin presupuesto" (el backend la rechaza con 400 si hubiera abiertos).
  const filasBase: FilaBase[] = abiertos.length > 0
    ? abiertos.map(p => ({
        presupuesto: p,
        cert: certsSemana.find(c => c.presupuesto_id === p.id) ?? null,
        saldoActual: Number(p.monto) - certsContrat
          .filter(c => c.presupuesto_id === p.id)
          .reduce((acc, c) => acc + Number(c.monto), 0),
      }))
    : [{
        presupuesto: null,
        cert: certsSemana.find(c => c.presupuesto_id == null) ?? null,
        saldoActual: null,
      }]

  // Certs de esta semana sin fila editable (presupuesto cerrado, o sin
  // presupuesto cuando ya hay abiertos): se muestran read-only y suman al total.
  const extras = certsSemana.filter(c => !filasBase.some(f => f.cert?.id === c.id))

  // Los valores iniciales se leen una vez al montar (el contenedor garantiza
  // que las queries ya resolvieron).
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      filas: filasBase.map(f => ({
        presupuesto_id: f.presupuesto?.id ?? null,
        monto: f.cert ? String(f.cert.monto) : '',
        desc:  f.cert?.desc ?? '',
      })),
    },
  })
  const filasWatch = useWatch({ control, name: 'filas' })

  const totalEditable = (filasWatch ?? []).reduce((acc, f) => acc + montoDe(f?.monto), 0)
  const totalExtras   = extras.reduce((acc, c) => acc + Number(c.monto), 0)
  const totalSemana   = totalEditable + totalExtras

  // Guardar = N PUT /cert en paralelo (una fila de auditoría por cert) + DELETE
  // de las filas que tenían cert (> 0) y quedaron en 0. Un toast al final.
  async function onSubmit(data: FormData) {
    if (guardando) return // Enter repetido durante el guardado
    const errores: string[] = []
    const ops: Promise<unknown>[] = []

    for (const fila of data.filas) {
      const base   = filasBase.find(f => (f.presupuesto?.id ?? null) === fila.presupuesto_id)
      const cert   = base?.cert ?? null
      const titulo = base?.presupuesto?.titulo ?? 'Sin presupuesto'
      const nuevo  = montoDe(fila.monto)
      const desc   = fila.desc.trim()

      if (nuevo > 0) {
        const sinCambios = cert != null && Number(cert.monto) === nuevo && (cert.desc ?? '') === desc
        if (sinCambios) continue
        ops.push(
          upsert.mutateAsync({
            obra_cod:       obraCod,
            contrat_id:     contratId,
            sem_key:        semKey,
            monto:          nuevo,
            desc,
            presupuesto_id: fila.presupuesto_id,
          }).catch((err: unknown) => {
            errores.push(`${titulo}: ${mensajeError(err, 'error al guardar')}`)
          }),
        )
      } else if (cert && Number(cert.monto) > 0) {
        // Una cert histórica en $0 que sigue en 0 no se toca (se borra desde el
        // historial si hace falta): acá solo se borra lo que el usuario vació.
        ops.push(
          borrar.mutateAsync(cert.id).catch((err: unknown) => {
            errores.push(`${titulo}: ${mensajeError(err, 'error al borrar')}`)
          }),
        )
      }
    }

    if (ops.length === 0) { onClose(); return }
    setGuardando(true)
    try {
      await Promise.all(ops)
    } finally {
      setGuardando(false)
    }
    if (errores.length > 0) {
      toast(errores.join(' · '), 'err')
      return
    }
    toast('✓ Semana certificada', 'ok')
    onClose()
  }

  const bloqueado = !puedeMutar || finalizado || guardando
  const motivo = finalizado ? 'Contratista finalizado en esta obra' : motivoBloqueo

  return (
    <Modal
      open
      onClose={onClose}
      title="💰 CERTIFICAR SEMANA"
      width="max-w-lg"
      footer={
        <>
          <span className="mr-auto text-sm text-gris-dark">
            Total semana: <span className="font-mono font-bold text-carbon">{fmtMonto(totalSemana)}</span>
          </span>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            type="submit"
            form="form-cert-semana"
            variant="primary"
            loading={guardando}
            disabled={!puedeMutar || finalizado}
            title={motivo ?? undefined}
          >
            ✓ Guardar
          </Button>
        </>
      }
    >
      <form id="form-cert-semana" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <Encabezado nom={nom} obraCod={obraCod} semKey={semKey} semanaPasada={semKey < semActualKey} />

        {finalizado && (
          <p className="text-xs text-rojo font-semibold bg-rojo-light rounded-lg px-3 py-2">
            El contratista está finalizado en esta obra. Reactivalo desde su card para certificar.
          </p>
        )}

        {filasBase.map((f, i) => {
          const titulo = f.presupuesto?.titulo ?? 'Sin presupuesto'
          const orig   = f.cert ? Number(f.cert.monto) : 0
          const nuevo  = montoDe(filasWatch?.[i]?.monto)
          const saldoDespues = f.saldoActual == null ? null : f.saldoActual + orig - nuevo
          return (
            <div
              key={f.presupuesto?.id ?? 'sin-presupuesto'}
              className="rounded-lg border-[1.5px] border-gris-mid p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <span className="font-bold text-carbon">
                  {titulo}
                  {f.presupuesto && (
                    <span className="font-normal text-gris-dark"> ({fmtDDMM(parseISOLocal(f.presupuesto.fecha))})</span>
                  )}
                </span>
                {f.saldoActual != null && (
                  <span className="text-gris-dark">
                    saldo{' '}
                    <span className={`font-mono font-bold ${f.saldoActual < 0 ? 'text-rojo' : 'text-carbon'}`}>
                      {fmtMonto(f.saldoActual)}
                    </span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Controller
                  name={`filas.${i}.monto`}
                  control={control}
                  render={({ field }) => (
                    <InputMonto
                      label="Monto ($)"
                      placeholder="0"
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.filas?.[i]?.monto?.message}
                      disabled={bloqueado}
                    />
                  )}
                />
                <Input
                  label="Descripción"
                  placeholder="Ej: nivel 2 completo"
                  disabled={bloqueado}
                  {...register(`filas.${i}.desc`)}
                />
              </div>
              {saldoDespues != null && (nuevo > 0 || orig > 0) && (
                <span className={`text-[11px] ${saldoDespues < 0 ? 'text-rojo font-bold' : 'text-gris-dark'}`}>
                  ↳ saldo después:{' '}
                  {saldoDespues < 0
                    ? `excede en ${fmtMonto(-saldoDespues)} (se guarda igual)`
                    : fmtMonto(saldoDespues)}
                </span>
              )}
              {f.cert && orig > 0 && nuevo === 0 && (
                <span className="text-[11px] text-naranja font-semibold">
                  Al guardar se borra la certificación de {fmtMonto(orig)}.
                </span>
              )}
              {f.cert && (
                <AuditInfo
                  createdBy={f.cert.created_by}
                  updatedBy={f.cert.updated_by}
                  createdAt={f.cert.created_at}
                  updatedAt={f.cert.updated_at}
                />
              )}
            </div>
          )
        })}

        {extras.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {extras.map(c => (
              <div
                key={c.id}
                className="rounded-lg border-[1.5px] border-dashed border-gris-mid px-3 py-2 text-xs flex items-center justify-between gap-2 opacity-80"
              >
                <div className="min-w-0">
                  <span className="font-bold text-carbon">{c.presupuesto_titulo ?? 'Sin presupuesto'}</span>
                  <span className="text-gris-dark"> · {c.presupuesto_id != null ? 'presupuesto cerrado' : 'histórico'}</span>
                  {c.desc && <div className="text-gris-dark truncate" title={c.desc}>{c.desc}</div>}
                </div>
                <span className="font-mono font-bold text-carbon shrink-0">{fmtMonto(Number(c.monto))}</span>
              </div>
            ))}
            <span className="text-[11px] text-gris-dark">
              Estas certificaciones se borran o se mueven desde el historial de la card (o reabriendo el presupuesto).
            </span>
          </div>
        )}
      </form>
    </Modal>
  )
}
