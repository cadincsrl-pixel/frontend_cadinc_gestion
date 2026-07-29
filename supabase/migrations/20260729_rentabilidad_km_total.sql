-- Rentabilidad: un solo campo de km en vez de ida + vuelta.
--
-- El simulador pedía los km de ida y los de vuelta por separado, pero en la
-- práctica son el mismo número: de los 15 viajes cargados, 14 tenían ida =
-- vuelta y el restante ("vuelta yeso cristamine") tenía 3115 en ida y 0 en
-- vuelta — o sea que ya se estaba usando el campo como total.
--
-- La conversión es SIN PÉRDIDA: el cálculo (src/lib/utils/rentabilidad.ts)
-- nunca usó los dos por separado, sólo `km_ida + km_vuelta` para el consumo de
-- gasoil, el pago por km al chofer y el desgaste de cubiertas.
--
-- NO se dropean km_ida/km_vuelta acá a propósito: dropear una columna es
-- irreversible y de km_total solo se puede reconstruir la ida cuando ida =
-- vuelta (falla justo en el viaje 8). Quedan como están —NOT NULL default 0,
-- la app deja de escribirlas— hasta confirmar que la pantalla nueva sirve.
-- El drop va en una migración aparte.

alter table public.rentabilidad_viajes
  add column if not exists km_total numeric not null default 0;

update public.rentabilidad_viajes
   set km_total = coalesce(km_ida, 0) + coalesce(km_vuelta, 0)
 where km_total = 0;

comment on column public.rentabilidad_viajes.km_total is
  'Kilómetros del viaje completo (ida + vuelta). Reemplaza a km_ida/km_vuelta, que eran redundantes: el cálculo siempre usó la suma. Esas dos quedan sin uso hasta que se dropeen.';
