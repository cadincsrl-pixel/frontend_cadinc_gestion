-- =====================================================================
-- Compras: el número de un comprobante es único POR CÓDIGO ARCA (2026-09-27)
--
-- Por qué (revisión de código de la fase 3): ARCA numera cada código de
-- comprobante aparte. La Factura A (1) y la Nota de débito A (2) de un mismo
-- proveedor pueden tener el mismo PV y número; lo mismo FB (6) / NDB (7) y
-- 1 / 201 / 81. Las dos quedan clase 'factura', tipo 'A', y chocaban en
-- pagos_facturas_prov_tipo_numero_uidx (proveedor, clase, letra, número):
--   · el importador de ARCA (20260927c) marcaba la ND como «duplicada» en la
--     vista previa y la descartaba en silencio al confirmar (también convertía
--     un unique_violation inesperado en duplicada: la fila desaparecía);
--   · la carga a mano de una ND A con el número de una FA A rebotaba con
--     FACTURA_DUPLICADA aunque fueran dos comprobantes distintos.
--
-- 1) _pagos_cbte_efectivo(clase, letra, código): el código ARCA; si la
--    factura no lo tiene (carga a mano sin QR), el de la factura común de esa
--    letra (A → 1, B → 6, C → 11). Las NC siempre tienen código (pagos_facturas_nc_chk).
-- 2) El índice único suma el código efectivo. Es MENOS restrictivo que el
--    anterior (mismas columnas + una), así que no puede fallar sobre los datos
--    existentes. Al 27/09 las 22 facturas (todas a mano) tienen código 1.
--    Una factura a mano sin código sigue chocando con la FA 1 del mismo número
--    (la protección de la carga a mano no se pierde) y no choca con la ND 2.
--    Mantiene el nombre: pagos_crear_factura / pagos_editar_factura lo buscan
--    por constraint_name.
-- 3) pagos_importar_recibidos (anclas sobre la definición viva):
--    · duplicada = mismo CUIT, clase, letra, número Y código efectivo;
--    · mismo número y letra contra una factura SIN código ARCA de otro código
--      efectivo → ERROR NUMERO_COMPARTIDO_OTRO_TIPO {factura_id, ...}: no se
--      sabe si es el mismo papel (una ND cargada a mano como factura A, por
--      ejemplo). Se corrige cargándole el tipo a la existente;
--    · mismo número y letra contra otro código EXPLÍCITO → entra (son dos
--      comprobantes) con el aviso numero_compartido_otro_tipo;
--    · un unique_violation al confirmar ya no se convierte en duplicada: es
--      ERROR DUPLICADA_AL_CONFIRMAR y, como todo error, tira abajo la
--      importación entera (IMPORTACION_CON_ERRORES): todo o nada.
-- 4) pagos_crear_factura / pagos_editar_factura: el factura_id_existente del
--    FACTURA_DUPLICADA se busca con el mismo código efectivo (antes podía
--    señalar la ND en vez de la factura con la que chocó).
-- =====================================================================

-- ── 1) Código efectivo ─────────────────────────────────────────────────
create or replace function public._pagos_cbte_efectivo(p_clase text, p_tipo text, p_cbte smallint)
returns smallint
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select coalesce(p_cbte,
                  case when p_clase = 'factura' then
                    case p_tipo when 'A' then 1 when 'B' then 6 when 'C' then 11 end
                  end)::smallint
$$;

comment on function public._pagos_cbte_efectivo(text, text, smallint) is
  'Código ARCA de un comprobante de compra; sin código, el de la factura común de su letra (A 1, B 6, C 11). Clave del índice único de número. 20260927j.';

revoke all on function public._pagos_cbte_efectivo(text, text, smallint) from public, anon, authenticated;
grant execute on function public._pagos_cbte_efectivo(text, text, smallint) to service_role;

-- ── 2) Índice único por código ─────────────────────────────────────────
create unique index pagos_facturas_prov_tipo_numero_uidx_v2 on public.pagos_facturas
  (proveedor_id, clase, tipo_comprobante, public._pagos_cbte_efectivo(clase, tipo_comprobante, cbte_tipo_arca), numero_norm)
  where numero_norm is not null and tipo_comprobante = any (array['A', 'B', 'C']) and estado <> 'anulada';
