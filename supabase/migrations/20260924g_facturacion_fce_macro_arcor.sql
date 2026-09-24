-- =====================================================================
-- 20260924g — Facturación, fase 6: datos reales de FCE (2026-09-23).
--
-- Fuente: dos FCE que CADINC emitió desde el portal de ARCA (PV 1):
--   · FCE A 00001-00000007 a BANCO MACRO, 17/06/2026: CBU de la cuenta de
--     CADINC en Macro (Macro pide cobrar ahí) y «Referencia Comercial» con su
--     número de OC.
--   · FCE A 00001-00000012 a ARCOR, 11/09/2026: domicilio del receptor.
--
-- 1. Cuenta Banco Macro de CADINC (no es la de por defecto: Galicia sigue).
-- 2. Cliente BANCO MACRO SOCIEDAD ANONIMA (CUIT 30500010084, RI), con la
--    cuenta de Macro como preferida para la FCE. Si otra sesión ya lo cargó,
--    solo se le asigna la cuenta.
-- 3. Domicilio de ARCOR S A I C (id 43), solo si está vacío.
-- =====================================================================

do $$
declare
  v_cta bigint;
  v_cli bigint;
begin
  select id into v_cta from public.ventas_cuentas_bancarias where cbu = '2850140230094250465501' and activo;
  if v_cta is null then
    insert into public.ventas_cuentas_bancarias (banco, cbu, alias, es_default, obs)
    values ('Banco Macro', '2850140230094250465501', 'SEDANTE.ATRIO.REBAJO', false,
            'La de la FCE a Banco Macro del 17/06/2026 (portal de ARCA). Macro pide cobrar en su banco.')
    returning id into v_cta;
  end if;

  select id into v_cli from public.ventas_clientes where doc_tipo = 80 and doc_nro = '30500010084' and activo;
  if v_cli is null then
    insert into public.ventas_clientes (razon_social, doc_tipo, doc_nro, condicion_iva_id, domicilio, provincia, cuenta_fce_id, obs)
    values ('BANCO MACRO SOCIEDAD ANONIMA', 80, '30500010084', 1, 'Madero Eduardo Av. 1182', 'Capital Federal', v_cta,
            'Recibe FCE MiPyME en su cuenta de Macro (FCE A 00001-00000007 del 17/06/2026). 20260924g.')
    returning id into v_cli;
  else
    update public.ventas_clientes set cuenta_fce_id = v_cta where id = v_cli;
  end if;

  update public.ventas_clientes
     set domicilio = 'Av Fulvio S Pagani 487 - Arroyito',
         provincia = case when btrim(provincia) = '' then 'Cordoba' else provincia end
   where doc_tipo = 80 and doc_nro = '30502793175' and btrim(domicilio) = '';
end $$;
