-- =====================================================================
-- Dueños de obras, según el dueño (2026-09-23). Aplicado por SQL el mismo
-- día; este archivo lo deja escrito. Idempotente.
--
--   · CC NORTE «Corrientes» → Sanatorio del Norte S.R.L. (30-54587418-7).
--     130 renglones de materiales y 3.427 horas: no cambia ningún importe,
--     sólo con quién se agrupa.
--   · CC-020 «Áridos», CC AIRES «Aire acondicionado» y CC RETRO «Retro» son
--     de CADINC → internas y con materiales a cargo de CADINC. Aire y Retro
--     estaban «a cargo del cliente»: el único renglón de la cuenta (Aire) era
--     de $0, así que tampoco cambia ningún importe; el trigger de la obra
--     recalcula a_cargo_de de sus renglones.
-- =====================================================================

update public.obras o set cliente_id = c.id
  from public.ventas_clientes c
 where c.doc_tipo = 80 and c.doc_nro = '30545874187' and c.activo
   and o.cod = 'CC NORTE' and o.cliente_id is null;

update public.obras
   set es_interna = true, materiales_a_cargo_de = 'cadinc'
 where cod in ('CC-020', 'CC AIRES', 'CC RETRO') and cliente_id is null
   and not (es_interna and materiales_a_cargo_de = 'cadinc');
