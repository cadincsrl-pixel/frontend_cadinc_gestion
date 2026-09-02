-- Los 3 unicos items del cluster "precio_unit = 1" cuyo precio se puede recuperar
-- de datos internos. Vincula al catalogo y carga la mediana por unidad identica.
--
-- CONTEXTO (el hallazgo importante es el negativo):
-- 40 items estaban cargados con precio_unit = 1, un placeholder para pasar un campo
-- obligatorio. Se mapearon contra el catalogo con agentes + verificacion adversarial.
-- Resultado: 21 matchearon un material del catalogo, pero **ese material no tiene
-- NI UN item historico con precio real**, asi que no hay mediana que recuperar.
-- Son casi todos sanitarios (termofusion y PVC) que nunca se cargaron con precio en
-- ninguna obra. Para esos NO alcanza con la base: hacen falta las facturas del
-- proveedor. Solo estos 3 tienen respaldo interno.
--
-- Los precios se recalcularon con SQL, no se tomaron del agente: para el item 3126
-- el agente propuso 3.388,20 y la mediana real por unidad identica es 3.340,00.
--
-- item 167  -> mat 555 "Niveladores piso (cuña + base)"  8.465,00 (1 ref)  [Praderas, pagado_por=cliente]
-- item 3126 -> mat   7 "Codo PVC 110mm"                  3.340,00 (9 refs) [Clinica Salta]
-- item 3128 -> mat  34 "Adhesivo PVC x 250cc"            5.500,00 (3 refs) [Clinica Salta]

do $guard$
declare n int;
begin
  select count(*) into n
  from solicitud_compra_item
  where id in (167, 3126, 3128) and (precio_unit <> 1 or material_id is not null);
  if n > 0 then
    raise exception 'Abortado: % item(s) ya no estan en precio 1 / sin vincular', n;
  end if;
end
$guard$;

update solicitud_compra_item i
   set material_id = p.mat_id,
       precio_unit = p.precio
  from (values
    (167,  555, 8465::numeric),
    (3126,   7, 3340::numeric),
    (3128,  34, 5500::numeric)
  ) as p(item_id, mat_id, precio)
 where i.id = p.item_id;

update materiales_a_cuenta_cliente m
   set precio_unit  = i.precio_unit,
       precio_total = round(m.cantidad * i.precio_unit, 2),
       updated_at   = now()
  from solicitud_compra_item i
 where i.id = m.item_id
   and m.item_id in (167, 3126, 3128);
