-- El camión es escalable o estándar — dato para la solicitud de turno
--
-- Pedido del user (15/09): "en la ficha de los camiones tengo dónde seleccionar
-- si son escalables o regular? escalable es que carga hasta 35 toneladas y
-- regular hasta 31, en un tipo digamos". Y al acotarlo: "es solo un dato que
-- quiero que salga en la solicitud de turno, no más, no hace nada a efectos
-- prácticos" · "tipo? escalable o estándar nada más".
--
-- O sea: NO es una capacidad que valide, tope ni calcule nada. Es el dato que
-- la cantera o la cementera pide en la solicitud de turno, y hoy había que
-- decírselo aparte. Por eso es texto con dos valores y nada más: ni numeric, ni
-- tope en los viajes, ni relación con `bateas.capacidad_tn`.
--
-- POR QUÉ EN `camiones` Y NO EN `bateas`. Físicamente la que carga es la batea,
-- y `bateas.capacidad_tn` ya existe (hoy: una en 35, una en 31, tres en 29,15,
-- una en 29150 — cargada en kilos — y una vacía). Pero el user lo pidió en la
-- ficha del camión y el dato es INFORMATIVO: no se compara con nada, así que no
-- crea una segunda fuente de verdad para un cálculo. Si algún día tiene que
-- topear la carga de un viaje, el número de la batea es el que manda y este
-- campo hay que revisarlo.
--
-- Nullable y sin default a propósito: los 7 camiones quedan "sin definir" hasta
-- que alguien los clasifique, y la solicitud de turno avisa cuál falta, igual
-- que ya avisa por CUIL o batea sin asignar. Un default inventado pondría
-- "estándar" en camiones escalables y nadie lo notaría.

alter table public.camiones
  add column if not exists tipo_carga text;

alter table public.camiones
  drop constraint if exists camiones_tipo_carga_check;

alter table public.camiones
  add constraint camiones_tipo_carga_check
  check (tipo_carga is null or tipo_carga in ('escalable', 'estandar'));

comment on column public.camiones.tipo_carga is
  'Configuración de la unidad para la solicitud de turno: escalable (hasta 35 tn) o estandar (hasta 31 tn). Dato INFORMATIVO — no valida ni calcula nada. La capacidad que manda para cualquier cálculo es bateas.capacidad_tn.';
