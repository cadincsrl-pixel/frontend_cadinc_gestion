-- 20260911b — unidad_compatible(): la regla de 20260908w sale del comentario de
-- una migracion y pasa a ser UNA funcion, para que la sugerencia de precio, la
-- precarga del despacho, el boton "usar ultima compra", la tasacion de los $0 y
-- cualquier retasado futuro digan exactamente lo mismo.
--
--   a) misma unidad                                        -> compatible
--   b) renglon 'unid' contra ficha en ENVASE CONTABLE
--      (unid, bolsa, balde, lata, rollo, juego, caja)      -> compatible:
--      "1 unid" solo puede querer decir "1 de esos"
--   c) todo lo demas                                       -> NO.
--      'unid' contra m/m2/kg/lt/tn no dice cuanto es, y lt contra lata es el
--      pozo de 20260908v ($7,4M por litro y medio de pintura).
--
-- IMMUTABLE y sin tablas: sirve en vistas e indices.

create or replace function public.unidad_compatible(p_renglon text, p_ficha text)
returns boolean language sql immutable parallel safe as $$
  select case
    when p_renglon is null or p_ficha is null then false
    when lower(trim(p_renglon)) = lower(trim(p_ficha)) then true
    when lower(trim(p_renglon)) = 'unid'
         and lower(trim(p_ficha)) in ('unid','bolsa','balde','lata','rollo','juego','caja') then true
    else false
  end
$$;

comment on function public.unidad_compatible(text, text) is
  'Regla unica de compatibilidad de unidades renglon<->ficha (20260908w -> 20260911b).';
