-- "Las espátulas son herramientas" (user, 14/09, a partir de la del pedido 720 de Garita).
--
-- Son SEIS fichas, todas en el rubro Pintura y con clase 'material': 364 (80mm), 365
-- (120mm), 719 (40mm), 804 (150mm), 2635 (125mm) y 2636 (140mm). Las llanas, que son la
-- herramienta hermana, ya estaban bien clasificadas.
--
-- Se sigue el procedimiento completo de CLAUDE.md §5.12, que son tres pasos y no uno:
--
--   1. EVENTO ANTES DE BORRAR. Cada fila de MCC que se saca deja su `sacado_de_cuenta_cliente`
--      con el motivo, para que el renglón pueda explicar por qué dejó de estar en la cuenta.
--   2. BORRAR LAS FILAS DE MCC. El trigger `trg_mcc_sin_herramientas` sólo frena los INSERT
--      futuros; las que ya estaban hay que sacarlas a mano.
--   3. TOCAR `material_id = material_id` EN LOS RENGLONES. Es lo que hace que el pañol los
--      tome. Sin este paso la reclasificación queda a medias: salen de la cuenta pero no
--      entran al inventario de herramientas.
--
-- LAS OCHO FILAS ESTÁN TODAS SIN COBRAR Y SIN CERTIFICAR, verificado antes de tocar: si
-- alguna hubiera tenido `cobro_id` o `certificado_id`, `fn_mcc_congelada` lo habría frenado
-- y el camino correcto sería otro (soltar del cobro primero).
--
-- PLATA: salen $40.378,34 de la cuenta, pero de eso sólo **$8.852,78 estaba a cargo del
-- cliente** (dos renglones de $4.426,39, en CC CLINICA HERAS y CC NORTE). Los otros seis ya
-- figuraban como gasto propio de CADINC, así que para esas obras no cambia lo facturable,
-- sólo dónde aparece el gasto.
--
-- Efecto verificado con rollback: el pañol pasa de 2 a 10 renglones.

insert into public.solicitud_item_eventos (item_id, solicitud_id, accion, estado_nuevo, cantidad, comentario, meta)
select i.id, i.solicitud_id, 'sacado_de_cuenta_cliente', i.estado, c.cantidad,
       'Era una herramienta cargada en la cuenta: ' || m.nombre,
       jsonb_build_object('motivo','espatulas pasadas a herramienta 2026-09-14','origen_mcc',c.origen)
  from public.materiales_a_cuenta_cliente c
  join public.solicitud_compra_item i on i.id = c.item_id
  join public.stock_materiales m on m.id = i.material_id
 where i.material_id in (364,365,719,804,2635,2636);

delete from public.materiales_a_cuenta_cliente c
 using public.solicitud_compra_item i
 where i.id = c.item_id and i.material_id in (364,365,719,804,2635,2636);

update public.stock_materiales set clase='herramienta', rubro_id=26
 where id in (364,365,719,804,2635,2636);

update public.solicitud_compra_item set material_id = material_id
 where material_id in (364,365,719,804,2635,2636);

do $$
declare n_mat int; n_mcc int; n_panol int;
begin
  select count(*) into n_mat from public.stock_materiales
   where id in (364,365,719,804,2635,2636) and clase='herramienta' and rubro_id=26;
  select count(*) into n_mcc from public.materiales_a_cuenta_cliente c
    join public.solicitud_compra_item i on i.id=c.item_id where i.material_id in (364,365,719,804,2635,2636);
  select count(*) into n_panol from public.herr_entregas he
    join public.solicitud_compra_item i on i.id=he.item_id where i.material_id in (364,365,719,804,2635,2636);
  if n_mat <> 6 then raise exception 'Sólo % de las 6 espátulas quedó como herramienta', n_mat; end if;
  if n_mcc <> 0 then raise exception 'Quedaron % filas de espátula en la cuenta del cliente', n_mcc; end if;
  if n_panol < 10 then raise exception 'El pañol tomó sólo % renglones, esperaba al menos 10', n_panol; end if;
end $$;
