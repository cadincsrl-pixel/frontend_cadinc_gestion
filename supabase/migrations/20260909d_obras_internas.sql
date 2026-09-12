-- Destinos internos: el gasto propio de CADINC deja de estar mezclado
--
-- Se aplicó a prod en TRES llamadas, anotadas en supabase_migrations como
-- `obras_internas_flag_y_panol` (20260908103432, el alter + los updates de
-- acá abajo), `cuenta_corriente_expone_obra_interna` (20260908103446, la
-- vista v_cuenta_corriente) y `pendientes_y_resumen_saben_de_internas`
-- (20260908103503, v_cuenta_cliente_pendientes + cuenta_corriente_resumen).
-- Ninguna de las tres tiene archivo propio ni lo necesita: son este archivo.
--
-- El user pidió "un centro de costo que se llame pañol u oficina, hacer la
-- solicitud ahí, y después poder ver el gasto de la oficina".
--
-- Resulta que la primera mitad ya existía. Hay CINCO obras que en realidad son
-- centros internos (materiales_a_cargo_de='cadinc' y ningún cliente detrás), y
-- una se llama literalmente OBRADOR: sus 16 renglones son escoba, franela,
-- lustramuebles, secador de piso, barbijo y lentes. Eso ya es el pañol. Entre
-- las cinco llevan $4.251.895 de gasto propio.
--
-- Lo que faltaba era poder LEERLO. Hoy el gasto del pañol está enterrado junto
-- al de las obras llave en mano: el chip "Gasto CADINC" de la cuenta corriente
-- da $79 millones, de los cuales el consumo interno real es el 5%.
--
-- Por qué un booleano en `obras` y no una tabla nueva de centros de costo: 24
-- tablas tienen FK a obras.cod (solicitud_compra, MCC, stock_movimientos,
-- horas, herr_entregas, remitos_envio…). `obras` no es "obras", es el registro
-- de destinos del ERP; una entidad aparte obligaría a un destino polimórfico en
-- los 24 lugares. El eje que falta es binario: ¿esto es de un cliente o es
-- nuestro?
--
-- Por qué NO es_deposito=true: ese flag se trata como singleton en 6 lugares
-- (entre ellos el `.eq('es_deposito',true).limit(1)` que decide dónde nace cada
-- ficha HER-NNN), bloquea el despacho desde depósito (DESPACHO_A_DEPOSITO) y
-- anula el registro del gasto. Con es_deposito=false el pañol se comporta como
-- cualquier obra, que es un camino probado.

alter table public.obras
  add column if not exists es_interna boolean not null default false;

comment on column public.obras.es_interna is
  'Destino interno de CADINC (pañol, mantenimiento, herreros, logística, poda): '
  'lo que se le despacha es gasto propio, no va a la cuenta de ningún cliente. '
  'Distinto de es_deposito, que es el galpón donde vive el stock.';

update public.obras set es_interna = true
 where cod in ('CC CADINC', 'CC CADINC 1', 'CC HERREROS', 'CC LOGISTICA', 'CC PODA');

-- El nombre que el user usa. El `cod` NO se toca: es la FK de todo el sistema.
-- Lleva las dos palabras porque el buscador matchea por substring y quien carga
-- va a tipear "pañol" o "oficina" según el día.
update public.obras set nom = 'PAÑOL Y OFICINA' where cod = 'CC CADINC';

-- La vista expone el flag. La columna va AL FINAL porque CREATE OR REPLACE VIEW
-- solo admite agregar columnas ahí. `motivo_cadinc` no se toca, para no romper
-- las etiquetas que ya lee el front.
create or replace view public.v_cuenta_corriente as
 SELECT c.id,
    c.obra_cod,
    COALESCE(o.nom, c.obra_cod) AS obra_nom,
    COALESCE(o.archivada, false) AS obra_archivada,
    COALESCE(o.materiales_a_cargo_de, 'cliente'::text) AS obra_modalidad,
    c.solicitud_id,
    c.item_id,
    c.descripcion,
    c.cantidad,
    c.unidad,
    c.precio_unit,
    c.precio_total,
    c.origen,
    c.proveedor_id,
    p.nombre AS proveedor_nom,
    c.factura_id,
    f.numero AS factura_numero,
    f.adjunto_url AS factura_adjunto_url,
    f.fecha AS factura_fecha,
    c.fecha_resolucion,
    to_char(c.fecha_resolucion::timestamp with time zone, 'YYYY-MM'::text) AS mes,
    c.pagado_por,
    c.a_cargo_de,
    c.cobro_id,
    c.monto_cobrado,
    i.estado AS item_estado,
    i.material_id,
    m.clase,
    m.rubro_id,
    r.nombre AS rubro_nom,
        CASE
            WHEN m.clase = 'epp'::text THEN 'epp'::text
            ELSE 'material'::text
        END AS tipo,
        CASE
            WHEN c.pagado_por = 'cliente'::text THEN 'pago_directo'::text
            WHEN c.a_cargo_de = 'cadinc'::text THEN 'gasto_cadinc'::text
            WHEN c.cobro_id IS NOT NULL THEN 'cobrado'::text
            ELSE 'a_cobrar'::text
        END AS estado,
        CASE
            WHEN c.a_cargo_de = 'cadinc'::text THEN
            CASE
                WHEN m.clase = 'epp'::text THEN 'epp'::text
                ELSE 'llave_en_mano'::text
            END
            ELSE NULL::text
        END AS motivo_cadinc,
    norm_txt((((((((((c.descripcion || ' '::text) || COALESCE(p.nombre, ''::text)) || ' '::text) || COALESCE(o.nom, ''::text)) || ' '::text) || c.obra_cod) || ' '::text) || c.solicitud_id::text) || ' '::text) || COALESCE(f.numero, ''::text)) AS busq,
    c.created_at,
    c.updated_at,
    COALESCE(o.es_interna, false) AS obra_interna
   FROM materiales_a_cuenta_cliente c
     JOIN solicitud_compra_item i ON i.id = c.item_id
     LEFT JOIN obras o ON o.cod = c.obra_cod
     LEFT JOIN stock_materiales m ON m.id = i.material_id
     LEFT JOIN stock_rubros r ON r.id = m.rubro_id
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     LEFT JOIN facturas_compra f ON f.id = c.factura_id;

