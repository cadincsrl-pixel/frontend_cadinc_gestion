-- 20260904ba — Rotomartillo grande (SDS-max), distinto del SDS-plus
-- User (2026-09-04): "también tenemos rotomartillo SDS-max que es el grande".

insert into public.stock_materiales (nombre, unidad, precio_ref, rubro_id, alias, clase, obs)
select 'Rotomartillo grande (SDS-max)', 'unid', 0, (select id from public.stock_rubros where nombre = 'Herramientas y máquinas'),
       array['rotomartillo grande','rotomartillo sds max','rotor martillo grande','rotormartillo grande','rotomartillo sdsmax','rotomartillo max','roto martillo grande','martillo perforador grande'],
       'herramienta', 'Alta 2026-09-04: el rotomartillo grande (encastre SDS-max). El chico es el SDS-plus.'
where not exists (select 1 from public.stock_materiales where lower(nombre) = lower('Rotomartillo grande (SDS-max)'));

update public.stock_materiales
   set alias = array(select distinct unnest(alias || array['rotomartillo chico','rotomartillo sds plus','rotor martillo chico']))
 where nombre = 'Rotomartillo (SDS-plus)';
