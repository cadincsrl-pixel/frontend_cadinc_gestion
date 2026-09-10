-- Las equivalencias que ya conocemos, para que fraccionar sirva desde el día 1.
--
-- LA ARENA. El user dijo *"la compramos por m3 y eso equivale a 60 bolsas"*.
-- La ficha de granel está en TONELADAS, no en m³, así que el factor se guarda
-- por tonelada: 1 tn = 40 bolsas de 25 kg (1000/25). Cierra con su número:
-- 1 m³ = 1,5 tn = 60 bolsas, y 60 x 25 kg = 1500 kg = 1,5 tn. Las dos cuentas
-- dan lo mismo, así que el dato del user y la unidad de la ficha son
-- compatibles — solo hay que no confundir m³ con tn al cargar la compra.
--
-- EL AGUARRÁS Y EL THINNER. Seis fichas de aguarrás que no se hablaban; ahora
-- todas se fraccionan a "Aguarrás x litro", que es la que se despacha. Idem
-- thinner: ahí el workaround ya había ocurrido a mano (el tambor en 0 y la
-- ficha por litro en 180).
--
-- Faltan las pinturas, que el user mencionó pero tienen 20+ fichas por color y
-- tamaño y casi todas en $0: conviene cargarlas cuando se sepa cuáles se usan
-- de verdad, no adivinando.

insert into public.material_equivalencias (origen_id, destino_id, factor, obs)
values
  -- Aguarrás → litro (ficha 2633)
  (1142, 2633, 200, 'Tambor de 200 lts'),
  (356,  2633,  18, 'Lata de 18 lts'),
  (1553, 2633,   5, 'Lata de 5 lts'),
  (357,  2633,   4, 'Lata de 4 lts'),
  (1552, 2633,   1, 'Lata de 1 lt'),
  -- Thinner / diluyente → litro (ficha 2634)
  (1145, 2634, 200, 'Tambor de 200 lts'),
  (124,  2634,  18, 'Lata de 18 lts'),
  (125,  2634,   4, 'Lata de 4 lts'),
  -- Arena a granel → bolsa de 25 kg
  (90,   769,   40, '1 tonelada = 40 bolsas de 25 kg (y 1 m3 = 1,5 tn = 60 bolsas)')
on conflict do nothing;
