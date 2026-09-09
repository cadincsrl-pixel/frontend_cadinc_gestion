-- LAMADRID: los cuatro renglones de POLLANO que quedaron a $1
--
-- En la compra del 08/09 a POLLANO SANITARIOS, cuatro renglones quedaron con
-- precio_unit = 1 — un placeholder, no un precio. El resto de esa misma
-- compra sí tiene precio real (codo 32 $935,83, reducciones $3.750 y
-- $1.179,97, toda la termofusión). El user los marcó: "son precios que no
-- existen, fijate en Mercado Libre y acomodalos".
--
-- Precios (búsqueda del 08/09, valor medio del rango, final con IVA):
--   3273 Codo PVC 32mm 45° HH        x10  $1.000/u  (ML $700-1.600)
--   3277 Manguito reparación 32 HH    x2  $1.200/u  (ML $970-1.650)
--   3278 Ramal PVC 32mm 45° HH        x2  $3.500/u  (ML $3.110-4.180, leídos
--                                                    de publicaciones reales)
--   3279 Caño PVC 32mm x 3m           x3  $4.200/u  ← NO es de ML
--
-- El caño va al precio de su ficha ($4.200), que el user fijó a mano hoy
-- mismo (historial 'manual', 00:42 UTC): manda su decisión sobre una
-- estimación. Queda anotado que ML lo ubica bastante más arriba ($7.800 a
-- $12.600 la tira de 3 m) y que el mismo caño se vendió a $30.000 en CLINICA
-- SALTA el 28/08, también a POLLANO — tres números muy distintos para el
-- mismo artículo; si el de la ficha resultara bajo, se ajusta.
--
-- Total: de $17 a $32.000.
--
-- ── Y SE DESCONGELAN ──
-- Los cuatro estaban imputados al cobro 11 (LAMADRID, $1.500.000 del 06/08),
-- que tiene solo $226,95 sin usar. Con los precios reales el cobro ya no los
-- cubre: dejarlos como "cobrado" diría que el cliente pagó $32.000 que no
-- pagó. Vuelven a "a cobrar" y el user puede correr "Imputar lo pagado" para
-- que se reasignen con la regla normal (primero lo más viejo).

-- En DOS pasos, respetando el candado `fn_mcc_congelada`: un renglón
-- cobrado no admite cambio de precio (tira MCC_COBRADO), y soltar el cobro
-- sin tocar los importes sí está permitido. Se descongela primero y se
-- valúa después — el mismo orden que exige la pantalla. No se usa el escape
-- `cadinc.descongelar`: acá el renglón realmente deja de estar cobrado.

update materiales_a_cuenta_cliente
   set cobro_id = null, monto_cobrado = null, updated_at = now()
 where id in (3273, 3277, 3278, 3279) and obra_cod = 'CC-016';

update materiales_a_cuenta_cliente set precio_unit = 1000, precio_total = 10000, updated_at = now() where id = 3273 and obra_cod = 'CC-016';
update materiales_a_cuenta_cliente set precio_unit = 1200, precio_total =  2400, updated_at = now() where id = 3277 and obra_cod = 'CC-016';
update materiales_a_cuenta_cliente set precio_unit = 3500, precio_total =  7000, updated_at = now() where id = 3278 and obra_cod = 'CC-016';
update materiales_a_cuenta_cliente set precio_unit = 4200, precio_total = 12600, updated_at = now() where id = 3279 and obra_cod = 'CC-016';

-- Las fichas del catálogo también estaban en $0: toman la misma referencia,
-- así el próximo despacho no vuelve a nacer sin precio.
update stock_materiales set precio_ref = 1000, precio_actualizado_en = '2026-09-08' where id = 2276 and precio_ref = 0;
update stock_materiales set precio_ref = 1200, precio_actualizado_en = '2026-09-08' where id = 2187 and precio_ref = 0;
update stock_materiales set precio_ref = 3500, precio_actualizado_en = '2026-09-08' where id = 1931 and precio_ref = 0;

-- QUEDA AFUERA: la grasera sanitaria 63mm de CLINICA SALTA (mcc 2711, también
-- POLLANO, también a $1, imputada al cobro comodín de $6M). Salta la está
-- acomodando el user a mano — ML la ubica en ~$26.000.

-- ── Y el certificado de prueba ──
-- El user probó la feature nueva en LAMADRID (certificado N° 1, $4.504.396,
-- 59 renglones) y lo dejó anulado con motivo "era una prueba". Se borra la
-- fila: no arrastraba nada (0 renglones y 0 cobros con ese certificado_id, y
-- las FK son ON DELETE SET NULL). Idempotente: si ya no está, no hace nada.
-- Nota para el futuro: la secuencia queda en 2, así que el próximo
-- certificado real nace con id 3; el `numero` es por obra y vuelve a 1.

delete from certificados_cliente
 where id = 2 and obra_cod = 'CC-016' and estado = 'anulado'
   and anulado_motivo = 'era una prueba';
