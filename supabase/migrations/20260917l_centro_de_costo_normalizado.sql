-- El centro de costo de las obras, normalizado: un nombre por cliente
--
-- El user, 17/09: "me gustaría filtrar por obra o por centro de costo de
-- manera distinta, ya que a veces el cliente le gusta ir cubriendo por obra".
-- ANIMAR paga sus cuatro clínicas con un solo saldo; BRADEL sus farmacias.
--
-- El campo ya existía — `obras.cc`, se edita en la ficha de la obra y el tab
-- Costos ya agrupa por él — pero era texto libre y estaba sucio:
--   · BRADEL escrito de tres formas ("BRADEL", "bradel", "cc bradel america")
--   · las cuatro clínicas de ANIMAR con CUATRO valores distintos
--     ("Clinicas", "CC CLINICA YB", "ACOMPAÑAR SAN JUAN" y Salta en null)
--   · "IGLESIA" / "IGLESIAS" / "Iglesias" / "CC IGLESIAS"
--   · 7 obras de cliente sin nada
-- Agrupar por eso daba basura. Las agrupaciones las propuse yo y el user las
-- confirmó ("1 es como vos decís"):
--   ANIMAR    = Salta, Heras, YB, San Juan
--   BRADEL    = Farmacia 25, Mantenimiento Farmacia, San Martín 1050, Casa
--               Bianca, Farmacia América, Techo San Martín 1050 (+ Farmacia
--               Roca y Farmacia Salta, archivadas)
--   ARCOR     = Arcor Canaleta, Casa Operarios (+ Arcor, archivada)
--   ARAUCANA  = 9 de Julio 882
--   IGLESIAS  = Villaguay, Mantenimiento Iglesia, Poda (+ Santiago Cabildo,
--               Valle Fértil, Misión Salta, archivadas)
--   HIPODROMO = Garita (+ Hipódromo, archivada)
-- y las que son un solo cliente con una sola obra quedan con su nombre,
-- limpio (sin "CC ", sin espacios, en mayúscula). Las que estaban vacías
-- también: sin centro cargado, la obra es su propio centro, y así ninguna
-- queda afuera de la agrupación.
--
-- Lo que NO se decidió, y queda con su nombre hasta que el user diga:
--   · CASA DE LA MISION (San Pablo), OFICINA MISION SALTA, SALTA OLAVARRIA
--     — ¿son de la Iglesia? ¿de ANIMAR?
--   · FARMACIA PLAZA (Techo Farmacia Plaza, archivada) — ¿es BRADEL?
--   · Caja Bella Vista, ITEC, Macro Urquiza — archivadas y sin nada; no
--     entran al resumen.
--
-- `cc` no se joinea con ninguna tabla: sólo se muestra (exports, Tarja) y se
-- agrupa por él (Costos, y desde hoy el resumen de cuenta corriente). Cambiar
-- el texto no rompe nada. Probado con rollback: 4 + 8 + 3 + 6 + 21 filas.

update public.obras set cc = 'ANIMAR'   where cod in ('CC CLINICA SALTA', 'CC CLINICA HERAS', 'CC clinica YB', 'CC-029');
update public.obras set cc = 'BRADEL'   where cod in ('CC FARM 25', 'CC-026', 'CC-004', 'CC-005', 'CC-023', 'CC-028', 'CC BRADEL', 'CC FARM SALTA');
update public.obras set cc = 'ARCOR'    where cod in ('CC-027', 'CC-014', 'CC-002');
update public.obras set cc = 'ARAUCANA' where cod = 'CC-013';
update public.obras set cc = 'IGLESIAS' where cod in ('cc 24', 'CC-012', 'CC PODA', 'CC SANTIAGO', 'CC VALLE FERTIL', 'CC-009');
update public.obras set cc = 'HIPODROMO' where cod in ('CC-025', 'CC-019');

update public.obras set cc = v.cc
  from (values
    ('CC-016', 'LAMADRID 566'), ('CC-006', 'CASA BELEN'), ('CC PRADERAS', 'PRADERAS'), ('CC-024', 'PINAR 2'),
    ('CC-001', 'ORAN'), ('CC RETRO', 'RETROPALA'), ('CC-020', 'ARIDOS CADINC'), ('CC-011', 'CADINC'),
    ('CC-015', 'LAPRIDA 196'), ('CC CASA WM', 'CASA WM'), ('CC-003', 'SIPROSA'), ('CC-008', 'FARMACIA PLAZA'),
    ('cc 08', 'CASA DE LA MISION'),
    ('CC AIRES', 'AIRE ACONDICIONADO'), ('CC NORTE', 'CORRIENTES'), ('CC-017', 'CONCEPCION CAPILLA'),
    ('CC-018', 'CONCEPCION PL'), ('CC-021', 'PASAJE KOTCH'), ('CC-022', 'OFICINA MISION SALTA'),
    ('CC-030', 'BALSA FRANCO'), ('CC SALTA', 'SALTA OLAVARRIA')
  ) as v(cod, cc)
 where obras.cod = v.cod;
