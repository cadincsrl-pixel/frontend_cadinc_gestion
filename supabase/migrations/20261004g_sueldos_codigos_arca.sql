-- Sueldos: códigos de concepto ARCA según la tabla oficial del Libro de Sueldos Digital
-- (hoja «Conceptos ARCA» de LSD-ARMADO-TXT-Conceptos.xlsx, ARCA, 09/2025).
--
-- Los seeds de 20261004e tenían los descuentos corridos un lugar:
--   jubilación 810001 (es INSSJyP), ley 19.032 810002 (es obra social), obra social 810003 (es FSR).
-- Correcto: 810000 sistema previsional, 810001 INSSJyP, 810002 obra social.
-- El SAC pasa a 120000 (genérico): 120001/120002 son de un semestre fijo.
-- Se completan los conceptos que no tenían código. Los de criterio dudoso quedan
-- marcados en obs «código ARCA a confirmar con el contador».
-- No hay recibos cargados todavía (sueldos_recibo_lineas vacía): no se reescribe historia.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- (convenio, código propio, código ARCA, a confirmar)
      (null,         'jubilacion',            '810000', false),
      (null,         'ley_19032',             '810001', false),
      (null,         'obra_social',           '810002', false),
      (null,         'sac',                   '120000', false),
      (null,         'prestamo',              '810007', false),
      (null,         'otro_descuento',        '820000', false),
      (null,         'no_rem_manual',         '550000', true),
      (null,         'adicional_manual',      '160000', false),
      (null,         'indemnizacion',         '520014', false),
      (null,         'vacaciones',            '150000', true),
      ('uocra',      'cuota_sindical',        '810004', false),
      ('uocra',      'seguro_vida',           '810005', false),
      ('uocra',      'aporte_solidario',      '820000', false),
      ('uocra',      'adicional_tarea',       '160003', false),
      ('uecara',     'cuota_sindical',        '810004', false),
      ('uecara',     'falla_caja',            '160000', false),
      ('uecara',     'titulo_a',              '160002', false),
      ('uecara',     'titulo_b',              '160002', false),
      ('uecara',     'titulo_c',              '160002', false),
      ('camioneros', 'cuota_sindical',        '810004', false),
      ('camioneros', 'sepelio',               '820000', false),
      ('camioneros', 'km_remunerativo',       '160000', true),
      ('camioneros', 'viatico_especial',      '550000', true),
      ('camioneros', 'viatico_comida',        '550000', true),
      ('camioneros', 'viatico_km',            '550000', true),
      ('camioneros', 'pernocte',              '550000', true),
      ('camioneros', 'suma_acuerdo',          '540000', true)
    ) as t(conv, codigo, arca, confirmar)
  loop
    update sueldos_conceptos c
       set codigo_arca = r.arca,
           obs = case when r.confirmar
                      then concat_ws(' · ', nullif(c.obs, ''), 'código ARCA a confirmar con el contador')
                      else c.obs end
     where c.codigo = r.codigo
       and ((r.conv is null and c.convenio_id is null)
            or c.convenio_id = (select id from sueldos_convenios where codigo = r.conv));
    if not found then
      raise exception 'CONCEPTO_NO_ENCONTRADO % %', r.conv, r.codigo;
    end if;
  end loop;
end $$;

-- Vacaciones no gozadas: el seed la trae remunerativa y ARCA la lista como no
-- remunerativa (520012, art. 7 Ley 24.241). No se cambia el tipo sin el contador:
-- queda sin código y la exportación del LSD avisa SIN_CODIGO_ARCA.
update sueldos_conceptos
   set obs = concat_ws(' · ', nullif(obs, ''), 'ARCA la trata como no remunerativa (520012): definir con el contador')
 where codigo = 'vacaciones_no_gozadas' and convenio_id is null;
