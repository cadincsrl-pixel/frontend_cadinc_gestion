-- Consumible propio: lo que pone CADINC para ejecutar, en una obra que por lo
-- demás se le factura al cliente
--
-- Pedido del dueño (14/09): "tenemos obras donde tenemos presupuesto cerrado de
-- la mano de obra pero registramos qué materiales ponemos nosotros como
-- consumibles propios para ejecutar los trabajos, y materiales que por ahí
-- mandamos que sí le tenemos que cobrar al cliente". Y sobre cuáles son:
-- "discos de corte algunas maderas o cosas que yo te marcaría".
--
-- O sea: lo marca UNA PERSONA, caso por caso, renglón por renglón. No es una
-- regla automática por rubro ni por ficha.
--
-- LA MARCA VA EN EL RENGLÓN DEL PEDIDO, NO EN LA LÍNEA DE LA CUENTA.
-- Motivo práctico: si un renglón se revierte y se vuelve a resolver, la fila de
-- materiales_a_cuenta_cliente se borra y se crea de nuevo. Una marca puesta ahí
-- se perdería sin que nadie se entere y el material volvería a la deuda del
-- cliente. En el renglón del pedido sobrevive a todo el ciclo.
--
-- CÓMO SOBREVIVE AL RECÁLCULO, que era el problema de fondo.
-- No se blinda la marca CONTRA el recálculo: se la mete ADENTRO. Hay un solo
-- lugar en toda la base que decide quién paga un renglón, calc_a_cargo_de(), y
-- los tres escritores de a_cargo_de le preguntan a ella (fn_mcc_a_cargo_de,
-- fn_obras_recalc_a_cargo_de y el nuevo de acá). Si la función aprende a leer la
-- marca, el recálculo deja de ser la amenaza y pasa a ser la garantía: cuanto
-- más se recalcula, más firme queda.
--
-- ORDEN DE LAS REGLAS, y por qué este y no otro:
--   1. EPP        -> 'cadinc' SIEMPRE, en toda obra. Confirmado por el dueño:
--                    "epp siempre es gastos propios", también en administración.
--   2. llave en mano -> 'cadinc'. Como hoy.
--   3. por administración -> 'cliente'. BLINDAJE: ahí se factura todo con %, así
--                    que la marca de consumible NO aplica, y queda impedido en la
--                    base y no sólo en la pantalla. Si una obra pasa a
--                    administración con consumibles ya marcados, el trigger de
--                    obras los devuelve solos a la cuenta del cliente.
--   4. consumible -> 'cadinc'. LA REGLA NUEVA.
--   5. resto      -> 'cliente'. Como hoy.
-- Los pasos 1 y 2 estaban invertidos respecto del original (antes miraba primero
-- la obra y después el EPP); da el mismo resultado en los dos casos, porque una
-- obra llave en mano ya mandaba todo a 'cadinc'. Se verifica abajo fila por fila.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La marca, en el renglón del pedido
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.solicitud_compra_item
  add column if not exists consumible_propio boolean not null default false,
  add column if not exists consumible_motivo text,
  add column if not exists consumible_por    uuid,
  add column if not exists consumible_en     timestamptz;

comment on column public.solicitud_compra_item.consumible_propio is
  'Lo pone CADINC para ejecutar la tarea y NO se le cobra al cliente (discos de '
  'corte, maderas de encofrado). Se marca a mano desde la cuenta corriente. Sólo '
  'aplica en obras de presupuesto cerrado: en las de administración se factura '
  'todo y en las llave en mano ya es todo gasto propio. Lo lee calc_a_cargo_de().';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La única función que decide quién paga un renglón
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.calc_a_cargo_de(p_obra_cod text, p_item_id integer)
returns text
language sql
stable
as $function$
  select case
           -- 1. El EPP es de CADINC en toda obra, siempre.
           when (select m.clase from public.solicitud_compra_item i
                   left join public.stock_materiales m on m.id = i.material_id
                  where i.id = p_item_id) = 'epp' then 'cadinc'
           -- 2. Llave en mano: todo el material lo pone CADINC.
           when (select materiales_a_cargo_de from public.obras where cod = p_obra_cod) = 'cadinc' then 'cadinc'
           -- 3. Por administración: se factura todo con %, la marca no aplica.
           when (select por_administracion from public.obras where cod = p_obra_cod) then 'cliente'
           -- 4. Consumible propio marcado a mano.
           when (select consumible_propio from public.solicitud_compra_item where id = p_item_id) then 'cadinc'
           else 'cliente'
         end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. El recálculo cuando cambia la marca del renglón
