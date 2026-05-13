-- Flota CADINC — Fase 2: vista de estado de servicio por vehículo.
-- Toma el último service no borrado de cada vehículo y deriva un estado
-- (al_dia / proximo / vencido / sin_service) comparando km_actuales contra
-- km_proximo (margen 2000 km) y current_date contra fecha_proximo (margen 30 días).

create or replace view public.v_flota_servicios_estado as
with ult as (
  select distinct on (vehiculo_id)
    vehiculo_id,
    fecha,
    km_service,
    km_proximo,
    fecha_proximo,
    tipo_id,
    id
  from public.flota_servicios
  where deleted_at is null
  order by vehiculo_id, fecha desc, id desc
)
select
  f.id                              as vehiculo_id,
  f.patente,
  f.km_actuales,
  ult.fecha                         as fecha_ultimo_service,
  ult.km_service                    as km_ultimo_service,
  ult.km_proximo,
  ult.fecha_proximo,
  ult.tipo_id                       as tipo_id_proximo,
  case
    when ult.vehiculo_id is null then 'sin_service'
    when (ult.km_proximo    is not null and f.km_actuales >= ult.km_proximo)
      or (ult.fecha_proximo is not null and current_date    >= ult.fecha_proximo)
      then 'vencido'
    when (ult.km_proximo    is not null and f.km_actuales >= ult.km_proximo - 2000)
      or (ult.fecha_proximo is not null and (ult.fecha_proximo - current_date) <= 30)
      then 'proximo'
    else 'al_dia'
  end                               as estado,
  case when ult.km_proximo    is not null then ult.km_proximo - f.km_actuales        end as km_restantes,
  case when ult.fecha_proximo is not null then ult.fecha_proximo - current_date      end as dias_restantes
from public.flota_vehiculos f
left join ult on ult.vehiculo_id = f.id
where f.estado <> 'baja';

-- RLS pasa por la tabla subyacente, no por el rol del owner de la vista.
alter view public.v_flota_servicios_estado set (security_invoker = on);
