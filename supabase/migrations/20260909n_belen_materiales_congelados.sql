-- CASA BELEN: los materiales que ya pagó quedan congelados
--
-- Pregunta del user (08/09): "si los precios de esos materiales varían, ¿a
-- ella se le actualizan aunque ya los pagó?". La respuesta era SÍ, y era un
-- agujero: los $9.000.000 entraron "a cuenta" sin imputar, así que los
-- renglones quedaron en "a cobrar" — que no significa impago sino NO
-- CONGELADO. Un precio corregido mañana le movía la cuenta retroactivamente.
--
-- Acá se imputan los 34 renglones CON precio ($3.044.858,37) a sus pagos, en
-- orden cronológico y sin partir ningún renglón entre dos pagos (primer pago
-- con capacidad, como hace la pantalla). Con eso pasan a "Cobrado": el precio
-- queda clavado y la edición bloqueada.
--
-- Los 3 renglones SIN precio quedan en "a cobrar" A PROPÓSITO: no se congela
-- un $0. El día que alguien los tase, entran a la cuenta — y el saldo a favor
-- de Belén ($94.792) los absorbe o no, pero tiene que verse.

do $$
declare
  r record;
  c record;
  restante jsonb := '{}'::jsonb;
begin
  -- Capacidad restante de cada cobro (todo el monto: nada imputado hoy).
  for c in select id, monto from cuenta_cliente_cobros where obra_cod = 'CC-006' order by fecha, id loop
    restante := restante || jsonb_build_object(c.id::text, c.monto);
  end loop;

  for r in
    select id, precio_total from materiales_a_cuenta_cliente
    where obra_cod = 'CC-006' and cobro_id is null and precio_total > 0
    order by fecha_resolucion nulls last, id
  loop
    for c in select id from cuenta_cliente_cobros where obra_cod = 'CC-006' order by fecha, id loop
      if (restante ->> c.id::text)::numeric >= r.precio_total then
        update materiales_a_cuenta_cliente
           set cobro_id = c.id, monto_cobrado = r.precio_total, updated_at = now()
         where id = r.id;
        restante := restante || jsonb_build_object(
          c.id::text, (restante ->> c.id::text)::numeric - r.precio_total);
        exit;
      end if;
    end loop;
  end loop;
end $$;
