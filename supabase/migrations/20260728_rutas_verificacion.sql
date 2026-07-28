-- Matriz de km: distinguir el km cargado a mano del sugerido por Google.
--
-- El km de una ruta es lo que se le paga al chofer por kilómetro, así que
-- llenar la matriz automáticamente sin marcarlo sería pagar con números que
-- nadie miró. La idea (pedido del dueño): completar los pares faltantes con
-- Google, dejarlos señalados como NO verificados, y que recién pasen a
-- "confiables" cuando alguien los revisa contra el mapa.
--
-- `verificada` arranca en TRUE a propósito: las 60 rutas que ya existen se
-- cargaron a mano una por una (y una auditoría del 26/07 con OSRM encontró
-- 47/53 dentro de ±10%). Si el default fuera FALSE, la matriz entera quedaría
-- marcada de un día para el otro y el estado dejaría de significar algo.

alter table public.rutas
  add column if not exists verificada     boolean not null default true,
  add column if not exists verificada_en  timestamptz,
  add column if not exists verificada_por uuid,
  add column if not exists origen_km      text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'rutas_verificada_por_fkey' and conrelid = 'public.rutas'::regclass
  ) then
    alter table public.rutas
      add constraint rutas_verificada_por_fkey
      foreign key (verificada_por) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'rutas_origen_km_check' and conrelid = 'public.rutas'::regclass
  ) then
    alter table public.rutas
      add constraint rutas_origen_km_check check (origen_km in ('manual', 'google'));
  end if;
end $$;

comment on column public.rutas.verificada is
  'false = el km lo sugirió Google y todavía nadie lo revisó contra el mapa. Se paga igual, pero la matriz lo marca y el modal de liquidar lo avisa.';
comment on column public.rutas.origen_km is
  'De dónde salió el km: manual | google. Se conserva incluso después de verificar, para saber el origen del número.';
comment on column public.rutas.verificada_en is
  'Cuándo se verificó. NULL en las rutas viejas: nacieron verificadas por el default de esta migración, sin un acto explícito de verificación.';

-- Sin índice: `rutas` tiene 60 filas y la matriz se trae completa de una para
-- pintarla. Un índice sobre `verificada` no se usaría nunca.
