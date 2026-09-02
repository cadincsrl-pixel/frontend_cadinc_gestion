-- "Tornillos para techar" = tornillo autoperforante para chapa 14x2". Lo aclaró el
-- dueño el 2026-09-02.
--
-- El problema: la familia entera de tornillos de techo ("Tornillo autoperf. p/ chapa"
-- 14x1", 14x2" y 14x3", ids 479/480/481, rubro Techado y cubiertas) tiene **0 usos y
-- 0 sinónimos**. Nadie la encuentra nunca. Mientras tanto el término genérico
-- "autoperforante"/"autoperforantes" está como alias de "Tornillo autoperf. punta
-- mecha 10mm" (id 380, rubro Ferretería), que es OTRO tornillo: ese es para perforar
-- metal, no para fijar chapa de techo.
--
-- Resultado: quien pedía tornillos de techo escribía texto libre. Hay 2 pedidos así
-- ("tornillos para techar", items 1338 y 1904) que nunca se vincularon.
--
-- Qué hace esta migración:
--   1. Le pone a los 3 tornillos de chapa los sinónimos con los que se piden en obra,
--      incluyendo la medida sola ("14x2"), que es como los nombra el dueño.
--   2. Vincula los 2 items históricos al 14x2".
--   3. Tasa el item 1904 (Lamadrid, 100 unid) a 89, que es lo que se pagó por el
--      MISMO texto en CC CLINICA SALTA el 2026-07-23 (item 1338).
--      ⚠ Es UNA sola referencia, no una mediana. Son 8.900 y es reversible.
--
-- NO se toca el item 1905 "tornillos para techar EN MADERA" (CC-016, 200 unid):
-- fijar chapa sobre madera no usa el mismo tornillo que sobre metal (punta aguja o
-- tirafondo en vez de punta mecha). Preguntar antes de asumir que es el mismo.

do $guard$
declare n int;
begin
  select count(*) into n from stock_materiales where id in (479,480,481) and alias <> '{}';
  if n > 0 then raise exception 'Abortado: los tornillos de chapa ya tienen alias'; end if;
  select count(*) into n from solicitud_compra_item where id in (1338,1904) and material_id is not null;
  if n > 0 then raise exception 'Abortado: los items 1338/1904 ya estan vinculados'; end if;
end
$guard$;

update stock_materiales set alias = array['tornillo techo 14x1','autoperforante techo 14x1','14x1']
 where id = 479;

update stock_materiales set alias = array[
  'tornillos para techar','tornillo para techar','tornillos de techar',
  'tornillos autoperforantes techo','tornillo autoperforante techo',
  'autoperforante techo','autoperforantes techo',
  'tornillo techo 14x2','14x2'
] where id = 480;

update stock_materiales set alias = array['tornillo techo 14x3','autoperforante techo 14x3','14x3']
 where id = 481;

update solicitud_compra_item set material_id = 480 where id in (1338, 1904);

update solicitud_compra_item set precio_unit = 89 where id = 1904;

update materiales_a_cuenta_cliente m
   set precio_unit  = 89,
       precio_total = round(m.cantidad * 89, 2),
       updated_at   = now()
  from solicitud_compra_item i
 where i.id = m.item_id and m.item_id = 1904 and m.cobro_id is null;
