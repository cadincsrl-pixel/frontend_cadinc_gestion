-- Saca un alias MIO que estaba mal y da de alta el material que faltaba.
--
-- En la migración de sinónimos (20260902d) mapeé "porcelanato 58x58" como alias de
-- "Porcelanato 30x60" (id 884). Está mal: 58x58 es otro formato, no un sinónimo.
-- Un alias equivocado es PEOR que no tener alias — el buscador ofrece el material
-- incorrecto con cara de correcto y el pedido queda mal imputado.
--
-- Lo destapó un pedido real de Hipódromo (solicitud 647, 2026-09-02 19:50): el
-- usuario escribió "Porcelanato 58x58" y prefirió texto libre antes que aceptar la
-- fila que le ofrecíamos. Tenía razón.
--
-- El 58x58 aparece 3 veces en el historico (CC FARM 25 x2, CC CADINC 1) mas este
-- pedido, asi que merece su propia fila.
--
-- Queda FLAGGEADO y sin tocar otro caso parecido, porque no estoy seguro:
--   id 869 "Chapón de hierro liso 1/8\" 1.22x2.44" tiene alias "chapon de 120x210
--   de 1/8 liso". 1.22x2.44 m son 122x244 cm, no 120x210. Puede ser otra chapa o
--   puede ser que en obra la midan redondeando. Preguntar antes de sacarlo.

do $guard$
begin
  if not exists (select 1 from stock_materiales where id = 884 and 'porcelanato 58x58' = any(alias)) then
    raise exception 'Abortado: el material 884 ya no tiene el alias porcelanato 58x58';
  end if;
end
$guard$;

update stock_materiales
   set alias = array_remove(alias, 'porcelanato 58x58')
 where id = 884;

insert into stock_materiales (rubro_id, nombre, unidad, stock_actual, stock_minimo, activo, alias)
select 11, 'Porcelanato 58x58', 'm2', 0, 0, true,
       array['porcelanato 58x58', 'caja de porcelanato 58x58', 'porcelanato 57x57', 'porcelanato 57x57 hueso']
where not exists (
  select 1 from stock_materiales where public.norm_material(nombre) = 'porcelanato 58x58' and activo
);
