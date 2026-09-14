-- Falta la ficha de pantalon de trabajo, y por eso un pantalon se le esta
-- facturando a un cliente
--
-- Lo encontro el barrido de los 125 renglones sin ficha que estaban dentro de
-- la deuda del cliente (14/09). De los 125, este es el UNICO que sobrevivio a
-- los dos escepticos: el renglon 2996 de CC NORTE dice "pantalon para fernandez
-- n44". Ropa de trabajo nominativa, para un operario, despachada del deposito
-- de CADINC. No es material de la obra CORRIENTES.
--
-- El rubro 15 (Seguridad y EPP) tiene 28 fichas y NINGUNA es un pantalon: estan
-- el mameluco descartable, el mandil, el delantal de soldador, las polainas y
-- la capa de lluvia, pero el pantalon nunca se dio de alta. Sin ficha,
-- calc_a_cargo_de no tiene como saber que es ropa de trabajo y el renglon cae
-- como deuda del cliente por defecto — la misma causa que los dos EPP de
-- 20260914ac.
--
-- El renglon esta en $0, asi que esto no mueve plata hoy. Lo que evita es que
-- se cobre el dia que alguien le ponga precio, y que el proximo pantalon entre
-- otra vez como texto libre.
--
-- Probado con rollback: al vincularlo, a_cargo_de pasa de 'cliente' a 'cadinc'
-- y el renglon queda como gasto propio con motivo 'epp'.

insert into public.stock_materiales (nombre, alias, clase, rubro_id, unidad, precio_ref, obs)
values (
  'Pantalón de trabajo',
  array['pantalon de trabajo', 'pantalon', 'pantalones', 'pantalon grafa', 'ropa de trabajo pantalon'],
  'epp', 15, 'unid', 0,
  'Ropa de trabajo: siempre gasto propio de CADINC, en toda obra. Alta del 14/09 por el barrido de texto libre; hasta entonces el rubro no tenia pantalon y los pedidos entraban a mano.'
);

update public.solicitud_compra_item i
   set material_id = (select id from public.stock_materiales where nombre = 'Pantalón de trabajo')
 where i.id = 2996 and i.material_id is null;
