-- =====================================================================
-- 20260929b — Productos de venta: catálogo editable (2026-09-25)
--
-- Tanda 6, ítem 2 (spec «configuración del ERP desde la pantalla» §3.2).
-- La spec reservaba la letra c; se usó la b porque era la siguiente libre
-- (el ítem 4, ventas_config + parámetros, toma la letra que siga).
--
-- 1) `ventas_productos`: el catálogo (nombre, concepto ARCA 1/2/3, si pide
--    obra, si pide período de servicio, activo, orden). Semilla = los dos
--    de hoy con los MISMOS ids que usa el frontend como fallback:
--      1 AVANCE DE OBRA  concepto 3, pide obra   (como conceptoDe() de reglas.ts)
--      2 TRANSPORTE      concepto 2, obra opcional
-- 2) `ventas_facturas`: producto_id (FK), fch_serv_desde/hasta (período de
--    servicio, opcional; solo concepto 2/3). `producto` (texto) queda como
--    FOTO del nombre al guardar. Se saca el CHECK que cerraba la lista.
--    Trigger `trg_ventas_factura_producto_id`: si alguien inserta o edita un
--    borrador sin id (backend viejo), lo completa desde el texto.
--    Backfill de las 18 autorizadas con el escape `cadinc.descongelar`:
--    motivo = la columna es nueva y el valor sale del texto que ya tienen,
--    no cambia nada fiscal (el guard compara to_jsonb completo y si no
--    las trabaría).
-- 3) `ventas_guardar_borrador`: parches por ancla sobre la definición viva
--    (resuelve producto por id o por nombre; PRODUCTO_INVALIDO /
--    PRODUCTO_INACTIVO; obra según pide_obra; concepto del catálogo;
--    período con PERIODO_REQUERIDO / PERIODO_INVALIDO; guarda las columnas).
--    `v_ventas_facturas` suma producto_id y el período AL FINAL.
-- 4) Motor contable: `ventas.producto` pasa de subclave fija por texto a
--    subclave = id del producto (reglas, validación, etiqueta, listado,
--    en uso y propuesta). Los 2 mapeos se migran EN EL LUGAR (update de la
--    subclave: conservan id, cuenta y autor; queda en la auditoría). Las
--    líneas de la propuesta no llevan subclave, así que el hash de los
--    asientos existentes no cambia (verificado en la vista previa).
-- 5) RPCs `ventas_productos_json(p_incluir_inactivos)` y
--    `ventas_guardar_producto(p, p_user_id)` (flag facturacion.configurar).
-- =====================================================================

create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

-- ── 1) Catálogo ─────────────────────────────────────────────────────────
create table public.ventas_productos (
  id            bigserial primary key,
  nombre        text not null check (length(btrim(nombre)) between 2 and 100),
  descripcion   text not null default '' check (length(descripcion) <= 500),
  concepto_arca smallint not null check (concepto_arca in (1, 2, 3)),
  pide_obra     boolean not null default false,
  pide_periodo  boolean not null default false,
  activo        boolean not null default true,
  orden         smallint not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid
);
create unique index ventas_productos_nombre_uidx on public.ventas_productos (public.norm_txt(nombre));

comment on table public.ventas_productos is
  'Productos de venta (Ventas › Configuración). Definen el concepto ARCA, si piden obra y período de servicio. Se escriben solo por ventas_guardar_producto(). Sin DELETE: se desactivan.';

insert into public.ventas_productos (id, nombre, descripcion, concepto_arca, pide_obra, pide_periodo, orden) values
  (1, 'AVANCE DE OBRA', 'Certificados de avance de obra. La obra es obligatoria (es el centro de costo).', 3, true,  false, 10),
  (2, 'TRANSPORTE',     'Fletes de logística. La obra es opcional.',                                      2, false, false, 20);
select setval(pg_get_serial_sequence('public.ventas_productos', 'id'), 2);

create trigger trg_ventas_productos_touch before update on public.ventas_productos
  for each row execute function public.set_updated_at();
create trigger trg_audit_cambios after update on public.ventas_productos
  for each row execute function public.audit_cambios('facturacion', 'producto de venta', 'id');

