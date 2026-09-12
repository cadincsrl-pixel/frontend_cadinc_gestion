-- El Loxon entonado termina en 20 litros, no en 18
-- ================================================
-- 2026-09-12
--
-- Del recuento físico de látex de Sosa (planilla del 08/09, procesada el 12/09)
-- salió una aclaración del user que corrige el catálogo:
--
--   "son de 20 litros porque la base tiene 18, pero cuando se prepara el color
--    termina con 20 por las tintas que se agregan"
--
-- O sea que el "x 18lts" del nombre es la BASE que compra la pinturería, no el
-- balde que llega al galpón. Sosa contó "5 x 20 L" en el renglón impreso de 18
-- y no era un error suyo: es el mismo producto. Siempre termina en 20
-- (confirmado por el user), así que no depende de cuánto se entone.
--
-- EVIDENCIA EN LOS PRECIOS, que ya estaban bien: el Cityscape (oscuro) cuesta
-- $156.956,51 y el Pure White (claro) $152.785,81 — mismo producto, $4.170 de
-- diferencia, que son las tintas. El precio de la ficha ya es el del balde
-- TERMINADO, no el de la base. Lo único que mentía era el nombre.
--
-- POR QUÉ RENOMBRAR ES SEGURO ACÁ: la `unidad` de estas fichas es 'lata', no
-- litros. Los litros del nombre son descriptivos. El peligro que documenta
-- §5.15 —"cambiarle la unidad a una ficha reinterpreta en silencio sus
-- movimientos viejos"— aparece cuando se toca `unidad`, y acá no se toca: un
-- balde sigue siendo un balde. Por eso alcanza con el texto.
--
-- Los alias con "18" SE CONSERVAN y se agregan los de "20": alguien puede
-- acordarse del número de la base y tiene que encontrar la ficha igual.
--
-- NO se tocan los renglones ya cargados ni MCC, aunque su descripción diga
-- "18lts": es la foto de lo que se pidió en su momento (§5.14) y reescribirla
-- sería falsear el historial. Los renglones nuevos ya nacen con el nombre
-- corregido.
--
-- Solo son estas CUATRO. Las otras fichas con 18 en el nombre (aguarrás,
-- diluyente, masilla Durlock, pintura asfáltica, primer asfáltico) son
-- genuinamente de 18 y quedan como están.

begin;

-- ── 1. Las cuatro bases entonadas pasan a 20 lts ──────────────────────
update stock_materiales set
  nombre = 'Látex exterior Loxon LD mate SW 7005 Pure White x 20lts',
  alias  = alias || array['loxon exterior mate blanco 20','loxon ld exterior 20','loxon 7005 20','pure white 20'],
  obs    = 'Base de 18 lts entonada: el balde terminado son 20. Ver 20260913w.',
  updated_at = now()
where id = 1159;

update stock_materiales set
  nombre = 'Látex exterior Loxon LD mate SW 7067 Cityscape x 20lts',
  alias  = alias || array['loxon ld exterior deep 20','loxon 7067 20','cityscape 20'],
  obs    = 'Base de 18 lts entonada: el balde terminado son 20. Ver 20260913w.',
  updated_at = now()
where id = 1153;

update stock_materiales set
  nombre = 'Látex frentes Loxon LD superelástico SW 7067 Cityscape x 20lts',
  alias  = alias || array['loxon frentes 20','loxon superelastico 20'],
  obs    = 'Base de 18 lts entonada: el balde terminado son 20. Ver 20260913w.',
  updated_at = now()
where id = 1152;

update stock_materiales set
  nombre = 'Látex interior Loxon LD mate SW 6105 Divine White x 20lts',
  alias  = alias || array['loxon ld interior 20','loxon interior mate 20','divine white 20'],
  obs    = 'Base de 18 lts entonada: el balde terminado son 20. Ver 20260913w.',
  updated_at = now()
where id = 1156;

-- ── 2. Los dos códigos que Sosa contó y no tenían ficha ───────────────
-- Sin precio a propósito (§5.15): inventar uno propaga el error, y en $0 caen
-- solos en la lista de pendientes de tasar. Los hermanos cuestan $156.956
-- (1153) y $172.992 (1156), así que el orden de magnitud está a mano cuando se
-- los quiera cargar.
insert into stock_materiales (rubro_id, nombre, unidad, clase, precio_ref, stock_actual, stock_minimo, activo, obs, alias)
values
  (5, 'Látex exterior Loxon LD mate SW 6142 Macadamia x 20lts', 'lata', 'material', 0, 0, 0, true,
   'Alta 2026-09-12 por el recuento: Sosa contó 7 baldes. La planilla del recuento decía "pedido en pliego, nunca comprado" y estaba comprado. Base 18 entonada a 20.',
   array['6142','sw 6142','sw6142','macadamia','loxon macadamia','loxon 6142','pintura 6142',
         'sw 6142 macadamia','loxon exterior macadamia','loxon exterior 6142','macadamia 20']),
  (5, 'Látex interior Loxon LD mate SW 6106 Kilim Beige x 20lts', 'lata', 'material', 0, 0, 0, true,
   'Alta 2026-09-12 por el recuento. Zócalo interior hasta 0,90 m. Base 18 entonada a 20.',
   array['6106','sw 6106','sw6106','kilim beige','kilim','loxon kilim beige','loxon 6106','pintura 6106',
         'sw 6106 kilim beige','loxon interior kilim','loxon interior 6106','kilim beige 20']);

-- ── 3. Las genéricas de látex que el recuento confirmó vacías ─────────
-- Las filas 7 a 16 y 19 a 27 de la planilla quedaron EN BLANCO: no apareció ni
-- una lata de 1, 4 ni 10 litros en el galpón. Se dan de baja solo las que
-- además nunca tuvieron un renglón. Quedan activas 112, 115 y 117, que sí se
-- pidieron alguna vez (y la 115 encima es la del Quantum, todavía sin resolver).
update stock_materiales set
  activo = false,
  obs = 'Baja 2026-09-12: el recuento físico de látex no encontró ninguna, y nunca tuvo un renglón. Ver 20260913w.',
  updated_at = now()
where id in (113, 114, 116, 341, 342)
  and activo
  and coalesce(stock_actual, 0) = 0
  and not exists (select 1 from solicitud_compra_item i where i.material_id = stock_materiales.id)
  and not exists (select 1 from stock_movimientos v where v.material_id = stock_materiales.id);

do $$
declare v_20 integer; v_nuevas integer; v_bajas integer;
begin
  select count(*) into v_20 from stock_materiales
   where id in (1159, 1153, 1152, 1156) and nombre like '%x 20lts';
  if v_20 <> 4 then raise exception 'Esperaba 4 fichas Loxon renombradas a 20lts, hay %', v_20; end if;

  select count(*) into v_nuevas from stock_materiales
   where activo and (nombre like '%6142 Macadamia%' or nombre like '%6106 Kilim Beige%');
  if v_nuevas <> 2 then raise exception 'Esperaba las 2 fichas nuevas, hay %', v_nuevas; end if;

  select count(*) into v_bajas from stock_materiales where id in (113,114,116,341,342) and not activo;
  if v_bajas <> 5 then raise exception 'Esperaba 5 genéricas de baja, hay %', v_bajas; end if;
end $$;

commit;
