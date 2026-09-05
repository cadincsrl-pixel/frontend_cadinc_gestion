-- 20260904bq — Barrido de todas las obras (1/2): herramientas y notas fuera de las cuentas
--
-- Pedido del user 2026-09-04: "anda revisando todas las obras que no revisamos y
-- anda poniendo todo lo de catálogo y ordenando las herramientas". Se revisaron
-- las 758 descripciones en texto libre de las 37 obras con renglón en la cuenta.
--
-- Esta mitad saca de las cuentas lo que no es material de la obra:
--   a) herramientas en texto libre que se reconocen y se vinculan a su tipo del
--      catálogo (el ledger del pañol las toma solo por el trigger),
--   b) herramientas que no se pueden tipificar ("alargue + tablero", "herramientas
--      de Gabriel", "máquina sondeadora"…): pasan a clase herramienta sin vínculo,
--   c) "cambio de demoledor" (canje, no salida): herramienta y fila del pañol ignorada,
--   d) notas que no son nada ("responsable Mario Barrionuevo", "Rodrigo Fernández"):
--      se sacan de la cuenta sin tocar el renglón.
-- Todas en $0 salvo "un juego de tubo grande para la máquina" (CC RETRO, $110.000),
-- que ya estaba marcada como herramienta a mirar. Ninguna cobrada.
-- La ruleta de 5 m (813) era clase material: pasa a herramienta.

-- tipos nuevos de herramienta
insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select v.nombre, 'unid', 0, 26, v.alias, 'herramienta', 'Alta 2026-09-04 (barrido de obras).'
from (values
  ('Ruleta (cinta métrica) 8m',        array['ruleta 8m','ruleta 7.5m','ruleta 7 mts','ruleta grande','cinta metrica 8m','ruleta 7,5']),
  ('Regla de aluminio 2.5m',           array['regla 2.5','reglas de 2,5','regla de 2,5 mts','regla 2,50','regla dos y medio']),
  ('Llana dentada 10mm',               array['llana dentada del 10','llana dentada 10','llana de 10']),
  ('Pisón vibratorio (canguro)',       array['canguro','pison vibratorio','compactador canguro','vibro apisonador']),
  ('Crique hidráulico',                array['cricket','crique','criquet','gato hidraulico','crike']),
  ('Hacha',                            array['hacha','hacha tolsen','hachita']),
  ('Machete',                          array['machete','machete para desmalezar']),
  ('Lima plana',                       array['lima','limas','lima plana','lima para afilar']),
  ('Roldana (polea)',                  array['roldana','polea','roldana para soga']),
  ('Terraja p/ roscar caños',          array['terraja','tarraja','terraja para canos','tarraja para roscar']),
  ('Minitorno',                        array['mini torno','minitorno','mini torno completo','dremel'])
) as v(nombre, alias)
where not exists (select 1 from public.stock_materiales m where lower(m.nombre) = lower(v.nombre));

update public.stock_materiales set clase = 'herramienta', rubro_id = 26,
       obs = coalesce(obs || ' · ', '') || 'Herramienta (barrido 2026-09-04).'
 where id = 813 and clase <> 'herramienta';

