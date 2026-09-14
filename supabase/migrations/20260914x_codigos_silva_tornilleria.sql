-- Los códigos de Silva en la tornillería de durlock, para que el cotejo la vea
--
-- El cotejador NO emparejaba ninguno de los seis tornillos de durlock: tres
-- quedaban "sin ficha" y los otros tres se iban todos a la misma ficha
-- equivocada. Por eso el cotejo del 14/09 dio verde sobre el rubro donde
-- justamente estaba el error de IVA que levantó Nicolás (20260914u).
--
-- El texto del proveedor y el nombre de la ficha no se parecen lo suficiente:
-- "TORNILLO T1 MECHA 8 X 9/16\" X 100 UN TEL" contra "Tornillo T1 punta mecha"
-- comparte tres palabras de nueve, y la ficha dice "punta" donde el proveedor
-- dice la medida. Ningún emparejador de texto salva esa distancia; el código sí.
-- Es el mismo arreglo que funcionó con Voltaje (20260914s): con el código, el
-- renglón pasa a FIRME y deja de depender del parecido de los nombres.
--
-- Cada mapeo está confirmado por el precio, no por el nombre: el precio de la
-- ficha es exactamente el de lista del código dividido por su envase y con IVA.
--
--   009884  T1 MECHA 8 X 9/16" X 100     2628,93/100 × 1,21 = 31,81  -> #763
--   009889  T2 AGUJA 6 X 1" X 500        7465,29/500 × 1,21 = 18,07  -> #77
--   009894  T2 MECHA 6 X 1.1/8" X 100    4461,98/100 × 1,21 = 53,99  -> #766
--   009891  T3 AGUJA 6 X 1.1/2" X 100    3082,64/100 × 1,21 = 37,30  -> #768
--   009899  TEL-FIX 8 X 1.1/2" X 100     3439,67/100 × 1,21 = 41,62  -> #75
--   009905  TEL-ALAS 8 X 1.1/4 X 100     4252,89/100 × 1,21 = 51,46  -> #940
--
-- Son de 6 dígitos y no aparecen en ninguna ficha activa, así que no hay riesgo
-- de que contaminen el buscador del pedido por substring (el problema que dejó
-- afuera al "25c" del cable celeste en 20260914s).

update stock_materiales set alias = array_append(alias, '009884') where id = 763  and not ('009884' = any(alias));
update stock_materiales set alias = array_append(alias, '009889') where id = 77   and not ('009889' = any(alias));
update stock_materiales set alias = array_append(alias, '009894') where id = 766  and not ('009894' = any(alias));
update stock_materiales set alias = array_append(alias, '009891') where id = 768  and not ('009891' = any(alias));
update stock_materiales set alias = array_append(alias, '009899') where id = 75   and not ('009899' = any(alias));
update stock_materiales set alias = array_append(alias, '009905') where id = 940  and not ('009905' = any(alias));
