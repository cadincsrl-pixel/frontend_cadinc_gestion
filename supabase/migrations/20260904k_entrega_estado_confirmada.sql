-- Estado 'confirmada': "si, es herramienta, ya la vi y esta registrada".
--
-- POR QUE
-- La bandeja solo tenia archivar ("no es herramienta") y desarchivar. Para
-- vaciar 257 filas la unica salida era archivar herramientas REALES bajo una
-- etiqueta que dice lo contrario — o dejarlas en 'pendiente' para siempre.
-- La bandeja se leia pero no se podia trabajar; lo marco la lente operativa de
-- la revision adversarial del 2026-09-04.
--
-- 'confirmada' NO toca el padron (eso es fase 2): solo dice que un humano ya la
-- miro y no hay nada mas que hacer. Es el equivalente positivo de 'ignorada'.

alter table public.herr_entregas drop constraint if exists herr_entregas_estado_check;

alter table public.herr_entregas add constraint herr_entregas_estado_check
  check (estado in ('pendiente','confirmada','vinculada','catalogada','ignorada','anulada','revisar'));

comment on column public.herr_entregas.estado is
  'pendiente = salio y nadie la miro · confirmada = un humano dijo "si, es herramienta" (no toca el padron) · vinculada/catalogada = fase 2 · ignorada = "no es herramienta" · anulada = se deshizo el envio (la escribe SOLO el trigger) · revisar = el renglon cambio despues de salir';
