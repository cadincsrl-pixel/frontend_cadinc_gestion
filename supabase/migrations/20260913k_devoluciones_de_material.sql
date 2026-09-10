-- DEVOLUCIONES DE MATERIAL AL DEPÓSITO — base de datos.
--
-- Pedido del user (10/09): *"a veces en obras sobra material y vuelve al
-- depósito, por ejemplo mandamos 20 litros de pintura y vuelven 15"*, y las
-- reglas las dio él:
--   · Si el renglón YA está cobrado  → vuelve como SALDO A FAVOR del cliente.
--   · Si NO está cobrado             → se descuenta de lo enviado.
--
-- Y un segundo caso que resulta ser el MISMO: *"de 30 bolsas se mandan 20,
-- quedan 10 pendientes de enviar y la obra dice que no necesita más"*. Hoy esas
-- 10 ya salieron del stock y ya están en la cuenta del cliente, porque la
-- cuenta se arma con lo DESPACHADO (`cantidad`) y no con lo enviado por remito
-- (`cantidad_enviada`). Caso vivo al escribir esto: item 3665 de GARITA, 15
-- bolsas despachadas y cobradas, 5 enviadas. Devolver material y cerrar un
-- despacho que nunca salió del galpón hacen exactamente lo mismo, así que va
-- una sola operación.
--
-- El user eligió que el saldo a favor viva en una TABLA PROPIA de notas de
-- crédito, y no como fila negativa de la cuenta ni como cobro negativo. Un
-- cobro es plata que entró; esto es deuda que baja. Que sea explícito permite
-- además mostrarlo en el PDF como "menos: devoluciones".

-- ── La nota de crédito ──────────────────────────────────────────────────
create table if not exists public.cuenta_cliente_notas_credito (
  id             serial primary key,
  obra_cod       text    not null,
  -- El renglón que la originó. ON DELETE SET NULL: si el renglón se borra, la
  -- nota sobrevive — ya afectó lo que se le debe al cliente.
  item_id        integer references public.solicitud_compra_item(id) on delete set null,
  fecha          date    not null default current_date,
  cantidad       numeric not null check (cantidad > 0),
  unidad         text    not null default 'unid',
  descripcion    text    not null,
  -- El precio al que SALIÓ, no el de referencia: si no, cada devolución crea
  -- o destruye plata.
  precio_unit    numeric not null check (precio_unit >= 0),
  monto          numeric not null check (monto >= 0),
  motivo         text,
  anulada        boolean not null default false,
  anulada_motivo text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_by     uuid,
  updated_at     timestamptz not null default now()
);

create index if not exists cuenta_cliente_notas_credito_obra_idx
  on public.cuenta_cliente_notas_credito (obra_cod) where not anulada;
create index if not exists cuenta_cliente_notas_credito_item_idx
  on public.cuenta_cliente_notas_credito (item_id);

alter table public.cuenta_cliente_notas_credito enable row level security;
drop policy if exists notas_credito_all on public.cuenta_cliente_notas_credito;
create policy notas_credito_all on public.cuenta_cliente_notas_credito
  for all using (true) with check (true);

comment on table public.cuenta_cliente_notas_credito is
  'Saldo a favor del cliente por material devuelto cuyo renglón ya estaba cobrado o certificado. No es un cobro: es deuda que baja.';

