-- Quitar el tope duro de 200 hs en tarja_hs_extras. El control de valores altos
-- pasa a ser un aviso en el frontend (confirm arriba de 200), no un bloqueo.
-- Se mantiene hs >= 0.
alter table public.tarja_hs_extras drop constraint if exists tarja_hs_extras_hs_check;
alter table public.tarja_hs_extras add constraint tarja_hs_extras_hs_check check (hs >= 0);
