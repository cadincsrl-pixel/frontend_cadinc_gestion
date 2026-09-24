-- =====================================================================
-- Los dueños particulares como clientes, y Techo Mendoza 418 interna
-- (2026-09-23)
--
-- El dueño eligió cargarlos como clientes para que «cuánto debe cada
-- cliente» los muestre con su nombre. Ninguno se facturó entre el 15/07 y el
-- 23/09:
--   · ALBOR JOSE MARIA (Praderas): CUIT 20-24167733-9 de la lista de
--     Finnegans. La condición IVA no se sabe sin el padrón de ARCA: queda
--     consumidor final, con nota de verificarla antes de facturarle.
--   · LEIRO LEONARDO (Helguera 29), APUD EDUARDO (Hotel), GALINDO FERNANDO
--     (Pinar 2), LEIRO FRANCO (Balsa Franco): sin documento conocido →
--     tipo 99 «sin identificar», consumidor final, con nota de completarlo.
--     (En Finnegans hay una «APUD MARIA EUGENIA» con otro CUIT: no es él.)
--   · CC-011 Techo Mendoza 418 es de CADINC → interna (ya estaba a cargo de
--     CADINC).
-- Idempotente.
-- =====================================================================

insert into public.ventas_clientes (razon_social, doc_tipo, doc_nro, condicion_iva_id, obs, created_by, updated_by)
select v.rs, v.dt, v.dn, 5, v.obs, 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8', 'a7d0ea6b-0bec-4ac0-bfc8-ef6262743dd8'
  from (values
    ('ALBOR JOSE MARIA', 80, '20241677339', 'Dueño de Praderas. CUIT de Finnegans. Condición IVA supuesta (consumidor final): verificar con el padrón de ARCA antes de facturarle.'),
    ('LEIRO LEONARDO',   99, '0', 'Dueño de Helguera 29. Sin DNI/CUIT cargado: completar antes de facturarle.'),
    ('APUD EDUARDO',     99, '0', 'Dueño del Hotel. Sin DNI/CUIT cargado: completar antes de facturarle.'),
    ('GALINDO FERNANDO', 99, '0', 'Dueño de Pinar 2. Sin DNI/CUIT cargado: completar antes de facturarle.'),
    ('LEIRO FRANCO',     99, '0', 'Dueño de Balsa Franco. Sin DNI/CUIT cargado: completar antes de facturarle.')
  ) v(rs, dt, dn, obs)
 where not exists (select 1 from public.ventas_clientes c where c.razon_social = v.rs and c.activo);

update public.obras o set cliente_id = c.id
  from public.ventas_clientes c
 where c.activo and o.cliente_id is null and not coalesce(o.es_interna, false)
   and ((o.cod = 'CC PRADERAS' and c.razon_social = 'ALBOR JOSE MARIA')
     or (o.cod = 'CC-034'      and c.razon_social = 'LEIRO LEONARDO')
     or (o.cod = 'CC-032'      and c.razon_social = 'APUD EDUARDO')
     or (o.cod = 'CC-024'      and c.razon_social = 'GALINDO FERNANDO')
     or (o.cod = 'CC-030'      and c.razon_social = 'LEIRO FRANCO'));

update public.obras set es_interna = true, materiales_a_cargo_de = 'cadinc'
 where cod = 'CC-011' and cliente_id is null and not es_interna;
