-- desc_con_color pasa de norm_material a norm_txt
-- ===============================================
-- 2026-09-12
--
-- Corrige a 20260913t, aplicada minutos antes. El helper comparaba con
-- `norm_material`, que conserva la puntuación; `norm_txt` la aplana a espacios.
-- La diferencia importa en los colores compuestos: con norm_material,
--
--   desc_con_color('Cable unipolar 1.5mm² verde-amarillo', 'verde amarillo')
--
-- no reconocía que el color YA estaba en el nombre (guion contra espacio) y
-- devolvía "… verde-amarillo (verde amarillo)". Los colores de cable unipolar
-- se escriben de las dos formas, así que era un caso real, no teórico.
--
-- La segunda razón, igual de importante: `norm_txt` ya tiene un espejo exacto
-- en TypeScript (`src/lib/norm-txt.ts` del backend, con su propia advertencia
-- sobre no usar String.normalize('NFD')). Usar la misma función de los dos
-- lados es lo que permite que el helper de TS y este den el MISMO resultado —
-- verificado caso por caso contra la base: 12 de 12 coinciden.

create or replace function desc_con_color(p_desc text, p_color text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select case
    when coalesce(trim(p_color), '') = '' then p_desc
    when norm_txt(coalesce(p_desc, '')) like '%' || norm_txt(trim(p_color)) || '%'
      then p_desc
    else coalesce(p_desc, '') || ' (' || trim(p_color) || ')'
  end;
$fn$;