--    Sin esto se tilda la marca, se ve en pantalla, y no se mueve un peso.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_item_recalc_a_cargo_de()
returns trigger
language plpgsql
as $function$
begin
  update public.materiales_a_cuenta_cliente c
     set a_cargo_de = public.calc_a_cargo_de(c.obra_cod, c.item_id),
         updated_at = now()
   where c.item_id = new.id
     and c.cobro_id is null
     and c.certificado_id is null
     and c.a_cargo_de is distinct from public.calc_a_cargo_de(c.obra_cod, c.item_id);
  return null;
end $function$;

drop trigger if exists trg_item_recalc_a_cargo_de on public.solicitud_compra_item;
create trigger trg_item_recalc_a_cargo_de
  after update of consumible_propio, material_id on public.solicitud_compra_item
  for each row
  when (old.consumible_propio is distinct from new.consumible_propio
     or old.material_id      is distinct from new.material_id)
  execute function public.fn_item_recalc_a_cargo_de();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El candado: no se marca ni se desmarca lo que ya está cobrado o certificado
--    Vale también por SQL, no sólo desde la pantalla.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_item_consumible_congelado()
returns trigger
language plpgsql
as $function$
declare
  v_cobro integer;
  v_cert  integer;
begin
  select max(cobro_id), max(certificado_id) into v_cobro, v_cert
    from public.materiales_a_cuenta_cliente
   where item_id = new.id;
  if v_cobro is not null then
    raise exception 'MCC_COBRADO' using errcode = 'P0001', detail = v_cobro::text;
  end if;
  if v_cert is not null then
    raise exception 'MCC_CERTIFICADO' using errcode = 'P0001', detail = v_cert::text;
  end if;
  return new;
end $function$;

drop trigger if exists trg_item_consumible_congelado on public.solicitud_compra_item;
create trigger trg_item_consumible_congelado
  before update of consumible_propio on public.solicitud_compra_item
  for each row
  when (old.consumible_propio is distinct from new.consumible_propio)
  execute function public.fn_item_consumible_congelado();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. El recálculo por obra: ahora también escucha "por administración", y
--    respeta lo CERTIFICADO además de lo cobrado.
--    Lo segundo es un arreglo de algo que ya estaba mal: cambiarle la modalidad
--    a una obra podía sacar un renglón de un certificado que el cliente ya tiene
--    en la mano. Hoy hay cero certificados emitidos, así que no mueve una fila;
--    después del primero deja de ser gratis.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_obras_recalc_a_cargo_de()
returns trigger
language plpgsql
as $function$
begin
  update public.materiales_a_cuenta_cliente c
     set a_cargo_de = public.calc_a_cargo_de(c.obra_cod, c.item_id)
   where c.obra_cod = new.cod
     and c.cobro_id is null
     and c.certificado_id is null
     and c.a_cargo_de is distinct from public.calc_a_cargo_de(c.obra_cod, c.item_id);
  return null;
end $function$;

drop trigger if exists trg_obras_recalc_a_cargo_de on public.obras;
create trigger trg_obras_recalc_a_cargo_de
  after update of materiales_a_cargo_de, por_administracion on public.obras
  for each row
  when (old.materiales_a_cargo_de is distinct from new.materiales_a_cargo_de
     or old.por_administracion    is distinct from new.por_administracion)
  execute function public.fn_obras_recalc_a_cargo_de();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. El agujero del faltante: comprar_faltante_item clona el renglón y hasta
