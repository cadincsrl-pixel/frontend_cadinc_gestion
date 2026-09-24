-- =====================================================================
-- Compras: concepto de las 17 facturas que ya estaban (2026-09-25)
--
-- Por qué: el concepto pasa a ser obligatorio (20260925n) y la bandeja
-- filtra/agrupa por él; las 17 facturas cargadas antes quedarían «Sin
-- concepto». Se asignan por lo que dice su descripción (propuesta de la
-- spec, el dueño las puede cambiar desde la ficha):
--   Combustible ............... 44 (gasoil)
--   Materiales de obra ........ 11, 12, 13, 14 (aires para obra), 15, 16, 19, 20, 21, 23, 43
--   Herramientas y equipos .... 10 (puntas de demoledor, silicona)
--   Limpieza e insumos ........ 9 (esponja, detergente, lavandina), 17 (felpones y borradores)
--   Mantenimiento y repuestos . 18, 22 (tiro de camioneta)
--
-- Guardas: cada id tiene que existir y no tener concepto; cada concepto
-- tiene que existir por nombre; al final ninguna factura queda sin
-- concepto. Si algo no cuadra, falla entera.
-- Es un alta de dato, no una edición de nadie: no bumpea `updated_at` ni
-- deja auditoría (se apagan touch y audit_cambios solo durante el UPDATE).
-- Ningún trigger de desaprobación/congelado mira `concepto_id`: estados y
-- saldos no se mueven.
-- =====================================================================

alter table public.pagos_facturas disable trigger trg_pagos_facturas_touch;
alter table public.pagos_facturas disable trigger trg_audit_cambios;
do $b$
declare
  v_n int;
  v_esperadas int;
begin
  create temp table _asig (factura_id bigint primary key, concepto text not null) on commit drop;
  insert into _asig values
    (44, 'Combustible'),
    (11, 'Materiales de obra'), (12, 'Materiales de obra'), (13, 'Materiales de obra'), (14, 'Materiales de obra'),
    (15, 'Materiales de obra'), (16, 'Materiales de obra'), (19, 'Materiales de obra'), (20, 'Materiales de obra'),
    (21, 'Materiales de obra'), (23, 'Materiales de obra'), (43, 'Materiales de obra'),
    (10, 'Herramientas y equipos'),
    (9, 'Limpieza e insumos'), (17, 'Limpieza e insumos'),
    (18, 'Mantenimiento y repuestos'), (22, 'Mantenimiento y repuestos');
  select count(*) into v_esperadas from _asig;

  select count(*) into v_n
    from _asig a
    join public.pagos_facturas f on f.id = a.factura_id and f.concepto_id is null
    join public.pagos_conceptos c on c.nombre = a.concepto;
  if v_n <> v_esperadas then
    raise exception 'GUARDA: esperaba % facturas existentes, sin concepto y con concepto válido; hay %', v_esperadas, v_n;
  end if;

  update public.pagos_facturas f
     set concepto_id = c.id
    from _asig a
    join public.pagos_conceptos c on c.nombre = a.concepto
   where f.id = a.factura_id and f.concepto_id is null;
  get diagnostics v_n = row_count;
  if v_n <> v_esperadas then
    raise exception 'GUARDA: se actualizaron % facturas, esperaba %', v_n, v_esperadas;
  end if;

  select count(*) into v_n from public.pagos_facturas where concepto_id is null;
  if v_n > 0 then
    raise exception 'GUARDA: quedaron % facturas sin concepto', v_n;
  end if;
end $b$;
alter table public.pagos_facturas enable trigger trg_pagos_facturas_touch;
alter table public.pagos_facturas enable trigger trg_audit_cambios;
