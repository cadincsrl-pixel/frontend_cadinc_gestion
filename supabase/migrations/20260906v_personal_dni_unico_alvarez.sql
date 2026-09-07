-- 20260906v — Personal: DNI de Alderete a verificar, Alvarez unificado en 091,
-- teléfonos basura fuera, legajo/teléfono con formato y DNI único.

-- 1) Alderete (009) y Aparicio (089) compartían el DNI 41961116. Por el año de
--    nacimiento (Aparicio 1999, Alderete 1990) el número es de Aparicio; el de
--    Alderete queda vacío hasta que Nicolás lo revise (pedido del user).
update public.personal
   set dni = '',
       obs = concat_ws(' · ', nullif(obs, ''), 'DNI a verificar con Nicolás: figuraba 41961116, que es el de Aparicio (leg 089). 2026-09-06')
 where leg = '009' and dni = '41961116';

-- 2) ALVAREZ LUCAS GABRIEL tenía dos legajos: 011 (por hora, 9 días en CC BRADEL
--    en marzo) y 091 (mensualizado desde mayo). Todo pasa a 091.
update public.horas                  set leg = '091' where leg = '011';
update public.tarja_hs_extras        set leg = '091' where leg = '011';
update public.asignaciones           set leg = '091' where leg = '011';
update public.cat_obra               set leg = '091' where leg = '011';
update public.prestamos              set leg = '091' where leg = '011';
update public.ropa_entregas          set leg = '091' where leg = '011';
update public.personal_documentos    set leg = '091' where leg = '011';
update public.herr_movimientos       set responsable_leg = '091' where responsable_leg = '011';
update public.alquiler_obra_maquinas set maquinista_leg  = '091' where maquinista_leg  = '011';
-- La categoría de marzo (cat 3) rige desde el viernes 13/03, primer día con
-- horas, hasta la de mensualizado (cat 11 desde 05/05): el costo de CC BRADEL
-- queda igual que antes.
update public.personal_cat_historial set leg = '091', desde = '2026-03-13' where leg = '011';
delete from public.personal where leg = '011';

-- 3) Teléfonos: "381" solo (20 filas, truncado en el import) no es un teléfono;
--    el único con 0 y 15 pasa a 10 dígitos.
update public.personal set tel = '3815847362' where tel = '0381155847362';
update public.personal set tel = '' where tel <> '' and tel !~ '^[0-9]{8,13}$';

-- 4) Formato garantizado por la base y DNI único (el backend exige DNI al crear
--    y no deja borrarlo; hay 7 legajos viejos sin DNI que la alerta reclama).
alter table public.personal add constraint personal_leg_formato_check check (leg ~ '^[0-9]{3,4}$');
alter table public.personal add constraint personal_tel_formato_check check (tel is null or tel = '' or tel ~ '^[0-9]{8,13}$');
create unique index personal_dni_uidx on public.personal (dni) where dni <> '';