--    ahora no copiaba la marca, así que el faltante volvía a facturarse al
--    cliente. Se copia junto con clase, devuelve y color, que ya se copiaban.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.comprar_faltante_item(p_item_id integer, p_user_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item      solicitud_compra_item%rowtype;
  v_efectiva  numeric;
  v_enviada   numeric;
  v_faltante  numeric;
  v_mcc_cobro integer;
  v_nuevo_id  integer;
begin
  select * into v_item
    from solicitud_compra_item
   where id = p_item_id
   for update;

  if not found then
    raise exception 'ITEM_NO_EXISTE';
  end if;
  if v_item.estado <> 'de_deposito' then
    raise exception 'ITEM_NO_DE_DEPOSITO';
  end if;

  v_efectiva := coalesce(v_item.cantidad_comprada, v_item.cantidad);
  v_enviada  := coalesce(v_item.cantidad_enviada, 0);
  v_faltante := v_efectiva - v_enviada;

  if v_enviada <= 0 then
    raise exception 'SIN_ENVIOS';
  end if;
  if v_faltante <= 0 then
    raise exception 'ITEM_COMPLETO';
  end if;

  select cobro_id into v_mcc_cobro
    from materiales_a_cuenta_cliente
   where item_id = p_item_id and cobro_id is not null;
  if found then
    raise exception 'ITEM_COBRADO' using detail = v_mcc_cobro::text;
  end if;

  if v_item.material_id is not null then
    update stock_materiales
       set stock_actual = stock_actual + v_faltante,
           updated_by   = p_user_id,
           updated_at   = now()
     where id = v_item.material_id;

    update stock_movimientos
       set cantidad = greatest(cantidad - v_faltante, 0)
     where solicitud_item_id = p_item_id
       and tipo = 'salida'
       and motivo = 'despacho_obra';
  end if;

  update solicitud_compra_item
     set cantidad          = v_enviada,
         cantidad_comprada = null,
         estado            = 'enviado',
         fecha_envio       = current_date,
         updated_by        = p_user_id
   where id = p_item_id;

  update materiales_a_cuenta_cliente
     set cantidad     = v_enviada,
         precio_total = case when precio_unit is not null then v_enviada * precio_unit end,
         updated_by   = p_user_id
   where item_id = p_item_id and cobro_id is null;

  -- El faltante HEREDA clase y devuelve del original: si era herramienta, el
  -- renglon nuevo tambien lo es, y por lo tanto tampoco se factura.
  -- Y desde 20260914aa hereda tambien la marca de consumible propio: si el
  -- original era gasto de CADINC, el faltante que se compra tambien lo es.
  insert into solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, material_id, estado, obs, clase, devuelve, color,
     consumible_propio, consumible_motivo, consumible_por, consumible_en)
  values
    (v_item.solicitud_id, v_item.descripcion, v_faltante, v_item.unidad,
     v_item.material_id, 'pendiente',
     format('Faltante de depósito del renglón #%s — a comprar', p_item_id),
     v_item.clase, v_item.devuelve, v_item.color,
     v_item.consumible_propio, v_item.consumible_motivo, v_item.consumible_por, v_item.consumible_en)
  returning id into v_nuevo_id;

  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  values
    (p_item_id, v_item.solicitud_id, 'enviado', 'de_deposito', 'enviado', v_enviada,
     format('Partido: %s enviadas de depósito, %s pasan a compra (ítem #%s)', v_enviada, v_faltante, v_nuevo_id),
     jsonb_build_object('split_nuevo_item_id', v_nuevo_id, 'faltante', v_faltante), p_user_id),
    (v_nuevo_id, v_item.solicitud_id, 'creado', null, 'pendiente', v_faltante,
     format('Creado por faltante de depósito del ítem #%s', p_item_id),
     jsonb_build_object('split_item_origen_id', p_item_id), p_user_id);

  return jsonb_build_object(
    'item_original_id', p_item_id,
    'enviada',          v_enviada,
    'nuevo_item_id',    v_nuevo_id,
    'faltante',         v_faltante
  );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. La única puerta para marcar: transaccional, todo o nada
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.marcar_consumible_propio(
  p_obra_cod  text,
  p_item_ids  integer[],
  p_marcar    boolean,
  p_motivo    text    default null,
  p_user_id   uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_obra    obras%rowtype;
  v_n       integer := 0;
  v_plata   numeric := 0;
  v_pedidos integer := coalesce(array_length(p_item_ids, 1), 0);
  r         record;
begin
  if v_pedidos = 0 then
    raise exception 'SIN_ITEMS' using errcode = 'P0001';
  end if;

  -- Mismo candado de obra que usan emitir certificado y registrar cobro, para
  -- que dos operaciones sobre la misma obra no se pisen.
  select * into v_obra from obras where cod = p_obra_cod for update;
  if not found then
    raise exception 'OBRA_NO_EXISTE' using errcode = 'P0001';
  end if;
  if v_obra.por_administracion then
    raise exception 'OBRA_POR_ADMINISTRACION' using errcode = 'P0001';
  end if;
  if coalesce(v_obra.materiales_a_cargo_de, 'cliente') = 'cadinc' then
    raise exception 'OBRA_LLAVE_EN_MANO' using errcode = 'P0001';
  end if;

  -- Validación completa ANTES de escribir: si uno solo no se puede, no se
  -- marca ninguno y el que tildó vuelve a la lista sin sorpresas.
  for r in
    select i.id, c.precio_total, c.pagado_por, c.cobro_id, c.certificado_id, m.clase
      from solicitud_compra_item i
      join materiales_a_cuenta_cliente c on c.item_id = i.id
      left join stock_materiales m on m.id = i.material_id
     where i.id = any(p_item_ids)
       and c.obra_cod = p_obra_cod
     order by i.id
     for no key update of i
  loop
    if r.cobro_id is not null then
      raise exception 'MCC_COBRADO' using errcode = 'P0001', detail = r.id::text;
    end if;
    if r.certificado_id is not null then
      raise exception 'MCC_CERTIFICADO' using errcode = 'P0001', detail = r.id::text;
    end if;
    -- Pago directo: el cliente ya le pagó al proveedor, no salió de la caja de
    -- CADINC. Marcarlo no sacaría nada de la deuda porque ya está afuera.
    if r.pagado_por = 'cliente' then
      raise exception 'ITEM_PAGO_DIRECTO' using errcode = 'P0001', detail = r.id::text;
    end if;
    -- El EPP ya es gasto propio por su clase; marcarlo lo contaría como
    -- consumible y ensuciaría el motivo.
    if r.clase = 'epp' then
      raise exception 'ITEM_ES_EPP' using errcode = 'P0001', detail = r.id::text;
    end if;
    v_n     := v_n + 1;
    v_plata := v_plata + coalesce(r.precio_total, 0);
  end loop;

  if v_n <> v_pedidos then
    raise exception 'ITEM_NO_ES_DE_LA_OBRA'
      using errcode = 'P0001',
            detail = format('pedidos=%s validos=%s', v_pedidos, v_n);
  end if;

  update solicitud_compra_item
     set consumible_propio = p_marcar,
         consumible_motivo = case when p_marcar then nullif(btrim(coalesce(p_motivo, '')), '') end,
         consumible_por    = case when p_marcar then p_user_id end,
         consumible_en     = case when p_marcar then now() end,
         updated_by        = p_user_id
   where id = any(p_item_ids)
     and consumible_propio is distinct from p_marcar;

  -- estado_anterior/estado_nuevo son NOT NULL y acá el estado del renglón NO
  -- cambia: marcar un consumible no lo mueve de 'comprado' ni de 'enviado'.
  -- Se repite el estado actual, que es la verdad, en vez de inventar uno.
  insert into solicitud_item_eventos
    (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
  select i.id, i.solicitud_id,
         case when p_marcar then 'consumible_marcado' else 'consumible_desmarcado' end,
         i.estado, i.estado,
         i.cantidad,
         case when p_marcar
              then coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Consumible propio de CADINC')
              else 'Vuelve a la cuenta del cliente' end,
         jsonb_build_object('obra_cod', p_obra_cod, 'precio_total', c.precio_total),
         p_user_id
    from solicitud_compra_item i
    join materiales_a_cuenta_cliente c on c.item_id = i.id
   where i.id = any(p_item_ids) and c.obra_cod = p_obra_cod;

  return jsonb_build_object(
    'obra_cod',  p_obra_cod,
    'marcados',  v_n,
    'marcar',    p_marcar,
    'plata',     round(v_plata, 2)
  );
end;
$function$;

-- Solo el backend. `revoke from public` NO alcanza: este proyecto tiene default
-- privileges que le dan EXECUTE a anon y a authenticated sobre las funciones
-- nuevas, asi que hay que nombrarlos. Es SECURITY DEFINER y mueve plata: sin
-- esto, cualquiera con la anon key la llamaba por PostgREST y se saltaba las
-- guardias de permiso del backend. Verificado con has_function_privilege contra
-- las otras SECURITY DEFINER del modulo, que estan todas en false/false/true.
revoke all on function public.marcar_consumible_propio(text, integer[], boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.marcar_consumible_propio(text, integer[], boolean, text, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. La vista: el motivo del gasto propio ahora conoce cuatro casos y no dos.
--    Hasta hoy 200 renglones de obras internas figuraban como "llave en mano".
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_cuenta_corriente as
 SELECT c.id,
    c.obra_cod,
    COALESCE(o.nom, c.obra_cod) AS obra_nom,
    COALESCE(o.archivada, false) AS obra_archivada,
    COALESCE(o.materiales_a_cargo_de, 'cliente'::text) AS obra_modalidad,
    c.solicitud_id,
    c.item_id,
    c.descripcion,
    c.cantidad,
    c.unidad,
    c.precio_unit,
    c.precio_total,
    c.origen,
    c.proveedor_id,
    p.nombre AS proveedor_nom,
    c.factura_id,
    f.numero AS factura_numero,
    f.adjunto_url AS factura_adjunto_url,
    f.fecha AS factura_fecha,
    c.fecha_resolucion,
    to_char(c.fecha_resolucion::timestamp with time zone, 'YYYY-MM'::text) AS mes,
    c.pagado_por,
    c.a_cargo_de,
    c.cobro_id,
    c.monto_cobrado,
    i.estado AS item_estado,
    i.material_id,
    m.clase,
    m.rubro_id,
    r.nombre AS rubro_nom,
        CASE
            WHEN m.clase = 'epp'::text THEN 'epp'::text
            WHEN i.consumible_propio THEN 'consumible'::text
            ELSE 'material'::text
        END AS tipo,
        CASE
            WHEN c.pagado_por = 'cliente'::text THEN 'pago_directo'::text
            WHEN c.a_cargo_de = 'cadinc'::text THEN 'gasto_cadinc'::text
            WHEN c.cobro_id IS NOT NULL THEN 'cobrado'::text
            ELSE 'a_cobrar'::text
        END AS estado,
        CASE
            WHEN c.a_cargo_de <> 'cadinc'::text THEN NULL::text
            WHEN m.clase = 'epp'::text THEN 'epp'::text
            WHEN i.consumible_propio THEN 'consumible'::text
            WHEN COALESCE(o.es_interna, false) THEN 'obra_interna'::text
            ELSE 'llave_en_mano'::text
        END AS motivo_cadinc,
    norm_txt((((((((((c.descripcion || ' '::text) || COALESCE(p.nombre, ''::text)) || ' '::text) || COALESCE(o.nom, ''::text)) || ' '::text) || c.obra_cod) || ' '::text) || c.solicitud_id::text) || ' '::text) || COALESCE(f.numero, ''::text)) AS busq,
    c.created_at,
    c.updated_at,
    COALESCE(o.es_interna, false) AS obra_interna,
    c.certificado_id,
    cc.numero AS certificado_numero,
    i.esperando_precio,
    m.precio_ref AS ficha_precio_ref,
    m.unidad AS ficha_unidad,
        CASE
            WHEN m.id IS NULL THEN NULL::boolean
            ELSE unidad_compatible(c.unidad, m.unidad)
        END AS ficha_unidad_ok,
    i.precio_propuesto,
    i.precio_propuesto_por,
    i.precio_propuesto_en,
    i.precio_propuesto_obs,
    -- Van al FINAL a propósito: create or replace view sólo admite AGREGAR
    -- columnas al final; meterlas en el medio da 42P16 "cannot change name of
    -- view column".
    i.consumible_propio,
    i.consumible_motivo
   FROM materiales_a_cuenta_cliente c
     JOIN solicitud_compra_item i ON i.id = c.item_id
     LEFT JOIN obras o ON o.cod = c.obra_cod
     LEFT JOIN stock_materiales m ON m.id = i.material_id
     LEFT JOIN stock_rubros r ON r.id = m.rubro_id
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     LEFT JOIN facturas_compra f ON f.id = c.factura_id
     LEFT JOIN certificados_cliente cc ON cc.id = c.certificado_id;
