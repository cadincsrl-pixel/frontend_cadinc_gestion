-- =====================================================================
-- Contra factura de intermediarios (comisión sobre el flete)
--
-- Regla (pedido del dueño 2026-09-02): cuando CADINC le factura un viaje a
-- una empresa INTERMEDIARIA, esa empresa emite una contra factura por su
-- comisión. Esa comisión resta del monto facturado del viaje, y con ese
-- saldo se calcula el % de pago al chofer (modalidad `pct`).
--
-- Decisiones del dueño:
--   · La comisión es un % que varía por viaje, pero se CARGA COMO MONTO FIJO
--     por viaje (el sistema no necesita conocer el %).
--   · Llega UNA contra factura por cada factura de CADINC.
--   · Hoy solo lo hace LOGISTICA GLOBAL (id 6) → flag por empresa.
--   · Se ESPERA a tener la contra factura para cerrar la liquidación.
--   · El monto viene CON IVA (convención del sistema: todo se guarda final).
--
-- Ojo con el nombre: en el código `comision` ya significa "lo que gana el
-- chofer" (neto × pct / 100). Por eso acá es `comision_intermediario`.
-- =====================================================================

-- ── 1. Qué empresas contra facturan ──────────────────────────────────
alter table public.empresas_transportistas
  add column if not exists contra_factura boolean not null default false;
comment on column public.empresas_transportistas.contra_factura is
  'La empresa es intermediaria y emite una contra factura por su comisión sobre cada factura de CADINC. Los viajes de esta empresa no se pueden liquidar a choferes pct hasta cargarle la comisión.';

-- ── 2. La comisión, por viaje (con IVA, como todo el sistema) ────────
alter table public.tramos
  add column if not exists comision_intermediario numeric
    check (comision_intermediario is null or comision_intermediario >= 0);
comment on column public.tramos.comision_intermediario is
  'Monto (CON IVA) que la empresa intermediaria contra facturó por este viaje. Resta del bruto facturado antes de netear: neto_chofer = (ton × tarifa − comision_intermediario) / 1,21. NULL = todavía no llegó la contra factura.';
create index if not exists tramos_comision_intermediario_idx
  on public.tramos (cobro_id) where comision_intermediario is not null;

-- ── 3. La contra factura como documento (una por factura) ────────────
alter table public.cobros
  add column if not exists contra_factura_nro   varchar(50),
  add column if not exists contra_factura_fecha date;
comment on column public.cobros.contra_factura_nro is
  'Nº de la contra factura que la empresa intermediaria emitió por su comisión sobre esta factura. El importe vive por viaje en tramos.comision_intermediario.';

-- ── 4. Adjunto de la contra factura ──────────────────────────────────
alter table public.cobros_adjuntos
  drop constraint if exists cobros_adjuntos_tipo_check;
alter table public.cobros_adjuntos
  add constraint cobros_adjuntos_tipo_check
  check (tipo in ('liquidacion', 'comprobante', 'factura', 'contra_factura'));

-- ── 5. Marcar la única intermediaria de hoy ──────────────────────────
update public.empresas_transportistas set contra_factura = true where id = 6;  -- LOGISTICA GLOBAL
