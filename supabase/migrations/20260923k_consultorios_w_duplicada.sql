-- =====================================================================
-- CC-031 «Consultorios W» era la misma obra que CC-035 «Consultorios
-- Paraguay», de Luis Wuscovi (el dueño, 2026-09-23)
--
-- CC-031 estaba vacía (ni horas, ni pedidos, ni materiales, ni pagos): todo
-- lo cargado está en CC-035. No hay nada que mover; la duplicada se archiva.
-- Aplicado por SQL el mismo día; este archivo lo deja escrito. Idempotente.
--
-- Luis Wuscovi no está en `ventas_clientes` (no se le facturó entre el 15/07
-- y el 23/09) y CC-035 es llave en mano: queda sin cliente hasta que se le
-- facture.
-- =====================================================================

update public.obras
   set archivada = true, fecha_archivo = now(),
       obs = trim(both ' ' from coalesce(obs, '') || ' Duplicada de CC-035 Consultorios Paraguay (misma obra, de Luis Wuscovi): archivada vacía el 23/09/2026.')
 where cod = 'CC-031' and not archivada;
