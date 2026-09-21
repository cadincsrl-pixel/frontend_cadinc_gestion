-- Padrón de Pagos: los 4 proveedores de las facturas que estaban en datos-entrada.
--
-- El padrón de Pagos es propio y NO se cruza con public.proveedores (§5.18): estos se
-- cargan de cero con lo que dice el encabezado de cada comprobante, no copiando otra tabla.
--
-- Los CUIT se verificaron con el dígito verificador antes de escribirlos: el CHECK de la
-- tabla sólo mira que sean 11 dígitos, no que el CUIT exista.
--
-- NO se cargan CBU ni alias: en ningún comprobante figuran. Los tiene que poner quien
-- pague, desde la pantalla, y ahí queda registrado quién los cargó
-- (`datos_pago_actualizados_por`). Sin cuenta destino, una OP por transferencia rebota con
-- PROVEEDOR_SIN_DATOS_PAGO, que es exactamente lo que tiene que pasar.

insert into public.pagos_proveedores
  (razon_social, razon_social_norm, cuit, banco, plazo_pago_dias, contacto, telefono, email, obs)
select v.razon_social, public.norm_txt(v.razon_social), v.cuit, '', v.plazo,
       v.contacto, v.telefono, v.email, v.obs
from (values
  ('El Fontanero', '23275943479', 30,
   '', '3814195987', 'elfontanerogalpon@gmail.com',
   'Titular: Contreras Mario Gabriel. Adolfo de la Vega 635, S.M. de Tucumán. IVA Responsable Inscripto. Factura A, punto de venta 0008. Facturan a cuenta corriente.'),

  ('ABC S.A.', '30542851836', 30,
   '', '0381-4530750', '',
   'Sucursal Tucumán: Prov. de Córdoba 1177. Casa central: Dr. Ricardo Balbín 7400, Córdoba. Factura A, punto de venta 0012. Plazo de pago 30 días fecha factura. Aplica percepción de IIBB Tucumán (RES. 86/00) y de IVA (RG 2408/08).'),

  ('Prestigio S.A.', '30577428618', 30,
   'García Carlos Adrián', '0381-4825836', '',
   'Sucursal Colón, Av. Colón 4747. Factura A, punto de venta 05132. Lista con descuento por renglón (29%) y a veces una bonificación global al pie: el precio real sale del importe, no de la columna de precio. Aplica percepción de IVA.'),

  ('Pollano Sanitarios', '30714650870', 30,
   'Fabián Pollano', '', '',
   'Fabián R. Pollano y Gustavo A. De Camilo S.H. José Colombres 370, S.M. de Tucumán. IVA Responsable Inscripto. Hasta ahora entregan presupuesto en talonario X («documento no válido como factura»), con precio final y sin IVA discriminado: pedir factura antes de pagar.')
) as v(razon_social, cuit, plazo, contacto, telefono, email, obs)
where not exists (
  select 1 from public.pagos_proveedores p
   where p.cuit = v.cuit or p.razon_social_norm = public.norm_txt(v.razon_social)
);
