-- Corrige los falsos positivos del marcado `usa_color` de 20260902s.
--
-- El regex agarró cosas donde "latex", "silicona", "pintura" o "cable" aparecen sin
-- que haya ninguna elección de color que hacer:
--   * "Guante latex multiuso": latex es el material del guante.
--   * "Pistola p/ cartucho de silicona": es la herramienta, no el sellador.
--   * "Removedor de pintura en gel": saca pintura, no tiene color.
--   * "Puente de adherencia (Sika Latex)": es un aditivo.
--   * Siliconas ya especificadas (blanca / transparente / neutra transp.): el regex
--     de exclusión miraba "blanco" pero no "blanca" ni "transparente".
--   * "Pintura demarcación vial amarilla": ya trae el color.
--   * Cables multiconductor (subterráneo, tipo taller, UTP, coaxil, telefónico) y
--     cable canal / de acero: los colores van adentro y son fijos. El color como
--     elección real es solo del **cable unipolar**, donde marca fase/neutro/tierra.
--   * Membranas asfálticas, velo de fibra, membrana Durlock, sellador anaeróbico y
--     Sika 221: vienen como vienen.
--
-- Un falso positivo no rompe nada (solo muestra un input de más), pero el objetivo
-- del flag era justamente que el campo NO apareciera donde no aporta.

update public.stock_materiales
   set usa_color = false
 where usa_color
   and (
        public.norm_material(nombre) ~ 'guante|pistola|removedor|puente de adherencia'
     or public.norm_material(nombre) ~ 'silicona (acetica|blanca|neutra|transparente)'
     or public.norm_material(nombre) ~ 'demarcacion vial'
     or public.norm_material(nombre) ~ 'membrana asfaltica|velo de fibra|membrana durlock'
     or public.norm_material(nombre) ~ 'anaerobico|sika 221'
     or public.norm_material(nombre) ~ '^cable (canal|coaxil|telefonico|utp|de acero|subterraneo|tipo taller)'
   );
