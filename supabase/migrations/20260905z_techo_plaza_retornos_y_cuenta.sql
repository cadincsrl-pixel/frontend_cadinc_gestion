-- 20260905z — Techo Farmacia Plaza (CC-008): vuelven las herramientas y la cuenta corriente se cierra como la de Hipódromo
--
-- OK del user 2026-09-05: "Techo Farmacia Plaza devolvé las herramientas, y
-- cerrá la cuenta corriente al igual que Hipódromo". Hipódromo es llave en
-- mano: sus materiales son costo propio y no se facturan. Se aplica lo mismo:
-- la obra pasa a `materiales_a_cargo_de = 'cadinc'` y los 40 renglones sin
-- cobrar ($1.016.439, 14 sin precio) quedan como costo interno. Las
-- herramientas (22 unidades, 3 tipos) vuelven al pañol con la RPC del botón.

do $$
begin
  perform public.registrar_retorno_herramientas(
    (select jsonb_agg(jsonb_build_object('salida_id', id))
       from public.herr_entregas
      where obra_cod = 'CC-008' and sentido = 'salida' and estado = 'confirmada' and en_obra > 0),
    current_date,
    'Cierre de obra Techo Farmacia Plaza (05/09/2026): vuelve todo al pañol',
    'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8');
end $$;

update public.obras
   set materiales_a_cargo_de = 'cadinc', updated_by = 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', updated_at = now()
 where cod = 'CC-008' and materiales_a_cargo_de <> 'cadinc';
update public.materiales_a_cuenta_cliente
   set a_cargo_de = 'cadinc', updated_at = now()
 where obra_cod = 'CC-008' and cobro_id is null and a_cargo_de <> 'cadinc';
