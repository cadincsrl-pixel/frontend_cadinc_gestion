-- ═══════════════════════════════════════════════════════════════════
--  solicitud_compra_item.updated_by — desbloquear el flujo "en proveedor"
-- ───────────────────────────────────────────────────────────────────
--  Las RPCs resolver_item_en_proveedor y retirar_de_proveedor (migración
--  20260429_stock_en_proveedor.sql) hacen:
--      UPDATE solicitud_compra_item SET ... updated_by = p_user_id
--  pero la tabla NUNCA tuvo esa columna → cada llamada falla con
--  42703 "column updated_by does not exist".
--
--  Consecuencia (verificado en prod 2026-07-01): el checkbox "queda en
--  proveedor" al comprar y TODO el circuito §5.8 (en_proveedor → retiro
--  RR-NNNN → MCC diferido) devuelven 500 y jamás funcionaron desde abril.
--  Evidencia: 0 filas en stock_proveedor_movimientos, 0 en
--  remitos_retiro_proveedor, 0 ítems en estados en_proveedor/retirado.
--
--  Fix quirúrgico: agregar la columna que las RPCs ya escriben. Además de
--  desbloquear el flujo, suma la trazabilidad temporal de la última
--  modificación del ítem, que hoy no existe (la tabla no tiene
--  created_at/updated_at/updated_by). Nullable, sin default: los ítems
--  históricos quedan en NULL, que es lo correcto (no sabemos quién los
--  tocó por última vez).
-- ═══════════════════════════════════════════════════════════════════

alter table public.solicitud_compra_item
  add column if not exists updated_by uuid references auth.users(id);
