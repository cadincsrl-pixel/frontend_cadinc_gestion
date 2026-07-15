-- Remolques (tabla `bateas`): consolidar la clasificación en UN solo campo
-- `tipo` con el vocabulario real de la flota: batea, acoplado, semirremolque,
-- sider, tanque cisterna. Reemplaza el par tipo(forma)+categoria(clase) que
-- quedó del 2026-07-15a — el user piensa en una sola dimensión.
-- La tabla NO se renombra (deuda conocida de modelos paralelos); solo cambia
-- la UI a "Camiones y remolques".

alter table bateas drop constraint bateas_tipo_check;

-- Mapeo de los valores viejos a los nuevos:
--   volcadora → batea (la batea volcadora es "la batea" a secas)
--   la plana XBM836 ya estaba categorizada como acoplado
update bateas set tipo = 'batea'    where tipo = 'volcadora';
update bateas set tipo = 'acoplado' where categoria = 'acoplado';

alter table bateas add constraint bateas_tipo_check
  check (tipo is null or tipo in ('batea', 'acoplado', 'semirremolque', 'sider', 'tanque_cisterna', 'otro'));

-- La categoría del 15a queda absorbida por `tipo`.
alter table bateas drop column categoria;
