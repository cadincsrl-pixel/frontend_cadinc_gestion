-- Dos VTV de flota interna tenían el vencimiento mal cargado, las dos hacia el
-- lado peligroso (el sistema creía que faltaba más de lo que falta, así que la
-- campana no iba a avisar a tiempo). Se cotejó contra el archivo adjunto.
--
-- AF927EW (Renault Kangoo): el certificado dice VENCIMIENTO 28/2/27. Estaba
-- cargado 31/08/2027, que es la FECHA DE INSPECCIÓN (31/08/26) más un año. El
-- vehículo está clasificado "Carga/Comercial 1", que lleva VTV de seis meses,
-- no de doce.
update public.flota_documentos
   set vence_el = '2027-02-28',
       obs = trim(coalesce(obs || ' · ', '') ||
             'Vencimiento corregido el 08/09/2026: estaba 31/08/2027 (la fecha de inspeccion mas un ano). El certificado dice 28/2/27; es VTV de 6 meses por ser Carga/Comercial 1.')
 where id = 40 and vence_el = '2027-08-31';

-- AH203RN (VW Saveiro): el sticker está perforado en MAY 2028, no en noviembre.
-- Se usa el día 1 igual que en OML763: el sticker solo da mes y año, y quedarse
-- corto hace que el aviso llegue antes, no después.
update public.flota_documentos
   set vence_el = '2028-05-01',
       obs = trim(coalesce(obs || ' · ', '') ||
             'Vencimiento corregido el 08/09/2026: estaba 01/11/2028. El sticker esta perforado en MAY 2028. Solo indica mes y ano; se usa el dia 1 para que el aviso llegue antes.')
 where id = 22 and vence_el = '2028-11-01';

-- La póliza cargada en la Ford Ranger es de otro dominio. No se borra ni se
-- cambia la fecha (la vigencia de la flota es la misma): se deja anotado, porque
-- el vehículo figura asegurado y el papel que lo respalda es de un acoplado.
update public.flota_documentos
   set obs = trim(coalesce(obs || ' · ', '') ||
             'REVISAR (08/09/2026): el PDF adjunto es la poliza del dominio AF629AG, un acoplado/semirremolque 2025 (chasis 8CB4SVZZZNB000522), no de esta camioneta. La vigencia 05/08/2026-05/08/2027 es la de la poliza de flota 13774293 y vale igual, pero falta el certificado propio de AH224AG.')
 where id = 35;
