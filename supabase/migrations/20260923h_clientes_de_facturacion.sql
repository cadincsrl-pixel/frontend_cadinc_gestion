-- =====================================================================
-- Los clientes de Facturación: los 27 a los que CADINC facturó (2026-09-23)
--
-- Fuente: el reporte de ventas de Finnegans del 15/07 al 23/09/2026 (153
-- comprobantes de CADINC S.R.L., 27 clientes). La razón social y el CUIT
-- salen de la lista de clientes de Finnegans, que es lo que ya va impreso en
-- las facturas. No se importó esa lista entera a propósito: tiene 577 filas
-- mezcladas con los clientes de la otra razón social (obras sociales,
-- pacientes), 273 sin CUIT y duplicados.
--
-- Condición frente al IVA, por la letra que se les facturó en el período:
--   · 26 con factura A (o FCE A) → IVA Responsable Inscripto (1).
--   · ANIMAR S.R.L. con factura B → IVA Sujeto Exento (4). Confirmado por el
--     dueño.
-- Los 27 CUIT pasan el dígito verificador. «Paramerica SA» de Logística es
-- PROSAL S.A. (mismo CUIT; está dentro del grupo Paramerica, dijo el dueño).
--
-- El domicilio queda vacío: la lista de Finnegans no lo trae. Se completa
-- desde el padrón de ARCA cuando esté la consulta de constancia.
--
-- Se vinculan las obras cuyo cliente es obvio por el centro de costo:
-- IGLESIAS, BRADEL, ANIMAR, ARCOR y HIPODROMO (Jockey Club). El resto de los
-- clientes nuevos (Sanatorio del Norte, Assistmedic, …) queda sin obra hasta
-- que el dueño diga cuáles son.
-- =====================================================================

do $$
declare n integer;
begin
  with datos(razon_social, doc_nro, condicion_iva_id) as (values
  ('AB-MIX SOCIEDAD ANONIMA', '30708564377', 1),
  ('ACEITERA GENERAL DEHEZA S.A.', '30502874353', 1),
  ('AGRO CASA BOIX S. R. L.', '30717593029', 1),
  ('ANIMAR S.R.L.', '30714069620', 4),
  ('ARCOR S A I C', '30502793175', 1),
  ('ASSISTMEDIC S.R.L.', '30709681350', 1),
  ('BRADEL DEL PUEBLO S R L', '33702413309', 1),
  ('BUNGE ARGENTINA S. A.', '30700869918', 1),
  ('CAJA POPULAR DE AHORROS DE LA PROVINCIA DE TUCUMAN', '30517999551', 1),
  ('CASILDA COMBUSTIBLES S.R.L.', '30715675265', 1),
  ('COMPLEJO ALIMENTICIO SAN SALVADOR S.A.', '30711828326', 1),
  ('CONDOMINIO SUC.FLOMEMBOM DE DIMOND Y OTROS', '30712042067', 1),
  ('DELOTTE SA', '30659909061', 1),
  ('DIMOND HECTOR ELIAS', '20070712599', 1),
  ('FLETES Y SERVICIOS PUJATO S A', '33695663299', 1),
  ('GRAVANO JUAN AGUSTIN', '20296846601', 1),
  ('GRUPO ANTA DEL PLATA S.A.', '30715746154', 1),
  ('JOCKEY CLUB DE TUCUMAN SOC CIVIL', '30525902672', 1),
  ('LA IGLESIA DE JESUCRISTO DE LOS SANTOS DE LOS ULTIMOS DIAS', '30544857815', 1),
  ('LARTIRIGOYEN Y CIA S A', '30613985995', 1),
  ('MARATHON SRL', '30675376669', 1),
  ('PROSAL S A', '30707209840', 1),
  ('SAN ROMAN EDUARDO', '20264123209', 1),
  ('SANATORIO DEL NORTE S R L', '30545874187', 1),
  ('TRANSPORTE BOCHA S. A. S.', '33719037319', 1),
  ('TRANSPORTE GLOBAL S.A.S.', '30716052121', 1),
  ('TRANSPORTE L. SANDOVAL S. A. S.', '30717523322', 1)
  )
  insert into public.ventas_clientes (razon_social, doc_tipo, doc_nro, condicion_iva_id, obs, created_by, updated_by)
  select d.razon_social, 80, d.doc_nro, d.condicion_iva_id,
         'Cargado desde Finnegans (facturado entre el 15/07 y el 23/09/2026). Falta el domicilio: completarlo desde el padrón de ARCA.',
         'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
    from datos d
   where not exists (select 1 from public.ventas_clientes c where c.doc_tipo = 80 and c.doc_nro = d.doc_nro and c.activo);
  get diagnostics n = row_count;
  raise notice 'clientes cargados: %', n;

  update public.obras o set cliente_id = c.id
    from public.ventas_clientes c
   where c.doc_tipo = 80 and c.activo and o.cliente_id is null
     -- Las internas no: CC PODA tiene cc = 'IGLESIAS' pero es de CADINC (§5.18).
     and not coalesce(o.es_interna, false)
     and ((o.cc = 'IGLESIAS'  and c.doc_nro = '30544857815')
       or (o.cc = 'BRADEL'    and c.doc_nro = '33702413309')
       or (o.cc = 'ANIMAR'    and c.doc_nro = '30714069620')
       or (o.cc = 'ARCOR'     and c.doc_nro = '30502793175')
       or (o.cc = 'HIPODROMO' and c.doc_nro = '30525902672'));
  get diagnostics n = row_count;
  raise notice 'obras vinculadas: %', n;
end $$;
