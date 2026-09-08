-- OFICINA MISION SALTA 2026 (CC-022): los mosaicos de la vereda
--
-- Factura A 00003-00000070 de LA FABRIKA - GRANITOS Y MARMOLES (Guanuco
-- Joaquín Ignacio, Salta), 08/09/2026, transferencia: "Mosaico vereda gris
-- pulidos 40x40 cm (cancelación)" — 65 m² × $23.140,50 neto + IVA =
-- $1.820.000,32.
--
-- El user aclara: esa factura es la CANCELACIÓN, por LA MITAD del precio;
-- la otra mitad ya la había pagado. El costo real de los 65 m² es
-- 2 × $1.820.000,32 = $3.640.000,64 ($56.000/m² final con IVA).
-- Ya está entregado; solo quiere dejarlo registrado.
--
-- La obra es llave en mano (materiales_a_cargo_de = 'cadinc'): el renglón
-- entra como gasto CADINC (a_cargo_de = 'cadinc'), igual que los otros 48
-- renglones de la obra — no se le factura a nadie, es costo propio.

with pedido as (
  insert into public.solicitud_compra (obra_cod, fecha, estado, prioridad, obs)
  values ('CC-022', '2026-09-08', 'aprobada', 'normal',
          '[migración] Compra registrada desde la factura, ya entregada en obra (08/09).')
  returning id
),
item as (
  insert into public.solicitud_compra_item
    (solicitud_id, descripcion, cantidad, unidad, estado, precio_unit,
     cantidad_enviada, fecha_resolucion, fecha_envio, obs)
  select p.id, 'Mosaico vereda gris pulido 40x40 cm', 65, 'm2', 'enviado', 56000.01,
         65, '2026-09-08', '2026-09-08',
         'Factura LA FABRIKA A 00003-00000070 (08/09, $1.820.000,32) es la CANCELACION por la mitad; la otra mitad ya estaba pagada. Total real $3.640.000,64.'
  from pedido p
  returning id, solicitud_id
)
insert into public.materiales_a_cuenta_cliente
  (obra_cod, solicitud_id, item_id, descripcion, cantidad, unidad,
   precio_unit, precio_total, origen, fecha_resolucion, a_cargo_de)
select 'CC-022', i.solicitud_id, i.id, 'Mosaico vereda gris pulido 40x40 cm',
       65, 'm2', 56000.01, 3640000.64, 'proveedor', '2026-09-08', 'cadinc'
from item i;

-- Proveedor LA FABRIKA creado (id 60) y vinculado al renglón, para que el
-- resumen por proveedor lo muestre. (Aplicado junto con esta migración.)
-- insert into proveedores (nombre) values ('LA FABRIKA (Granitos y Mármoles)');
update public.materiales_a_cuenta_cliente
   set proveedor_id = 60
 where obra_cod = 'CC-022' and descripcion = 'Mosaico vereda gris pulido 40x40 cm';
update public.solicitud_compra_item i
   set proveedor_id = 60
  from public.materiales_a_cuenta_cliente c
 where c.item_id = i.id and c.obra_cod = 'CC-022'
   and c.descripcion = 'Mosaico vereda gris pulido 40x40 cm';