drop index public.pagos_facturas_prov_tipo_numero_uidx;
alter index public.pagos_facturas_prov_tipo_numero_uidx_v2 rename to pagos_facturas_prov_tipo_numero_uidx;

-- ── 3 y 4) Parches por anclas ──────────────────────────────────────────
create or replace function pg_temp._una(p_txt text, p_ancla text, p_nuevo text) returns text
  language plpgsql as $f$
declare v_n int;
begin
  v_n := (length(p_txt) - length(replace(p_txt, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'ANCLA_NO_UNICA (% veces): %', v_n, left(p_ancla, 120);
  end if;
  return replace(p_txt, p_ancla, p_nuevo);
end $f$;

-- 3) Importador.
do $m$
declare
  v text := pg_get_functiondef('public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text)'::regprocedure);
begin
  v := pg_temp._una(v,
$a$  v_exist    bigint;
$a$,
$a$  v_exist    bigint;
  v_otro     smallint;
$a$);

  v := pg_temp._una(v,
$a$          v_vistos := v_vistos || v_key;
          select f.id into v_exist
            from public.pagos_facturas f join public.pagos_proveedores p on p.id = f.proveedor_id
           where p.cuit = v_cuit and f.clase = v_clase and f.tipo_comprobante = v_tipo
             and f.numero_norm = v_nn and f.estado <> 'anulada'
           order by f.id limit 1;
          if v_exist is not null then
            v_dup := jsonb_build_object('motivo', 'ya_cargada', 'factura_id_existente', v_exist);
          else
            select f.id into v_exist
              from public.pagos_facturas f join public.pagos_proveedores p on p.id = f.proveedor_id
             where p.cuit is null and f.numero_norm = v_nn and f.clase = v_clase and f.total = v_tot
               and f.estado <> 'anulada'
             order by f.id limit 1;
            if v_exist is not null then
              v_err := 'POSIBLE_DUPLICADA'; v_det := jsonb_build_object('factura_id', v_exist);
            end if;
          end if;$a$,
$a$          v_vistos := v_vistos || v_key;
          -- ARCA numera cada código aparte: duplicada = mismo código efectivo (20260927j).
          select f.id into v_exist
            from public.pagos_facturas f join public.pagos_proveedores p on p.id = f.proveedor_id
           where p.cuit = v_cuit and f.clase = v_clase and f.tipo_comprobante = v_tipo
             and f.numero_norm = v_nn and f.estado <> 'anulada'
             and public._pagos_cbte_efectivo(f.clase, f.tipo_comprobante, f.cbte_tipo_arca) = v_cbte
           order by f.id limit 1;
          if v_exist is not null then
            v_dup := jsonb_build_object('motivo', 'ya_cargada', 'factura_id_existente', v_exist);
          else
            -- Mismo número y letra, otro código. Contra una SIN código no se sabe
            -- si es el mismo papel: error visible. Contra otro código explícito
            -- son dos comprobantes: entra, con aviso.
            v_otro := null;
            select f.id, f.cbte_tipo_arca into v_exist, v_otro
              from public.pagos_facturas f join public.pagos_proveedores p on p.id = f.proveedor_id
             where p.cuit = v_cuit and f.clase = v_clase and f.tipo_comprobante = v_tipo
               and f.numero_norm = v_nn and f.estado <> 'anulada'
             order by (f.cbte_tipo_arca is null) desc, f.id limit 1;
            if v_exist is not null and v_otro is null then
              v_err := 'NUMERO_COMPARTIDO_OTRO_TIPO';
              v_det := jsonb_build_object('factura_id', v_exist, 'cbte_tipo_existente', null,
                         'cbte_tipo', v_cbte, 'nombre', public._pagos_nombre_cbte(v_cbte),
                         'tipo_comprobante', v_tipo, 'numero', v_numero, 'motivo', 'existente_sin_codigo_arca');
            elsif v_exist is not null then
              v_avisos := v_avisos || jsonb_build_object('codigo', 'numero_compartido_otro_tipo', 'detalle',
                            jsonb_build_object('factura_id', v_exist, 'cbte_tipo_existente', v_otro,
                                               'nombre_existente', public._pagos_nombre_cbte(v_otro)));
            end if;
            v_exist := null;
            if v_err is null then
              select f.id into v_exist
                from public.pagos_facturas f join public.pagos_proveedores p on p.id = f.proveedor_id
               where p.cuit is null and f.numero_norm = v_nn and f.clase = v_clase and f.total = v_tot
                 and f.estado <> 'anulada'
               order by f.id limit 1;
              if v_exist is not null then
                v_err := 'POSIBLE_DUPLICADA'; v_det := jsonb_build_object('factura_id', v_exist);
              end if;
            end if;
          end if;$a$);

  v := pg_temp._una(v,
$a$          if v_constr = 'pagos_facturas_prov_tipo_numero_uidx' then
            select f.id into v_exist from public.pagos_facturas f
             where f.proveedor_id = v_prov and f.clase = v_clase and f.tipo_comprobante = v_tipo
               and f.numero_norm = v_nn and f.estado <> 'anulada' limit 1;
            v_dup := jsonb_build_object('motivo', 'ya_cargada', 'factura_id_existente', v_exist);
          else$a$,
$a$          if v_constr = 'pagos_facturas_prov_tipo_numero_uidx' then
            -- La vista previa no lo vio (otra carga en el medio): ERROR, no
            -- duplicada, para que IMPORTACION_CON_ERRORES tire abajo todo en
            -- vez de descartar la fila en silencio (20260927j).
            select f.id into v_exist from public.pagos_facturas f
             where f.proveedor_id = v_prov and f.clase = v_clase and f.tipo_comprobante = v_tipo
               and f.numero_norm = v_nn and f.estado <> 'anulada'
               and public._pagos_cbte_efectivo(f.clase, f.tipo_comprobante, f.cbte_tipo_arca) = v_cbte
             limit 1;
            v_err := 'DUPLICADA_AL_CONFIRMAR';
            v_det := jsonb_build_object('factura_id', v_exist, 'cbte_tipo', v_cbte, 'numero', v_numero);
          else$a$);
  execute v;
end $m$;

comment on function public.pagos_importar_recibidos(jsonb, uuid, boolean, text, text) is
  'Importa «Mis Comprobantes Recibidos» de ARCA como facturas sin_imputar (vista previa con p_confirmar=false; todo o nada al confirmar). Duplicada = mismo CUIT, clase, letra, número y código ARCA efectivo (20260927j). 20260927c.';

-- 4) El factura_id_existente de FACTURA_DUPLICADA, con el mismo código.
do $m$
declare
  v text := pg_get_functiondef('public.pagos_crear_factura'::regproc);
begin
  v := pg_temp._una(v,
$a$and numero_norm = v_numero_norm and estado <> 'anulada' limit 1;$a$,
$a$and numero_norm = v_numero_norm and estado <> 'anulada'
         and public._pagos_cbte_efectivo(clase, tipo_comprobante, cbte_tipo_arca) = public._pagos_cbte_efectivo(v_clase, v_tipo, v_cbte)
       limit 1;$a$);
  execute v;

  v := pg_get_functiondef('public.pagos_editar_factura'::regproc);
  v := pg_temp._una(v,
$a$and numero_norm = v_new.numero_norm and estado <> 'anulada' and id <> p_factura_id limit 1;$a$,
$a$and numero_norm = v_new.numero_norm and estado <> 'anulada' and id <> p_factura_id
           and public._pagos_cbte_efectivo(clase, tipo_comprobante, cbte_tipo_arca)
             = public._pagos_cbte_efectivo(v_f.clase, v_new.tipo_comprobante, v_new.cbte_tipo_arca)
         limit 1;$a$);
  execute v;
end $m$;

drop function pg_temp._una(text, text, text);
