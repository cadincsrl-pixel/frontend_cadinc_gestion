-- =====================================================================
-- Los números de las 5 primeras facturas, leídos del comprobante (2026-09-21)
--
-- Pedido del dueño: "¿podés fijarte en las facturas cargadas cómo es el número
-- y acomodarlo?". No se dedujo del dato cargado: se BAJÓ el adjunto de cada
-- una del bucket y se leyó el número del papel, que es un dato legal y no se
-- adivina. Las 5 tenían su comprobante subido.
--
--   id  proveedor              cargado             en el papel        qué pasaba
--   ──  ─────────────────────  ──────────────────  ─────────────────  ─────────────────
--    9  Norte Distribuidora    0001100000194       00011-00000194     sin guion
--   10  ABC S.A.               0013-00402141       0012-00402141      PUNTO DE VENTA MAL
--   11  Cencosud (puertas)     0883700004557       08837-00004557     sin guion
--   12  Cencosud (tender)      (vacío)             08839-00001908     faltaba
--   13  Aceros del NOA         (vacío)             00002-00032168     faltaba
--
-- La de ABC es la única donde el número estaba MAL y no sólo mal escrito: el
-- papel dice punto de venta 0012 y estaba cargado 0013. Cambia `numero_norm`,
-- o sea que hasta hoy esa factura no se hubiera detectado como duplicada
-- contra la verdadera.
--
-- `numero` no está en CAMPOS_CONGELADOS ni en CAMPOS_QUE_DESAPRUEBAN, así que
-- esto no desaprueba ni toca plata. `numero_norm` se escribe a mano porque no
-- hay trigger: lo calcula el backend con `normNumeroFactura` al guardar, y
-- estos valores son los que esa función devuelve para cada número nuevo.
--
-- LO QUE NO SE TOCA ACÁ, a propósito, porque desaprueba la factura y es plata:
--   · id 9, el TOTAL está en $24.995,00 y el papel dice $24.994,52. Son 48
--     centavos de más. Es el rastro del bug de "Sobran $0" (20260921/547b34a):
--     para que el reparto cuadrara se subió el total en vez de corregir el
--     reparto. Hay que bajarlo Y rehacer la imputación, que hoy también está
--     en 24.995,00.
--   · las fechas de emisión de las ids 11, 12 y 13 son del 18/09 en el papel y
--     están cargadas como 21/09. Mueve el vencimiento y el período de IVA.
-- =====================================================================

do $$
declare n integer;
begin
  update pagos_facturas set numero = '00011-00000194', numero_norm = '11-194'    where id = 9;
  update pagos_facturas set numero = '0012-00402141',  numero_norm = '12-402141' where id = 10;
  update pagos_facturas set numero = '08837-00004557', numero_norm = '8837-4557' where id = 11;
  update pagos_facturas set numero = '08839-00001908', numero_norm = '8839-1908' where id = 12;
  update pagos_facturas set numero = '00002-00032168', numero_norm = '2-32168'   where id = 13;

  -- Ninguna puede quedar sin número ni con un formato que no sea PV-comprobante.
  select count(*) into n from pagos_facturas
   where numero is null or numero !~ '^\d{4,5}-\d{8}$';
  if n <> 0 then
    raise exception 'QUEDAN_CON_FORMATO_RARO: %', n;
  end if;

  -- Y ninguna puede haber quedado duplicada contra otra del mismo proveedor.
  select count(*) into n from (
    select proveedor_id, tipo_comprobante, numero_norm
      from pagos_facturas
     where estado <> 'anulada' and tipo_comprobante in ('A','B','C')
     group by 1,2,3 having count(*) > 1
  ) d;
  if n <> 0 then
    raise exception 'NUMERO_DUPLICADO_TRAS_LA_CORRECCION: % grupos', n;
  end if;
end $$;
