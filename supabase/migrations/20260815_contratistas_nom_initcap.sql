-- Normalización one-shot de nombres de contratistas: había mezcla de todo
-- mayúsculas, todo minúsculas y title case ("CESAR LADRILLOS", "arcont",
-- "Diego Gutierrez"). Desde ahora el backend normaliza al crear/editar;
-- esto empareja lo ya cargado.
update public.contratistas
set nom = initcap(btrim(regexp_replace(nom, '\s+', ' ', 'g')))
where nom is not null
  and nom <> initcap(btrim(regexp_replace(nom, '\s+', ' ', 'g')));