alter table public.ventas_productos enable row level security;
create policy ventas_productos_all on public.ventas_productos for all using (true) with check (true);
revoke all on table public.ventas_productos from public, anon, authenticated;
grant all on table public.ventas_productos to service_role;
revoke all on sequence public.ventas_productos_id_seq from public, anon, authenticated;
grant all on sequence public.ventas_productos_id_seq to service_role;

-- ── 2) Facturas: id del producto y período de servicio ──────────────────
alter table public.ventas_facturas
  add column producto_id    bigint references public.ventas_productos(id),
  add column fch_serv_desde date,
  add column fch_serv_hasta date,
  add constraint ventas_facturas_periodo_chk check (
    (fch_serv_desde is null) = (fch_serv_hasta is null)
    and (fch_serv_desde is null or (concepto in (2, 3) and fch_serv_desde <= fch_serv_hasta)));
create index ventas_facturas_producto_id_idx on public.ventas_facturas (producto_id);

comment on column public.ventas_facturas.producto is
  'Foto del nombre del producto al guardar el borrador. El vínculo es producto_id.';

-- Backfill (18 autorizadas al 25/09). Ver motivo del escape en el encabezado.
do $b$
begin
  perform set_config('cadinc.descongelar', 'on', true);
  update public.ventas_facturas f
     set producto_id = p.id
    from public.ventas_productos p
   where f.producto_id is null and public.norm_txt(p.nombre) = public.norm_txt(f.producto);
  perform set_config('cadinc.descongelar', 'off', true);
  if exists (select 1 from public.ventas_facturas where producto_id is null) then
    raise exception 'BACKFILL_INCOMPLETO: % facturas sin producto_id',
      (select count(*) from public.ventas_facturas where producto_id is null);
  end if;
end $b$;

alter table public.ventas_facturas drop constraint ventas_facturas_producto_check;

-- Compatibilidad: quien inserte o edite un borrador mandando solo el texto
-- (backend viejo, o una RPC sin parchear) igual queda con el id. No toca
-- autorizadas (el guard corre antes y ya las protege).
create or replace function public.fn_ventas_factura_producto_id()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if (tg_op = 'INSERT' or new.estado = 'borrador')
     and new.producto_id is null and nullif(btrim(new.producto), '') is not null then
    select p.id into new.producto_id
      from public.ventas_productos p
     where public.norm_txt(p.nombre) = public.norm_txt(new.producto);
  end if;
  return new;
end $$;

create trigger trg_ventas_factura_producto_id before insert or update on public.ventas_facturas
  for each row execute function public.fn_ventas_factura_producto_id();

-- ── 3) ventas_guardar_borrador: parches por ancla ───────────────────────
do $p$
declare
  v_def text := pg_get_functiondef('public.ventas_guardar_borrador(jsonb,jsonb,uuid,boolean)'::regprocedure);
