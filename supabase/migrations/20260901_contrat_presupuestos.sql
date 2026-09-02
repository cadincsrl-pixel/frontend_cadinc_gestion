-- =====================================================================
-- Contratistas: presupuestos múltiples por obra×contratista (fase 1, ADITIVA)
--
-- Diseño: Obsidian → Proyectos/Contratistas — Presupuestos y certificaciones (diseño).md
-- Reglas de negocio (2026-09-01):
--   · El certificado se paga sí o sí el viernes de cobro (= operarios) → el
--     estado pendiente/cerrado por certificación deja de existir (se dropea
--     en la fase 2, después del deploy del backend nuevo).
--   · Un contratista puede tener N presupuestos en la misma obra y cada
--     certificación semanal se imputa a uno (o a ninguno: histórico).
--
-- Esta migración es compatible con el backend en prod:
--   · la UNIQUE vieja (obra_cod, sem_key, contrat_id) se CONSERVA (el backend
--     viejo hace onConflict sobre esas 3 columnas). Se dropea en la fase 2.
--   · presupuesto_id es nullable; `estado` y asig_contrat.cotizacion* siguen.
-- =====================================================================

-- ── 1. Presupuestos ──────────────────────────────────────────────────
create table if not exists public.contrat_presupuestos (
  id          serial primary key,
  obra_cod    text    not null,
  contrat_id  integer not null,
  titulo      text    not null check (length(trim(titulo)) > 0),
  monto       numeric not null check (monto > 0),
  fecha       date    not null default current_date,
  obs         text,
  cerrado_en  timestamptz,                       -- null = abierto (se ofrece al certificar)
  doc_path    text,
  doc_nombre  text,
  doc_mime    text,
  doc_size    integer,
  doc_hash    text,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Cuelga de la asignación obra×contratista. Desasignar sin historial
  -- borra sus presupuestos; con historial el backend devuelve 409 y ofrece
  -- "finalizar" (asig_contrat.finalizado_en).
  constraint cp_asig_fk foreign key (obra_cod, contrat_id)
    references public.asig_contrat (obra_cod, contrat_id) on delete cascade,
  -- Adjunto todo-o-nada.
  constraint cp_doc_completo_chk check (
    (doc_path is null) = (doc_nombre is null)
    and (doc_path is null) = (doc_mime is null)
    and (doc_path is null) = (doc_size is null)
    and (doc_path is null) = (doc_hash is null)
  )
);
comment on table public.contrat_presupuestos is
  'Presupuestos de un contratista en una obra (N por asignación). Las certificaciones semanales se imputan a uno; saldo = monto - sum(certificaciones.monto del presupuesto).';
comment on column public.contrat_presupuestos.cerrado_en is
  'Cierre manual: el presupuesto deja de ofrecerse al certificar. NULL = abierto. Se puede reabrir.';
comment on column public.contrat_presupuestos.doc_path is
  'Adjunto (foto/PDF) en bucket privado contratista-docs bajo presupuesto/{id}/.';

-- Título único por par (case/espacios-insensitive) para que el selector no repita.
create unique index if not exists cp_titulo_uq
  on public.contrat_presupuestos (obra_cod, contrat_id, lower(trim(titulo)));
create index if not exists cp_asig_idx
  on public.contrat_presupuestos (obra_cod, contrat_id);

drop trigger if exists trg_audit_contrat_presupuestos on public.contrat_presupuestos;
create trigger trg_audit_contrat_presupuestos
  before insert or update on public.contrat_presupuestos
  for each row execute function public.set_audit_fields();

-- RLS permisiva por diseño (§5.4): la seguridad real está en el backend Hono.
alter table public.contrat_presupuestos enable row level security;
drop policy if exists "auth_all" on public.contrat_presupuestos;
create policy "auth_all" on public.contrat_presupuestos
  for all to authenticated using (true) with check (true);

-- ── 2. Certificaciones → presupuesto ─────────────────────────────────
alter table public.certificaciones
  add column if not exists presupuesto_id integer
    references public.contrat_presupuestos(id) on delete no action;
comment on column public.certificaciones.presupuesto_id is
  'Presupuesto al que se imputa. NULL = certificación histórica sin presupuesto (permitido solo si el contratista no tiene presupuestos abiertos en la obra; lo valida el backend).';
create index if not exists certificaciones_presupuesto_id_idx
  on public.certificaciones (presupuesto_id);

-- Endurecimientos sin violaciones en prod (verificado 2026-09-01: 0 nulls, 0 no-viernes).
alter table public.certificaciones
  alter column obra_cod   set not null,
  alter column contrat_id set not null;
alter table public.certificaciones
  drop constraint if exists cert_sem_key_viernes_chk;
alter table public.certificaciones
  add constraint cert_sem_key_viernes_chk check (extract(dow from sem_key) = 5);

-- Nueva identidad: 1 certificación por (obra, contratista, semana, presupuesto).
-- NULLS NOT DISTINCT (PG 15+): las certs sin presupuesto siguen siendo 1 por
-- semana y el upsert las encuentra. Convive con la UNIQUE vieja hasta la fase 2.
alter table public.certificaciones
  drop constraint if exists certificaciones_contrat_sem_presup_uq;
alter table public.certificaciones
  add constraint certificaciones_contrat_sem_presup_uq
  unique nulls not distinct (obra_cod, contrat_id, sem_key, presupuesto_id);

-- ── 3. Asignación: "finalizado en esta obra" ─────────────────────────
-- Reemplaza el "desasignar" para contratistas con historial: no borra nada,
-- lo saca del modal de certificar y colapsa su card. Reversible.
alter table public.asig_contrat
  add column if not exists finalizado_en timestamptz;
comment on column public.asig_contrat.finalizado_en is
  'Contratista finalizado en la obra (no certifica más, historial intacto). NULL = activo.';

-- ── 4. Backfill: la única cotización cargada pasa a ser un presupuesto ─
-- (CC-022 × contrat 24, $11.424.375; 0 adjuntos en prod). Sus certificaciones
-- se imputan al presupuesto nuevo para que el saldo que se ve hoy no cambie.
insert into public.contrat_presupuestos
  (obra_cod, contrat_id, titulo, monto, fecha, obs,
   doc_path, doc_nombre, doc_mime, doc_size, doc_hash,
   created_by, updated_by, created_at)
select a.obra_cod, a.contrat_id, 'Presupuesto inicial', a.cotizacion,
       coalesce(a.updated_at, a.created_at, now())::date, a.cotizacion_obs,
       a.cotizacion_doc_path, a.cotizacion_doc_nombre, a.cotizacion_doc_mime,
       a.cotizacion_doc_size, a.cotizacion_doc_hash,
       a.created_by, a.updated_by, coalesce(a.updated_at, a.created_at, now())
  from public.asig_contrat a
 where a.cotizacion is not null and a.cotizacion > 0
   and not exists (
     select 1 from public.contrat_presupuestos p
      where p.obra_cod = a.obra_cod and p.contrat_id = a.contrat_id
   );

update public.certificaciones c
   set presupuesto_id = p.id
  from public.contrat_presupuestos p
 where p.obra_cod = c.obra_cod
   and p.contrat_id = c.contrat_id
   and p.titulo = 'Presupuesto inicial'
   and c.presupuesto_id is null;
