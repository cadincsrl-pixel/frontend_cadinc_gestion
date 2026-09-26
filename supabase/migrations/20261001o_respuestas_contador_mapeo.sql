-- Respuestas del contador (25/09) al mapeo de cuentas de Finnegans → ERP.
-- Nota en Obsidian: Proyectos/Mapeo cuentas Finnegans → ERP (2026-09-25).md
--
-- 1. Concepto nuevo «Mantenimiento de rodados» → 4.2.1.03.15 (service de camiones y camionetas).
--    Pasan a ese concepto las ya imputadas de Truck NOA, Larocca neumáticos y Martin Escapes.
-- 2. Mapeos: Rodados (bien de uso) → 1.2.2.04.01; Gastos bancarios → 4.2.1.05.01.
-- 3. Imputaciones:
--    - El Limón FA 00003-00000002 (vehículo AC559KD) → Rodados, CC CADINC, y ficha de bien de uso a 5 años.
--    - Aseguradores de Cauciones (seguro para adelantos financieros de obras) → Seguros, CC CADINC.
--    - Cámara Tucumana de la Construcción (cuota societaria) → Otros (4.2.1.03.10), CC CADINC.
--    - Planta de Verificación Autopista FA 4-12678 → Mantenimiento de rodados, CC CADINC.
--      En Finnegans estaba en la cuenta «Obra Pje. Fco. de Asís 650»; el contador pidió CC CADINC y
--      revisarla más adelante por número de factura y proveedor.
--    - Romero Julio Leonardo (service, Áridos) y HDI Lubricentro (service) → Mantenimiento de rodados.
-- Alquiler de baño químico (Flores Gudiño) va a Alquileres; se imputa con el reparto por obra del cubo.
-- Equipo de soldadura Tauro (junio, antes del ERP) va al inventario de apertura de bienes de uso (2 años).

do $m$
declare
  u   uuid := 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8';
  v_c bigint;
begin
  insert into public.pagos_conceptos (nombre, orden, created_by, updated_by)
  values ('Mantenimiento de rodados', 45, u, u)
  returning id into v_c;

  perform public.cont_guardar_mapeos(jsonb_build_array(
    jsonb_build_object('clave','compras.concepto','subclave', v_c::text,'cuenta_id',1380,
                       'obs','Service de camiones y camionetas (contador 25/09)'),
    jsonb_build_object('clave','compras.concepto','subclave','17','cuenta_id',1288,
                       'obs','Rodados: bien de uso (contador 25/09)'),
    jsonb_build_object('clave','compras.concepto','subclave','18','cuenta_id',1398)
  ), u);

  update public.pagos_facturas f
     set concepto_id = v_c, updated_by = u
    from public.pagos_proveedores p
   where p.id = f.proveedor_id and f.concepto_id = 4 and f.estado <> 'anulada'
     and (p.razon_social ilike 'TRUCK NOA%' or p.razon_social ilike 'LAROCCA%' or p.razon_social ilike 'Martin Escapes%');

  perform public.pagos_imputar_lote(array[456]::bigint[], 17, 'CC CADINC', u);
  perform public.pagos_imputar_lote(array[88, 222, 923]::bigint[], 10, 'CC CADINC', u);
  perform public.pagos_imputar_lote(array[106, 404, 755]::bigint[], 12, 'CC CADINC', u);
  perform public.pagos_imputar_lote(array[203, 697, 698]::bigint[], v_c, 'CC CADINC', u);
  perform public.pagos_imputar_lote(array[211]::bigint[], v_c, 'CC-020', u);

  perform public.cont_guardar_bien(jsonb_build_object(
    'descripcion', 'Vehículo dominio AC559KD',
    'identificador', 'Dominio AC559KD · Chasis 8AB695023JA703670',
    'cuenta_origen_id', 1288, 'cuenta_amort_id', 1290, 'cuenta_gasto_id', 1374,
    'fecha_alta', '2026-08-10', 'valor_origen', 51722824.08, 'vida_util_anios', 5,
    'obra_cod', 'CC CADINC', 'pagos_factura_id', 456,
    'obs', 'El Limón SRL FA 00003-00000002. Rodado a 5 años según el contador (25/09).'
  ), u);
end $m$;
