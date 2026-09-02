-- Tasación de despachos de depósito en LAMADRID 566 (CC-016).
--
-- Contexto: 1.505 despachos de depósito en todo el sistema quedaron en precio 0.
-- No es un bug — el schema admite 0 a propósito ("queda a tasar y le ponen precio
-- después", ver solicitudes.schema.ts) — pero la cola no se vacía. Lamadrid tenía
-- 94 filas sin tasar, todas `pagado_por='cadinc'`, `origen='deposito'` y **ninguna
-- con cobro_id**, así que se pueden tasar sin desincronizar ningún cobro.
--
-- MÉTODO: mediana del mismo material Y la misma unidad, excluyendo del conjunto de
-- referencia los precios < 10 (los placeholders tipo `precio_unit = 1` no son
-- precios y ensucian el mínimo).
--
-- SE APLICAN SOLO 15 DE LAS 94. El resto no tiene respaldo suficiente:
--   * 69 no tienen NI UNA referencia con precio en el sistema (el material nunca
--     se compró con precio en ninguna obra). Para esas hace falta la factura.
--   * 6 tienen UNA sola referencia — un dato no es una mediana. La más cara es
--     "Caño de chapa galvanizada 100mm" x4 = 74.800 sobre una única observación.
--     Entre ellas hay un "Buscapolo (destornillador probador)", que además NO es
--     material sino herramienta.
--   * 2 tienen dispersión real que la mediana no salva: "Sellador poliuretano
--     x300ml" (5,5x entre min y max) y "Masilla Durlock x 32kg" (13,3x, casi seguro
--     mezcla de precio por bolsa y por kg).
--
-- Las 4 de dispersión alta que SÍ entran (Tornillo T1, Disco corte 115mm y los dos
-- Tarugo fisher) van porque sus medianas se verificaron a mano hoy contra el
-- histórico al tasar Casa Belén: 32,34 / 800 / 60. La dispersión viene de filas con
-- la unidad mal cargada en otras obras, no del precio en sí.

do $guard$
declare n int;
begin
  select count(*) into n
  from materiales_a_cuenta_cliente
  where item_id in (1930,2025,3080,3083,3072,3082,2762,1249,1903,2924,2760,3074,1902,3076,3077)
    and (coalesce(precio_unit,0) <> 0 or cobro_id is not null or obra_cod <> 'CC-016');
  if n > 0 then
    raise exception 'Abortado: % fila(s) ya no estan sin precio / ya cobradas / no son de CC-016', n;
  end if;
end
$guard$;

update solicitud_compra_item i
   set precio_unit = p.precio
  from (values
    (1930, 265220.50), (2025, 265220.50),   -- Chapa galvanizada lisa C25 (3 refs, disp 1,2x)
    (3080,  15307.45),                      -- Placa Durlock STD 12.5mm   (6 refs, disp 1,2x)
    (3083,   3434.38),                      -- Montante 35mm x 2.60m      (6 refs, disp 1,2x)
    (3072,   3955.81),                      -- Solera 70mm x 2.60m        (6 refs, disp 1,0x)
    (3082,   2936.83),                      -- Solera 35mm x 2.60m        (5 refs, disp 1,2x)
    (2762,  32545.00),                      -- Fenolico 18mm 1.22x2.44    (4 refs, disp 1,8x)
    (1249,   1764.00), (2924, 1764.00),     -- Balde de albanil 12lts     (3 refs, disp 1,7x)
    (1903,   9300.00),                      -- Electrodo 2.5mm x kg       (13 refs, verificado hoy)
    (2760,    300.00),                      -- Bolsa para escombro        (4 refs, disp 1,0x)
    (3074,     32.34),                      -- Tornillo T1 punta aguja    (verificado hoy)
    (1902,    800.00),                      -- Disco corte 115mm          (verificado hoy)
    (3076,     60.00), (3077, 60.00)        -- Tarugo fisher 8mm          (verificado hoy)
  ) as p(item_id, precio)
 where i.id = p.item_id;

update materiales_a_cuenta_cliente m
   set precio_unit  = i.precio_unit,
       precio_total = round(m.cantidad * i.precio_unit, 2),
       updated_at   = now()
  from solicitud_compra_item i
 where i.id = m.item_id
   and m.item_id in (1930,2025,3080,3083,3072,3082,2762,1249,1903,2924,2760,3074,1902,3076,3077);
