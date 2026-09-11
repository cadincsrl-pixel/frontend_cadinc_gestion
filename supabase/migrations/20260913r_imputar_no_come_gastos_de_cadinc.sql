-- "Imputar lo pagado" se comía gastos de CADINC — soltar lo mal imputado
-- =====================================================================
-- 2026-09-11
--
-- `imputarPagado` (cuenta-cliente.service.ts) elegía los materiales del reparto
-- con un filtro incompleto:
--
--     .eq('obra_cod', obraCod).is('cobro_id', null).gt('precio_total', 0)
--
-- Le faltaban las dos exclusiones que `emitir_certificado_cliente` sí tenía:
--
--   1. `a_cargo_de <> 'cliente'` — gasto de CADINC, no se le cobra al cliente.
--      El reparto se lo comía y le sacaba capacidad al pago, dejando sin cubrir
--      facturable real.
--   2. `certificado_id is not null` — ya está en un certificado. Un pago a
--      cuenta podía cubrir medio certificado por fecha y dejarlo figurando
--      impago aunque el cliente lo había pagado. El pago de un certificado va
--      CONTRA el certificado, nunca por "Imputar lo pagado".
--
-- El código ya está arreglado (función pura `esMaterialImputable`, con tests).
-- Esta migración limpia lo que el bug alcanzó a imputar, que fue poco porque
-- recién el 08/09 se corrió el reparto por primera vez: 3 renglones de ropa de
-- trabajo por $7.344,50 en total.
--
--   id 175  CC-006  Guante de tela     $2.044,50  cobro 7
--   id 2182 CC-016  Guante de tela     $1.300,00  cobro 13
--   id 2410 CC-016  Mandil de trabajo  $4.000,00  cobro 13
--
-- Soltarlos del cobro devuelve esa capacidad a los pagos (cobro 13 pasa de
-- $99,55 a $5.399,55 libres; el 7, de $391,40 a $2.435,90), así que el próximo
-- "Imputar lo pagado" la va a usar en facturable de verdad.
--
-- No hace falta el escape `cadinc.descongelar`: `fn_mcc_congelada` bloquea
-- precio/cantidad, y acá solo se sueltan `cobro_id` y `monto_cobrado`, que no
-- cambian importes (CLAUDE.md §5.14).
--
-- Nada que hacer del lado de los certificados: al 11/09 hay 0 renglones
-- imputados que además estuvieran certificados.

begin;

update materiales_a_cuenta_cliente
   set cobro_id = null,
       monto_cobrado = null,
       updated_at = now()
 where cobro_id is not null
   and a_cargo_de <> 'cliente';

do $$
declare v_mal integer;
begin
  select count(*) into v_mal
    from materiales_a_cuenta_cliente
   where cobro_id is not null and a_cargo_de <> 'cliente';
  if v_mal > 0 then
    raise exception 'Quedaron % renglones de gasto CADINC imputados a un cobro', v_mal;
  end if;
end $$;

commit;
