-- 20260905x — San Pablo: vuelven las 10 herramientas al pañol; la obra pasa a llave en mano; se archivan San Pablo, Valle Fértil y Caja Bella Vista
--
-- OK del user 2026-09-05: "que vuelvan las herramientas de San Pablo, los
-- materiales no importa porque es llave en mano, y archivá esas 3".
-- 1) Retorno de las 10 salidas confirmadas con algo en obra (cc 08) con la
--    misma RPC que usa el botón "Volvió al pañol" (una devolución por salida).
-- 2) El sistema tenía a San Pablo con materiales a cargo del CLIENTE (16
--    renglones sin cobrar, ~$32.000); el user dice que es llave en mano →
--    `materiales_a_cargo_de = 'cadinc'` y las filas no cobradas pasan a
--    a_cargo_de 'cadinc' (costo interno, no se factura).
-- 3) Se archivan las tres. Valle Fértil y Bella Vista no tienen herramientas
--    en obra y sus renglones abiertos ya eran internos (llave en mano).

do $$
begin
  perform public.registrar_retorno_herramientas(
    (select jsonb_agg(jsonb_build_object('salida_id', id))
       from public.herr_entregas
      where obra_cod = 'cc 08' and sentido = 'salida' and estado = 'confirmada' and en_obra > 0),
    current_date,
    'Cierre de obra San Pablo (05/09/2026): vuelve todo al pañol',
    'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
end $$;

update public.obras
   set materiales_a_cargo_de = 'cadinc', updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where cod = 'cc 08' and materiales_a_cargo_de <> 'cadinc';
update public.materiales_a_cuenta_cliente
   set a_cargo_de = 'cadinc', updated_at = now()
 where obra_cod = 'cc 08' and cobro_id is null and a_cargo_de <> 'cadinc';

update public.obras
   set archivada = true, fecha_archivo = current_date,
       updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where cod in ('cc 08', 'CC VALLE FERTIL', 'CC BELLA VISTA') and coalesce(archivada, false) = false;
