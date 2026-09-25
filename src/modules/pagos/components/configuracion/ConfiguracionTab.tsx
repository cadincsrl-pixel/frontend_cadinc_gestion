'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { JurisdiccionSelect } from '@/components/JurisdiccionSelect'
import { JurisdiccionesEditor } from '@/components/catalogos/JurisdiccionesEditor'
import { useJurisdicciones } from '@/hooks/useJurisdicciones'
import { nombreJurisdiccion } from '@/lib/utils/jurisdicciones'
import { useConfigPagos, useGuardarConfigPagos, useProbarMailPagos } from '../../hooks/useConfigPagos'
import { mensajeErrorPagos } from '../../utils/pagos.errores'
import { FUENTE_CONTADOR, esEmailValido, pieConCbu, plazoLabel } from '../../utils/pagos.utils'
import type { PagosConfig, PagosConfigPatch } from '@/types/config.types'

/**
 * Compras › Configuración (tanda 6). Ver lo puede cualquiera con la tab;
 * editar pide además el flag `configurar` de Compras (los botones quedan
 * deshabilitados con el motivo). Avisos de pago por mail y plazos de cheque
 * (20260929i), la jurisdicción por defecto de los tributos (20260929f) y el
 * catálogo de jurisdicciones, que comparte con Ventas.
 */
export function ConfiguracionTab() {
  const { configurar } = usePermisos('pagos')
  return (
    <div className="flex flex-col gap-4">
      {!configurar && (
        <div className="border rounded p-2 text-xs bg-gris border-gris-mid text-gris-dark">
          Podés ver la configuración de Compras; para cambiarla hace falta el permiso «Configurar» (Admin › Usuarios).
        </div>
      )}
      <AvisosCard puede={configurar} />
      <ChequesCard puede={configurar} />
      <TributosCard puede={configurar} />
      <JurisdiccionesEditor />
      <div className="text-[11px] text-gris-dark">Los cambios pueden tardar hasta un minuto en verse en todas las pantallas.</div>
    </div>
  )
}

