-- ── Talles de ropa de trabajo para personal ───────────────────────────────
alter table personal
  add column if not exists talle_pantalon text,
  add column if not exists talle_botines  text,
  add column if not exists talle_camisa   text;
