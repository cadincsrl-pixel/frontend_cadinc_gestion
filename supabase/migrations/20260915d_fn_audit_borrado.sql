-- NOTA DE NUMERACION: aplicada en la base como "20260915b_fn_audit_borrado"; otra sesion tomo esa
-- letra en paralelo (CLAUDE.md 10). El archivo se renombro; el ledger de
-- Supabase conserva el nombre viejo, que ahi es etiqueta y no orden.

-- Que la edición de un pedido deje rastro, incluido lo que se borra
--
-- Pedido del user el 15/09: quiere que Juan Pablo pueda editar pedidos, "pero
-- que toda la edición se quede registrada". Al revisar qué se registra hoy
-- apareció que el agujero es anterior al permiso, y que lo tiene cualquiera que
-- ya pueda editar:
--
--   * ALTA de renglón       -> deja evento 'creado' en solicitud_item_eventos. OK.
--   * EDICIÓN de renglón    -> NO deja nada. Ni evento ni antes/después.
--   * BORRADO de renglón    -> NO deja nada, y es un DELETE de verdad. En el
--                              audit_log queda "remove_items=[3455]": un id que
--                              ya no existe y que nadie puede reconstruir.
--   * EDICIÓN de cabecera   -> NO deja nada (obra, estado, prioridad, obs).
--
-- El auditMiddleware sí escribe una fila por request, pero guarda lo que se
-- MANDÓ, no lo que había antes. Para "cambié 30 bolsas por 3" eso no alcanza, y
-- para un renglón borrado no alcanza para nada.
--
-- Las tablas sensibles del sistema ya tienen `trg_audit_cambios` (20260906l),
-- que escribe campo por campo "antes → después" en audit_log y se ve en
-- Admin › Auditoría. solicitud_compra y solicitud_compra_item NO lo tenían.
-- Se las agrega, más un trigger nuevo para el borrado, que audit_cambios no
-- cubre porque es AFTER UPDATE y usa `new`.
--
-- POR QUÉ LA LISTA DE COLUMNAS EN EL RENGLÓN Y NO EL UPDATE ENTERO: el renglón
-- se toca en cada compra y cada despacho (unas 230 veces por semana), y esos
-- caminos YA dejan su fila del middleware y su evento de trazabilidad. Auditar
-- todo triplicaría el log sin agregar nada. Las columnas elegidas son las que
-- se editan mientras el renglón está pendiente, más `cantidad`, que también la
-- mueven devolver, fraccionar y el cambio de unidad — y ésos sí hay que verlos.
-- La cabecera va sin lista: sólo se toca al editar, no hay ruido que filtrar.

-- ESTA MIGRACION: solo la funcion. Los triggers van en 20260915c, para
-- poder probar la funcion sin que nadie la llame todavia.

-- 1. El borrado, que es el caso que hoy se pierde entero.
create or replace function public.audit_borrado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_modulo  text := tg_argv[0];
  v_entidad text := tg_argv[1];
  v_pk      text := tg_argv[2];
  v_ignorar text[] := array['created_at', 'updated_at', 'created_by', 'updated_by'];
  v_old     jsonb := to_jsonb(old);
  v_k       text;
  v_partes  text[] := '{}';
  v_uid     uuid;
  v_nombre  text;
begin
  -- Se vuelca la fila entera menos los campos de sistema y los nulos: es la
  -- única copia que va a quedar de lo que se borró.
  for v_k in select jsonb_object_keys(v_old) loop
    if v_k = any(v_ignorar) then continue; end if;
    if v_old ->> v_k is null then continue; end if;
    v_partes := v_partes || format('%s: %s', v_k, public.audit_fmt_valor(v_old -> v_k));
  end loop;

  begin
    v_uid := public.usuario_actual();
  exception when others then
    v_uid := null;
  end;
  if v_uid is not null then
    select nombre into v_nombre from public.profiles where id = v_uid;
  end if;

  insert into public.audit_log (user_id, user_nombre, modulo, accion, entidad, entidad_id, detalle, ip)
  values (v_uid, v_nombre, v_modulo, 'borrado', v_entidad, v_old ->> v_pk,
          array_to_string(v_partes, ' · '), null);
  return old;
end $function$;

comment on function public.audit_borrado() is
  'Deja en audit_log una copia legible de la fila borrada. Complementa a audit_cambios(), que es AFTER UPDATE y no ve los DELETE. Argumentos: modulo, entidad legible, nombre de la PK.';

