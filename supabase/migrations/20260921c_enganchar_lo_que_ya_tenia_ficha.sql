-- =====================================================================
-- Enganchar lo que ya tenía ficha (2026-09-21)
--
-- Revisión del texto libre de los últimos 10 días: 33 renglones sobre 518.
-- Casi todo es genuinamente único (la balsa, el pañol, retazos) y se queda
-- como texto: en toda la historia del sistema sólo 11 textos libres se
-- repitieron 2 veces o más. Lo que sí se arregla es lo que YA tenía ficha y
-- no se enganchó porque el matcher corre AL CREAR el renglón (§5.15).
--
-- (1) "escalera andamios" (renglón 4106, CORRIENTES, 4 unid, enviado) →
--     ficha 2776, que se creó el 17/09 justamente por este pedido, unas
--     horas DESPUÉS de que el renglón se cargara. El alias "escalera
--     andamio" ya está en la ficha; no hacía falta ninguno nuevo.
--     Importa porque es herramienta: su fila del pañol (herr_entregas 1206)
--     tiene material_id NULL, así que las 4 escaleras de Corrientes no se
--     cuentan por tipo.
--
--     OJO, y por eso se escribe explícito: trg_herr_entregas_sync NO completa
--     una fila del pañol que ya existe. Sólo INSERTA lo que falta — calcula
--     `v_falta = cantidad_enviada − lo ya registrado` y con 4 de 4 sale por
--     `return null` sin mirar el material_id. La nota del §5.12 sobre tocar
--     `material_id = material_id` vale para las filas que todavía no nacieron.
--     Hoy hay 9 filas del pañol sin tipo (6 vivas); esta migración arregla la
--     de la escalera, que es la que tiene ficha a la que apuntar.
--
-- (2) La ficha 2778 quedó escrita como "nafta x 20l": minúscula, sin alias,
--     y el nombre dice 20 litros con unidad "unid". Se ordena el nombre y se
--     le ponen sinónimos DEL BIDÓN, nunca "nafta" a secas — un alias de una
--     palabra sobre un envase concreto es el bug de plata del §5.15. Como no
--     hay trigger que propague el rename, la descripción de su único renglón
--     se actualiza acá.
--
-- (3) Los pasadores del pedido 877 están cargados dos veces (renglón 4232 por
--     120 unid y renglón 4233 por 1). Los dos ya salieron y los dos están en
--     $0, así que no hay plata en juego todavía. No se toca ninguno: se deja
--     anotado en la observación para que lo resuelva quien sabe la cantidad.
--
-- LO QUE NO SE HACE, A PROPÓSITO: los tres renglones "nafta" de CONCEPCION PL
-- (3881, 3882, 3883) NO se enganchan a la ficha 2778. Se había propuesto,
-- pero al mirarlos de cerca no son bidones: son cargas de combustible de
-- $55.999,99, $80.000 y $60.000, montos que a precio de nafta no entran en
-- 20 litros. Engancharlos diría que se compraron tres bidones cuando fueron
-- ~$196.000 de combustible suelto. La convención del catálogo para
-- combustible ya existe y es la ficha "Gasoil" (847): nombre genérico y
-- unidad en LITROS. Queda a decisión del dueño.
-- =====================================================================

do $$
declare
  v_herr_material integer;
  v_renglones     integer;
  n               integer;
begin
  -- (1) La escalera de Corrientes ────────────────────────────────────
  update solicitud_compra_item
     set material_id = 2776
   where id = 4106 and material_id is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'ESCALERA_NO_ENGANCHADA: % filas', n;
  end if;

  -- La fila del pañol ya existía con material_id NULL: se completa a mano,
  -- con el nombre de la ficha, para que el tab Salidas la cuente por tipo.
  update herr_entregas e
     set material_id      = i.material_id,
         descripcion      = m.nombre,
         descripcion_norm = norm_txt(m.nombre)
    from solicitud_compra_item i
    join stock_materiales m on m.id = i.material_id
   where e.item_id = i.id and i.id = 4106 and e.material_id is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'PANOL_NO_ACTUALIZADO: % filas', n;
  end if;

  select material_id into v_herr_material from herr_entregas where item_id = 4106;
  if v_herr_material is distinct from 2776 then
    raise exception 'PANOL_SIN_TIPO: herr_entregas quedó en %', coalesce(v_herr_material::text, 'NULL');
  end if;

  -- (2) La ficha de nafta, escrita como corresponde ──────────────────
  update stock_materiales
     set nombre = 'Nafta x 20lts',
         alias  = array['nafta x 20l', 'nafta 20 litros', 'nafta 20l',
                        'bidon de nafta', 'bidon nafta 20', 'nafta en bidon']
   where id = 2778 and nombre = 'nafta x 20l';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FICHA_NAFTA_NO_ACTUALIZADA: % filas', n;
  end if;

  -- Sin trigger de propagación, la descripción del renglón se sincroniza acá.
  update solicitud_compra_item
     set descripcion = 'Nafta x 20lts'
   where material_id = 2778 and btrim(descripcion) = 'nafta x 20l';
  get diagnostics v_renglones = row_count;

  update materiales_a_cuenta_cliente
     set descripcion = 'Nafta x 20lts'
   where item_id in (select id from solicitud_compra_item where material_id = 2778)
     and btrim(descripcion) = 'nafta x 20l';

  -- (3) Los pasadores duplicados, anotados y sin tocar ───────────────
  update solicitud_compra_item
     set obs = btrim(coalesce(obs, '') || ' · POSIBLE DUPLICADO del renglón 4232 (120 unid) en este mismo pedido: definir cuál queda.')
   where id = 4233
     and coalesce(obs, '') not like '%POSIBLE DUPLICADO%';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'PASADOR_NO_ANOTADO: % filas', n;
  end if;

  raise notice 'OK · escalera enganchada · ficha 2778 renombrada · % renglón(es) resincronizados · pasador anotado', v_renglones;
end $$;
