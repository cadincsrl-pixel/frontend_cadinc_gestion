-- Baja las 12 fichas de esmalte de la grilla color × tamaño que nunca se usaron
-- ============================================================================
-- 2026-09-12
--
-- Viene de la auditoría del modelo de pinturas (12/09) y cierra lo que
-- 20260902s_color_en_pedidos.sql había medido y dejado pasar: "Hay 19 filas de
-- 'Esmalte sintético <color> x <tamaño>' y 17 nunca se usaron: cero stock, cero
-- movimientos, cero pedidos". Diez días después son 23 filas y 16 sin un solo
-- renglón: el problema no se arregló, creció.
--
-- Se dan de BAJA (activo=false, no delete: §5.15) solo las 12 combinaciones
-- pre-generadas que siguen en cero absoluto — cero renglones, cero movimientos,
-- stock 0 y sin precio:
--
--   azul  1lt / 4lts / 20lts      (711, 712, 713)
--   gris        4lts / 20lts      (706, 707)
--   negro 1lt                     (702)
--   rojo  1lt / 4lts / 20lts      (708, 709, 710)
--   verde 1lt / 4lts / 20lts      (714, 715, 716)
--
-- QUÉ QUEDA VIVO Y POR QUÉ, que es la parte que importa:
--   · 122 "x 4lts" genérica — 4 renglones, 1 movimiento, stock −2. Es la MÁS
--     usada de las 23, y tiene usa_color=true. O sea que en la práctica la
--     gente elige la genérica y querría decir el color aparte: es evidencia a
--     favor del atributo, no de la grilla. Por eso la plomería del color
--     (20260913t) es el arreglo que sirve y la grilla no.
--   · 123 "x 1lt" genérica — sin uso, pero es el camino de 1 litro en color.
--     Se deja por la misma razón que la 122.
--   · 2637 SW 7055 Enduring Bronze — stock 20 y un movimiento real.
--   · 701 blanco x 20lts — sin renglones, pero alguien le puso precio
--     ($141.066): un precio cargado a mano es señal de producto real.
--   · 2638 color aluminio Albalux — producto de marca cargado hace poco con 6
--     sinónimos, no es parte de la grilla vieja.
--   · 699, 700, 703, 704, 705, 802 — todas con al menos un renglón.
--
-- NO se tocan las fichas genéricas de LÁTEX ("Latex interior/exterior x N lts"),
-- aunque varias estén igual de muertas: Sosa está haciendo el recuento físico
-- de látex justo ahora y esas fichas están en su planilla. Bajarlas antes de
-- contar sería al revés — si aparece una lata, hace falta la ficha para cargar
-- el ajuste. Se revisan cuando entre el recuento.

begin;

update stock_materiales
   set activo = false,
       obs = coalesce(nullif(obs, ''), '') ||
             case when coalesce(obs,'') = '' then '' else ' ' end ||
             'Baja 2026-09-12: combinación de la grilla color x tamaño que nunca se usó '
             || '(cero renglones, cero movimientos, sin stock ni precio). Ver 20260913v.',
       updated_at = now()
 where id in (711, 712, 713, 706, 707, 702, 708, 709, 710, 714, 715, 716)
   and activo
   -- Cinturón de seguridad: solo si SIGUEN en cero al momento de aplicar.
   and coalesce(stock_actual, 0) = 0
   and coalesce(precio_ref, 0) = 0
   and not exists (select 1 from solicitud_compra_item i where i.material_id = stock_materiales.id)
   and not exists (select 1 from stock_movimientos v where v.material_id = stock_materiales.id);

do $$
declare v_bajadas integer; v_vivas integer;
begin
  select count(*) into v_bajadas from stock_materiales
   where id in (711, 712, 713, 706, 707, 702, 708, 709, 710, 714, 715, 716) and not activo;
  if v_bajadas <> 12 then
    raise exception 'Esperaba dar de baja 12 fichas de esmalte, quedaron % (alguna tenía uso nuevo)', v_bajadas;
  end if;

  -- Tiene que seguir habiendo camino para pedir esmalte en cualquier tamaño.
  select count(*) into v_vivas from stock_materiales
   where activo and nombre ilike 'Esmalte sint%';
  if v_vivas < 10 then
    raise exception 'Quedaron solo % fichas de esmalte activas: me pasé de mano', v_vivas;
  end if;
end $$;

commit;
