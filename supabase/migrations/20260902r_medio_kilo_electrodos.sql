-- "1/2 de electrodos" = Electrodo 2.5mm, MEDIO KILO. Lo aclaró el dueño el 2026-09-02.
--
-- Hay 2 items cargados asi, los dos como "1 unid" en vez de "0,5 kg":
--
--   item 2024 (CC-016 LAMADRID, 2026-08-04): 1 unid x 3.250 = 3.250
--     Leido bien es 0,5 kg a 6.500/kg = 3.250. **La plata facturada esta BIEN**,
--     lo que estaba mal es el desglose. Mismo patron que el tirante pino de CC-013.
--     Ademas 6.500/kg es un precio real: es lo que se pago en CC-006 el 2026-06-26.
--
--   item 2641 (CC-018, 2026-08-21): 1 unid x 0 = 0, sin tasar.
--     Se tasa a 12.000/kg x 0,5 = 6.000. La referencia es la mejor posible: el item
--     2890, MISMA obra CC-018, MISMO material, 6 dias despues (2026-08-27), a
--     12.000/kg. No se usa la mediana global porque el precio del electrodo se movio
--     mucho en el año (6.500 en junio, 12.200 en julio, 4.500 en septiembre) y una
--     referencia de la misma obra a 6 dias vale mas que la mediana de todo el año.
--
-- Se suman ademas los sinonimos con los que se pide en obra, para que la proxima vez
-- lo encuentren en el catalogo en vez de escribirlo libre. Se hace con append, sin
-- pisar los 7 que ya tenia.

do $guard$
declare n int;
begin
  select count(*) into n from solicitud_compra_item where id in (2024, 2641) and material_id is not null;
  if n > 0 then raise exception 'Abortado: los items 2024/2641 ya estan vinculados'; end if;
  select count(*) into n from materiales_a_cuenta_cliente where item_id in (2024, 2641) and cobro_id is not null;
  if n > 0 then raise exception 'Abortado: alguno ya esta cobrado'; end if;
end
$guard$;

update stock_materiales
   set alias = (
     select array_agg(distinct a) from unnest(
       alias || array['1/2 de electrodos','1/2 de electrodo','1/2 de electrodo 2.5',
                      'medio kilo de electrodos','1/2 kilo de electrodos','medio de electrodos']
     ) a)
 where id = 165;

update solicitud_compra_item i
   set material_id = 165,
       cantidad    = 0.5,
       unidad      = 'kg',
       precio_unit = p.precio
  from (values (2024, 6500::numeric), (2641, 12000::numeric)) as p(item_id, precio)
 where i.id = p.item_id;

update materiales_a_cuenta_cliente m
   set cantidad     = 0.5,
       unidad       = 'kg',
       precio_unit  = i.precio_unit,
       precio_total = round(0.5 * i.precio_unit, 2),
       updated_at   = now()
  from solicitud_compra_item i
 where i.id = m.item_id and m.item_id in (2024, 2641);
