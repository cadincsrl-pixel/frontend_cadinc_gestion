-- Extender la vista de vencimientos de papeles con la rama de flota.
-- La consumen `useNotificaciones` (campana del topbar para camiones/bateas)
-- y el módulo de flota.

create or replace view public.v_vehiculo_documentos_vencimientos as
with camion_ult as (
  select distinct on (camion_id, tipo)
    id, camion_id, tipo, vence_el, nombre_archivo, created_at
  from public.camion_documentos
  where vence_el is not null and deleted_at is null
  order by camion_id, tipo, created_at desc
),
batea_ult as (
  select distinct on (batea_id, tipo)
    id, batea_id, tipo, vence_el, nombre_archivo, created_at
  from public.batea_documentos
  where vence_el is not null and deleted_at is null
  order by batea_id, tipo, created_at desc
),
flota_ult as (
  select distinct on (vehiculo_id, tipo)
    id, vehiculo_id, tipo, vence_el, nombre_archivo, created_at
  from public.flota_documentos
  where vence_el is not null and deleted_at is null
  order by vehiculo_id, tipo, created_at desc
)
select
  cu.id           as doc_id,
  'camion'::text  as entidad,
  cu.camion_id    as entidad_id,
  c.patente       as entidad_patente,
  cu.tipo,
  cu.vence_el,
  cu.nombre_archivo
from camion_ult cu
join public.camiones c on c.id = cu.camion_id
union all
select bu.id, 'batea', bu.batea_id, b.patente, bu.tipo, bu.vence_el, bu.nombre_archivo
from batea_ult bu
join public.bateas b on b.id = bu.batea_id
union all
select fu.id, 'flota', fu.vehiculo_id, f.patente, fu.tipo, fu.vence_el, fu.nombre_archivo
from flota_ult fu
join public.flota_vehiculos f on f.id = fu.vehiculo_id;
