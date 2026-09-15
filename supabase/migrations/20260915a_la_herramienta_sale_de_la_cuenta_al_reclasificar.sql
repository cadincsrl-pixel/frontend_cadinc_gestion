-- B1 de la auditoría del 15/09: reclasificar una ficha a herramienta NO la sacaba
-- de la cuenta del cliente.
--
-- §5.12 promete que una herramienta "no tiene precio ni entra en la cuenta del
-- cliente" y que el trigger `trg_mcc_sin_herramientas` la saca. Pero ese trigger
-- es AFTER **INSERT** solamente (tgtype=5): frena los renglones nuevos y no mira
-- los que ya están. Por eso las cuatro veces que se reclasificó una ficha
-- (20260910p puntal, 20260913i zaranda, 20260914ad botas, 20260914r espátulas)
-- hubo que borrar las filas de MCC A MANO en la propia migración.
--
-- El problema es que la pantalla ofrece el botón y no hace ese paso:
-- Certificaciones › Catálogo › Editar › Clase = 🔧 Herramienta escribe `clase`
-- y nada más. El resto de la cascada SÍ corre sola (trg_material_clase_recache →
-- herr_origen → el pañol toma los renglones), así que la reclasificación queda a
-- medias justo del lado caro: la herramienta entra al pañol Y sigue facturada.
--
-- Al escribir esto la exposición es potencial, no consumada: hay 0 filas de MCC
-- apuntando a un material clase='herramienta'. La ficha 340 "Balde de albañil
-- 12lts" es el ejemplo vivo del riesgo — 24 renglones sin cobrar por $193.102,
-- de los cuales $86.967 a cargo del CLIENTE en 19 obras — y está a un click de
-- convertirse en el quinto caso de limpieza manual.
--
-- Van los dos remiendos que faltaban, en orden de menor a mayor.

-- ── 1. El casi-acierto que ya existía ───────────────────────────────────
-- `trg_stock_materiales_recalc_a_cargo_de` YA corre al cambiar la clase y
-- recalcula `a_cargo_de` de las filas no congeladas. Lo que fallaba es que
-- `calc_a_cargo_de` tiene rama para 'epp' y no para 'herramienta': o sea que
-- reclasificar a EPP estaba cubierto y a herramienta no. Una palabra.
create or replace function public.calc_a_cargo_de(p_obra_cod text, p_item_id integer)
returns text
language sql
stable
as $function$
  select case
           when (select m.clase from public.solicitud_compra_item i
                   left join public.stock_materiales m on m.id = i.material_id
                  where i.id = p_item_id) in ('epp', 'herramienta') then 'cadinc'
           when (select materiales_a_cargo_de from public.obras where cod = p_obra_cod) = 'cadinc' then 'cadinc'
           when (select por_administracion from public.obras where cod = p_obra_cod) then 'cliente'
           when (select consumible_propio from public.solicitud_compra_item where id = p_item_id) then 'cadinc'
           else 'cliente'
         end
$function$;

-- ── 2. El paso de §5.12, automatizado ───────────────────────────────────
-- Que `a_cargo_de` pase a 'cadinc' saca la plata de la deuda del cliente, pero
-- no alcanza: §5.12 dice que la herramienta no va a la cuenta, punto. La fila
-- tiene que irse, como la borraban a mano las cuatro migraciones.
--
-- Las CONGELADAS no se tocan: una fila con `cobro_id` o `certificado_id` ya se
-- le presentó al cliente y borrarla descuadraría ese cobro (es la misma doctrina
-- de `fn_mcc_congelada`). Para esas queda un evento, que es lo único honesto:
-- avisar que hay que soltarlas del cobro a mano antes de que se vayan.
create or replace function public.fn_material_a_herramienta_saca_de_mcc()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user     uuid := public.usuario_actual();
  v_borradas integer := 0;
  v_trabadas integer := 0;
  r          record;
begin
  for r in
    select c.id, c.item_id, c.solicitud_id, c.descripcion, c.cantidad, c.precio_total,
           c.origen, c.obra_cod, c.a_cargo_de,
           (c.cobro_id is not null or c.certificado_id is not null) as congelada,
           i.estado
      from public.materiales_a_cuenta_cliente c
      join public.solicitud_compra_item i on i.id = c.item_id
     where i.material_id = new.id
  loop
    insert into public.solicitud_item_eventos
      (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta, user_id)
    values (
      r.item_id, r.solicitud_id,
      case when r.congelada then 'herramienta_trabada_en_la_cuenta' else 'sacado_de_cuenta_cliente' end,
      null, r.estado, r.cantidad,
      case when r.congelada
        then 'La ficha pasó a herramienta pero este renglón ya está cobrado o certificado: soltalo del cobro para sacarlo de la cuenta (' || r.descripcion || ')'
        else 'La ficha pasó a herramienta: el renglón sale de la cuenta de la obra y va al pañol (' || r.descripcion || ')'
      end,
      jsonb_build_object(
        'motivo',        'reclasificacion a herramienta',
        'material_id',   new.id,
        'clase_anterior', old.clase,
        'origen_mcc',    r.origen,
        'obra_cod',      r.obra_cod,
        'a_cargo_de',    r.a_cargo_de,
        'precio_total',  r.precio_total,
        'congelada',     r.congelada,
        'detectada_por', 'trigger'),
      v_user);

    if r.congelada then
      v_trabadas := v_trabadas + 1;
    else
      delete from public.materiales_a_cuenta_cliente where id = r.id;
      v_borradas := v_borradas + 1;
    end if;
  end loop;

  if v_trabadas > 0 then
    raise warning '[mcc] material % pasó a herramienta: % renglones salieron de la cuenta, % quedaron trabados por estar cobrados o certificados',
      new.id, v_borradas, v_trabadas;
  end if;
  return null;
end;
$function$;

comment on function public.fn_material_a_herramienta_saca_de_mcc() is
  'Al reclasificar una ficha a clase=herramienta, saca sus renglones de materiales_a_cuenta_cliente (§5.12). Las filas ya cobradas o certificadas NO se borran: quedan con un evento que pide soltarlas del cobro.';

-- Se llama `trg_material_clase_...` a propósito: los triggers del mismo evento
-- corren por orden alfabético, así que este va ANTES que
-- `trg_stock_materiales_recalc_a_cargo_de` y le deja menos filas para recalcular.
drop trigger if exists trg_material_clase_saca_de_mcc on public.stock_materiales;
create trigger trg_material_clase_saca_de_mcc
  after update of clase on public.stock_materiales
  for each row
  when (new.clase = 'herramienta' and old.clase is distinct from 'herramienta')
  execute function public.fn_material_a_herramienta_saca_de_mcc();