-- La alerta de "renglones sin precio" es para priorizar qué facturarle a los
-- clientes. Los despachos sin tasar del pañol no son cobranza pendiente: si
-- entran ahí, inflan un número que Alina y Nicolás usan para decidir el día.
create or replace view public.v_cuenta_cliente_pendientes as
 SELECT m.obra_cod,
    count(*)::integer AS sin_precio,
    COALESCE(o.archivada, false) AS obra_archivada
   FROM materiales_a_cuenta_cliente m
     LEFT JOIN obras o ON o.cod = m.obra_cod
  WHERE m.precio_unit = 0::numeric
    AND NOT COALESCE(o.es_interna, false)
  GROUP BY m.obra_cod, (COALESCE(o.archivada, false));

-- El resumen aprende a filtrar por internas. Parámetro nuevo al final y con
-- default, así las llamadas que ya existen siguen andando igual.
--   null  = todo (como hoy)
--   true  = solo los centros internos
--   false = solo las obras de verdad
CREATE OR REPLACE FUNCTION public.cuenta_corriente_resumen(
  p_obras text[] DEFAULT NULL::text[], p_obra_cod text DEFAULT NULL::text,
  p_grupo text DEFAULT 'obra'::text, p_sin_precio boolean DEFAULT false,
  p_proveedor_id integer DEFAULT NULL::integer, p_origen text DEFAULT NULL::text,
  p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date,
  p_palabras text[] DEFAULT NULL::text[], p_archivadas boolean DEFAULT false,
  p_solo_internas boolean DEFAULT NULL::boolean)
 RETURNS TABLE(grupo text, grupo_nom text, modalidad text, estado text, tipo text,
               renglones integer, total numeric, sin_precio integer, ultimo date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    case p_grupo
      when 'mes'       then v.mes
      when 'proveedor' then coalesce(v.proveedor_id::text, case when v.origen = 'deposito' then 'deposito' else 'sin' end)
      else v.obra_cod end,
    case p_grupo
      when 'mes'       then v.mes
      when 'proveedor' then coalesce(v.proveedor_nom, case when v.origen = 'deposito' then 'Depósito' else 'Sin proveedor' end)
      else v.obra_nom end,
    case when p_grupo = 'obra' then v.obra_modalidad end,
    v.estado, v.tipo,
    count(*)::integer,
    coalesce(sum(v.precio_total), 0),
    count(*) filter (where v.precio_unit = 0)::integer,
    max(v.fecha_resolucion)
  from public.v_cuenta_corriente v
  where (p_obras is null or v.obra_cod = any(p_obras))
    and (p_obra_cod is null or v.obra_cod = p_obra_cod)
    and (not p_sin_precio or v.precio_unit = 0)
    and (p_proveedor_id is null or v.proveedor_id = p_proveedor_id)
    and (p_origen is null or v.origen = p_origen)
    and (p_desde is null or v.fecha_resolucion >= p_desde)
    and (p_hasta is null or v.fecha_resolucion <= p_hasta)
    and (p_archivadas or p_obra_cod is not null or not v.obra_archivada)
    and (p_solo_internas is null or v.obra_interna = p_solo_internas)
    and (p_palabras is null or cardinality(p_palabras) = 0
         or (select bool_and(v.busq like '%' || w || '%') from unnest(p_palabras) w))
  group by 1, 2, 3, 4, 5
$function$;
