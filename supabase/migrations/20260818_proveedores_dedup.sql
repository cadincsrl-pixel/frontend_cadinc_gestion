-- Unifica proveedores duplicados por nombre (case-insensitive) y previene nuevos duplicados.
--
-- Caso: "Mercado Libre" (id 3) y "mercado libre" (id 22) convivían en la lista de
-- proveedores del módulo de compras. Idem "POLLANO SANITARIOS" (ids 1 y 2).
-- Regla de merge: gana el id más bajo (el más antiguo); las FKs del duplicado se
-- repuntan al ganador y la fila duplicada se borra.

-- ── 1. Repuntar FKs de todos los duplicados al id más bajo de cada nombre ──
with canon as (
  select id as dup_id,
         min(id) over (partition by lower(btrim(nombre))) as keep_id
  from proveedores
),
mapa as (
  select dup_id, keep_id from canon where dup_id <> keep_id
)
update solicitud_compra_item s
set proveedor_id = m.keep_id
from mapa m
where s.proveedor_id = m.dup_id;

with canon as (
  select id as dup_id,
         min(id) over (partition by lower(btrim(nombre))) as keep_id
  from proveedores
),
mapa as (
  select dup_id, keep_id from canon where dup_id <> keep_id
)
update materiales_a_cuenta_cliente mcc
set proveedor_id = m.keep_id
from mapa m
where mcc.proveedor_id = m.dup_id;

with canon as (
  select id as dup_id,
         min(id) over (partition by lower(btrim(nombre))) as keep_id
  from proveedores
),
mapa as (
  select dup_id, keep_id from canon where dup_id <> keep_id
)
update facturas_compra f
set proveedor_id = m.keep_id
from mapa m
where f.proveedor_id = m.dup_id;

with canon as (
  select id as dup_id,
         min(id) over (partition by lower(btrim(nombre))) as keep_id
  from proveedores
),
mapa as (
  select dup_id, keep_id from canon where dup_id <> keep_id
)
update stock_materiales sm
set proveedor_id = m.keep_id
from mapa m
where sm.proveedor_id = m.dup_id;

with canon as (
  select id as dup_id,
         min(id) over (partition by lower(btrim(nombre))) as keep_id
  from proveedores
),
mapa as (
  select dup_id, keep_id from canon where dup_id <> keep_id
)
update stock_proveedor_movimientos spm
set proveedor_id = m.keep_id
from mapa m
where spm.proveedor_id = m.dup_id;

with canon as (
  select id as dup_id,
         min(id) over (partition by lower(btrim(nombre))) as keep_id
  from proveedores
),
mapa as (
  select dup_id, keep_id from canon where dup_id <> keep_id
)
update remitos_retiro_proveedor rrp
set proveedor_id = m.keep_id
from mapa m
where rrp.proveedor_id = m.dup_id;

-- ── 2. Borrar las filas duplicadas (ya sin referencias) ──
delete from proveedores p
where p.id <> (select min(q.id) from proveedores q
               where lower(btrim(q.nombre)) = lower(btrim(p.nombre)));

-- ── 3. Normalizar espacios sobrantes en los nombres que quedan ──
update proveedores set nombre = btrim(nombre) where nombre <> btrim(nombre);

-- ── 4. Índice único case-insensitive, solo sobre proveedores activos ──
-- Parcial por `activo` porque el DELETE del backend es soft (activo = false):
-- un proveedor dado de baja no debe bloquear el alta de uno nuevo con ese nombre.
create unique index if not exists proveedores_nombre_uniq_activo
  on proveedores (lower(btrim(nombre)))
  where activo;
