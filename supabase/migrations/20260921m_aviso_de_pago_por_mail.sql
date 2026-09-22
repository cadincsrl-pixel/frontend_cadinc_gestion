-- =====================================================================
-- Queda escrito a quién se le avisó del pago y cuándo (2026-09-21)
--
-- Pedido del dueño: «¿podemos hacer que cuando se genere una OP se mande un
-- mail al contador y al proveedor con los comprobantes de pago?».
--
-- Esta tabla es la mitad que no se ve. Un mail con datos de pago NO SE PUEDE
-- DESMANDAR, así que tiene que quedar registrado: a qué dirección salió, con
-- qué adjuntos, quién lo mandó y si falló. Sin esto, «¿le avisaste a Norte?»
-- no tiene respuesta, y peor: alguien lo manda tres veces porque no sabe si
-- salió.
--
-- Se guarda la DIRECCIÓN USADA, no solo el id del proveedor: el mail salió a
-- esa casilla, y si mañana en el padrón la cambian, lo que pasó no cambia.
--
-- `estado` distingue tres cosas que no son lo mismo:
--   enviado   el servidor de correo lo aceptó
--   fallado   no se pudo mandar (queda el error, para poder reintentar)
--   omitido   no se intentó porque no había dirección cargada. NO es un fallo,
--             pero tampoco es «avisado»: es la respuesta a «por qué no le llegó»
--
-- Por qué el envío al proveedor NO es automático (decisión del dueño): de 9
-- proveedores del padrón, 1 tiene mail cargado. Automático, en 8 de 9 casos no
-- saldría nada y el que lo emitió creería que el proveedor se enteró. Va con un
-- clic, mostrando antes a qué dirección y con qué adjuntos.
-- =====================================================================

create table if not exists public.pagos_ordenes_avisos (
  id          bigserial primary key,
  orden_id    bigint not null references public.pagos_ordenes(id) on delete cascade,
  -- A quién: el proveedor al que se le pagó, o el estudio contable.
  destinatario text not null check (destinatario in ('proveedor', 'contador')),
  -- La casilla a la que REALMENTE salió. Null solo con estado 'omitido'.
  email       text,
  estado      text not null check (estado in ('enviado', 'fallado', 'omitido')),
  -- Qué se adjuntó, para poder decir qué vio el que lo recibió.
  adjuntos    text[] not null default '{}',
  -- El error del servidor de correo, tal cual, para poder reintentar con dato.
  error       text not null default '',
  enviado_at  timestamptz not null default now(),
  enviado_por uuid references auth.users(id)
);

create index if not exists pagos_ordenes_avisos_orden_idx
  on public.pagos_ordenes_avisos (orden_id, enviado_at desc);

comment on table public.pagos_ordenes_avisos is
  'Aviso de pago por mail: a quién salió, a qué casilla, con qué adjuntos y si falló (20260921m). Un mail no se desmanda: esto es el registro.';

-- Misma postura que el resto del módulo: escribe el backend como service_role.
alter table public.pagos_ordenes_avisos enable row level security;
revoke all on public.pagos_ordenes_avisos from anon, authenticated;
revoke all on sequence public.pagos_ordenes_avisos_id_seq from anon, authenticated;

-- La bandeja de órdenes muestra si ya se avisó, para no mandarlo dos veces.
-- `create or replace view` no admite insertar columnas en el medio ni cambiar
-- el orden (42P16): las nuevas van AL FINAL y el resto se reproduce tal cual
-- está hoy — incluidos `numero_fmt` y `cbu_destino_ultimos4`, que en el primer
-- borrador de esta migración me había comido.
create or replace view public.v_pagos_ordenes as
select o.id, o.numero,
       'OP-' || lpad(o.numero::text, 4, '0') as numero_fmt,
       o.proveedor_id, o.fecha, o.fecha_cobro, o.forma_pago, o.referencia,
       o.cbu_destino, o.alias_destino,
       right(o.cbu_destino, 4) as cbu_destino_ultimos4,
       o.monto_pagado, o.monto_nc, o.monto_aplicado, o.estado,
       o.motivo_anulacion, o.anulado_por, o.anulado_at, o.obs,
       o.created_at, o.updated_at, o.created_by, o.updated_by,
       p.razon_social as proveedor_nom, p.cuit as proveedor_cuit,
       pc.nombre as created_by_nombre, pn.nombre as anulado_por_nombre,
       ln.facturas, coalesce(ln.cantidad_facturas, 0)::int as cantidad_facturas,
       coalesce(ln.a_cuenta, 0)::numeric(14,2) as a_cuenta,
       (coalesce(ln.nc, 0) > 0) as tiene_nc,
       coalesce(adj.tiene_comprobante, false) as tiene_comprobante,
       coalesce(adj.tiene_nc_adjunto, false)  as tiene_nc_adjunto,
       (o.monto_pagado > 0 and o.forma_pago in ('transferencia','echeq')) as comprobante_requerido,
       (o.estado = 'emitida' and o.fecha_cobro is not null and o.fecha_cobro > public.hoy_ar()) as en_cartera,
       to_char(o.fecha, 'YYYY-MM') as mes_pago,
       public.norm_txt('op ' || o.numero::text || ' ' || p.razon_social || ' ' || coalesce(p.cuit, '') || ' '
                       || o.referencia || ' ' || coalesce(ln.facturas, '') || ' ' || o.obs) as busq,
       -- Nuevas (20260921m): si ya se avisó, y a quién le falta.
       coalesce(av.aviso_proveedor, false) as aviso_proveedor,
       coalesce(av.aviso_contador, false)  as aviso_contador,
       av.aviso_ultimo_at,
       -- El mail del padrón, para que la pantalla sepa si se puede avisar sin
       -- ir a buscarlo. No es dato de pago (no es el CBU), va sin enmascarar.
       nullif(btrim(coalesce(p.email, '')), '') as proveedor_email
from public.pagos_ordenes o
join public.pagos_proveedores p on p.id = o.proveedor_id
left join public.profiles pc on pc.id = o.created_by
left join public.profiles pn on pn.id = o.anulado_por
left join lateral (
  select string_agg(case when l.tipo = 'a_cuenta' then 'a cuenta'
                         when l.tipo = 'nota_credito' then 'NC ' || l.nc_numero || ' s/ ' || f.tipo_comprobante || ' ' || coalesce(f.numero, 's/n')
                         else f.tipo_comprobante || ' ' || coalesce(f.numero, 's/n') end, ', ' order by l.id) as facturas,
         count(distinct l.factura_id) as cantidad_facturas,
         sum(l.monto) filter (where l.tipo = 'a_cuenta')     as a_cuenta,
         sum(l.monto) filter (where l.tipo = 'nota_credito') as nc
    from public.pagos_orden_lineas l left join public.pagos_facturas f on f.id = l.factura_id
   where l.orden_id = o.id) ln on true
left join lateral (
  select bool_or(a.tipo = 'comprobante_pago') as tiene_comprobante,
         bool_or(a.tipo = 'nota_credito')     as tiene_nc_adjunto
    from public.pagos_ordenes_adjuntos a where a.orden_id = o.id and a.deleted_at is null) adj on true
left join lateral (
  -- Solo los que salieron: un 'fallado' o un 'omitido' NO es «ya se avisó».
  select bool_or(v.destinatario = 'proveedor') as aviso_proveedor,
         bool_or(v.destinatario = 'contador')  as aviso_contador,
         max(v.enviado_at)                     as aviso_ultimo_at
    from public.pagos_ordenes_avisos v where v.orden_id = o.id and v.estado = 'enviado') av on true;
