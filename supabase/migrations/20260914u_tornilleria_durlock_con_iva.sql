-- Tornillería de durlock: los precios estaban en NETO, sin el IVA
--
-- Lo levantó Nicolás: la tornillería del sistema está sin IVA y en su planilla
-- de precios está con IVA. Es cierto en 3 de las 7 fichas de tornillo de
-- durlock. El error es tomar el precio de lista del comprobante, dividirlo por
-- las unidades de la caja y cargar ese número, sin sumarle el 21%.
-- Todos los precios del sistema son finales, con IVA (CLAUDE.md §5.14).
--
-- Contra la planilla de Silva SRL (datos-entrada/Base de datos de precios -
-- Nicolas.xlsx, hoja "Base de precios", todos los renglones con base "Neto"):
--
--   ficha                        planilla (caja)      neto/u    c/IVA   cargado
--   #763 T1 punta mecha          T1 MECHA 8x9/16 x100  26,2893   31,81   26,28  X
--   #766 T2 punta mecha          T2 MECHA 6x1.1/8 x100 44,6198   53,99   44,61  X
--   #768 T3 punta aguja          T3 AGUJA 6x1.1/2 x100 30,8264   37,30   30,82  X
--   #940 T2 punta mecha c/ alas  TEL-ALAS 8x1.1/4 x100 42,5289   51,46   51,46  ok
--   #75  fix N°8 x 1 1/2"        TEL-FIX 8x1.1/2 x100  34,3967   41,62   41,62  ok
--   #77  T2 punta aguja          T2 AGUJA 6x1" x500    14,9306   18,07   18,07  ok
--
-- Las tres mal están truncadas a 2 decimales; las tres bien están redondeadas
-- con el IVA aplicado. Son dos manos distintas sobre la misma planilla.
--
-- El resto del catálogo no tiene este patrón: de los 189 renglones de la
-- planilla que emparejan con una ficha con precio, 89 coinciden al centavo y
-- ninguno más queda exactamente 21% abajo.
--
-- CLÍNICA SALTA QUEDA AFUERA, POR DECISIÓN DEL USER: ahí se compró más caro,
-- así que sus renglones reflejan su propia compra y no esta planilla. Son 5
-- renglones sin IVA ya cobrados (mcc 2682, 2683, 2684, 2801, 2804, $15.044) y
-- el renglón 2802, que tiene 1000 u de T2 punta aguja a $74,65 (la caja de 500
-- dividida por 100). Nada de eso se toca acá.

-- 1. El catálogo. Única puerta: fijar_precio_ref, que deja historial.
select fijar_precio_ref(763, 31.81, 'migracion');  -- Tornillo T1 punta mecha
select fijar_precio_ref(766, 53.99, 'migracion');  -- Tornillo T2 punta mecha
select fijar_precio_ref(768, 37.30, 'migracion');  -- Tornillo T3 punta aguja

-- 2. Los renglones ya despachados que arrastran el precio sin IVA. Ninguno
--    está cobrado ni certificado, así que no hay que descongelar nada.
--    El trigger de MCC deja el evento precio_cambiado con el antes y el después.
update materiales_a_cuenta_cliente
   set precio_unit = 31.81, precio_total = round(cantidad * 31.81, 2), updated_at = now()
 where id in (3118, 3201, 3251) and precio_unit = 26.28
   and cobro_id is null and certificado_id is null;

update materiales_a_cuenta_cliente
   set precio_unit = 53.99, precio_total = round(cantidad * 53.99, 2), updated_at = now()
 where id = 2895 and precio_unit = 44.61
   and cobro_id is null and certificado_id is null;

update materiales_a_cuenta_cliente
   set precio_unit = 51.46, precio_total = round(cantidad * 51.46, 2), updated_at = now()
 where id = 3026 and precio_unit = 42.52
   and cobro_id is null and certificado_id is null;

-- 3. Rastro en el renglón del pedido, para quien lo mire desde la solicitud.
update solicitud_compra_item i
   set obs = coalesce(i.obs || ' · ', '') ||
             'Precio corregido el 14/09 (20260914u): estaba cargado en neto, sin el IVA de la lista de Silva.'
 where i.id in (select item_id from materiales_a_cuenta_cliente
                 where id in (3118, 3201, 3251, 2895, 3026));
