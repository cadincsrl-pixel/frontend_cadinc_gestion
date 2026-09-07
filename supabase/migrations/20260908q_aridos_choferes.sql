-- Padrón de choferes de Áridos, con su jornal.
--
-- Áridos se maneja como un brazo aparte de CADINC (palabras del dueño: "pensalo
-- como un brazo extra de cadinc, que se maneja independiente, es otra area").
-- Por eso NO se reusa `personal` (el padrón de tarja, con legajo, categoría y
-- semana viernes-jueves) ni `choferes` (el de logística, con modalidad km_jornal
-- o porcentaje sobre facturación y liquidaciones propias). Se verificó que el
-- único chofer nombrado hoy, "Jose naranjo", NO está en ninguno de los dos.
--
-- CÓMO COBRAN: por DÍA TRABAJADO. Entonces hacen falta dos cosas que el sistema
-- no tiene: el jornal (cuánto vale el día) y los días (cuántos trabajó).
--
-- EL JORNAL VA VERSIONADO, como todo precio en este ERP (`categoria_tarifas`,
-- `tarifas`, `aridos_costos_cantera`, `oficina_sueldos`). Un UPDATE in-place
-- recalcularía retroactivamente meses ya pagados: es exactamente el incidente
-- del 2026-06-26 con el valor hora global, que costó reconstruir los históricos
-- desde un Excel. No se repite.

-- ── Los choferes ──────────────────────────────────────────────────────
create table if not exists public.aridos_choferes (
  id          serial primary key,
  nombre      text not null,
  dni         text,
  tel         text,
  activo      boolean not null default true,
  obs         text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create unique index if not exists aridos_choferes_nombre_uidx
  on public.aridos_choferes (public.norm_txt(nombre));

comment on table public.aridos_choferes is
  'Choferes del area de aridos. Padron propio: no son los de logistica (tabla choferes) ni el personal de tarja.';

-- ── El jornal, versionado ─────────────────────────────────────────────
create table if not exists public.aridos_chofer_jornales (
  id            serial primary key,
  chofer_id     integer not null references public.aridos_choferes(id) on delete cascade,
  jornal        numeric not null check (jornal >= 0),
  vigente_desde date    not null,
  obs           text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  unique (chofer_id, vigente_desde)
);

comment on table public.aridos_chofer_jornales is
  'Cuanto vale el dia de cada chofer, versionado. El jornal vigente para una fecha es la fila mas reciente con vigente_desde <= esa fecha. NUNCA actualizar in-place: se inserta una version nueva.';

-- ── Los días trabajados ───────────────────────────────────────────────
-- Una fila por día efectivamente trabajado. Se guarda contra qué unidad,
-- porque el resultado se quiere ver por camión.
--
-- El monto del día se congela en la fila (`jornal_aplicado`): si mañana sube el
-- jornal, los meses ya cerrados no se mueven. Es el mismo criterio con el que
-- `materiales_a_cuenta_cliente` congela el precio de un renglón ya resuelto.
create table if not exists public.aridos_chofer_dias (
  id              bigserial primary key,
  chofer_id       integer not null references public.aridos_choferes(id) on delete restrict,
  fecha           date    not null,
  unidad_id       integer references public.aridos_unidades(id) on delete set null,
  jornal_aplicado numeric check (jornal_aplicado >= 0),
  obs             text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Un chofer no puede cobrar dos veces el mismo día.
create unique index if not exists aridos_chofer_dias_uq
  on public.aridos_chofer_dias (chofer_id, fecha) where deleted_at is null;
create index if not exists aridos_chofer_dias_mes_idx
  on public.aridos_chofer_dias (fecha desc) where deleted_at is null;
create index if not exists aridos_chofer_dias_unidad_idx
  on public.aridos_chofer_dias (unidad_id, fecha desc) where deleted_at is null;

-- ── La unidad apunta al chofer del padrón ─────────────────────────────
-- La columna vieja `chofer` (texto libre) se conserva: es el dato con el que se
-- va a hacer el match manual la primera vez.
alter table public.aridos_unidades
  add column if not exists chofer_id integer references public.aridos_choferes(id) on delete set null;

comment on column public.aridos_unidades.chofer is
  'LEGADO: nombre del chofer en texto libre. Usar chofer_id. Se conserva para poder matchear las fichas viejas.';

-- ── Triggers de updated_at ────────────────────────────────────────────
create or replace function public._aridos_choferes_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['aridos_choferes','aridos_chofer_jornales','aridos_chofer_dias'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_'||t||'_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public._aridos_choferes_touch()', 'trg_'||t||'_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t||'_all', t);
  end loop;
end $$;

-- ── El chofer que ya estaba en texto libre ────────────────────────────
-- "Jose naranjo" en el Ford 1722. Se da de alta sin jornal: el dueño lo carga.
insert into public.aridos_choferes (nombre, obs)
select distinct trim(u.chofer),
       'Alta automatica el 2026-09-07 desde el campo de texto de la unidad. Falta cargarle el jornal.'
  from public.aridos_unidades u
 where coalesce(trim(u.chofer),'') <> ''
   and not exists (select 1 from public.aridos_choferes c
                    where public.norm_txt(c.nombre) = public.norm_txt(trim(u.chofer)));

update public.aridos_unidades u
   set chofer_id = c.id
  from public.aridos_choferes c
 where coalesce(trim(u.chofer),'') <> ''
   and public.norm_txt(c.nombre) = public.norm_txt(trim(u.chofer))
   and u.chofer_id is null;

-- ── Lo que hay que pagarle a cada chofer, por mes ─────────────────────
-- Usa el jornal congelado en el día; si esa fila no lo tiene (carga vieja o a
-- mano), cae al jornal vigente a esa fecha. Si no hay ninguno, el día cuenta
-- pero suma $0 y `dias_sin_jornal` lo delata — mejor que ocultar el día.
create or replace view public.v_aridos_chofer_pago_mes as
select date_trunc('month', d.fecha)::date          as mes,
       d.chofer_id,
       c.nombre                                     as chofer,
       d.unidad_id,
       u.nombre                                     as unidad,
       count(*)                                     as dias,
       count(*) filter (where coalesce(d.jornal_aplicado, j.jornal) is null) as dias_sin_jornal,
       sum(coalesce(d.jornal_aplicado, j.jornal, 0)) as a_pagar
  from public.aridos_chofer_dias d
  join public.aridos_choferes c on c.id = d.chofer_id
  left join public.aridos_unidades u on u.id = d.unidad_id
  left join lateral (
    select jj.jornal
      from public.aridos_chofer_jornales jj
     where jj.chofer_id = d.chofer_id and jj.vigente_desde <= d.fecha
     order by jj.vigente_desde desc
     limit 1
  ) j on true
 where d.deleted_at is null
 group by 1, 2, 3, 4, 5;

alter view public.v_aridos_chofer_pago_mes set (security_invoker = on);

comment on view public.v_aridos_chofer_pago_mes is
  'Dias trabajados y plata a pagar por chofer, mes y unidad. dias_sin_jornal > 0 significa que ese numero esta incompleto: hay dias sin jornal cargado.';