begin
  v_def := pg_temp._una(v_def,
$a$  v_evento    text;
begin$a$,
$n$  v_evento    text;
  -- 20260929b: catálogo de productos y período de servicio.
  v_prod      public.ventas_productos%rowtype;
  v_prod_id   bigint := nullif(p_factura ->> 'producto_id', '')::bigint;
  v_serv_d    date   := nullif(p_factura ->> 'fch_serv_desde', '')::date;
  v_serv_h    date   := nullif(p_factura ->> 'fch_serv_hasta', '')::date;
begin$n$);

  v_def := pg_temp._una(v_def,
$a$  if v_producto not in ('AVANCE DE OBRA', 'TRANSPORTE') then
    raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('producto', v_producto)::text;
  end if;$a$,
$n$  -- 20260929b: el producto sale del catálogo. Por id si viene; si no, por el
  -- nombre (backend viejo: default AVANCE DE OBRA).
  if v_prod_id is not null then
    select * into v_prod from public.ventas_productos where id = v_prod_id;
  else
    select * into v_prod from public.ventas_productos where public.norm_txt(nombre) = public.norm_txt(v_producto);
  end if;
  if v_prod.id is null then
    raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001',
      detail = json_build_object('campo', 'producto_id', 'producto', v_producto, 'producto_id', v_prod_id)::text;
  end if;
  if not v_prod.activo and v_prod.id is distinct from v_old.producto_id then
    raise exception 'PRODUCTO_INACTIVO' using errcode = 'P0001',
      detail = json_build_object('campo', 'producto_id', 'producto_id', v_prod.id, 'producto', v_prod.nombre)::text;
  end if;
  v_producto := v_prod.nombre;$n$);

  v_def := pg_temp._una(v_def,
    $a$if v_producto = 'AVANCE DE OBRA' and v_obra is null then$a$,
    $n$if v_prod.pide_obra and v_obra is null then$n$);

  v_def := pg_temp._una(v_def,
    $a$case when v_producto = 'TRANSPORTE' then 2 else 3 end$a$,
    $n$v_prod.concepto_arca$n$);

  v_def := pg_temp._una(v_def,
$a$  perform public._ventas_validar_fecha(v_id, v_amb, v_pv, v_tipo, v_concepto, v_fecha);$a$,
$n$  perform public._ventas_validar_fecha(v_id, v_amb, v_pv, v_tipo, v_concepto, v_fecha);

  -- 20260929b: período de servicio (FchServDesde/Hasta de ARCA). Con
  -- concepto 1 no existe; con 2/3 es opcional salvo que el producto lo pida.
  if v_concepto = 1 then
    v_serv_d := null;
    v_serv_h := null;
  else
    if (v_serv_d is null) <> (v_serv_h is null) or (v_prod.pide_periodo and v_serv_d is null) then
      raise exception 'PERIODO_REQUERIDO' using errcode = 'P0001',
        detail = json_build_object('campo', case when v_serv_d is null then 'fch_serv_desde' else 'fch_serv_hasta' end)::text;
    end if;
    if v_serv_d > v_serv_h then
      raise exception 'PERIODO_INVALIDO' using errcode = 'P0001',
        detail = json_build_object('campo', 'fch_serv_hasta', 'desde', v_serv_d, 'hasta', v_serv_h)::text;
    end if;
  end if;$n$);

  v_def := pg_temp._una(v_def,
    $a$      obra_cod, producto, centro_costo, provincia_origen, provincia_destino, condicion_pago,$a$,
    $n$      obra_cod, producto, producto_id, fch_serv_desde, fch_serv_hasta, centro_costo, provincia_origen, provincia_destino, condicion_pago,$n$);

  v_def := pg_temp._una(v_def,
    $a$      v_obra, v_producto, v_cc,$a$,
    $n$      v_obra, v_producto, v_prod.id, v_serv_d, v_serv_h, v_cc,$n$);

  v_def := pg_temp._una(v_def,
    $a$obra_cod = v_obra, producto = v_producto, centro_costo = v_cc,$a$,
    $n$obra_cod = v_obra, producto = v_producto, producto_id = v_prod.id,
      fch_serv_desde = v_serv_d, fch_serv_hasta = v_serv_h, centro_costo = v_cc,$n$);

  execute v_def;
end $p$;

-- La vista suma las columnas nuevas AL FINAL (create or replace lo exige).
do $v$
declare
  v_def text := pg_get_viewdef('public.v_ventas_facturas'::regclass, true);
begin
  v_def := pg_temp._una(v_def,
    $a$s.dias_vencido AS cobro_dias_vencido$a$,
    $n$s.dias_vencido AS cobro_dias_vencido,
    f.producto_id,
    f.fch_serv_desde,
    f.fch_serv_hasta$n$);
  execute 'create or replace view public.v_ventas_facturas with (security_invoker = true) as ' || v_def;
end $v$;

