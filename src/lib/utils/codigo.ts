/**
 * Código interno de una ficha del catálogo: `C-0128`.
 *
 * Es DERIVADO del id, no un dato guardado aparte: en la base es una columna
 * `generated always as ('C-' || lpad(id, 4, '0')) stored` (20260915n/o), y acá
 * se replica la misma cuenta para no tener que traer la columna a todos lados.
 * Si cambia una, cambia la otra.
 *
 * EL RELLENO A 4 DÍGITOS NO ES ESTÉTICO. Las dos búsquedas del sistema son por
 * substring (`matchesSearch` acá, `busq like` en el server). En ancho variable
 * un código corto es prefijo de uno largo: `C-128` encontraba también C-1280 …
 * C-1289, once fichas en vez de una. Con todos los códigos del mismo largo eso
 * es imposible. Medido sobre el catálogo: 254 choques sin relleno, 0 con.
 */
export function codigoMaterial(id: number | null | undefined): string | null {
  if (id == null || !Number.isFinite(id)) return null
  return `C-${String(id).padStart(4, '0')}`
}
