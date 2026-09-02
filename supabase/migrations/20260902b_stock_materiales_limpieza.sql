-- =====================================================================
-- Catálogo de materiales — FASE 1a: limpieza de duplicados y defectos
--
-- Antes de sumar materiales nuevos o abrir el alta a las obras hay que
-- dejar el catálogo consistente. Son 12 filas: 9 correcciones de nombre,
-- rubro o unidad, y 3 bajas lógicas (activo=false, NUNCA delete: rompería
-- FKs históricas de stock_movimientos y solicitud_compra_item).
--
-- REGLA APLICADA EN LOS DUPLICADOS: sobrevive la fila que TIENE historia
-- (stock y movimientos), no la más antigua. Verificado 2026-09-02:
--   · Disco flap 4 1/2 (717) tiene stock 10 y 1 movimiento; la 169 está
--     en cero y sin referencias. Sobrevive la 717, renombrada.
--   · Guantes de descarne (720) tiene stock 22, 1 item y 2 movimientos;
--     la 648 está vacía. Sobrevive la 720. El dueño confirmó que los 22
--     en stock son CORTOS.
--   · Alfajía pino 1x2" (556) y Listón pino 1x2" (606) son la misma
--     madera (confirmado por el dueño). Las dos están vacías; se conserva
--     la alfajía porque es como se pide en obra ("50ml de alfajias 1x2").
-- =====================================================================

-- ── 1. Disco flap: unificar en la fila con existencia ────────────────
update public.stock_materiales set activo = false,
  obs = coalesce(obs || ' · ', '') || 'Baja 2026-09-02: duplicada con id 717, que conserva el stock.'
where id = 169;
update public.stock_materiales
   set nombre = 'Disco flap 115mm', rubro_id = 7,
       obs = coalesce(obs || ' · ', '') || 'Absorbe la id 169 (2026-09-02). Medida en mm, no en pulgadas.'
where id = 717;

-- ── 2. Guante de descarne: los 22 en stock son cortos ────────────────
update public.stock_materiales set activo = false,
  obs = coalesce(obs || ' · ', '') || 'Baja 2026-09-02: duplicada con id 720, que conserva el stock.'
where id = 648;
update public.stock_materiales
   set nombre = 'Guante descarne corto', rubro_id = 15,
       obs = coalesce(obs || ' · ', '') || 'Absorbe la id 648 (2026-09-02). Todo EPP va en rubro 15.'
where id = 720;

-- ── 3. Alfajía y listón 1x2 son la misma madera ──────────────────────
update public.stock_materiales set activo = false,
  obs = coalesce(obs || ' · ', '') || 'Baja 2026-09-02: misma madera que la id 556 (Alfajía). En obra se pide "alfajía".'
where id = 606;

-- ── 4. Las 5 altas ad-hoc de jul-ago salieron defectuosas ────────────
update public.stock_materiales
   set nombre = 'Revoque fino exterior hidrorrepelente x 30kg', unidad = 'bolsa'
where id = 723;                                    -- estaba en `unid` y sin decir qué es
update public.stock_materiales set nombre = 'Espátula 40mm'
where id = 719;                                    -- sin tilde, contra sus dos hermanas
update public.stock_materiales
   set nombre = 'Disco sierra circular 7 1/4" x 60 dientes', rubro_id = 13
where id = 718;                                    -- minúscula, "cirular", y es de madera

-- ── 5. Precintos: una sola grafía y un solo rubro ────────────────────
update public.stock_materiales set nombre = 'Precinto plástico 15cm', rubro_id = 6 where id = 277;
update public.stock_materiales set nombre = 'Precinto plástico 20cm'                where id = 152;

-- ── 6. Clavos: la familia vive en Ferretería ─────────────────────────
update public.stock_materiales set rubro_id = 6 where id in (107, 108);

-- ── 7. Rodillo de lana: decir qué pelo es ────────────────────────────
update public.stock_materiales set nombre = 'Rodillo lana pelo corto 23cm' where id = 126;

-- ── 8. La alfajía que sobrevive estaba en Pisos, siendo madera ───────
update public.stock_materiales set rubro_id = 13 where id = 556;