-- ── 4) Motor contable: ventas.producto por id ───────────────────────────
do $m$
declare v_def text;
begin
  -- Regla: subclave = id del catálogo.
  v_def := pg_get_functiondef('public._cont_mapeo_reglas()'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$"descripcion":"Ingreso de las facturas emitidas desde el ERP, por producto.","rubros":["ingreso"],"auxiliares":["none"],"subclave_tipo":"fija","subclaves":["AVANCE DE OBRA","TRANSPORTE"]$a$,
    $n$"descripcion":"Ingreso de las facturas emitidas desde el ERP, por producto (el catálogo de Ventas › Configuración › Productos). Un producto sin mapeo deja sus facturas pendientes.","rubros":["ingreso"],"auxiliares":["none"],"subclave_tipo":"producto_venta","subclaves":[]$n$);
  execute v_def;

  -- Validación de la subclave.
  v_def := pg_get_functiondef('public._cont_subclave_valida(text,text)'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$    when 'cliente' then$a$,
$n$    when 'producto_venta' then
      return p_sub ~ '^[0-9]{1,18}$' and exists (select 1 from public.ventas_productos p where p.id = p_sub::bigint);
    when 'cliente' then$n$);
  execute v_def;

  -- Etiqueta: el nombre del producto (+ « (baja)»).
  v_def := pg_get_functiondef('public._cont_subclave_etiqueta(text,text)'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$    when p_clave = 'ventas.cliente' then$a$,
$n$    when p_clave = 'ventas.producto' then
      coalesce((select p.nombre || case when p.activo then '' else ' (baja)' end
                  from public.ventas_productos p where p_sub ~ '^[0-9]{1,18}$' and p.id = p_sub::bigint), 'Producto ' || p_sub)
    when p_clave = 'ventas.cliente' then$n$);
  execute v_def;

  -- Listado: todos los productos del catálogo, ordenados por nombre.
  v_def := pg_get_functiondef('public.cont_mapeos_listar()'::regprocedure);
  v_def := pg_temp._una(v_def,
$a$      union select c.id::text from public.tesoreria_conceptos c where r ->> 'clave' = 'fondos.concepto'$a$,
$n$      union select c.id::text from public.tesoreria_conceptos c where r ->> 'clave' = 'fondos.concepto'
      union select p.id::text from public.ventas_productos p where r ->> 'clave' = 'ventas.producto'$n$);
  v_def := pg_temp._una(v_def,
    $a$case when r ->> 'clave' = 'ventas.cliente' then$a$,
    $n$case when r ->> 'clave' in ('ventas.cliente', 'ventas.producto') then$n$);
  execute v_def;

  -- En uso: por id.
  v_def := pg_get_functiondef('public._cont_mapeo_en_uso(text,text,date)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$v.fecha_cbte >= p_desde and v.producto = p_sub;$a$,
    $n$v.fecha_cbte >= p_desde and v.producto_id::text = p_sub;$n$);
  execute v_def;

  -- Propuesta de la factura de venta: id y, si faltara, el texto.
  v_def := pg_get_functiondef('public._cont_prop_venta_factura(bigint)'::regprocedure);
  v_def := pg_temp._una(v_def,
    $a$else array[v.producto] end$a$,
    $n$else array_remove(array[v.producto_id::text, v.producto], null) end$n$);
  execute v_def;
end $m$;

-- Los 2 mapeos de texto pasan a id, en el lugar.
update public.cont_mapeos m
   set subclave = p.id::text
  from public.ventas_productos p
 where m.clave = 'ventas.producto' and m.subclave = p.nombre;

do $c$
begin
  if exists (select 1 from public.cont_mapeos where clave = 'ventas.producto' and subclave !~ '^[0-9]+$') then
    raise exception 'MAPEO_PRODUCTO_SIN_MIGRAR';
  end if;
end $c$;

-- ── 5) RPCs del catálogo ────────────────────────────────────────────────
create or replace function public._ventas_producto_json(p_id bigint)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(p)
    || jsonb_build_object(
         'facturas', (select count(*) from public.ventas_facturas f where f.producto_id = p.id and f.estado <> 'descartada'),
         'mapeado',  exists (select 1 from public.cont_mapeos m where m.clave = 'ventas.producto' and m.subclave = p.id::text))
    from public.ventas_productos p
   where p.id = p_id
$$;

create or replace function public.ventas_productos_json(p_incluir_inactivos boolean default false)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(public._ventas_producto_json(p.id) order by p.orden, p.nombre, p.id), '[]'::jsonb)
    from public.ventas_productos p
   where p.activo or coalesce(p_incluir_inactivos, false)
$$;

