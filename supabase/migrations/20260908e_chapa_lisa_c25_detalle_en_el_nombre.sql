-- 20260908e — El ancho de la chapa lisa C25 pasa al nombre (user 2026-09-07:
-- "¿le mejoraste el detalle? por ejemplo le pusiste el ancho")
--
-- En 20260908d el ancho quedo solo en `obs`, que nadie lee al cargar un pedido.
-- El nombre es lo unico que se ve en el buscador, y ademas hay una ficha
-- hermana que se puede confundir: la 1172, "Chapa galvanizada lisa C25
-- 1,22 x 2,40 m (hoja)". Sin el ancho en el nombre, "1,22" solo aparece en la
-- hoja y parece que la bobina no lo tuviera.
update public.stock_materiales
set nombre = 'Chapa galvanizada lisa C25 ancho 1,22 m x metro lineal',
    alias = array(select distinct e from unnest(alias || array[
      'chapa lisa 1.22','chapa lisa 1,22','bobina 1.22','chapa galvanizada 1.22',
      'chapa lisa calibre 25 por metro','bobina calibre 25']) e),
    obs = 'POR METRO LINEAL. Bobina de ancho 1,22 m, calibre 25 (el espesor no lo dice la cotizacion; los 5 kg por metro dan ~0,5 mm, que es lo que corresponde al calibre 25). Codigo del proveedor: BOB25.'
          || E'\n'
          || 'SE COMPRA POR KILO. Cotizacion 07/09/2026: $2.181,41 el kilo neto = $2.639,51 con IVA. La equivalencia que da el proveedor es 5 kg por metro, asi que el metro sale $13.197,53 con IVA. La bobina entera son 20 m = 100 kg = $263.951.'
          || E'\n'
          || '2026-09-07: la ficha decia "rollo" pero sus renglones y su unico movimiento de stock siempre estuvieron en metros; se corrigio la unidad y con eso el saldo -10 pasa a leerse como -10 m (antes se leia como -10 rollos, o sea -200 m).'
where id = 877;

-- La hoja cortada (1172) tiene un precio ESTIMADO de mercado que quedo marcado
-- "ajustar con la primera compra real". Ahora hay con que contrastarlo: una
-- hoja de 1,22 x 2,40 son 2,40 m de bobina = 12 kg = $31.674 con IVA al precio
-- de hoy, contra los $62.000 cargados. El corte y el mostrador encarecen, pero
-- el doble es mucho. Se deja anotado en la ficha; no se toca el precio porque
-- la estimacion la aprobo el user y puede haber una compra real detras.
update public.stock_materiales
set obs = coalesce(obs, '') || ' · 2026-09-07: con el precio por kilo de la bobina (ficha 877), esta hoja son 2,40 m de bobina = 12 kg = $31.674 con IVA. El estimado cargado es $62.000, mas del doble. Verificar contra una compra real antes de facturarla.'
where id = 1172;
