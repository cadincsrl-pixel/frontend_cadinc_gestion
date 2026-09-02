-- Marca de clase en la línea del pedido: material vs herramienta, y en las de
-- herramienta, si la obra PIDE o DEVUELVE.
--
-- POR QUÉ ACÁ Y NO EN UNA PANTALLA APARTE:
-- El módulo Herramientas está prácticamente muerto (76 movimientos en toda su
-- historia, 1 en los últimos 60 días) mientras entraron 176 pedidos de herramienta
-- por certificaciones desde julio. El motivo NO fue que faltara un botón: la
-- pantalla de herramientas nunca emitió el remito que la obra firma (se dropeó en
-- `20260520_drop_herr_remitos.sql`) y después de esa fecha los movimientos se
-- desplomaron. Y el pedido de obra es UNO SOLO: 97 solicitudes de los últimos 60
-- días traen herramienta Y material mezclados. Partirlo en dos pantallas al cargar
-- es pelearle a cómo trabajan.
-- Entonces: una sola puerta (esta tabla) y la derivación es un filtro, no una copia.
--
-- POR QUÉ HAY COLA DE VERDAD (y por eso esto sirve):
-- Medido por separado, no en agregado — el agregado lo tapa oficina auto-atendiéndose:
--   obra (jefe de obra) carga -> mediana 12,3 h hasta resolverse; 80% > 1 h; 53% > 8 h
--   oficina/pañol carga      -> mediana 49 min
-- O sea que cuando pide la obra, el ítem espera. Esa es la cola que el pañol atiende.
--
-- `devuelve`: decisión del dueño (2026-09-02). La devolución de una herramienta entra
-- por donde entra todo, como una línea de pedido que dice "devuelvo tal cosa", en vez
-- de por un botón escondido en otra pantalla. Sin disparador, el saldo por obra solo
-- sube y el inventario termina mintiendo CON respaldo de sistema, que es peor que el
-- texto libre de hoy (hay 11 devoluciones contra 22 asignaciones).
--
-- NO SE HACE BACKFILL POR KEYWORD, a propósito. `clase` tiene que contener solo lo
-- que marcó un humano: si se llena con un regex sobre los 3.127 ítems históricos, el
-- día que se quiera medir si el toggle se usa no se va a poder distinguir la marca
-- real de la adivinada. El default 'material' deja todo lo existente intacto.

alter table public.solicitud_compra_item
  add column if not exists clase    text    not null default 'material',
  add column if not exists devuelve boolean not null default false;

alter table public.solicitud_compra_item
  drop constraint if exists solicitud_compra_item_clase_check;
alter table public.solicitud_compra_item
  add constraint solicitud_compra_item_clase_check
  check (clase in ('material','herramienta'));

-- Devolver solo aplica a herramientas: el material que sobra en obra vuelve por
-- otro camino (ajuste de stock), no por una linea de pedido.
alter table public.solicitud_compra_item
  drop constraint if exists solicitud_compra_item_devuelve_check;
alter table public.solicitud_compra_item
  add constraint solicitud_compra_item_devuelve_check
  check (not devuelve or clase = 'herramienta');

comment on column public.solicitud_compra_item.clase is
  'material | herramienta. La derivacion al pañol es un FILTRO sobre esto, no una copia '
  'de la fila. Solo lo setea un humano con el toggle: no hay backfill heuristico.';
comment on column public.solicitud_compra_item.devuelve is
  'Solo para clase=herramienta: la obra DEVUELVE la herramienta en vez de pedirla. '
  'Es el disparador de la devolucion, que hoy no existe (11 devoluciones vs 22 asignaciones).';

-- Indice de la bandeja del pañol: los pendientes de herramienta.
create index if not exists solicitud_compra_item_clase_estado_idx
  on public.solicitud_compra_item (clase, estado)
  where clase <> 'material';

-- Espejo en el catalogo, igual que `usa_color`: al elegir un material marcado como
-- herramienta, la linea nace clasificada sin que nadie toque el toggle.
alter table public.stock_materiales
  add column if not exists clase text not null default 'material';
alter table public.stock_materiales
  drop constraint if exists stock_materiales_clase_check;
alter table public.stock_materiales
  add constraint stock_materiales_clase_check
  check (clase in ('material','herramienta'));

comment on column public.stock_materiales.clase is
  'Espejo de solicitud_compra_item.clase. Sirve para PRE-TILDAR el toggle al elegir '
  'del catalogo. No decide por si solo: el 97,6% de los pedidos de herramienta se '
  'escriben en texto libre, sin material_id.';