create or replace function public.ventas_guardar_producto(p jsonb, p_user_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id   bigint := nullif(p ->> 'id', '')::bigint;
  v_row  public.ventas_productos%rowtype;
  v_k    text;
  v_v    jsonb;
  v_txt  text;
  v_otro bigint;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  if not public._ventas_flag(p_user_id, 'configurar', false) then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = json_build_object('flag', 'configurar')::text;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', null)::text;
  end if;

  -- Serializa las altas/bajas (la regla del último activo mira todo el catálogo).
  perform 1 from public.ventas_productos for update;

  if v_id is not null then
    select * into v_row from public.ventas_productos where id = v_id;
    if not found then
      raise exception 'PRODUCTO_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('producto_id', v_id)::text;
    end if;
  else
    if not (p ? 'nombre') then
      raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'nombre')::text;
    end if;
    if not (p ? 'concepto_arca') then
      raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'concepto_arca')::text;
    end if;
    v_row.descripcion := '';
    v_row.pide_obra := false;
    v_row.pide_periodo := false;
    v_row.activo := true;
    v_row.orden := 100;
  end if;

  for v_k, v_v in select key, value from jsonb_each(p) loop
    continue when v_k = 'id';
    if v_k = 'nombre' then
      v_txt := btrim(regexp_replace(coalesce(v_v #>> '{}', ''), '\s+', ' ', 'g'));
      if jsonb_typeof(v_v) <> 'string' or length(v_txt) not between 2 and 100 then
        raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.nombre := v_txt;
    elsif v_k = 'descripcion' then
      if jsonb_typeof(v_v) not in ('string', 'null') or length(coalesce(v_v #>> '{}', '')) > 500 then
        raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.descripcion := btrim(coalesce(v_v #>> '{}', ''));
    elsif v_k = 'concepto_arca' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') not in ('1', '2', '3') then
        raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.concepto_arca := (v_v #>> '{}')::smallint;
    elsif v_k in ('pide_obra', 'pide_periodo', 'activo') then
      if jsonb_typeof(v_v) <> 'boolean' then
        raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      case v_k
        when 'pide_obra'    then v_row.pide_obra    := (v_v #>> '{}')::boolean;
        when 'pide_periodo' then v_row.pide_periodo := (v_v #>> '{}')::boolean;
        else                     v_row.activo       := (v_v #>> '{}')::boolean;
      end case;
    elsif v_k = 'orden' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,4}$' then
        raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
      end if;
      v_row.orden := (v_v #>> '{}')::smallint;
    else
      raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', v_k)::text;
    end if;
  end loop;

  -- Concepto 1 (solo productos) no lleva período: no se puede pedir.
  if v_row.concepto_arca = 1 and v_row.pide_periodo then
    raise exception 'PRODUCTO_INVALIDO' using errcode = 'P0001', detail = json_build_object('campo', 'pide_periodo')::text;
  end if;

  select id into v_otro from public.ventas_productos
   where public.norm_txt(nombre) = public.norm_txt(v_row.nombre) and id is distinct from v_id;
  if v_otro is not null then
    raise exception 'PRODUCTO_DUPLICADO' using errcode = 'P0001', detail = json_build_object('existente_id', v_otro)::text;
  end if;

  if not v_row.activo and not exists (
       select 1 from public.ventas_productos where activo and id is distinct from v_id) then
    raise exception 'ULTIMO_PRODUCTO_ACTIVO' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.ventas_productos (nombre, descripcion, concepto_arca, pide_obra, pide_periodo, activo, orden, created_by, updated_by)
    values (v_row.nombre, v_row.descripcion, v_row.concepto_arca, v_row.pide_obra, v_row.pide_periodo, v_row.activo, v_row.orden,
            p_user_id, p_user_id)
    returning id into v_id;
  else
    update public.ventas_productos
       set nombre = v_row.nombre, descripcion = v_row.descripcion, concepto_arca = v_row.concepto_arca,
           pide_obra = v_row.pide_obra, pide_periodo = v_row.pide_periodo, activo = v_row.activo,
           orden = v_row.orden, updated_by = p_user_id
     where id = v_id;
  end if;

  return public._ventas_producto_json(v_id);
end $$;

-- ── 6) Grants ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'fn_ventas_factura_producto_id()',
    '_ventas_producto_json(bigint)',
    'ventas_productos_json(boolean)',
    'ventas_guardar_producto(jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