-- a) herramientas con tipo ────────────────────────────────────────────────────
create temp table herr (item_id int, mat int);
insert into herr values
  (2253, 742), (723, 742), (3168, 742),                       -- alargues 15 m
  (1945, 812),                                                -- pistola p/ cartucho
  (1465, 816), (2265, 816),                                   -- masa → maza
  (2238, 839),                                                -- pinza de perro
  (523, 903), (3099, 903), (1928, 903),                       -- tachos vacíos 20 l
  (568, 1096), (2860, 1096),                                  -- mandriles
  (1400, 1098),                                               -- escuadra
  (1469, 1100),                                               -- punta p/ demoledor
  (1029, 1112), (3164, 1112), (957, 1112),                    -- tablones de chapa
  (1454, 1201),                                               -- destornillador plano
  (1357, 1131),                                               -- cuerpo de andamio
  (2240, 1125), (2710, 1125),                                 -- cajón de herramientas
  (662, 1132),                                                -- fusionadora
  (444, 1115),                                                -- mezclador
  (3100, 1121), (2929, 1121), (1949, 1121),                   -- rotomartillos
  (2242, 1113),                                               -- agujereadora chica
  (896, 813), (895, 813),                                     -- ruletas nuevas (Esteban Rodríguez, Salazar)
  (1767, (select id from public.stock_materiales where nombre = 'Ruleta (cinta métrica) 8m')),
  (702,  (select id from public.stock_materiales where nombre = 'Ruleta (cinta métrica) 8m')),
  (2602, (select id from public.stock_materiales where nombre = 'Regla de aluminio 2.5m')),
  (955,  (select id from public.stock_materiales where nombre = 'Regla de aluminio 2.5m')),
  (1596, (select id from public.stock_materiales where nombre = 'Regla de aluminio 2.5m')),
  (991,  (select id from public.stock_materiales where nombre = 'Regla de aluminio 2.5m')),
  (1803, (select id from public.stock_materiales where nombre = 'Llana dentada 10mm')),
  (2345, (select id from public.stock_materiales where nombre = 'Pisón vibratorio (canguro)')),
  (1463, (select id from public.stock_materiales where nombre = 'Crique hidráulico')),
  (2647, (select id from public.stock_materiales where nombre = 'Hacha')),
  (2629, (select id from public.stock_materiales where nombre = 'Machete')),
  (883,  (select id from public.stock_materiales where nombre = 'Lima plana')),
  (3095, (select id from public.stock_materiales where nombre = 'Roldana (polea)')),
  (851,  (select id from public.stock_materiales where nombre = 'Roldana (polea)')),
  (1738, (select id from public.stock_materiales where nombre = 'Terraja p/ roscar caños')),
  (1690, (select id from public.stock_materiales where nombre = 'Terraja p/ roscar caños')),
  (885,  (select id from public.stock_materiales where nombre = 'Minitorno')),
  -- b) herramientas sin tipo (clase herramienta, texto libre)
  (1948, null), (466, null), (353, null), (2250, null), (2418, null), (2732, null), (1113, null), (2210, null),
  (369, null), (356, null), (2556, null), (475, null), (1470, null), (1494, null), (94, null), (1493, null),
  (676, null), (3187, null), (2235, null), (1960, null), (2497, null), (690, null),
  (1549, null), (3105, null), (1376, null), (879, null), (852, null), (84, null),
  (3133, null);                                                -- c) canje de demoledor

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'vinculacion_manual', null, i.estado, i.cantidad,
       i.descripcion || ' → ' || coalesce(m.nombre, 'herramienta (sin tipo)'),
       jsonb_build_object('motivo', 'barrido herramientas 2026-09-04', 'material_id', h.mat, 'desc_canonica', m.nombre, 'clase', 'herramienta')
from herr h join public.solicitud_compra_item i on i.id = h.item_id left join public.stock_materiales m on m.id = h.mat
where i.material_id is null;

update public.solicitud_compra_item i
   set material_id = coalesce(h.mat, i.material_id),
       descripcion = coalesce(m.nombre, i.descripcion),
       clase = case when h.mat is null then 'herramienta' else i.clase end
  from herr h left join public.stock_materiales m on m.id = h.mat
 where i.id = h.item_id and i.material_id is null;

-- d) notas que no son materiales
create temp table notas (item_id int);
insert into notas values (483), (241), (376), (897);

create temp table fuera as
select c.id as mcc_id, c.obra_cod, i.id as item_id, i.solicitud_id, i.estado, i.descripcion, c.cantidad, c.origen, c.precio_total,
       case when exists (select 1 from notas n where n.item_id = i.id) then 'nota' else 'herramienta' end tipo
from public.materiales_a_cuenta_cliente c
join public.solicitud_compra_item i on i.id = c.item_id
where c.cobro_id is null and (i.id in (select item_id from herr) or i.id in (select item_id from notas));

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, cantidad, comentario, meta)
select f.item_id, f.solicitud_id, 'sacado_de_cuenta_cliente', null, f.estado, f.cantidad,
       case when f.tipo = 'nota' then 'No es un material, era una nota del pedido: ' else 'Era una herramienta cargada en la cuenta de ' || f.obra_cod || ': ' end || f.descripcion,
       jsonb_build_object('motivo', 'barrido herramientas 2026-09-04', 'tipo', f.tipo, 'origen_mcc', f.origen, 'precio_total', f.precio_total, 'obra_cod', f.obra_cod)
from fuera f;
delete from public.materiales_a_cuenta_cliente c using fuera f where c.id = f.mcc_id;

-- el canje de demoledor no es una salida nueva
update public.herr_entregas
   set estado = 'ignorada', nota = coalesce(nota || ' | ', '') || 'canje de demoledor (mediano por chico), no es una salida nueva'
 where item_id = 3133 and estado not in ('anulada', 'ignorada');

drop table fuera; drop table notas; drop table herr;
