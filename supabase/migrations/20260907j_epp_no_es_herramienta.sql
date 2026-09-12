-- El EPP nunca es una herramienta del pañol.
--
-- Caso real (CC PODA, entregas 536 y 537): "Delantal de cuero soldador" es una
-- ficha con clase='epp' y aun así entró al pañol dos veces, porque el brazo 3 de
-- `es_herramienta_item` (detección por texto) corre aunque el renglón YA esté
-- vinculado a una ficha del catálogo, y el patrón 'soldador' pega dentro de
-- "delantal de cuero SOLDADOR". El user lo marcó: los delantales son consumibles.
--
-- Hay 3 fichas de EPP de soldador en esa situación: delantal (662), guante
-- descarne largo (649) y polainas de cuero (663).
--
-- Dos arreglos complementarios:
--
--  1) Brazo 2 bis: si el renglón está vinculado a una ficha con clase='epp', el
--     catálogo MANDA y la detección por texto ni siquiera corre. El EPP es
--     consumible por definición: va y no vuelve, así que no tiene nada que hacer
--     en un ledger que existe para saber qué se prestó a cada obra.
--
--     A propósito NO se hace lo mismo con clase='material': ahí el patrón sigue
--     pudiendo ganar, porque atrapa fichas mal clasificadas (caso "escalera de
--     madera chica", entrega 576, cargada como material siendo herramienta).
--     'epp' es la única clase que nunca puede ser una herramienta.
--
--  2) Patrones de exclusión por cabeza de frase, para el texto libre (que no
--     tiene ficha y por lo tanto no lo cubre el punto 1): delantal, guante,
--     polaina, careta, mameluco, antiparra. Todos son EPP de soldador o de obra
--     que hoy caen por 'soldador' o quedarían expuestos al mismo problema.
--
-- Reversible: revertir el CREATE OR REPLACE a la versión previa y desactivar
-- los patrones nuevos. No toca filas de herr_entregas ya escritas.

create or replace function public.es_herramienta_item(p_clase text, p_material_id integer, p_desc text)
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d      text;
  v_cabeza text;
begin
  -- Brazo 1: tildado a mano. Manda sobre todo y no toca el texto.
  if coalesce(p_clase, 'material') = 'herramienta' then
    return 'clase';
  end if;

  -- Brazo 2: el material del catalogo esta marcado como herramienta.
  if p_material_id is not null and exists (
       select 1 from stock_materiales m
        where m.id = p_material_id and m.clase = 'herramienta') then
    return 'catalogo';
  end if;

  -- Brazo 2 bis: el material del catalogo es EPP. El EPP es consumible: no se
  -- presta ni se devuelve, asi que no entra al panol y la deteccion por texto
  -- no corre. Sin esto, "Delantal de cuero soldador" entraba por 'soldador'.
  if p_material_id is not null and exists (
       select 1 from stock_materiales m
        where m.id = p_material_id and m.clase = 'epp') then
    return null;
  end if;

  -- Brazo 3: deteccion por texto. Recien aca se normaliza, UNA vez.
  v_d := public.norm_txt(p_desc);
  if v_d = '' then
    return null;
  end if;
  v_cabeza := split_part(v_d, ' ', 1);

  if exists (
       select 1 from herr_patrones p
        where p.activo and p.tipo = 'incluir'
          and v_d like '%' || p.patron || '%')
     and not exists (
       select 1 from herr_patrones p
        where p.activo and p.tipo = 'excluir'
          and p.patron in (v_cabeza, regexp_replace(v_cabeza, 'e?s$', '')))
  then
    return 'patron';
  end if;

  return null;
end;
$function$;

-- Patrones de exclusion para el texto libre. El matcher de excluir compara
-- contra la CABEZA de la frase (y su singular), no contra la frase entera.
insert into public.herr_patrones (patron, tipo, activo)
select v.patron, 'excluir', true
  from (values ('delantal'), ('guante'), ('polaina'), ('careta'), ('mameluco'), ('antiparra')) as v(patron)
 where not exists (
   select 1 from public.herr_patrones p where p.patron = v.patron and p.tipo = 'excluir');

-- (Este bloque se aplicó a prod como una llamada aparte, anotada en
-- supabase_migrations con el nombre `20260907k_excluir_guantes_plural`
-- (version 20260907125327). Ese nombre choca con el archivo real
-- 20260907k_sika_silva_factura_25502.sql y no existe como archivo: el SQL
-- vive acá, que es su lugar. No crear un archivo nuevo con esa copia.)
-- OJO con el singularizador: es regexp_replace(cabeza, 'e?s$', ''), así que
-- "guantes" queda en "guant", NO en "guante". Para las palabras cuyo singular
-- termina en 'e' hay que cargar también la forma plural tal cual. (delantales →
-- delantal, polainas → polaina y caretas → careta sí funcionan solas.)
insert into public.herr_patrones (patron, tipo, activo)
select v.patron, 'excluir', true
  from (values ('guantes'), ('guant')) as v(patron)
 where not exists (
   select 1 from public.herr_patrones p where p.patron = v.patron and p.tipo = 'excluir');
