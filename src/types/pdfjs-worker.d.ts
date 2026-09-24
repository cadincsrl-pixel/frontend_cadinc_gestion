// El worker de pdfjs se importa sólo por su efecto: registra
// `globalThis.pdfjsWorker` y pdfjs lo usa en el mismo hilo (utils/qrFactura.ts).
declare module 'pdfjs-dist/build/pdf.worker.min.mjs'
