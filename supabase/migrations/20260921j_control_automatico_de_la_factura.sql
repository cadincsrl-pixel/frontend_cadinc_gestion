-- =====================================================================
-- El sistema lee el comprobante y controla lo que se tipeó (2026-09-21)
--
-- Pedido del dueño, después de que revisar a mano las 5 primeras facturas
-- contra su adjunto encontrara 3 errores: un punto de venta mal (0013 en vez
-- de 0012), dos facturas sin número, y un total con 48 centavos de más.
-- «Armalo, que revise número de factura y el total final nomás».
--
-- Alcance A PROPÓSITO CHICO: número y total. Nada de CUIT, fecha, IVA ni
-- renglones. Son los dos datos que, si están mal, hacen pagar mal o pagar dos
-- veces; el resto se puede mirar después.
--
-- AVISA, NO BLOQUEA. Una foto de papel arrugado (la de Norte lo es) o un
-- ticket borroso no pueden impedir cargar una factura real. Por eso el
-- resultado se guarda como un dato más y la factura queda cargada igual — pero
-- queda escrito, para que quien aprueba vea que el sistema marcó algo.
--
-- `estado` distingue tres cosas que NO son lo mismo:
--   coincide  el papel dice lo mismo que se tipeó
--   difiere   el papel dice otra cosa (y queda registrado qué decía)
--   ilegible  no se pudo leer. NO es «está bien»: es «no sé», y se muestra así
--   error     falló la llamada. Tampoco es «está bien».
-- =====================================================================

create table if not exists public.pagos_facturas_control (
  id           bigserial primary key,
  factura_id   bigint not null references public.pagos_facturas(id) on delete cascade,
  adjunto_id   bigint references public.pagos_facturas_adjuntos(id) on delete set null,
  estado       text   not null check (estado in ('coincide', 'difiere', 'ilegible', 'error')),
  -- Lo que se leyó del papel, tal cual, para poder discutirlo con el comprobante
  -- al lado. NULL cuando no se pudo leer ese dato.
  numero_leido text,
  total_leido  numeric(14,2),
  -- El veredicto por dato. NULL = no se pudo comparar (no se leyó).
  numero_ok    boolean,
  total_ok     boolean,
  nota         text   not null default '',
  modelo       text   not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists pagos_facturas_control_factura_idx
  on public.pagos_facturas_control (factura_id, created_at desc);

comment on table public.pagos_facturas_control is
  'Control automático del comprobante contra lo tipeado: número y total (20260921j). Avisa, no bloquea.';

-- Misma postura que el resto del módulo: escribe el backend como service_role.
alter table public.pagos_facturas_control enable row level security;
revoke all on public.pagos_facturas_control from anon, authenticated;
revoke all on sequence public.pagos_facturas_control_id_seq from anon, authenticated;