function TributosCard({ puede }: { puede: boolean }) {
  const toast = useToast()
  const cfg = useConfigPagos()
  const { jurisdicciones } = useJurisdicciones()
  const guardar = useGuardarConfigPagos()
  const id = cfg.config.tributos.jurisdiccion_default_id
  const tip = puede ? undefined : TIP_SIN_PERMISO

  async function cambiar(nuevo: number | null) {
    try {
      await guardar.mutateAsync({ tributo_jurisdiccion_default_id: nuevo })
      toast(nuevo ? `✓ Los tributos nuevos proponen ${nombreJurisdiccion(jurisdicciones, nuevo)}` : '✓ Los tributos nuevos arrancan sin jurisdicción', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div>
        <div className="text-sm font-bold">Percepciones de las facturas de compra</div>
        <div className="text-[11px] text-gris-dark">
          La jurisdicción que se propone al agregar una percepción o impuesto en una factura. Se puede cambiar en cada renglón.
        </div>
      </div>
      {cfg.respaldo ? (
        <div className="text-xs text-naranja-dark">El servidor todavía no tiene esta configuración: se propone «Tucumán», como siempre.</div>
      ) : (
        <div className="max-w-sm" title={tip}>
          <JurisdiccionSelect label="Jurisdicción por defecto" disabled={!puede || guardar.isPending || cfg.isLoading}
            value={{ id, nombre: nombreJurisdiccion(jurisdicciones, id) }}
            onChange={v => { if (v.id !== id) void cambiar(v.id) }} />
        </div>
      )}
    </div>
  )
}

const TIP_SIN_PERMISO = 'Necesitás el permiso «Configurar» de Compras'

/**
 * Avisos de pago por mail: a quién le llega el del contador, a dónde vuelven
 * las respuestas, con qué nombre sale y un texto al pie. La DIRECCIÓN del
 * remitente no se elige acá: es la cuenta de correo del servidor.
 */
function AvisosCard({ puede }: { puede: boolean }) {
  const cfg = useConfigPagos()
  const aviso = cfg.config.aviso

  if (cfg.respaldo || (!cfg.isLoading && !aviso)) {
    return (
      <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-1">
        <div className="text-sm font-bold">Avisos de pago por mail</div>
        <div className="text-xs text-naranja-dark">
          El servidor todavía no tiene esta configuración: el aviso sale como siempre (casilla del contador del servidor).
        </div>
      </div>
    )
  }
  if (!aviso) return null
  // La key remonta el formulario cuando cambia lo guardado: toma los valores nuevos.
  const key = [aviso.contador_email, aviso.compras_email, aviso.responder_a, aviso.nombre_remitente, aviso.pie_texto].join('\u0001')
  return <AvisosForm key={key} aviso={aviso} puede={puede} />
}

type AvisoCfg = NonNullable<PagosConfig['aviso']>

function AvisosForm({ aviso, puede }: { aviso: AvisoCfg; puede: boolean }) {
  const toast = useToast()
  const guardar = useGuardarConfigPagos()
  const probar = useProbarMailPagos()
  const tip = puede ? undefined : TIP_SIN_PERMISO

  const [contador, setContador] = useState(aviso.contador_email ?? '')
  // Copia a Compras (20260929x). Un backend anterior no manda la clave: el campo no se muestra.
  const soportaCompras = aviso.compras_email !== undefined
  const [compras, setCompras] = useState(aviso.compras_email ?? '')
  const [responder, setResponder] = useState(aviso.responder_a ?? '')
  const [nombre, setNombre] = useState(aviso.nombre_remitente ?? '')
  const [pie, setPie] = useState(aviso.pie_texto ?? '')
  const [para, setPara] = useState('')

  const errContador = contador.trim() && !esEmailValido(contador) ? 'No tiene forma de dirección' : undefined
  const errCompras = compras.trim() && !esEmailValido(compras) ? 'No tiene forma de dirección' : undefined
  const errResponder = responder.trim() && !esEmailValido(responder) ? 'No tiene forma de dirección' : undefined
  const errNombre = nombre.length > 60 ? 'Máximo 60 caracteres'
    : /[<>"]/.test(nombre) ? 'Sin comillas ni < >' : undefined
  const errPie = pie.length > 500 ? 'Máximo 500 caracteres'
    : pieConCbu(pie) ? 'No puede llevar un CBU, un CVU ni un alias' : undefined
  const invalido = !!(errContador || errCompras || errResponder || errNombre || errPie)

  const n = (s: string) => s.trim() || null
  const mail = (s: string) => s.trim().toLowerCase() || null  // la base los guarda en minúscula
  const cambios: PagosConfigPatch = {}
  if (mail(contador) !== (aviso.contador_email ?? null)) cambios.contador_email = mail(contador)
  if (soportaCompras && mail(compras) !== (aviso.compras_email ?? null)) cambios.compras_email = mail(compras)
  if (mail(responder) !== (aviso.responder_a ?? null)) cambios.responder_a = mail(responder)
  if (n(nombre) !== (aviso.nombre_remitente ?? null)) cambios.nombre_remitente = n(nombre)
  if (n(pie) !== (aviso.pie_texto ?? null)) cambios.pie_texto = n(pie)
  const hayCambios = Object.keys(cambios).length > 0

  async function onGuardar() {
    try {
      await guardar.mutateAsync(cambios)
      toast('✓ Avisos de pago guardados', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  async function onProbar() {
    try {
      const r = await probar.mutateAsync(para.trim())
      toast(`✓ Mail de prueba enviado a ${r.para}`, 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  const smtpOk = aviso.smtp.configurado ?? false
  const tipGuardar = !puede ? TIP_SIN_PERMISO : invalido ? 'Corregí los campos marcados' : !hayCambios ? 'No hay cambios' : undefined
  const tipProbar = !puede ? TIP_SIN_PERMISO
    : !smtpOk ? 'El servidor no tiene el correo configurado'
    : hayCambios ? 'Guardá los cambios antes de probar: la prueba sale con lo guardado'
    : !esEmailValido(para) ? 'Poné a qué dirección mandar la prueba' : undefined

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-3">
      <div>
        <div className="text-sm font-bold">Avisos de pago por mail</div>
        <div className="text-[11px] text-gris-dark">
          El aviso que se manda desde una orden de pago al proveedor, al contador y, en copia, a Compras.
        </div>
      </div>

      {!smtpOk && (
        <div className="border rounded p-2 text-xs bg-naranja-light border-naranja text-naranja-dark">
          El servidor no tiene el correo configurado{aviso.smtp.falta.length ? ` (falta ${aviso.smtp.falta.join(', ')})` : ''}: los avisos no salen hasta que se configure.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" title={tip}>
        <div className="flex flex-col gap-1">
          <Input label="Mail del contador" type="email" value={contador} disabled={!puede} error={errContador}
            placeholder="estudio@ejemplo.com.ar" onChange={e => setContador(e.target.value)} />
          <div className="text-[11px] text-gris-dark">
            {aviso.contador_email_efectivo
              ? <>Hoy le llega a <b>{aviso.contador_email_efectivo}</b>{aviso.contador_fuente ? ` (${FUENTE_CONTADOR[aviso.contador_fuente]})` : ''}.</>
              : 'Hoy no hay ninguna casilla del contador: el aviso al contador sale «sin dirección».'}
            {' '}Vacío = la del servidor o la del usuario con rol Contador.
          </div>
        </div>
        {soportaCompras && (
          <div className="flex flex-col gap-1">
            <Input label="Mail de compras (copia)" type="email" value={compras} disabled={!puede} error={errCompras}
              placeholder="compras@ejemplo.com" onChange={e => setCompras(e.target.value)} />
            <div className="text-[11px] text-gris-dark">
              Recibe lo mismo que el contador: el comprobante del pago (y el archivo de cada cheque o e-cheq) más las facturas.
              En cada aviso viene tildado y se puede destildar. Vacío = no se manda copia.
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Input label="Responder a" type="email" value={responder} disabled={!puede} error={errResponder}
            placeholder="administracion@ejemplo.com.ar" onChange={e => setResponder(e.target.value)} />
          <div className="text-[11px] text-gris-dark">
            A dónde van las respuestas del proveedor.
            {aviso.responder_a_efectivo && !aviso.responder_a ? <> Hoy: <b>{aviso.responder_a_efectivo}</b> (del servidor).</> : ''}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Input label="Nombre del remitente" value={nombre} disabled={!puede} error={errNombre} maxLength={80}
            placeholder="Vacío = el nombre de fantasía de la empresa" onChange={e => setNombre(e.target.value)} />
          <div className="text-[11px] text-gris-dark">
            Sale como: <b className="font-mono">{aviso.remitente_efectivo || '—'}</b>. La dirección es la cuenta de correo del servidor y no se cambia acá.
          </div>
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Texto al pie</label>
          <textarea value={pie} disabled={!puede} rows={3} maxLength={600}
            onChange={e => setPie(e.target.value)}
            placeholder="Por ejemplo: Consultas sobre pagos al 381-4000000, de lunes a viernes de 8 a 16."
            className={`w-full px-3 py-2 border-[1.5px] rounded-lg text-sm bg-blanco outline-none focus:border-naranja disabled:opacity-60 disabled:cursor-not-allowed ${errPie ? 'border-rojo bg-rojo-light' : 'border-gris-mid'}`} />
          <div className={`text-[11px] ${errPie ? 'text-rojo' : 'text-gris-dark'}`}>
            {errPie ?? 'Texto plano, va al final de todos los avisos. Nunca un CBU ni un alias: el mail no es el lugar para la cuenta.'}
            <span className="float-right tabular-nums">{pie.length}/500</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span title={tipGuardar}>
          <Button size="sm" onClick={() => void onGuardar()} loading={guardar.isPending}
            disabled={!puede || invalido || !hayCambios || guardar.isPending}>
            Guardar avisos
          </Button>
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <input type="email" value={para} onChange={e => setPara(e.target.value)} disabled={!puede}
            placeholder="probar con…" aria-label="Dirección para el mail de prueba"
            className="px-2 py-1 text-xs border border-gris-mid rounded bg-white w-52 disabled:opacity-60" />
          <span title={tipProbar}>
            <Button size="sm" variant="secondary" onClick={() => void onProbar()} loading={probar.isPending}
              disabled={!!tipProbar || probar.isPending}>
              Mandar prueba
            </Button>
          </span>
        </div>
      </div>
    </div>
  )
}

/** Los plazos que ofrece el alta de cheques del modal de pago: chips de días. */
function ChequesCard({ puede }: { puede: boolean }) {
  const cfg = useConfigPagos()
  const sinEndpoint = cfg.respaldo || (!cfg.isLoading && !cfg.config.cheques)
  // La key remonta el editor cuando cambia lo guardado.
  return <ChequesForm key={cfg.plazosCheque.join(',')} guardados={cfg.plazosCheque} sinEndpoint={sinEndpoint} puede={puede} />
}

function ChequesForm({ guardados, sinEndpoint, puede }: { guardados: number[]; sinEndpoint: boolean; puede: boolean }) {
  const toast = useToast()
  const guardar = useGuardarConfigPagos()
  const [plazos, setPlazos] = useState<number[]>(guardados)
  const [nuevo, setNuevo] = useState('')
  const clave = guardados.join(',')

  const tip = puede ? undefined : TIP_SIN_PERMISO
  const n = nuevo.trim() === '' ? NaN : Number(nuevo)
  const errNuevo = nuevo.trim() === '' ? undefined
    : !Number.isInteger(n) || n < 0 || n > 365 ? 'Entre 0 y 365'
    : plazos.includes(n) ? 'Ya está' : plazos.length >= 12 ? 'Máximo 12 plazos' : undefined
  const hayCambios = plazos.join(',') !== clave

  function agregar() {
    if (errNuevo || nuevo.trim() === '') return
    setPlazos(p => [...p, n].sort((a, b) => a - b))
    setNuevo('')
  }

  async function onGuardar() {
    try {
      await guardar.mutateAsync({ plazos_cheque: plazos })
      toast('✓ Plazos de cheque guardados', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  const tipGuardar = !puede ? TIP_SIN_PERMISO : plazos.length === 0 ? 'Tiene que quedar al menos un plazo' : !hayCambios ? 'No hay cambios' : undefined

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div>
        <div className="text-sm font-bold">Plazos de cheque</div>
        <div className="text-[11px] text-gris-dark">
          Los días que ofrece «primero a…» al partir un pago en cheques. 0 = al día. De 1 a 12 plazos.
        </div>
      </div>
      {sinEndpoint && (
        <div className="text-xs text-naranja-dark">El servidor todavía no tiene esta configuración: se ofrecen los plazos de siempre.</div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap" title={tip}>
        {plazos.map(d => (
          <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gris text-xs font-semibold tabular-nums">
            {plazoLabel(d)}
            <button type="button" aria-label={`Quitar ${plazoLabel(d)}`} disabled={!puede || sinEndpoint}
              title={puede ? 'Quitar' : TIP_SIN_PERMISO}
              onClick={() => setPlazos(p => p.filter(x => x !== d))}
              className="text-gris-dark hover:text-rojo disabled:opacity-40 disabled:cursor-not-allowed">×</button>
          </span>
        ))}
        <input inputMode="numeric" value={nuevo} disabled={!puede || sinEndpoint} aria-label="Días del plazo nuevo"
          placeholder="días" onChange={e => setNuevo(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
          className={`w-16 px-1.5 py-0.5 text-xs text-right tabular-nums border rounded bg-white disabled:opacity-60 ${errNuevo ? 'border-rojo' : 'border-gris-mid'}`} />
        <span title={!puede ? TIP_SIN_PERMISO : errNuevo}>
          <Button size="sm" variant="secondary" onClick={agregar}
            disabled={!puede || sinEndpoint || !!errNuevo || nuevo.trim() === ''}>Agregar</Button>
        </span>
        {errNuevo && <span className="text-[11px] text-rojo">{errNuevo}</span>}
      </div>
      <div>
        <span title={tipGuardar}>
          <Button size="sm" onClick={() => void onGuardar()} loading={guardar.isPending}
            disabled={!puede || sinEndpoint || plazos.length === 0 || !hayCambios || guardar.isPending}>
            Guardar plazos
          </Button>
        </span>
      </div>
    </div>
  )
}
