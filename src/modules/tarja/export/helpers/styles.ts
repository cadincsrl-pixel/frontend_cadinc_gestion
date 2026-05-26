/**
 * Paleta y estilos base para el export de tarja.
 *
 * La paleta está alineada con `liquidacion-export.ts` (mismo theme Tailwind)
 * para que los exports del sistema se vean del mismo "set".
 */
import type ExcelJS from 'exceljs'

// ── Paleta (ARGB) ─────────────────────────────────────────────────
export const C_AZUL          = 'FF1F3A66'
export const C_AZUL_HEADER   = 'FF445C82'
export const C_AZUL_LIGHT    = 'FFE8F0F8'
export const C_NARANJA       = 'FFE8621A'
export const C_NARANJA_LIGHT = 'FFFDE6D6'
export const C_VERDE         = 'FF1A6B3C'
export const C_VERDE_LIGHT   = 'FFDEEDE6'
export const C_ROJO          = 'FFC0392B'
export const C_AMARILLO_BG   = 'FFFFF4D6'
export const C_GRIS_BORDE    = 'FFCCCCCC'
export const C_GRIS_LIGHT    = 'FFF5F5F5'
export const C_GRIS_MEDIUM   = 'FFE0E0E0'
export const C_BLANCO        = 'FFFFFFFF'
export const C_CARBON        = 'FF1C1C1E'

// ── Estilos por tipo de fila ──────────────────────────────────────

/** Título principal de hoja (fila 1, merged). */
export const STYLE_TITLE: Partial<ExcelJS.Style> = {
  font:      { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } },
  alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
  fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } },
}

/** Subtítulo / metadata (fila 2, merged, fondo claro). */
export const STYLE_SUBTITLE: Partial<ExcelJS.Style> = {
  font:      { name: 'Calibri', size: 10, italic: true, color: { argb: C_CARBON } },
  alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
  fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } },
}

/** Encabezado de tabla (negrita, fondo azul oscuro, blanco). */
export const STYLE_TABLE_HEADER: Partial<ExcelJS.Style> = {
  font:      { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } },
  border: {
    top:    { style: 'thin', color: { argb: C_GRIS_BORDE } },
    bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } },
    left:   { style: 'thin', color: { argb: C_GRIS_BORDE } },
    right:  { style: 'thin', color: { argb: C_GRIS_BORDE } },
  },
}

/** Fila de subtotal (semana, sección): negrita, fondo gris claro. */
export const STYLE_SUBTOTAL: Partial<ExcelJS.Style> = {
  font:      { name: 'Calibri', size: 10, bold: true, color: { argb: C_CARBON } },
  fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_LIGHT } },
  border: {
    top:    { style: 'thin', color: { argb: C_GRIS_BORDE } },
    bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } },
  },
}

/** Fila de total general: negrita, fondo gris medio, doble borde top. */
export const STYLE_TOTAL: Partial<ExcelJS.Style> = {
  font:      { name: 'Calibri', size: 11, bold: true, color: { argb: C_CARBON } },
  fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } },
  border: {
    top:    { style: 'double', color: { argb: C_AZUL } },
    bottom: { style: 'thin',   color: { argb: C_AZUL } },
  },
}

/** Celda de datos normal (border thin). */
export const STYLE_DATA: Partial<ExcelJS.Style> = {
  font:      { name: 'Calibri', size: 10, color: { argb: C_CARBON } },
  alignment: { vertical: 'middle' },
  border: {
    top:    { style: 'hair', color: { argb: C_GRIS_BORDE } },
    bottom: { style: 'hair', color: { argb: C_GRIS_BORDE } },
    left:   { style: 'hair', color: { argb: C_GRIS_BORDE } },
    right:  { style: 'hair', color: { argb: C_GRIS_BORDE } },
  },
}

/** Aviso (fondo amarillo): operario sin tarifa, monto sospechoso, etc. */
export const STYLE_WARNING: Partial<ExcelJS.Style> = {
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AMARILLO_BG } },
}

/** Resaltado de monto positivo (verde) — para netos a cobrar. */
export const STYLE_MONTO_POS: Partial<ExcelJS.Style> = {
  font: { name: 'Calibri', size: 10, bold: true, color: { argb: C_VERDE } },
}

/** Resaltado de monto negativo (rojo) — para descuentos. */
export const STYLE_MONTO_NEG: Partial<ExcelJS.Style> = {
  font: { name: 'Calibri', size: 10, bold: true, color: { argb: C_ROJO } },
}
