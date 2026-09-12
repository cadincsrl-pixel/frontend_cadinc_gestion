-- Ajuste de stock del recuento de látex de Sosa
-- =============================================
-- 2026-09-12
--
-- Sosa contó el látex HOY (confirmado por el user), no el 08/09 que trae
-- impreso el encabezado de la planilla. Eso importa: entre el 07 y el 10/09 hubo
-- cinco despachos (Z10 −10 y Pro 720 −2 el 10/09 a CC-025; satinado −1 el 09/09
-- y Pure White y Cityscape −1 cada uno el 07/09, a CC-017). Al ser el conteo
-- POSTERIOR, los números ya los incluyen y el ajuste va fechado hoy sin apilar
-- nada encima. Si el conteo hubiera sido del 08/09, el Z10 habría terminado en
-- −5,5 y no sería un problema de carga sino de faltante físico.
--
-- NOTACIÓN DE LA PLANILLA (aclarada por el user): el entero son baldes cerrados
-- y el decimal es lo que queda en uno abierto. "5,05" = 5 cerrados + medio.
-- Por eso hay cantidades con coma: 0,8 es una lata abierta al 80% sin ninguna
-- cerrada.
--
-- EL DELTA SE CALCULA CONTRA EL LIBRO, no contra `stock_actual`: el cache no
-- tiene trigger (§5.15) y podría estar desfasado. Se verificó que hoy los 13
-- estaban en sync, pero calcular contra la suma de movimientos es correcto
-- igual y no depende de eso. Después se recalcula el cache desde el libro.
--
-- El número contado es la verdad y no se toca: lo que se calcula es el delta.
--
-- Las fichas contadas en CERO (1152 frentes superelástico, 1157 Alba grafito,
-- 1094 verde tenis) no generan movimiento: el sistema ya decía 0 y el conteo lo
-- confirma. Anotar un ajuste de 0 sería ruido.
--
-- QUEDA AFUERA, esperando la foto de la etiqueta: Tersuave (4,8), Albacryl
-- (0,8) y Alba Latex (0,5). Sosa anotó solo la marca y crear tres fichas flacas
-- para después fusionarlas es peor que esperar (§5.15).

begin;

with contado(material_id, cant, nota) as (values
  (799,  5.5,  'satinado antimanchas 6105: el sistema decía -1'),
  (1156, 5.0,  'Loxon LD interior mate 6105: anotado como "5 x 20 L" en el renglón de 18, que es la base entonada (ver 20260913w)'),
  (1146, 4.0,  'Soft Touch 7100'),
  (1159, 0.0,  'exterior mate 7005 Pure White: contado 0, el sistema decía -1'),
  (1153, 0.0,  'exterior mate 7067 Cityscape: contado 0, el sistema decía -1'),
  (797,  4.5,  'Z10 cielorraso: el sistema decía -10 porque el depósito anota lo que sale y casi nunca lo que entra'),
  (1161, 0.0,  'Sherwin Pro 720: contado 0. El -2 venía de 2 baldes despachados a CC-025 el 10/09 sin entrada registrada'),
  (2654, 0.8,  'enduido plástico Prinz: una sola lata abierta'),
  (2655, 0.6,  'enduido plástico Venier: una sola lata abierta'),
  (1151, 0.5,  'enduido Casablanca exterior: media lata'),
  (2696, 7.0,  'Macadamia 6142: ficha nueva. La planilla del recuento decía "pedido en pliego, nunca comprado" y había 7 baldes'),
  (2697, 4.7,  'Kilim Beige 6106: ficha nueva, 4 cerrados y uno abierto'),
  (2698, 1.0,  'Quantum blanco: ficha nueva, antes se pedía por la genérica 115'),
  (2699, 0.5,  'Loxon LD interior mate PRO: ficha nueva, media lata abierta')
),
con_delta as (
  select c.material_id, c.cant, c.nota,
         c.cant - coalesce((
           select sum(case when v.tipo = 'salida' then -v.cantidad else v.cantidad end)
             from stock_movimientos v where v.material_id = c.material_id
         ), 0) as delta
  from contado c
)
insert into stock_movimientos
  (material_id, tipo, cantidad, motivo, estado, fecha, created_by, forzado_sin_stock, obs)
select material_id, 'ajuste', delta, 'ajuste_inventario', 'aprobado', current_date,
       'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'::uuid, false,
       'Recuento de látex (planilla en papel de Sosa, contada el 12/09): ' || nota
       || '. Contado ' || cant || '.'
from con_delta
where delta <> 0;

-- El cache no tiene trigger: se recalcula a mano desde el libro.
update stock_materiales m
   set stock_actual = coalesce((
         select sum(case when v.tipo = 'salida' then -v.cantidad else v.cantidad end)
           from stock_movimientos v where v.material_id = m.id
       ), 0),
       updated_at = now()
 where m.id in (799,1156,1146,1159,1153,1152,797,1161,2654,2655,1151,1157,1094,2696,2697,2698,2699);

do $$
declare v_mal text; v_neg text;
begin
  -- El cache tiene que coincidir con el libro en las 17 fichas tocadas.
  select string_agg(m.id || ' ' || m.nombre, ', ') into v_mal
    from stock_materiales m
   where m.id in (799,1156,1146,1159,1153,1152,797,1161,2654,2655,1151,1157,1094,2696,2697,2698,2699)
     and m.stock_actual <> coalesce((
       select sum(case when v.tipo='salida' then -v.cantidad else v.cantidad end)
         from stock_movimientos v where v.material_id = m.id), 0);
  if v_mal is not null then
    raise exception 'El cache quedó desfasado del libro en: %', v_mal;
  end if;

  -- Después de un recuento no puede quedar ningún negativo entre las contadas.
  select string_agg(m.id || ' ' || m.nombre || '=' || m.stock_actual, ', ') into v_neg
    from stock_materiales m
   where m.id in (799,1156,1146,1159,1153,797,1161,2654,2655,1151,2696,2697,2698,2699)
     and m.stock_actual < 0;
  if v_neg is not null then
    raise exception 'Quedaron negativos después del recuento: %', v_neg;
  end if;
end $$;

commit;
