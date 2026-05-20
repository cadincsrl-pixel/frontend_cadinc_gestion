-- Drop RPC `obras_a_auto_archivar`.
--
-- Definida en `20260430_rpc_obras_auto_archivar.sql` para soportar el
-- auto-archivado que disparaba el frontend cada 6h. El feature se eliminó
-- el 2026-05-20 (call frontend, endpoint backend y filtro de audit).
-- Esta migración cierra el ciclo droppeando la función.

drop function if exists obras_a_auto_archivar(int);
