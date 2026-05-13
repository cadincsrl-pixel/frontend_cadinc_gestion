-- Suma 'flota' al universo de módulos asignables:
--   1) seed de la tabla `modulos` (catálogo que lista el frontend)
--   2) CHECK constraint de `usuario_obras` para permitir filtrar obras por flota
--      cuando se use el scope 'asignadas'.
-- Hay que mantener esto alineado con ModuloKeySchema (backend) y
-- MODULOS_VALIDOS (lib/obras-usuario.ts).

insert into public.modulos (id, key, nombre, descripcion, icono, activo, orden)
values (7, 'flota', 'Flota CADINC', 'Vehículos internos (autos, camionetas)', '🚙', true, 6)
on conflict (id) do update set
  key         = excluded.key,
  nombre      = excluded.nombre,
  descripcion = excluded.descripcion,
  icono       = excluded.icono,
  activo      = excluded.activo,
  orden       = excluded.orden;

alter table public.usuario_obras drop constraint if exists usuario_obras_modulo_chk;
alter table public.usuario_obras add constraint usuario_obras_modulo_chk
  check (
    modulo is null or modulo = any (array[
      'tarja','logistica','certificaciones','herramientas',
      'caja','ropa','prestamos','admin','configuracion','flota'
    ])
  );
