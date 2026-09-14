-- El tercer recalculador de "quien paga" tambien tiene que respetar lo certificado
--
-- La migracion 20260914aa arreglo el hueco en fn_obras_recalc_a_cargo_de (que
-- respetaba lo cobrado pero no lo certificado) y el trigger nuevo del renglon
-- nacio con las dos guardas. Quedo afuera el tercero, que lo encontro la
-- revision adversarial del mismo dia: fn_stock_materiales_recalc_a_cargo_de,
-- que corre cuando se le cambia la CLASE a una ficha del catalogo.
--
-- Escenario: se emite un certificado, el cliente lo tiene en la mano, y despues
-- alguien pasa una ficha a clase 'epp' (o saca un epp mal clasificado). El
-- trigger recalculaba TODOS los renglones de esa ficha sin cobrar, incluidos
-- los ya certificados, y los mandaba a gasto propio. El total del certificado
-- impreso dejaba de coincidir con la suma de sus renglones.
--
-- Hoy es gratis: certificados_cliente esta vacia. Despues del primer
-- certificado emitido deja de serlo, igual que el hueco que arreglo la aa.
--
-- Con esto los TRES escritores de a_cargo_de quedan con la misma regla:
-- no se reinterpreta lo cobrado ni lo certificado. Nunca.

create or replace function public.fn_stock_materiales_recalc_a_cargo_de()
returns trigger
language plpgsql
as $function$
begin
  update public.materiales_a_cuenta_cliente c
     set a_cargo_de = public.calc_a_cargo_de(c.obra_cod, c.item_id)
    from public.solicitud_compra_item i
   where i.id = c.item_id and i.material_id = new.id
     and c.cobro_id is null
     and c.certificado_id is null
     and c.a_cargo_de is distinct from public.calc_a_cargo_de(c.obra_cod, c.item_id);
  return null;
end $function$;
