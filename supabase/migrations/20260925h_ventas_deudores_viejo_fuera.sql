-- Fuera la antigüedad por vencimiento de Deudores (24/09).
--
-- Desde `20260924y` Deudores usa `ventas_deudores_antiguedad_al` (días desde
-- la fecha de la factura: el dueño no usa el vencimiento de cobro). La función
-- vieja y la vista que la envolvía ya no las lee nadie (backend, frontend ni
-- otra vista: verificado). Sin CASCADE a propósito: si algo dependiera, falla.

drop view if exists public.v_ventas_deudores;
drop function if exists public.ventas_deudores_al(date, text);