-- ── La operación, transaccional ─────────────────────────────────────────
-- Toca cuatro cosas (stock, ficha, renglón y cuenta) y ninguna puede quedar a
-- medias, así que va como RPC con lock sobre el renglón — mismo criterio que
-- resolver_item_compra / resolver_item_despacho (§5.2).
create or replace function public.devolver_material(
  p_item_id  integer,
  p_cantidad numeric,
  p_motivo   text default null,
  p_user_id  uuid  default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item      record;
  v_mcc       record;
  v_tiene_mcc boolean := false;
  v_congelada boolean := false;
  v_clase     text;
  v_resto     numeric;
  v_monto     numeric;
  v_nota_id   integer;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;

  select i.*, s.obra_cod as obra
    into v_item
    from public.solicitud_compra_item i
    join public.solicitud_compra s on s.id = i.solicitud_id
   where i.id = p_item_id
     for update of i;
  if not found then
    raise exception 'ITEM_NO_EXISTE' using errcode = 'P0001';
  end if;

  -- Solo se devuelve lo que efectivamente salió.
  if v_item.estado not in ('comprado', 'de_deposito', 'enviado', 'retirado') then
    raise exception 'ITEM_NO_RESUELTO' using errcode = 'P0001', detail = v_item.estado;
  end if;

  -- Las herramientas tienen su propio circuito (el pañol, herr_entregas):
  -- van y vuelven por definición y no tocan la cuenta del cliente.
  select clase into v_clase from public.stock_materiales where id = v_item.material_id;
  if coalesce(v_clase, '') = 'herramienta' then
    raise exception 'ES_HERRAMIENTA' using errcode = 'P0001';
  end if;

  if p_cantidad > v_item.cantidad then
    raise exception 'CANTIDAD_MAYOR_A_LA_DESPACHADA' using errcode = 'P0001',
      detail = format('se quiere devolver %s de %s', p_cantidad, v_item.cantidad);
  end if;
  v_resto := v_item.cantidad - p_cantidad;

  select * into v_mcc
    from public.materiales_a_cuenta_cliente
   where item_id = p_item_id
     for update;
  if found then
    v_tiene_mcc := true;
    v_congelada := (v_mcc.cobro_id is not null or v_mcc.certificado_id is not null);
  end if;

  -- 1) El material vuelve al depósito. Con obra de origen y renglón, al revés
  --    que las 5 devoluciones de abril, que no tenían ni una cosa ni la otra.
  if v_item.material_id is not null then
    insert into public.stock_movimientos
      (material_id, tipo, cantidad, motivo, obra_cod, solicitud_item_id, obs, fecha, created_by, estado)
    values
      (v_item.material_id, 'entrada', p_cantidad, 'devolucion', v_item.obra, p_item_id,
       coalesce(nullif(btrim(p_motivo), ''), 'Devolución de obra al depósito'),
       current_date, p_user_id, 'aprobado');

    update public.stock_materiales
       set stock_actual = stock_actual + p_cantidad,
           updated_by   = coalesce(p_user_id, updated_by),
           updated_at   = now()
     where id = v_item.material_id;
  end if;

  -- 2) La cuenta del cliente, según la regla del user.
  if v_tiene_mcc and v_congelada then
    -- Ya cobrado o certificado: el renglón NO se toca (el candado
    -- fn_mcc_congelada lo impediría igual, y está bien: al cliente ya se le
    -- cobró eso). El crédito va aparte.
    v_monto := round(p_cantidad * v_mcc.precio_unit, 2);
    insert into public.cuenta_cliente_notas_credito
      (obra_cod, item_id, fecha, cantidad, unidad, descripcion, precio_unit, monto, motivo, created_by, updated_by)
    values
      (v_item.obra, p_item_id, current_date, p_cantidad, coalesce(v_mcc.unidad, v_item.unidad),
       v_mcc.descripcion, v_mcc.precio_unit, v_monto,
       coalesce(nullif(btrim(p_motivo), ''), 'Material devuelto al depósito'),
       p_user_id, p_user_id)
    returning id into v_nota_id;

  elsif v_tiene_mcc then
    -- Todavía no cobrado: se descuenta de lo enviado, que es lo que pidió el
    -- user. Se baja el RENGLÓN además de la cuenta, porque editarItem
    -- recalcula precio_total = cantidad x precio_unit y una edición posterior
    -- borraría el ajuste si solo tocáramos la cuenta.
    if v_resto = 0 then
      delete from public.materiales_a_cuenta_cliente where id = v_mcc.id;
    else
      update public.materiales_a_cuenta_cliente
         set cantidad     = v_resto,
             precio_total = round(v_resto * precio_unit, 2),
             updated_by   = p_user_id,
             updated_at   = now()
       where id = v_mcc.id;
    end if;
  end if;

  -- 3) El renglón, salvo que el crédito ya haya cubierto el caso.
  if not v_congelada then
    update public.solicitud_compra_item
       set cantidad         = v_resto,
           cantidad_enviada = least(cantidad_enviada, v_resto),
           updated_by       = coalesce(p_user_id, updated_by)
     where id = p_item_id;
  end if;

  -- 4) Rastro.
  -- estado_anterior/estado_nuevo son NOT NULL. Una devolución NO cambia el
  -- estado del renglón (sigue comprado/despachado/enviado), así que van los
  -- dos con el mismo valor: lo que cambia es la cantidad, que va aparte.
  insert into public.solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'devuelto', v_item.estado, v_item.estado, p_cantidad,
     nullif(btrim(p_motivo), ''),
     jsonb_build_object(
       'obra_cod',    v_item.obra,
       'congelada',   v_congelada,
       'nota_credito_id', v_nota_id,
       'cantidad_antes',  v_item.cantidad,
       'cantidad_despues', case when v_congelada then v_item.cantidad else v_resto end),
     p_user_id);

  return jsonb_build_object(
    'item_id',         p_item_id,
    'devuelto',        p_cantidad,
    'saldo_a_favor',   v_congelada,
    'nota_credito_id', v_nota_id,
    'monto_credito',   v_monto,
    'cantidad_restante', case when v_congelada then v_item.cantidad else v_resto end);
end;
$function$;

-- SECURITY DEFINER: solo el backend la ejecuta (§9, migración 20260527).
revoke all on function public.devolver_material(integer, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.devolver_material(integer, numeric, text, uuid) to service_role;
