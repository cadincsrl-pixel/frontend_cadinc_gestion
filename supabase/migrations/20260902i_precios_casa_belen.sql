-- Carga de precios faltantes en CASA BELEN (CC-006) + correccion de sobreprecio en LAMADRID (CC-016).
--
-- Contexto: la vinculacion al catalogo (20260902h) permitio por primera vez cruzar precios
-- POR MATERIAL entre obras. El cruce mostro dos cosas:
--
--   1) Casa Belen tenia 25 items sin precio. 10 tienen referencia confiable.
--      Fuente por item, en orden de preferencia:
--        a. precio propio de Casa Belen para el mismo material Y la misma unidad
--        b. mediana de todas las obras filtrando por unidad identica
--        c. valor indicado por el dueño (chapa y film)
--      OJO: NO usar "el ultimo precio de otra obra". Da resultados absurdos porque
--      hay items cargados con unidad equivocada (ej. electrodo "x kg" cargado en `unid`
--      a 250, que leido como kg es 40x mas barato que el precio real de ~9.300/kg).
--      El filtro por unidad identica es lo que saca ese ruido.
--
--   2) LAMADRID tiene un tornillo T1 cargado a 324,28 cuando en 10 obras se paga 32,46.
--      Es exactamente 10x: typo de carga. Estaba facturado al cliente por 64.856
--      en lugar de 6.492. Sin cobro_id ni factura_id asociados, asi que se corrige sin
--      desincronizar nada.
--
-- No hay triggers en solicitud_compra_item ni en materiales_a_cuenta_cliente,
-- por eso ambas tablas se actualizan explicitamente y precio_total se recalcula a mano.

-- Guarda: los 10 de Belen deben estar en 0 y el de Lamadrid en 324,28.
-- Si alguien ya los toco a mano, abortar en vez de pisar el dato.
do $guard$
declare n int;
begin
  select count(*) into n
  from (values (499),(737),(405),(406),(363),(255),(407),(256),(257),(258),(2459)) v(id)
  join solicitud_compra_item i on i.id = v.id
  where (v.id =  2459 and i.precio_unit <> 324.28)
     or (v.id <> 2459 and coalesce(i.precio_unit, 0) <> 0);
  if n > 0 then
    raise exception 'Abortado: % item(s) ya no estan en el estado esperado', n;
  end if;
end
$guard$;

update solicitud_compra_item i
   set precio_unit = p.precio
  from (values
    -- CASA BELEN (CC-006)
    (499, 314310::numeric),  -- Chapa galvanizada lisa C25 x1      (valor del dueño)
    (737,  25000::numeric),  -- Film polietileno 100 micrones x1   (valor del dueño)
    (405,   6890::numeric),  -- Diluyente x 4lts x5 lt             (mediana 4 refs)
    (406,   9300::numeric),  -- Electrodo 2.5mm x kg x2 kg         (propio Belen 2026-07-31)
    (363,    986.50),        -- Ladrillo hueco 18cm x16            (mediana 2 obras, disp. 0%)
    (255,    200::numeric),  -- Tornillo autoperf. punta mecha x50 (propio Belen 2026-06-23)
    (407,    800::numeric),  -- Disco corte 115mm x10              (mediana 27 refs)
    (256,     32.46),        -- Tornillo T1 punta aguja x200       (propio Belen 2026-08-19)
    (257,     60::numeric),  -- Tarugo fisher 8mm c/tornillo x50   (mediana 9 refs)
    (258,    681.50),        -- Guante de tela x3                  (mediana 18 refs)
    -- LAMADRID (CC-016) — correccion del typo 10x
    (2459,    32.46)         -- Tornillo T1 punta aguja x200       (estaba en 324,28)
  ) as p(item_id, precio)
 where i.id = p.item_id;

-- MCC toma el precio ya escrito arriba, asi no se duplica la lista de valores.
update materiales_a_cuenta_cliente m
   set precio_unit  = i.precio_unit,
       precio_total = round(m.cantidad * i.precio_unit, 2),
       updated_at   = now()
  from solicitud_compra_item i
 where i.id = m.item_id
   and m.item_id in (499,737,405,406,363,255,407,256,257,258,2459);
