-- 20260908y — La poliza de seguro de la Hilux AF898QV estaba cargada como VTV
-- (user 2026-09-07: "en flota interna parece que metieron los archivos del
-- seguro en la vtv")
--
-- El 25/08 se subieron 12 polizas, una por vehiculo, todas con el mismo
-- vencimiento (2027-08-05) y el mismo patron de nombre
-- "SEGURO <patente> VENC 5-8-2027.pdf". ONCE quedaron bien en `poliza_seguro`.
-- La de AF898QV (documento 31) quedo en `vtv`.
--
-- Que no queden dudas de que es la poliza y no una VTV:
--   * el archivo se llama "SEGURO AF898QV VENC 5-8-2027.pdf"
--   * vence 2027-08-05, identico a las otras once polizas
--   * se subio el 25/08/2026 12:06, en la misma tanda
--   * AF898QV era el UNICO vehiculo de la flota sin poliza cargada
--
-- La VTV de verdad de esa Hilux es el documento 20 (la foto de WhatsApp del
-- 03/06 que vence el 08/09/2026), y por eso la seccion mostraba dos.
update public.flota_documentos
set tipo = 'poliza_seguro',
    obs = coalesce(obs || ' · ', '') || 'Estaba cargado como VTV por error en la carga del 25/08/2026; corregido el 07/09.',
    updated_at = now()
where id = 31 and tipo = 'vtv' and nombre_archivo ilike '%SEGURO%';
