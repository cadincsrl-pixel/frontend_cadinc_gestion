-- =====================================================================
-- Diego aprueba lo que carga (2026-09-21)
--
-- Decisión del dueño, con el problema a la vista: Diego es el ÚNICO aprobador
-- del sistema y el sistema no deja aprobar lo que cargó uno mismo, así que
-- cada factura que cargaba Diego quedaba trabada esperando al único admin.
-- Se le ofrecieron tres salidas (sumar a Alina como aprobadora, que Diego no
-- cargue, o dejarlo así) y eligió una cuarta: que se apruebe solo.
--
-- QUÉ CONTROL SE ESTÁ AFLOJANDO, escrito para que se entienda dentro de un
-- año: `NO_PUEDE_APROBAR_PROPIA` es la doble firma del circuito de pagos —
-- quien carga no aprueba. Con esto, para quien tenga el flag, la carga y la
-- aprobación pasan a ser la misma persona y el mismo acto. Lo que SIGUE en
-- pie es la otra mitad, que es la que cuida la plata de verdad:
-- `NO_PUEDE_PAGAR_PROPIA` y `NO_PUEDE_PAGAR_LO_QUE_APROBO` en
-- `_pagos_emitir_orden`. O sea: Diego puede dejar su factura lista para
-- pagar, pero NO puede pagarla. La plata sigue saliendo por Mariana.
--
-- No se afloja para todos: va un flag nuevo `aprobar_propias` (default
-- false), y sólo Diego lo recibe. El resto del sistema no cambia.
--
-- Se toca la RPC y no sólo el backend porque la regla vive en la base: el
-- backend adelanta el error al formulario, la RPC es la que manda (es la que
-- usa también el "Aprobar N" en lote, que llama a esta misma función).
-- =====================================================================

-- Espejo de `flagPagos()` del backend: permisos.pagos.<flag>, admin siempre
-- true, usuario inactivo siempre false.
create or replace function public._pagos_flag(
  p_user_id uuid,
  p_flag    text,
  p_default boolean default false
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  -- El coalesce de AFUERA no es decorativo: sin fila (usuario inexistente o
  -- borrado) el subselect da NULL, y `not NULL` es NULL, así que el `if` del
  -- que cuelga la regla no entraría por ninguna rama. Sin él, un uuid que no
  -- existe se colaba. Mismo patrón que `_pagos_es_admin`. Ante la duda, false.
  select coalesce((
    select case
             when coalesce(p.activo, true) = false then false
             when p.rol = 'admin'                  then true
             when p.permisos -> 'pagos' ? p_flag
               then coalesce((p.permisos -> 'pagos' ->> p_flag)::boolean, p_default)
             else p_default
           end
      from public.profiles p
     where p.id = p_user_id
  ), false)
$$;

revoke all on function public._pagos_flag(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public._pagos_flag(uuid, text, boolean) to service_role;

-- Misma función de antes; lo único que cambia es que el bloqueo de la propia
-- ahora cede ante el flag `aprobar_propias`.
create or replace function public.pagos_aprobar_factura(p_factura_id bigint, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_f        public.pagos_facturas%rowtype;
  v_es_admin boolean;
  v_activo   boolean;
begin
  if p_user_id is null then raise exception 'USUARIO_REQUERIDO' using errcode = 'P0001'; end if;
  v_es_admin := public._pagos_es_admin(p_user_id);
  select * into v_f from public.pagos_facturas where id = p_factura_id for update;
  if not found then
    raise exception 'FACTURA_NO_EXISTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.paga_cliente then
    raise exception 'FACTURA_PAGA_CLIENTE' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  select activo into v_activo from public.pagos_proveedores where id = v_f.proveedor_id;
  if not coalesce(v_activo, false) then
    raise exception 'PROVEEDOR_INACTIVO' using errcode = 'P0001', detail = json_build_object('proveedor_id', v_f.proveedor_id)::text;
  end if;
  -- 20260921f: la doble firma cede ante `aprobar_propias`. Sin el flag, la
  -- regla es la de siempre.
  if not v_es_admin and v_f.created_by = p_user_id
     and not public._pagos_flag(p_user_id, 'aprobar_propias', false) then
    raise exception 'NO_PUEDE_APROBAR_PROPIA' using errcode = 'P0001', detail = json_build_object('factura_id', p_factura_id)::text;
  end if;
  if v_f.estado = 'pendiente' then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update public.pagos_facturas
       set estado = 'aprobada', aprobada_por = p_user_id, aprobada_at = now(), updated_by = p_user_id
     where id = p_factura_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
  elsif v_f.estado = 'pagada' and v_f.pagada_al_cargar and v_f.aprobada_at is null then
    perform set_config('cadinc.pagos_aprobar', 'on', true);
    update public.pagos_facturas
       set aprobada_por = p_user_id, aprobada_at = now(), updated_by = p_user_id
     where id = p_factura_id;
    perform set_config('cadinc.pagos_aprobar', 'off', true);
  else
    raise exception 'FACTURA_NO_APROBABLE' using errcode = 'P0001',
      detail = json_build_object('factura_id', p_factura_id, 'estado', v_f.estado)::text;
  end if;
  return (select to_jsonb(v) from public.v_pagos_facturas v where v.id = p_factura_id);
end $function$;

-- El flag, sólo para Diego.
do $$
declare n integer;
begin
  update profiles
     set permisos      = jsonb_set(permisos, '{pagos,aprobar_propias}', 'true'::jsonb),
         personalizado = true
   where id = 'ed457d11-ad13-4ff3-95b8-aeee2ac52e4f'   -- Diego Bonilla
     and permisos ? 'pagos';                            -- jsonb_set no crea claves intermedias
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'DIEGO_NO_ACTUALIZADO: % filas', n;
  end if;

  -- Que no se haya colado nadie más.
  select count(*) into n from profiles
   where coalesce((permisos->'pagos'->>'aprobar_propias')::boolean, false) and rol <> 'admin';
  if n <> 1 then
    raise exception 'FLAG_EN_DEMASIADOS_PERFILES: %', n;
  end if;
end $$;
