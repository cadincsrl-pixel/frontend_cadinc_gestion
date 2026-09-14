-- La cámara de inspección de caños entró dos veces como texto libre — alta del tipo
--
-- El 14/09 a las 07:51 el pedido 761 (CC-004) trajo el renglón "CAMARA CABLE"
-- escrito a mano, sin ficha, y a las 07:58 se rechazó. Un minuto después de
-- crearlo, el pedido 762 de la misma obra trajo "camara de inspeccion de
-- tuberia", también a mano y sin ficha, y ese SÍ se despachó del depósito.
--
-- Son el mismo equipo (confirmado por el user, con foto): una cámara boroscopio
-- de carrete, 30 m de cable, con pantalla. Es herramienta: va y vuelve de la
-- obra, no tiene precio y no entra en la cuenta del cliente (CLAUDE.md §5.12).
--
-- El pañol ya registró la salida a CC-004, pero por PATRÓN DE TEXTO
-- (herr_entregas.origen = 'clase'), no por ficha: sin material_id no se agrupa
-- por tipo ni aparece en el catálogo de herramientas. Esta migración crea el
-- tipo y le engancha los dos renglones y las dos filas del pañol.
--
-- OJO CON LOS ALIAS: en Sanitaria hay ~15 fichas de "cámara de inspección" que
-- son la boca de registro de PVC (cojinetes, prolongadores, rejas, contratapas).
-- Es OTRA cosa. Por eso acá no va ningún alias corto tipo "camara": el matcher
-- del Combobox es includes() sobre un blob y se llevaría puestas a todas
-- (CLAUDE.md §5.15). Los alias de acá llevan siempre una palabra que
-- desambigua: caños, desagües, cable, boroscopio, tubería.

do $m$
declare
  v_id      int;
  v_items   int;
  v_panol   int;
  v_mcc     int;
begin
  -- Guarda: si estos renglones tuvieran cuenta del cliente, algo está mal —
  -- una herramienta nunca se le factura a la obra.
  select count(*) into v_mcc
    from materiales_a_cuenta_cliente where item_id in (3811, 3812);
  if v_mcc > 0 then
    raise exception 'Los renglones 3811/3812 tienen % fila(s) en la cuenta del cliente: revisar antes de marcarlos como herramienta', v_mcc;
  end if;

  insert into stock_materiales (nombre, alias, clase, rubro_id, unidad, precio_ref, obs)
  values (
    'Cámara boroscopio p/ cañerías y desagües 30m c/ pantalla',
    array[
      'cable camara', 'camara cable', 'camara con cable',
      'camara de inspeccion de tuberia', 'camara de inspeccion de tuberias',
      'camara de inspeccion de caños', 'camara para inspeccionar caños',
      'boroscopio', 'camara boroscopio', 'endoscopio de caños',
      'camara de caños', 'camara para caños',
      'camara de desagues', 'camara para desagues',
      'videoinspeccion', 'video inspeccion', 'sonda con camara'
    ],
    'herramienta', 26, 'unid', 0,
    'Carrete de 30 m con pantalla. Entró dos veces como texto libre el 14/09 (pedidos 761 y 762, CC-004); el tipo se creó después, en 20260914v.'
  )
  returning id into v_id;

  -- Los dos renglones que la nombraron a mano, incluido el rechazado: así la
  -- historia del pedido queda contada contra la ficha y no contra un texto.
  update solicitud_compra_item
     set material_id = v_id
   where id in (3811, 3812) and material_id is null;
  get diagnostics v_items = row_count;

  -- El pañol. La fila anulada también, para que el historial por tipo sea
  -- completo; el saldo no cambia porque anulada no suma.
  update herr_entregas
     set material_id = v_id
   where item_id in (3811, 3812) and material_id is null;
  get diagnostics v_panol = row_count;

  raise notice 'ficha % · renglones % · panol %', v_id, v_items, v_panol;
end $m$;
