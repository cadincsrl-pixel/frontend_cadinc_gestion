-- 20260907h — Los códigos 7067 y 7005 son Loxon, según las facturas de Prestigio (2026-09-07)
--
-- Factura A 05132-00000589 de PRESTIGIO S.A. (10/07/2026), líneas textuales:
--     8785 (7067) LOX.LD.EXT.MATE S.COLOR DEEP x18   2,00  193.606,65  −33 %
--     8792 (7005) LOX.LD.EXT.MATE S.COLOR EW   x18   3,00  188.461,58  −33 %
-- (PDF en `datos-entrada/prestigio.pdf`, hoja 4, y suelto en Descargas como
--  TICKET-FACTURA_A_513200000589.PDF. Ninguna factura de Prestigio está cargada
--  como `facturas_compra`: se usaron solo como fuente de precios el 04/09.)
--
-- O sea: la base DEEP es 7067 y la base EW es 7005. Dos cosas quedaron mal:
--
--  1. El 04/09 (`20260904bo`) la ficha del Loxon Deep (1153) se cargó con los
--     sinónimos 7055. El 7055 NO figura en ninguna de las cinco facturas de
--     Prestigio (499, 543, 589, 602, 619). El código de esa fila es 7067.
--
--  2. El 07/09 (`20260907e_pinturas_sosa_aguarras`) los códigos 7067 y 7005 se
--     sumaron como sinónimos del latex genérico "Latex exterior x 20lts" (115),
--     que es otro producto: la factura los da como las dos bases del Loxon
--     exterior x 18 lts, que es lo que la capilla ya venía comprando.
--
-- El 7055 se queda en "Esmalte sintético x 4lts" (122): el renglón 3400 salió
-- del depósito con 2 latas de esmalte reales (stock 122 −2), y ese despacho
-- físico respalda la lectura. Después de esta migración cada código vive en una
-- sola fila: 7055 → 122, 7067 → 1153, 7005 → 1159.
--
-- OJO al usar estos códigos como identidad: el paréntesis NO es único. El 6106
-- aparece en dos productos distintos (KEM SATINADO x3,60 en la 589 y
-- LOX.LD.INT.MATE x18 en la 619).
--
-- NO TOCA los renglones 1542 y 1825 de septiembre, que entraron a la cuenta
-- como Loxon Deep por haber sido leídos como 7055 ($156.956,51 c/u, sin cobrar).
-- Eso lo revisa el user: puede ser que la pintura sea la correcta aunque el
-- código estuviera mal.

-- ═══ 1) el Loxon Deep pasa a 7067 ══════════════════════════════════════════
update public.stock_materiales
   set alias = array(select distinct x from unnest(
                 array(select y from unnest(alias) y where y !~ '7055')
                 || array['7067','pintura 7067','sw 7067','sw7067','loxon 7067']) x),
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: el código es 7067, no 7055. Factura Prestigio 05132-00000589 (10/07/2026), '
             'línea 8785 (7067) LOX.LD.EXT.MATE S.COLOR DEEP x18. El 7055 no figura en ninguna factura '
             'de Prestigio y quedó en el esmalte sintético x 4lts (122).',
       updated_at = now()
 where id = 1153;

-- ═══ 2) el latex genérico devuelve los códigos que no son suyos ════════════
update public.stock_materiales
   set alias = array(select y from unnest(alias) y where y !~ '(7067|7005)'),
       obs = coalesce(nullif(obs, '') || ' · ', '') ||
             '2026-09-07: se le sacan los sinónimos 7067 y 7005 que se le habían puesto esa mañana. '
             'Según la factura Prestigio 05132-00000589 son las dos bases del Loxon LD exterior mate '
             'x 18 lts (Deep 1153 y EW 1159), no este latex.',
       updated_at = now()
 where id = 115;

-- ═══ 3) los dos renglones pendientes del pedido 680 van al Loxon ═══════════
-- Los dos están 'pendiente', con precio_unit null y sin fila en la cuenta del
-- cliente: cambiarlos no mueve un peso.
create temp table mov (item_id int, material_id int, codigo text);
insert into mov values (3401, 1153, '7067'), (3402, 1159, '7005');

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_anterior, estado_nuevo, comentario, meta)
select i.id, i.solicitud_id, 'correccion', null, i.estado,
       'Código ' || v.codigo || ': según la factura Prestigio 05132-00000589 es ' || d.nombre
       || ', no el latex genérico x 20 lts.',
       jsonb_build_object('motivo','codigos loxon segun factura prestigio 2026-09-07',
                          'material_anterior', i.material_id, 'material_nuevo', d.id,
                          'evidencia','factura A 05132-00000589 PRESTIGIO S.A. 10/07/2026')
from mov v
join public.solicitud_compra_item i on i.id = v.item_id and i.material_id = 115 and i.estado = 'pendiente'
join public.stock_materiales d on d.id = v.material_id;

update public.solicitud_compra_item i
   set material_id = v.material_id,
       descripcion = d.nombre || ' (cód. ' || v.codigo || ')',
       unidad      = 'lata'
  from mov v join public.stock_materiales d on d.id = v.material_id
 where i.id = v.item_id and i.material_id = 115 and i.estado = 'pendiente';

drop table mov;
