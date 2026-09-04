-- Performance de es_herramienta_item(): 1.152 ms -> 157 ms.
--
-- La version SQL de 20260904a llamaba norm_txt(p_desc) DENTRO de cada
-- subconsulta EXISTS, o sea una vez por patron: ~74 veces por renglon.
-- Medido con EXPLAIN ANALYZE sobre los 2.579 items de los ultimos 60 dias:
--   antes: Execution Time 1152 ms   (el join solo eran 2,4 ms)
--   ahora: Execution Time  157 ms
--
-- Importa porque esta funcion es el campo calculado `es_herramienta` que
-- consume la LISTA de pedidos (getAll): sin este arreglo, cada carga de la
-- pantalla de Compras y Stock se comia un segundo extra contra el nano de Render.
--
-- Version plpgsql: normaliza UNA sola vez, corta temprano en los dos primeros
-- brazos (que ni tocan el texto) y calcula la cabeza una vez.
-- Semantica IDENTICA: verificado, mismos 41 por catalogo y 211 por patron.

create or replace function public.es_herramienta_item(
  p_clase text, p_material_id integer, p_desc text
) returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
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
$$;
