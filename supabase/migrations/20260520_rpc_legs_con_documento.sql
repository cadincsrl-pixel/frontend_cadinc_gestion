-- RPC `legs_con_documento` — devuelve los legs agrupados por tipo de
-- documento de personal subido.
--
-- Usado por el endpoint GET /api/personal/documentos/resumen para
-- alimentar banners como AlertaDniFaltante sin hacer N requests
-- individuales. SELECT con array_agg evita el cap de PostgREST aunque
-- la tabla `personal_documentos` crezca >1000 rows.

create or replace function legs_con_documento()
returns table (tipo text, legs text[])
language sql stable security invoker as $$
  select tipo::text, array_agg(distinct leg) as legs
  from personal_documentos
  group by tipo
$$;
grant execute on function legs_con_documento() to authenticated;
