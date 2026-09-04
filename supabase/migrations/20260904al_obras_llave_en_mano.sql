-- 20260904al — Las obras llave en mano, según el user (2026-09-04)
--
-- Tildadas una por una sobre la lista de obras activas. Casa Operarios (CC-014)
-- ya estaba desde 20260904ak. El trigger `trg_obras_recalc_a_cargo_de` pasa a
-- 'cadinc' las filas de la cuenta de cada obra (salvo las ya cobradas), así que
-- este UPDATE es todo lo que hace falta. Las demás activas quedan 'cliente'.

update public.obras
   set materiales_a_cargo_de = 'cadinc'
 where cod in (
   'CC BELLA VISTA',   -- Caja Bella Vista
   'CC-003',           -- CAPS
   'CC-017',           -- Concepción Capilla
   'CC-018',           -- Concepción PL
   'CC-025',           -- Garita
   'CC HERREROS',      -- Herreros
   'CC-019',           -- Hipódromo
   'CC-015',           -- Laprida 196
   'CC LOGISTICA',     -- Logística
   'CC MACRO',         -- Macro Urquiza
   'CC CADINC 1',      -- Mantenimiento
   'CC-012',           -- Mantenimiento Iglesia
   'CC CADINC',        -- Obrador
   'CC-022',           -- Oficina Misión Salta 2026
   'CC-001',           -- Orán 2026
   'CC PODA',          -- Poda
   'CC VALLE FERTIL',  -- Valle Fértil
   'cc 24',            -- Villaguay
   'CC-011'            -- Techo Mendoza 418
 )
   and materiales_a_cargo_de <> 'cadinc';
