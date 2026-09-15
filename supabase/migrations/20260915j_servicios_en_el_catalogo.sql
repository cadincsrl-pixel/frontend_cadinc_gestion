-- Los servicios entran al catálogo: clase='servicio'
--
-- El user: "los gastos de una obra, sean reintegrables o no, como ser fletes o
-- los pagos a empresas de logistica por envio etc donde se pueden registrar?
-- (...) acabo de retirar un bulto de via cargo para una obra, si bien la obra es
-- llave en mano me gustaria registrarlo para llevar la contabilidad y
-- rentabilidad de la obra".
--
-- LA RESPUESTA ERA: EN NINGÚN LADO. Verificado, no inferido — no existe un solo
-- flete en toda la base. Los cuatro lugares que parecen servir, no sirven:
--
--   Cuenta corriente  materiales             es el parche que ya se usa sin querer
--   Adicionales       obra+fecha+monto+adj.  LA FORMA ES LA CORRECTA, pero la tabla
--                                            está VACÍA y no entra en ninguna vista
--                                            ni función: es una isla
--   Costos            mano de obra semanal   sólo operarios y contratistas
--   Caja              centros de costo       CERO movimientos, y los centros son
--                                            "Norte" y "Obrador", no obras
--   Gasto interno     el pañol               no es la obra del cliente
--
-- Y el equipo ya había inventado el parche: tres servicios por $1.301.600 están
-- cargados COMO SI FUERAN MATERIALES (corte de canaletas $726.000 en ARCOR,
-- plegado de chapa $435.600 en CASA BELEN, volquetes $140.000 en LAMADRID).
-- Funciona: caen en la cuenta de la obra, tienen proveedor, se clasifican como
-- del cliente o de CADINC. Lo único mal es que el catálogo no sabe qué son.
--
-- POR ESO LA SOLUCIÓN ES ENSANCHAR `clase` Y NO CONSTRUIR UN CIRCUITO NUEVO. Un
-- servicio con clase='servicio' hereda TODO lo que ya funciona sin escribir una
-- línea: entra por el pedido, tiene proveedor y factura, cae en
-- materiales_a_cuenta_cliente, respeta a_cargo_de (cliente o CADINC según el
-- tipo de obra), se puede marcar consumible propio y se certifica.
--
-- Se revisaron las 6 funciones que miran `clase` y ninguna necesita cambio:
--   fn_mcc_sin_herramientas    saca de MCC sólo 'herramienta'  -> el servicio ENTRA ✓
--   calc_a_cargo_de            fuerza cadinc sólo con 'epp'    -> el servicio sigue
--                                                                 la regla de la obra ✓
--   marcar_consumible_propio   rechaza sólo 'epp'              -> se puede marcar ✓
--   es_herramienta_item        sólo 'herramienta'              -> no va al pañol ✓
--   gasto_interno_herramientas sólo 'herramienta'              -> no lo cuenta ✓
--   fusionar_tipo_herramienta  sólo herramientas               -> no aplica ✓
--
-- LO ÚNICO QUE HAY QUE ATAJAR ES EL STOCK. Un servicio no tiene existencias, y
-- `resolver_item_despacho` NO mira clase y SÍ descuenta stock: despachar un flete
-- "de depósito" dejaría la ficha en negativo. `devolver_material` bloquea sólo
-- 'herramienta', así que también dejaría pasar un servicio y le sumaría stock.
--
-- En vez de reescribir esas dos RPC (son largas y tocan plata), va UNA guarda en
-- stock_movimientos: un servicio nunca genera un movimiento, venga del camino que
-- venga. Cubre los dos casos y cualquier camino futuro, y falla con un mensaje
-- que dice qué hacer.

-- 1. Las dos clases nuevas.
alter table public.stock_materiales
  drop constraint if exists stock_materiales_clase_check;
alter table public.stock_materiales
  add constraint stock_materiales_clase_check
  check (clase = any (array['material'::text, 'herramienta'::text, 'epp'::text, 'servicio'::text]));

alter table public.solicitud_compra_item
  drop constraint if exists solicitud_compra_item_clase_check;
alter table public.solicitud_compra_item
  add constraint solicitud_compra_item_clase_check
  check (clase = any (array['material'::text, 'herramienta'::text, 'servicio'::text]));

-- 2. Un servicio no tiene stock. Nunca.
create or replace function public.fn_stock_sin_servicios()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_clase text;
begin
  select clase into v_clase from public.stock_materiales where id = new.material_id;
  if v_clase = 'servicio' then
    raise exception 'ES_SERVICIO_SIN_STOCK'
      using errcode = 'P0001',
            detail  = format('La ficha %s es un servicio: no tiene existencias. Se resuelve como compra al proveedor, no por despacho de deposito ni devolucion.', new.material_id);
  end if;
  return new;
end $function$;

comment on function public.fn_stock_sin_servicios() is
  'Un servicio (clase=servicio) no genera movimientos de stock. Ataja de una vez el despacho de deposito (resolver_item_despacho no mira clase y descuenta) y la devolucion (devolver_material solo bloquea herramienta).';

drop trigger if exists trg_stock_sin_servicios on public.stock_movimientos;
create trigger trg_stock_sin_servicios
  before insert on public.stock_movimientos
  for each row execute function fn_stock_sin_servicios();

-- 3. La secuencia de rubros estaba desfasada y esto NO es cosmetico: last_value
--    valia 27 sin marcar como usada, o sea que el proximo nextval devolvia 27,
--    que ya existe. Cualquier alta de rubro reventaba con
--    "duplicate key value violates unique constraint stock_rubros_pkey", viniera
--    de esta migracion o de la pantalla. Lo descubri al chocarme con el error.
select setval('stock_rubros_id_seq', (select max(id) from public.stock_rubros), true);

-- 4. Un rubro propio, para que los servicios no se mezclen con los materiales
--    al buscar en el catalogo.
insert into public.stock_rubros (nombre, orden)
select 'Servicios', 99
where not exists (select 1 from public.stock_rubros where lower(nombre) = 'servicios');
